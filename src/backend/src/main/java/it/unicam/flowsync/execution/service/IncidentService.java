package it.unicam.flowsync.execution.service;

import it.unicam.flowsync.common.error.ApiError;
import it.unicam.flowsync.common.error.ApiException;
import it.unicam.flowsync.configuration.domain.Resource;
import it.unicam.flowsync.configuration.domain.Unavailability;
import it.unicam.flowsync.configuration.repository.ResourceRepository;
import it.unicam.flowsync.configuration.repository.UnavailabilityRepository;
import it.unicam.flowsync.configuration.web.ConfigurationDtos;
import it.unicam.flowsync.execution.domain.IssueReport;
import it.unicam.flowsync.execution.repository.IssueReportRepository;
import it.unicam.flowsync.execution.web.ExecutionDtos.Alert;
import it.unicam.flowsync.execution.web.ExecutionDtos.AlertLink;
import it.unicam.flowsync.execution.web.ExecutionDtos.Created;
import it.unicam.flowsync.execution.web.ExecutionDtos.IncidentKind;
import it.unicam.flowsync.execution.web.ExecutionDtos.IncidentRequest;
import it.unicam.flowsync.planning.domain.Assignment;
import it.unicam.flowsync.planning.domain.Plan;
import it.unicam.flowsync.planning.domain.PlanningRequest;
import it.unicam.flowsync.planning.repository.AssignmentRepository;
import it.unicam.flowsync.planning.repository.PlanRepository;
import it.unicam.flowsync.planning.repository.PlanningRequestRepository;
import it.unicam.flowsync.planning.service.PlanAssembler;
import it.unicam.flowsync.security.domain.AppUser;
import it.unicam.flowsync.security.repository.AppUserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Segnalazioni degli operatori e avvisi della dashboard (contratto A.6). Gli avvisi non hanno una tabella: si
 * ricavano dalle segnalazioni aperte (INCIDENT), dalle richieste con piani da rivedere (PLANS_TO_REVIEW) e dalle
 * manutenzioni dei prossimi 7 giorni (MAINTENANCE).
 */
@Service
public class IncidentService {

    private static final ZoneId ZONE = ZoneId.of("Europe/Rome");
    private static final DateTimeFormatter WHEN = DateTimeFormatter.ofPattern("EEE d MMM, H:mm", Locale.ITALIAN);

    private final IssueReportRepository issues;
    private final AppUserRepository users;
    private final ResourceRepository resources;
    private final PlanRepository plans;
    private final AssignmentRepository assignments;
    private final PlanningRequestRepository requests;
    private final UnavailabilityRepository unavailabilities;

    public IncidentService(IssueReportRepository issues, AppUserRepository users, ResourceRepository resources,
                           PlanRepository plans, AssignmentRepository assignments, PlanningRequestRepository requests,
                           UnavailabilityRepository unavailabilities) {
        this.issues = issues;
        this.users = users;
        this.resources = resources;
        this.plans = plans;
        this.assignments = assignments;
        this.requests = requests;
        this.unavailabilities = unavailabilities;
    }

    /** POST /incidents: 422 se manca la nota con OTHER o se una risorsa, un piano o un'attività non esistono. */
    @Transactional
    public Created report(IncidentRequest body, String username) {
        AppUser user = users.findByUsername(username).orElseThrow(() -> ApiException.unauthorized("User not found"));
        List<ApiError> errors = new ArrayList<>();
        String note = body.note() == null || body.note().isBlank() ? null : body.note().trim();
        if (body.kind() == IncidentKind.OTHER && note == null) {
            errors.add(new ApiError("NOTE_REQUIRED", "note", "Describe the problem when the kind is OTHER"));
        }
        Resource resource = null;
        if (body.resourceId() != null && !body.resourceId().isBlank()) {
            resource = resources.findByCode(body.resourceId()).orElse(null);
            if (resource == null) {
                errors.add(new ApiError("UNKNOWN_RESOURCE", "resourceId", "Resource " + body.resourceId() + " does not exist"));
            }
        }
        Plan plan = null;
        if (body.planId() != null && !body.planId().isBlank()) {
            plan = parsePlan(body.planId());
            if (plan == null) {
                errors.add(new ApiError("UNKNOWN_PLAN", "planId", "Plan " + body.planId() + " does not exist"));
            }
        }
        Assignment assignment = null;
        if (plan != null && body.activityId() != null && !body.activityId().isBlank()) {
            assignment = assignments.findByPlan(plan).stream()
                    .filter(a -> ExecutionService.specId(a).equals(body.activityId())).findFirst().orElse(null);
            if (assignment == null) {
                errors.add(new ApiError("UNKNOWN_ACTIVITY", "activityId", "Activity " + body.activityId() + " is not in " + body.planId()));
            }
        }
        if (!errors.isEmpty()) {
            throw ApiException.unprocessable("The report is not valid", errors);
        }
        if (resource == null && assignment != null) {
            resource = assignment.getResource();
        }
        if (plan == null && resource != null) {                   // il piano in corso su quella risorsa, se c'è
            plan = assignments.findInPlans(ExecutionService.ACTIVE, List.of(resource)).stream()
                    .map(Assignment::getPlan).max(Comparator.comparing(Plan::getId)).orElse(null);
        }
        IssueReport issue = new IssueReport();
        issue.setReportedBy(user);
        issue.setKind(IssueReport.Kind.valueOf(body.kind().name()));
        issue.setResource(resource);
        issue.setAssignment(assignment);
        issue.setPlan(plan);
        issue.setDescription(note);
        issue.setReportedAt(body.timestamp() != null ? body.timestamp().toInstant() : Instant.now());
        issue = issues.save(issue);
        return new Created(alertId(issue));
    }

    /** GET /alerts: gli avvisi aperti, dal più recente. */
    @Transactional(readOnly = true)
    public List<Alert> alerts() {
        List<Alert> out = new ArrayList<>();
        for (IssueReport i : issues.findByStatusInOrderByReportedAtDesc(List.of(IssueReport.Status.OPEN, IssueReport.Status.ACKNOWLEDGED))) {
            out.add(incident(i));
        }
        for (PlanningRequest r : requests.findAllByOrderByIdDesc()) {
            boolean proposed = r.getPlans().stream().anyMatch(p -> p.getStatus() == Plan.Status.CANDIDATE || p.getStatus() == Plan.Status.SELECTED);
            boolean decided = r.getPlans().stream().anyMatch(p -> p.getStatus() == Plan.Status.APPROVED
                    || p.getStatus() == Plan.Status.EXECUTING || p.getStatus() == Plan.Status.CLOSED);
            if (r.getStatus() == PlanningRequest.Status.DONE && proposed && !decided) {
                String id = PlanAssembler.requestId(r.getId());
                out.add(new Alert("AL-" + id, "PLANS_TO_REVIEW", "Piani da rivedere: " + r.getLabel(),
                        r.getPlans().size() + " piani proposti aspettano una decisione",
                        PlanAssembler.odt(r.getCompletedAt() != null ? r.getCompletedAt() : r.getCreatedAt()),
                        new AlertLink("Rivedi i piani", null, id), null));
            }
        }
        Instant now = Instant.now();
        for (Unavailability u : unavailabilities.findByReasonAndEndsAtAfterOrderByStartsAtAsc(Unavailability.Reason.MAINTENANCE, now)) {
            if (u.getStartsAt().isAfter(now.plus(Duration.ofDays(7)))) {
                continue;
            }
            Map<String, Object> event = new LinkedHashMap<>();
            event.put("type", "RESOURCE_DOWN");
            event.put("resourceId", u.getResource().getCode());
            event.put("from", PlanAssembler.odt(u.getStartsAt()).toString());
            event.put("to", PlanAssembler.odt(u.getEndsAt()).toString());
            out.add(new Alert("AL-UN-" + u.getId(), "MAINTENANCE", "Manutenzione: " + u.getResource().getName(),
                    ConfigurationDtos.ResourceResponse.reasonLabel(u) + ", " + u.getStartsAt().atZone(ZONE).format(WHEN)
                            + " – " + u.getEndsAt().atZone(ZONE).format(WHEN),
                    PlanAssembler.odt(u.getStartsAt()), null, event));
        }
        return out;
    }

    private Alert incident(IssueReport i) {
        String who = shortName(i.getReportedBy());
        String what = switch (i.getKind()) {
            case BREAKDOWN -> "Guasto";
            case MISSING_MATERIAL -> "Materiale mancante";
            case DELAY -> "Ritardo";
            case OTHER -> "Problema";
        };
        String detail = (i.getResource() == null ? "" : i.getResource().getName() + ": ")
                + (i.getDescription() == null ? what.toLowerCase(Locale.ITALIAN) : i.getDescription());
        Map<String, Object> event = null;
        if (i.getKind() == IssueReport.Kind.BREAKDOWN && i.getResource() != null) {
            event = new LinkedHashMap<>();
            event.put("type", "RESOURCE_DOWN");
            event.put("resourceId", i.getResource().getCode());
            event.put("from", PlanAssembler.odt(i.getReportedAt()).toString());
            event.put("to", null);
        } else if ((i.getKind() == IssueReport.Kind.DELAY || i.getKind() == IssueReport.Kind.MISSING_MATERIAL)
                && i.getAssignment() != null) {
            event = new LinkedHashMap<>();
            event.put("type", "DELAY");
            event.put("orderId", i.getAssignment().getActivity().getWorkOrder().getCode());
            event.put("delayMin", null);                           // lo sceglie il pianificatore nella pagina Ripianifica
        }
        AlertLink link = i.getPlan() == null ? null : new AlertLink("Ripianifica", PlanAssembler.planId(i.getPlan().getId()), null);
        return new Alert(alertId(i), "INCIDENT", what + " segnalato da " + who, detail, PlanAssembler.odt(i.getReportedAt()),
                link, event);
    }

    /** "Marco Rossi" -> "M. Rossi"; senza nome, lo username. */
    static String shortName(AppUser user) {
        String full = user.getFullName();
        if (full == null || full.isBlank()) {
            return user.getUsername();
        }
        String[] parts = full.trim().split("\\s+");
        return parts.length == 1 ? parts[0] : parts[0].charAt(0) + ". " + String.join(" ", List.of(parts).subList(1, parts.length));
    }

    static String alertId(IssueReport issue) {
        return "AL-" + issue.getId();
    }

    private Plan parsePlan(String id) {
        try {
            return plans.findById(PlanAssembler.parsePlanId(id)).orElse(null);
        } catch (ApiException e) {
            return null;
        }
    }
}
