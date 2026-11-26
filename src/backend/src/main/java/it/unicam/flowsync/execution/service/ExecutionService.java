package it.unicam.flowsync.execution.service;

import it.unicam.flowsync.common.error.ApiError;
import it.unicam.flowsync.common.error.ApiException;
import it.unicam.flowsync.configuration.domain.Resource;
import it.unicam.flowsync.configuration.domain.WorkCalendar;
import it.unicam.flowsync.configuration.repository.ResourceRepository;
import it.unicam.flowsync.execution.domain.ExecutionEvent;
import it.unicam.flowsync.execution.repository.ExecutionEventRepository;
import it.unicam.flowsync.execution.web.ExecutionDtos.ActivityExecution;
import it.unicam.flowsync.execution.web.ExecutionDtos.ExecutionRequest;
import it.unicam.flowsync.execution.web.ExecutionDtos.OperatorToday;
import it.unicam.flowsync.execution.web.ExecutionDtos.ResourceRef;
import it.unicam.flowsync.execution.web.ExecutionDtos.Shift;
import it.unicam.flowsync.execution.web.ExecutionDtos.WaitingFor;
import it.unicam.flowsync.orders.domain.Activity;
import it.unicam.flowsync.orders.domain.Precedence;
import it.unicam.flowsync.orders.domain.WorkOrder;
import it.unicam.flowsync.orders.repository.PrecedenceRepository;
import it.unicam.flowsync.planning.domain.Assignment;
import it.unicam.flowsync.planning.domain.Plan;
import it.unicam.flowsync.planning.repository.AssignmentRepository;
import it.unicam.flowsync.planning.repository.PlanRepository;
import it.unicam.flowsync.planning.service.PlanAssembler;
import it.unicam.flowsync.planning.service.PlanningContext;
import it.unicam.flowsync.security.domain.AppUser;
import it.unicam.flowsync.security.repository.AppUserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Esecuzione dei piani approvati (contratto A.6): la giornata dell'operatore e i pulsanti Inizia / Pausa /
 * Riprendi / Termina. Lo stato di ogni attività si ricava dagli eventi ({@link ExecutionState}), che non si
 * modificano mai: sono anche il dataset delle durate reali per M1.
 * <p>
 * Le risorse di un operatore: la risorsa collegata al suo utente; se è una persona o una squadra, anche le
 * macchine che richiedono una sua competenza. Un operatore senza risorsa collegata vede tutte le risorse attive.
 */
@Service
public class ExecutionService {

    static final List<Plan.Status> ACTIVE = List.of(Plan.Status.APPROVED, Plan.Status.EXECUTING);
    private static final ZoneId ZONE = ZoneId.of("Europe/Rome");

    private final AppUserRepository users;
    private final ResourceRepository resources;
    private final AssignmentRepository assignments;
    private final PlanRepository plans;
    private final ExecutionEventRepository events;
    private final PrecedenceRepository precedences;

    public ExecutionService(AppUserRepository users, ResourceRepository resources, AssignmentRepository assignments,
                            PlanRepository plans, ExecutionEventRepository events, PrecedenceRepository precedences) {
        this.users = users;
        this.resources = resources;
        this.assignments = assignments;
        this.plans = plans;
        this.events = events;
        this.precedences = precedences;
    }

    // ---------------------------------------------------------------- GET /operator/today

    @Transactional(readOnly = true)
    public OperatorToday today(String username) {
        AppUser user = user(username);
        List<Resource> mine = resourcesOf(user);
        LocalDate today = LocalDate.now(ZONE);
        Instant dayStart = today.atStartOfDay(ZONE).toInstant();
        Instant dayEnd = today.plusDays(1).atStartOfDay(ZONE).toInstant();

        List<Assignment> all = mine.isEmpty() ? List.of() : assignments.findInPlans(ACTIVE, mine);
        Map<Long, ExecutionState> states = states(all);
        List<Assignment> shown = all.stream()
                .filter(a -> (a.getStartAt().isBefore(dayEnd) && a.getEndAt().isAfter(dayStart))
                        || states.get(a.getId()).state() == ExecutionState.State.IN_PROGRESS
                        || states.get(a.getId()).state() == ExecutionState.State.PAUSED)
                .toList();

        Resource first = user.getResource() != null ? user.getResource() : mine.isEmpty() ? null : mine.get(0);
        List<Shift> shifts = first == null ? List.of() : first.getCalendar().getShifts().stream()
                .filter(s -> s.getDayOfWeek() == today.getDayOfWeek().getValue())
                .sorted(Comparator.comparing(WorkCalendar.Shift::getStartTime))
                .map(s -> new Shift(s.getStartTime(), s.getEndTime()))
                .toList();
        return new OperatorToday(today, user.getFullName(),
                user.getResource() == null ? null : user.getResource().getName(), shifts,
                mine.stream().map(r -> new ResourceRef(r.getCode(), r.getName())).toList(),
                views(shown, states));
    }

    private List<Resource> resourcesOf(AppUser user) {
        Resource own = user.getResource();
        if (own == null) {
            return resources.findAll().stream().filter(Resource::isActive)
                    .sorted(Comparator.comparing(Resource::getCode)).toList();
        }
        Set<Resource> out = new LinkedHashSet<>();
        out.add(own);
        if (own.getType() != Resource.Type.MACHINE) {
            Set<String> skills = new java.util.HashSet<>();
            own.getSkills().forEach(s -> skills.add(s.getSkill().getCode()));
            resources.findAll().stream()
                    .filter(r -> r.isActive() && r.getType() == Resource.Type.MACHINE)
                    .filter(r -> r.getSkills().stream().anyMatch(s -> skills.contains(s.getSkill().getCode())))
                    .sorted(Comparator.comparing(Resource::getCode))
                    .forEach(out::add);
        }
        return List.copyOf(out);
    }

    // ---------------------------------------------------------------- GET /executions?planId=

    @Transactional(readOnly = true)
    public List<ActivityExecution> ofPlan(String planId) {
        Plan plan = plans.findById(PlanAssembler.parsePlanId(planId))
                .orElseThrow(() -> ApiException.notFound("Plan " + planId + " not found"));
        List<Assignment> list = assignments.findByPlan(plan);
        return views(list, states(list));
    }

    // ---------------------------------------------------------------- POST /executions

    /**
     * 409 se il passaggio non è ammesso: un'attività alla volta in corso per operatore, niente inizio prima della
     * fine delle precedenti, niente pausa, ripresa o fine di un'attività non iniziata.
     */
    @Transactional
    public ActivityExecution record(ExecutionRequest body, String username) {
        AppUser user = user(username);
        Plan plan = plans.findById(PlanAssembler.parsePlanId(body.planId()))
                .orElseThrow(() -> ApiException.notFound("Plan " + body.planId() + " not found"));
        if (!ACTIVE.contains(plan.getStatus())) {
            throw ApiException.conflict("PLAN_NOT_APPROVED", "Plan " + body.planId() + " is not approved");
        }
        List<Assignment> ofPlan = assignments.findByPlan(plan);
        Assignment target = ofPlan.stream().filter(a -> specId(a).equals(body.activityId())).findFirst()
                .orElseThrow(() -> ApiException.unprocessable("Unknown activity", List.of(new ApiError("UNKNOWN_ACTIVITY",
                        "activityId", "Activity " + body.activityId() + " is not in " + body.planId()))));
        ExecutionEvent.Type type = switch (body.event()) {
            case START -> ExecutionEvent.Type.START;
            case PAUSE -> ExecutionEvent.Type.PAUSE;
            case RESUME -> ExecutionEvent.Type.RESUME;
            case END -> ExecutionEvent.Type.COMPLETE;
        };
        Instant at = body.timestamp() != null ? body.timestamp().toInstant() : Instant.now();

        Map<Long, ExecutionState> states = states(ofPlan);
        ExecutionState current = states.get(target.getId());
        if (!current.allows(type)) {
            throw ApiException.conflict("ILLEGAL_TRANSITION", "Cannot " + body.event() + " an activity that is "
                    + current.state());
        }
        List<ExecutionEvent> previous = events.findByActivities(List.of(target.getActivity()));
        if (!previous.isEmpty() && at.isBefore(previous.get(previous.size() - 1).getOccurredAt())) {
            throw ApiException.unprocessable("Events must follow each other", List.of(new ApiError("INVALID_TIMESTAMP",
                    "timestamp", "The event is earlier than the last one of this activity")));
        }
        if (type == ExecutionEvent.Type.START) {
            WaitingFor waiting = waitingFor(target, ofPlan, states);
            if (waiting != null) {
                throw ApiException.conflict("PREDECESSOR_NOT_DONE", waiting.activityName() + " is not finished yet");
            }
        }
        if (type == ExecutionEvent.Type.START || type == ExecutionEvent.Type.RESUME) {
            String running = runningOf(user, target);
            if (running != null) {
                throw ApiException.conflict("ANOTHER_IN_PROGRESS", "Activity " + running + " is already in progress");
            }
        }

        ExecutionEvent e = new ExecutionEvent();
        e.setAssignment(target);
        e.setOperator(user);
        e.setEventType(type);
        e.setOccurredAt(at);
        e.setNote(body.note() == null || body.note().isBlank() ? null : body.note().trim());
        events.save(e);

        // stati derivati: attività, commessa, piano
        Activity activity = target.getActivity();
        WorkOrder order = activity.getWorkOrder();
        if (type == ExecutionEvent.Type.START) {
            activity.setStatus(Activity.Status.IN_PROGRESS);
            if (plan.getStatus() == Plan.Status.APPROVED) {
                plan.setStatus(Plan.Status.EXECUTING);
            }
            if (order.getStatus() == WorkOrder.Status.PLANNED || order.getStatus() == WorkOrder.Status.READY
                    || order.getStatus() == WorkOrder.Status.DRAFT) {
                order.setStatus(WorkOrder.Status.IN_PROGRESS);
            }
        }
        List<Assignment> refreshed = List.copyOf(ofPlan);
        Map<Long, ExecutionState> after = states(refreshed);
        if (type == ExecutionEvent.Type.COMPLETE) {
            activity.setStatus(Activity.Status.DONE);
            boolean orderDone = refreshed.stream()
                    .filter(a -> a.getActivity().getWorkOrder().getId().equals(order.getId()))
                    .allMatch(a -> after.get(a.getId()).state() == ExecutionState.State.DONE);
            if (orderDone) {
                order.setStatus(WorkOrder.Status.DONE);
            }
            if (refreshed.stream().allMatch(a -> after.get(a.getId()).state() == ExecutionState.State.DONE)) {
                plan.setStatus(Plan.Status.CLOSED);
            }
        }
        return views(List.of(target), after).get(0);
    }

    /** L'attività che l'operatore ha in corso, diversa da {@code except}; null se nessuna. */
    private String runningOf(AppUser user, Assignment except) {
        Map<Long, List<ExecutionState.Event>> byActivity = new LinkedHashMap<>();
        Map<Long, Assignment> assignmentOf = new HashMap<>();
        for (ExecutionEvent e : events.findByOperatorOrderByOccurredAtAscIdAsc(user)) {
            Long activity = e.getAssignment().getActivity().getId();
            byActivity.computeIfAbsent(activity, k -> new ArrayList<>())
                    .add(new ExecutionState.Event(e.getEventType(), e.getOccurredAt()));
            assignmentOf.put(activity, e.getAssignment());
        }
        for (Map.Entry<Long, List<ExecutionState.Event>> entry : byActivity.entrySet()) {
            if (!entry.getKey().equals(except.getActivity().getId())
                    && ExecutionState.of(entry.getValue()).state() == ExecutionState.State.IN_PROGRESS) {
                return specId(assignmentOf.get(entry.getKey()));
            }
        }
        return null;
    }

    // ---------------------------------------------------------------- viste

    /** Stato per assegnazione, ricavato dagli eventi della sua attività (anche quelli registrati su piani precedenti). */
    private Map<Long, ExecutionState> states(List<Assignment> list) {
        Map<Long, List<ExecutionState.Event>> byActivity = new HashMap<>();
        if (!list.isEmpty()) {
            for (ExecutionEvent e : events.findByActivities(list.stream().map(Assignment::getActivity).distinct().toList())) {
                byActivity.computeIfAbsent(e.getAssignment().getActivity().getId(), k -> new ArrayList<>())
                        .add(new ExecutionState.Event(e.getEventType(), e.getOccurredAt()));
            }
        }
        Map<Long, ExecutionState> out = new HashMap<>();
        list.forEach(a -> out.put(a.getId(), ExecutionState.of(byActivity.getOrDefault(a.getActivity().getId(), List.of()))));
        return out;
    }

    private List<ActivityExecution> views(List<Assignment> list, Map<Long, ExecutionState> states) {
        Map<Long, List<Assignment>> planAssignments = new HashMap<>();
        Map<Long, Map<Long, ExecutionState>> planStates = new HashMap<>();
        List<ActivityExecution> out = new ArrayList<>();
        for (Assignment a : list) {
            // le precedenti possono stare su risorse non mostrate: servono tutte le assegnazioni del piano
            List<Assignment> siblings = planAssignments.computeIfAbsent(a.getPlan().getId(),
                    k -> assignments.findByPlan(a.getPlan()));
            Map<Long, ExecutionState> siblingStates = planStates.computeIfAbsent(a.getPlan().getId(), k -> states(siblings));
            ExecutionState s = states.getOrDefault(a.getId(), ExecutionState.TODO);
            WaitingFor waiting = s.state() == ExecutionState.State.TODO ? waitingFor(a, siblings, siblingStates) : null;
            WorkOrder order = a.getActivity().getWorkOrder();
            out.add(new ActivityExecution(PlanAssembler.planId(a.getPlan().getId()), specId(a), a.getActivity().getName(),
                    order.getCode(), order.getClientName(), a.getResource().getCode(), a.getResource().getName(),
                    PlanAssembler.odt(a.getStartAt()), PlanAssembler.odt(a.getEndAt()), s.state().name(), s.workedMin(),
                    PlanAssembler.odt(s.runningSince()), PlanAssembler.odt(s.actualStart()), PlanAssembler.odt(s.actualEnd()),
                    waiting));
        }
        return out;
    }

    /** La precedente non ancora finita che finisce più tardi (secondo il piano); null se si può iniziare. */
    private WaitingFor waitingFor(Assignment a, List<Assignment> siblings, Map<Long, ExecutionState> states) {
        Map<Long, Assignment> byActivity = new HashMap<>();
        siblings.forEach(s -> byActivity.put(s.getActivity().getId(), s));
        WaitingFor latest = null;
        Instant latestEnd = null;
        for (Precedence p : precedences.findByOrder(a.getActivity().getWorkOrder())) {
            if (!p.getSuccessor().getId().equals(a.getActivity().getId())) {
                continue;
            }
            Assignment pred = byActivity.get(p.getPredecessor().getId());
            if (pred == null || states.getOrDefault(pred.getId(), ExecutionState.TODO).state() == ExecutionState.State.DONE) {
                continue;
            }
            if (latestEnd == null || pred.getEndAt().isAfter(latestEnd)) {
                latestEnd = pred.getEndAt();
                latest = new WaitingFor(pred.getActivity().getName(), PlanAssembler.odt(pred.getEndAt()));
            }
        }
        return latest;
    }

    static String specId(Assignment a) {
        return PlanningContext.specId(a.getActivity().getWorkOrder().getCode(), a.getActivity().getCode());
    }

    private AppUser user(String username) {
        return users.findByUsername(username).orElseThrow(() -> ApiException.unauthorized("User not found"));
    }
}
