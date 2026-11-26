package it.unicam.flowsync.planning.service;

import it.unicam.flowsync.common.error.ApiError;
import it.unicam.flowsync.common.error.ApiException;
import it.unicam.flowsync.configuration.repository.CalendarRepository;
import it.unicam.flowsync.orders.domain.WorkOrder;
import it.unicam.flowsync.orders.repository.WorkOrderRepository;
import it.unicam.flowsync.planning.ai.AiClient;
import it.unicam.flowsync.planning.domain.Plan;
import it.unicam.flowsync.planning.domain.PlanningRequest;
import it.unicam.flowsync.planning.repository.PlanningRequestRepository;
import it.unicam.flowsync.planning.web.PlanningDtos.Accepted;
import it.unicam.flowsync.planning.web.PlanningDtos.CreateRequest;
import it.unicam.flowsync.planning.web.PlanningDtos.PlanStatus;
import it.unicam.flowsync.planning.web.PlanningDtos.PlanSummary;
import it.unicam.flowsync.planning.web.PlanningDtos.RequestStatus;
import it.unicam.flowsync.planning.web.PlanningDtos.RequestView;
import it.unicam.flowsync.planning.web.PlanningDtos.Weights;
import it.unicam.flowsync.security.domain.AppUser;
import it.unicam.flowsync.security.repository.AppUserRepository;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Richieste di pianificazione (contratto A.4): creazione con i controlli sincroni (422), elenco e dettaglio per il
 * polling. L'elaborazione vera parte dopo il commit ({@link PlanningRunner}).
 */
@Service
public class PlanningService {

    private final PlanningRequestRepository requests;
    private final WorkOrderRepository orders;
    private final CalendarRepository calendars;
    private final AppUserRepository users;
    private final PlanningContextFactory contexts;
    private final AiClient ai;
    private final ApplicationEventPublisher events;

    public PlanningService(PlanningRequestRepository requests, WorkOrderRepository orders, CalendarRepository calendars,
                           AppUserRepository users, PlanningContextFactory contexts, AiClient ai,
                           ApplicationEventPublisher events) {
        this.requests = requests;
        this.orders = orders;
        this.calendars = calendars;
        this.users = users;
        this.contexts = contexts;
        this.ai = ai;
        this.events = events;
    }

    @Transactional
    public Accepted create(CreateRequest body, String username) {
        List<ApiError> errors = new ArrayList<>();
        if (!body.horizonEnd().isAfter(body.horizonStart())) {
            errors.add(new ApiError("INVALID_HORIZON", "horizonEnd", "horizonEnd must follow horizonStart"));
        }
        List<WorkOrder> selected = new ArrayList<>();
        List<String> codes = List.copyOf(new LinkedHashSet<>(body.orderIds()));
        for (int i = 0; i < codes.size(); i++) {
            String code = codes.get(i);
            WorkOrder order = orders.findByCode(code).orElse(null);
            String path = "orderIds[" + body.orderIds().indexOf(code) + "]";
            if (order == null) {
                errors.add(new ApiError("UNKNOWN_ORDER", path, "Order " + code + " does not exist"));
            } else if (order.getStatus() != WorkOrder.Status.DRAFT && order.getStatus() != WorkOrder.Status.READY) {
                errors.add(new ApiError("ORDER_NOT_OPEN", path, "Order " + code + " is not OPEN"));
            } else {
                selected.add(order);
            }
        }
        // le commesse senza scadenza vanno chiarite: la risposta "due-<codice>" diventa la scadenza della commessa
        Map<String, String> answers = body.answers() == null ? Map.of() : body.answers();
        for (WorkOrder order : selected) {
            if (order.getDueAt() != null) {
                continue;
            }
            String key = "due-" + order.getCode();
            String answer = answers.get(key);
            if (answer == null || answer.isBlank()) {
                errors.add(new ApiError("MISSING_ANSWER", "answers." + key, order.getCode() + " has no due date: an answer is required"));
                continue;
            }
            try {
                order.setDueAt(OffsetDateTime.parse(answer).toInstant());
            } catch (DateTimeParseException e) {
                errors.add(new ApiError("INVALID_ANSWER", "answers." + key, "Expected an ISO date-time, got '" + answer + "'"));
            }
        }
        if (!errors.isEmpty()) {
            throw ApiException.unprocessable("The planning request is not valid", errors);
        }

        selected.sort(Comparator.comparing(WorkOrder::getCode));
        Instant from = body.horizonStart().toInstant();
        Instant to = body.horizonEnd().toInstant();
        PlanningContext ctx = contexts.build(selected, from, to, null);      // 422 se le commesse non sono pianificabili

        Weights w = body.weights() == null ? new Weights(5, 5, 5) : body.weights();
        Map<String, Object> sliders = new LinkedHashMap<>();
        sliders.put("punctuality", w.punctuality());
        sliders.put("overtime", w.overtime());
        sliders.put("setup", w.setup());

        AppUser author = users.findByUsername(username).orElseThrow(() -> ApiException.unauthorized("User not found"));
        PlanningRequest r = new PlanningRequest();
        r.setRequestedBy(author);
        r.setLabel(label(selected));
        r.setCalendar(calendars.getReferenceById(ctx.calendarId()));
        r.setHorizonStart(from);
        r.setHorizonEnd(to);
        r.setPromptText(body.text());
        r.setObjectiveWeights(sliders);
        r.setStatus(PlanningRequest.Status.QUEUED);
        r.setStage("VALIDATION");
        r.getWorkOrders().addAll(selected);
        r = requests.save(r);
        // la spec del piano BALANCED resta sulla richiesta: è l'input esatto inviato al servizio AI (riproducibilità)
        r.setProblemSpec(ctx.problemSpec(PlanAssembler.requestId(r.getId()) + "-BALANCED",
                selected.get(0).getProfile() == null ? null : selected.get(0).getProfile().getCode(),
                PlanAssembler.objectiveWeights(Plan.Variant.BALANCED, sliders), null, ai.timeLimitMs()));
        events.publishEvent(new PlanningRequested(r.getId()));
        return new Accepted(PlanAssembler.requestId(r.getId()), RequestStatus.PENDING);
    }

    /** Dalla più recente; {@code q} cerca nell'etichetta, nel testo e nei codici delle commesse. */
    @Transactional(readOnly = true)
    public List<RequestView> list(Integer limit, String q, RequestStatus status, OffsetDateTime from) {
        String needle = q == null || q.isBlank() ? null : q.toLowerCase(Locale.ROOT);
        return requests.findAllByOrderByIdDesc().stream()
                .filter(r -> status == null || PlanAssembler.apiStatus(r.getStatus()) == status)
                .filter(r -> from == null || (r.getCreatedAt() != null && !r.getCreatedAt().isBefore(from.toInstant())))
                .filter(r -> needle == null || matches(r, needle))
                .limit(limit == null || limit <= 0 ? 50 : limit)
                .map(PlanningService::view)
                .toList();
    }

    @Transactional(readOnly = true)
    public RequestView get(String id) {
        return view(load(id));
    }

    PlanningRequest load(String id) {
        return requests.findById(PlanAssembler.parseRequestId(id))
                .orElseThrow(() -> ApiException.notFound("Planning request " + id + " not found"));
    }

    private static boolean matches(PlanningRequest r, String needle) {
        return (r.getLabel() != null && r.getLabel().toLowerCase(Locale.ROOT).contains(needle))
                || (r.getPromptText() != null && r.getPromptText().toLowerCase(Locale.ROOT).contains(needle))
                || r.getWorkOrders().stream().anyMatch(o -> o.getCode().toLowerCase(Locale.ROOT).contains(needle));
    }

    static RequestView view(PlanningRequest r) {
        List<PlanSummary> plans = r.getPlans().stream()
                .sorted(Comparator.comparing(Plan::getId))
                .map(PlanAssembler::summaryOf)
                .toList();
        String recommended = plans.stream()
                .filter(p -> "BALANCED".equals(p.variant()) && p.status() != PlanStatus.SUPERSEDED && p.status() != PlanStatus.REJECTED)
                .reduce((first, second) -> second)
                .or(() -> plans.stream().filter(p -> p.status() == PlanStatus.PROPOSED || p.status() == PlanStatus.APPROVED).findFirst())
                .map(PlanSummary::id).orElse(null);
        return new RequestView(PlanAssembler.requestId(r.getId()), PlanAssembler.apiStatus(r.getStatus()),
                r.getStage(), PlanAssembler.odt(r.getCreatedAt()), r.getRequestedBy().getUsername(), r.getLabel(),
                r.getWorkOrders().stream().map(WorkOrder::getCode).sorted().toList(),
                PlanAssembler.odt(r.getHorizonStart()), PlanAssembler.odt(r.getHorizonEnd()), r.getObjectiveWeights(),
                recommended, r.getElapsedMs() == null ? null : r.getElapsedMs() / 1000.0, plans,
                r.getBaselines() == null ? List.of() : r.getBaselines(),
                r.getRescheduleOf() == null ? null : PlanAssembler.planId(r.getRescheduleOf().getId()),
                r.getTriggerEvent(), r.getErrorMessage());
    }

    private static String label(List<WorkOrder> selected) {
        if (selected.size() == 1) {
            return "Commessa " + selected.get(0).getCode();
        }
        if (selected.size() <= 3) {
            return "Commesse " + String.join(", ", selected.stream().map(WorkOrder::getCode).toList());
        }
        return "Commesse " + selected.get(0).getCode() + " – " + selected.get(selected.size() - 1).getCode();
    }
}
