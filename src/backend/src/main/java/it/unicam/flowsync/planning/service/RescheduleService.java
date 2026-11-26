package it.unicam.flowsync.planning.service;

import it.unicam.flowsync.audit.service.AuditService;
import it.unicam.flowsync.common.error.ApiError;
import it.unicam.flowsync.common.error.ApiException;
import it.unicam.flowsync.configuration.domain.Resource;
import it.unicam.flowsync.configuration.domain.Unavailability;
import it.unicam.flowsync.configuration.repository.ResourceRepository;
import it.unicam.flowsync.configuration.repository.UnavailabilityRepository;
import it.unicam.flowsync.execution.domain.IssueReport;
import it.unicam.flowsync.execution.repository.IssueReportRepository;
import it.unicam.flowsync.orders.domain.WorkOrder;
import it.unicam.flowsync.orders.repository.WorkOrderRepository;
import it.unicam.flowsync.planning.ai.AiClient;
import it.unicam.flowsync.planning.domain.Plan;
import it.unicam.flowsync.planning.domain.PlanningRequest;
import it.unicam.flowsync.planning.repository.PlanRepository;
import it.unicam.flowsync.planning.repository.PlanningRequestRepository;
import it.unicam.flowsync.planning.web.PlanningDtos.Accepted;
import it.unicam.flowsync.planning.web.PlanningDtos.EventType;
import it.unicam.flowsync.planning.web.PlanningDtos.RequestStatus;
import it.unicam.flowsync.planning.web.PlanningDtos.RescheduleEvent;
import it.unicam.flowsync.planning.web.PlanningDtos.RescheduleRequest;
import it.unicam.flowsync.planning.web.PlanningDtos.Scope;
import it.unicam.flowsync.security.domain.AppUser;
import it.unicam.flowsync.security.repository.AppUserRepository;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * {@code POST /plans/{id}/reschedule} (contratto A.4). Riparte da un piano approvato dopo un evento e crea una
 * nuova richiesta di pianificazione, elaborata come le altre ({@link PlanningRunner}): tre piani più le baseline.
 * <ul>
 *   <li>Le attività iniziate prima di {@code freezeBefore} (o con un evento di esecuzione) restano dove sono.</li>
 *   <li>{@code RESOURCE_DOWN} registra un fermo della risorsa ({@code to} null = fino alla fine del periodo).</li>
 *   <li>{@code URGENT_ORDER} aggiunge la commessa (priorità alta, scadenza aggiornata se indicata).</li>
 *   <li>{@code DELAY} sposta in avanti, di {@code delayMin} minuti di lavoro, il resto della commessa.</li>
 * </ul>
 * {@code scope} viene salvato con l'evento: in entrambi i casi il servizio AI ripianifica tutto ciò che non è
 * congelato, perché non ha ancora un termine che penalizzi gli spostamenti.
 */
@Service
public class RescheduleService {

    private final PlanRepository plans;
    private final PlanningRequestRepository requests;
    private final ResourceRepository resources;
    private final UnavailabilityRepository unavailabilities;
    private final WorkOrderRepository orders;
    private final IssueReportRepository issues;
    private final AppUserRepository users;
    private final PlanningRunner runner;
    private final AiClient ai;
    private final AuditService audit;
    private final ApplicationEventPublisher events;

    public RescheduleService(PlanRepository plans, PlanningRequestRepository requests, ResourceRepository resources,
                             UnavailabilityRepository unavailabilities, WorkOrderRepository orders,
                             IssueReportRepository issues, AppUserRepository users, PlanningRunner runner, AiClient ai,
                             AuditService audit, ApplicationEventPublisher events) {
        this.plans = plans;
        this.requests = requests;
        this.resources = resources;
        this.unavailabilities = unavailabilities;
        this.orders = orders;
        this.issues = issues;
        this.users = users;
        this.runner = runner;
        this.ai = ai;
        this.audit = audit;
        this.events = events;
    }

    @Transactional
    public Accepted reschedule(String planId, RescheduleRequest body, String username) {
        Plan source = GanttService.load(plans, planId);
        if (source.getStatus() != Plan.Status.APPROVED && source.getStatus() != Plan.Status.EXECUTING) {
            throw ApiException.conflict("PLAN_NOT_APPROVED", "Only an APPROVED plan can be rescheduled; "
                    + planId + " is " + PlanAssembler.apiStatus(source.getStatus()));
        }
        AppUser user = users.findByUsername(username).orElseThrow(() -> ApiException.unauthorized("User not found"));
        PlanningRequest original = source.getRequest();
        RescheduleEvent event = body.event();
        Instant now = Instant.now();
        Instant freeze = body.freezeBefore() != null ? body.freezeBefore().toInstant() : now;
        Instant start = freeze.isAfter(original.getHorizonStart()) ? freeze : original.getHorizonStart();
        Instant end = original.getHorizonEnd();
        if (!end.isAfter(start.plus(Duration.ofHours(1)))) {          // periodo già passato: stessa durata da adesso
            end = start.plus(Duration.between(original.getHorizonStart(), original.getHorizonEnd()));
        }

        List<ApiError> errors = new ArrayList<>();
        Resource downResource = null;
        WorkOrder eventOrder = null;
        switch (event.type()) {
            case RESOURCE_DOWN -> {
                downResource = event.resourceId() == null ? null : resources.findByCode(event.resourceId()).orElse(null);
                if (downResource == null) {
                    errors.add(new ApiError("UNKNOWN_RESOURCE", "event.resourceId", "Resource " + event.resourceId() + " does not exist"));
                }
                if (event.from() != null && event.to() != null && !event.to().isAfter(event.from())) {
                    errors.add(new ApiError("INVALID_INTERVAL", "event.to", "to must follow from"));
                }
            }
            case URGENT_ORDER, DELAY -> {
                eventOrder = event.orderId() == null ? null : orders.findByCode(event.orderId()).orElse(null);
                if (eventOrder == null) {
                    errors.add(new ApiError("UNKNOWN_ORDER", "event.orderId", "Order " + event.orderId() + " does not exist"));
                } else if (event.type() == EventType.DELAY
                        && !original.getWorkOrders().contains(eventOrder)) {
                    errors.add(new ApiError("ORDER_NOT_IN_PLAN", "event.orderId", "Order " + event.orderId() + " is not in " + planId));
                } else if (event.type() == EventType.URGENT_ORDER && !original.getWorkOrders().contains(eventOrder)
                        && eventOrder.getStatus() != WorkOrder.Status.DRAFT && eventOrder.getStatus() != WorkOrder.Status.READY) {
                    errors.add(new ApiError("ORDER_NOT_OPEN", "event.orderId", "Order " + event.orderId() + " is not OPEN"));
                }
                if (event.type() == EventType.DELAY && (event.delayMin() == null || event.delayMin() <= 0)) {
                    errors.add(new ApiError("INVALID_DELAY", "event.delayMin", "delayMin must be a positive number of minutes"));
                }
            }
        }
        IssueReport alert = null;
        if (body.alertId() != null && !body.alertId().isBlank()) {
            alert = parseAlert(body.alertId()) == null ? null : issues.findById(parseAlert(body.alertId())).orElse(null);
            if (alert == null) {
                errors.add(new ApiError("UNKNOWN_ALERT", "alertId", "Alert " + body.alertId() + " does not exist"));
            }
        }
        if (!errors.isEmpty()) {
            throw ApiException.unprocessable("The reschedule request is not valid", errors);
        }

        // effetti dell'evento sui dati, visibili anche fuori da questa richiesta
        if (downResource != null) {
            Unavailability down = new Unavailability();
            down.setResource(downResource);
            down.setStartsAt(event.from() != null ? event.from().toInstant() : freeze);
            down.setEndsAt(event.to() != null ? event.to().toInstant() : end);
            down.setReason(Unavailability.Reason.BREAKDOWN);
            down.setNote(body.note() == null || body.note().isBlank() ? "Guasto" : truncate(body.note(), 255));
            down.setCreatedBy(user);
            unavailabilities.save(down);
        }
        if (eventOrder != null && event.type() == EventType.URGENT_ORDER) {
            eventOrder.setPriority(WorkOrder.Priority.HIGH);
            if (event.dueDate() != null) {
                eventOrder.setDueAt(event.dueDate().toInstant());
            }
        }

        PlanningRequest r = new PlanningRequest();
        r.setRequestedBy(user);
        r.setLabel(truncate("Ripianificazione di " + planId + " (" + label(event) + ")", 150));
        r.setCalendar(original.getCalendar());
        r.setHorizonStart(start);
        r.setHorizonEnd(end);
        r.setPromptText(body.note());
        r.setRescheduleOf(source);
        r.setFreezeBefore(freeze);
        Map<String, Object> trigger = new LinkedHashMap<>();
        trigger.put("type", event.type().name());
        trigger.put("resourceId", event.resourceId());
        trigger.put("from", event.from() == null ? null : event.from().toString());
        trigger.put("to", event.to() == null ? null : event.to().toString());
        trigger.put("orderId", event.orderId());
        trigger.put("dueDate", event.dueDate() == null ? null : event.dueDate().toString());
        trigger.put("delayMin", event.delayMin());
        trigger.put("scope", (body.scope() == null ? Scope.MINIMAL : body.scope()).name());
        trigger.put("alertId", body.alertId());
        r.setTriggerEvent(trigger);
        Map<String, Object> sliders = new LinkedHashMap<>(original.getObjectiveWeights());
        if (body.weights() != null) {
            sliders.put("punctuality", body.weights().punctuality());
            sliders.put("overtime", body.weights().overtime());
            sliders.put("setup", body.weights().setup());
        }
        r.setObjectiveWeights(sliders);
        r.setStatus(PlanningRequest.Status.QUEUED);
        r.setStage("VALIDATION");
        r.getWorkOrders().addAll(original.getWorkOrders());
        if (eventOrder != null && !r.getWorkOrders().contains(eventOrder)) {
            r.getWorkOrders().add(eventOrder);
        }
        r = requests.save(r);
        PlanningContext ctx = runner.contextOf(r);                      // 422 se le commesse non sono pianificabili
        r.setProblemSpec(ctx.problemSpec(PlanAssembler.requestId(r.getId()) + "-BALANCED", null,
                PlanAssembler.objectiveWeights(Plan.Variant.BALANCED, sliders), null, ai.timeLimitMs()));

        if (alert != null) {                                            // l'avviso da cui nasce è gestito
            alert.setStatus(IssueReport.Status.RESOLVED);
            alert.setResolvedAt(now);
        }
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("planId", planId);
        payload.put("newRequestId", PlanAssembler.requestId(r.getId()));
        payload.put("trigger", event.type().name());
        payload.put("reason", body.note());
        audit.record(user.getId(), "RESCHEDULE", "PLAN", source.getId(), payload);
        events.publishEvent(new PlanningRequested(r.getId()));
        return new Accepted(PlanAssembler.requestId(r.getId()), RequestStatus.PENDING);
    }

    /** "AL-31" -> 31; null se non è l'id di una segnalazione. */
    static Long parseAlert(String id) {
        if (id != null && id.startsWith("AL-")) {
            try {
                return Long.parseLong(id.substring(3));
            } catch (NumberFormatException ignored) {
                return null;
            }
        }
        return null;
    }

    private static String label(RescheduleEvent event) {
        return switch (event.type()) {
            case RESOURCE_DOWN -> "fermo " + event.resourceId();
            case URGENT_ORDER -> "urgenza " + event.orderId();
            case DELAY -> "ritardo " + event.orderId();
        };
    }

    private static String truncate(String s, int max) {
        return s == null || s.length() <= max ? s : s.substring(0, max);
    }
}
