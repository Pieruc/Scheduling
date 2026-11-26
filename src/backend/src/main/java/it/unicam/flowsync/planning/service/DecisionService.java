package it.unicam.flowsync.planning.service;

import it.unicam.flowsync.audit.service.AuditService;
import it.unicam.flowsync.common.error.ApiError;
import it.unicam.flowsync.common.error.ApiException;
import it.unicam.flowsync.orders.domain.WorkOrder;
import it.unicam.flowsync.planning.domain.Plan;
import it.unicam.flowsync.planning.domain.PlanDecision;
import it.unicam.flowsync.planning.domain.PlanningRequest;
import it.unicam.flowsync.planning.repository.PlanDecisionRepository;
import it.unicam.flowsync.planning.repository.PlanRepository;
import it.unicam.flowsync.planning.service.PlanChangeValidator.Bar;
import it.unicam.flowsync.planning.service.PlanChangeValidator.Change;
import it.unicam.flowsync.planning.web.PlanningDtos.DecisionRequest;
import it.unicam.flowsync.planning.web.PlanningDtos.DecisionResult;
import it.unicam.flowsync.planning.web.PlanningDtos.DecisionType;
import it.unicam.flowsync.planning.web.PlanningDtos.DecisionView;
import it.unicam.flowsync.planning.web.PlanningDtos.PlanStatus;
import it.unicam.flowsync.security.domain.AppUser;
import it.unicam.flowsync.security.repository.AppUserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Decisioni sui piani (contratto A.5). APPROVE approva il piano e manda in SUPERSEDED gli altri della richiesta;
 * REJECT lo scarta; MODIFY controlla gli spostamenti con {@link PlanChangeValidator} (le stesse regole del Gantt del
 * frontend) e crea una <b>nuova versione</b> del piano, che torna PROPOSED. Ogni decisione resta nello storico
 * (plan_decision) e nel registro di audit.
 */
@Service
public class DecisionService {

    private final PlanRepository plans;
    private final PlanDecisionRepository decisions;
    private final AppUserRepository users;
    private final PlanningRunner runner;
    private final PlanAssembler assembler;
    private final AuditService audit;

    public DecisionService(PlanRepository plans, PlanDecisionRepository decisions, AppUserRepository users,
                           PlanningRunner runner, PlanAssembler assembler, AuditService audit) {
        this.plans = plans;
        this.decisions = decisions;
        this.users = users;
        this.runner = runner;
        this.assembler = assembler;
        this.audit = audit;
    }

    @Transactional
    public DecisionResult decide(String planId, DecisionRequest body, String username) {
        Plan plan = GanttService.load(plans, planId);
        if (PlanAssembler.apiStatus(plan.getStatus()) != PlanStatus.PROPOSED) {
            throw ApiException.conflict("PLAN_NOT_PROPOSED",
                    "Plan " + planId + " is " + PlanAssembler.apiStatus(plan.getStatus()) + ": only PROPOSED plans can be decided");
        }
        String reason = body.reason() == null || body.reason().isBlank() ? null : body.reason().trim();
        if (reason == null && body.decision() != DecisionType.APPROVE) {
            throw ApiException.unprocessable("A reason is required",
                    List.of(new ApiError("REASON_REQUIRED", "reason", "MODIFY and REJECT need a reason")));
        }
        AppUser user = users.findByUsername(username).orElseThrow(() -> ApiException.unauthorized("User not found"));

        return switch (body.decision()) {
            case APPROVE -> approve(plan, reason, user);
            case REJECT -> reject(plan, reason, user);
            case MODIFY -> modify(plan, body, reason, user);
        };
    }

    @Transactional(readOnly = true)
    public List<DecisionView> history(String planId) {
        Plan plan = GanttService.load(plans, planId);
        return decisions.findByPlanOrderByDecidedAtAscIdAsc(plan).stream()
                .map(d -> new DecisionView(switch (d.getDecision()) {
                    case APPROVED -> DecisionType.APPROVE;
                    case REJECTED -> DecisionType.REJECT;
                    case MODIFIED -> DecisionType.MODIFY;
                }, d.getReason(), d.getDecidedBy().getUsername(), PlanAssembler.odt(d.getDecidedAt())))
                .toList();
    }

    private DecisionResult approve(Plan plan, String reason, AppUser user) {
        PlanningRequest request = plan.getRequest();
        plan.setStatus(Plan.Status.APPROVED);
        for (Plan other : request.getPlans()) {
            if (other != plan && PlanAssembler.apiStatus(other.getStatus()) == PlanStatus.PROPOSED) {
                other.setStatus(Plan.Status.SUPERSEDED);
            }
        }
        // ripianificazione: il piano di partenza è sostituito da quello approvato
        Plan source = request.getRescheduleOf();
        if (source != null && (source.getStatus() == Plan.Status.APPROVED || source.getStatus() == Plan.Status.EXECUTING)) {
            source.setStatus(Plan.Status.SUPERSEDED);
        }
        // le commesse pianificate passano a PLANNED (nel contratto: non più OPEN)
        for (WorkOrder order : request.getWorkOrders()) {
            if (order.getStatus() == WorkOrder.Status.DRAFT || order.getStatus() == WorkOrder.Status.READY) {
                order.setStatus(WorkOrder.Status.PLANNED);
            }
        }
        record(plan, PlanDecision.Decision.APPROVED, reason, user, Map.of());
        return new DecisionResult(PlanAssembler.planId(plan.getId()), PlanStatus.APPROVED);
    }

    private DecisionResult reject(Plan plan, String reason, AppUser user) {
        plan.setStatus(Plan.Status.REJECTED);
        record(plan, PlanDecision.Decision.REJECTED, reason, user, Map.of());
        return new DecisionResult(PlanAssembler.planId(plan.getId()), PlanStatus.REJECTED);
    }

    private DecisionResult modify(Plan plan, DecisionRequest body, String reason, AppUser user) {
        if (body.changes() == null || body.changes().isEmpty()) {
            throw ApiException.unprocessable("MODIFY needs at least one change",
                    List.of(new ApiError("NO_CHANGES", "changes", "changes must not be empty")));
        }
        PlanningContext ctx = runner.contextOf(plan.getRequest());
        for (int i = 0; i < body.changes().size(); i++) {
            if (ctx.frozen().containsKey(body.changes().get(i).activityId())) {
                throw ApiException.unprocessable("Started activities cannot be moved", List.of(new ApiError("FROZEN_ACTIVITY",
                        "changes[" + i + "].activityId", body.changes().get(i).activityId() + " has already started")));
            }
        }
        List<Bar> bars = PlanAssembler.barsOf(plan, ctx);
        Map<String, Integer> planned = bars.stream().collect(Collectors.toMap(Bar::activityId, b -> b.end() - b.start()));
        List<Change> changes = body.changes().stream()
                .map(c -> new Change(c.activityId(), c.resourceId(), c.start()))
                .toList();
        PlanChangeValidator.Result result = PlanChangeValidator.apply(bars, changes, ctx.durations(planned),
                ctx.edges(), ctx.unavailableBlocks(), ctx.scale().totalMinutes());
        if (!result.problems().isEmpty()) {
            throw ApiException.unprocessable("The changes make the plan infeasible", result.problems().stream()
                    .map(p -> new ApiError(p.code(), p.path(), p.message())).toList());
        }

        // le attività già spostate a mano nella versione di partenza restano marcate
        Set<String> manual = new HashSet<>();
        plan.getAssignments().stream().filter(a -> a.isManuallyModified())
                .forEach(a -> manual.add(PlanningContext.specId(a.getActivity().getWorkOrder().getCode(), a.getActivity().getCode())));
        changes.forEach(c -> manual.add(c.activityId()));

        Plan version = assembler.newPlan(plan.getRequest(), ctx,
                plan.getVariant() == null ? Plan.Variant.BALANCED : plan.getVariant(), Plan.Solver.MANUAL,
                result.bars(), toDoubles(plan.getObjectiveWeights()), plan.getModelVersion(), false, null, manual);
        version.setParentPlan(plan);
        version.setLabel(plan.getLabel() + " (modificato)");
        plans.save(version);
        plan.setStatus(Plan.Status.SUPERSEDED);

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("newPlanId", PlanAssembler.planId(version.getId()));
        payload.put("changes", body.changes());
        record(plan, PlanDecision.Decision.MODIFIED, reason, user, payload);
        return new DecisionResult(PlanAssembler.planId(version.getId()), PlanStatus.PROPOSED);
    }

    private void record(Plan plan, PlanDecision.Decision decision, String reason, AppUser user, Map<String, Object> extra) {
        PlanDecision d = new PlanDecision();
        d.setPlan(plan);
        d.setDecidedBy(user);
        d.setDecision(decision);
        d.setReason(reason);
        decisions.save(d);
        // contratto A.8: action DECISION, con la decisione (APPROVE / REJECT / MODIFY) nei dettagli
        Map<String, Object> payload = new LinkedHashMap<>(extra);
        payload.put("decision", switch (decision) {
            case APPROVED -> "APPROVE";
            case REJECTED -> "REJECT";
            case MODIFIED -> "MODIFY";
        });
        payload.put("reason", reason);
        payload.put("planId", PlanAssembler.planId(plan.getId()));
        payload.put("solver", plan.getSolver().name());
        payload.put("modelVersion", plan.getModelVersion());
        audit.record(user.getId(), "DECISION", "PLAN", plan.getId(), payload);
    }

    private static Map<String, Double> toDoubles(Map<String, Object> weights) {
        Map<String, Double> out = new LinkedHashMap<>();
        weights.forEach((k, v) -> out.put(k, v instanceof Number n ? n.doubleValue() : 0.0));
        return out;
    }
}
