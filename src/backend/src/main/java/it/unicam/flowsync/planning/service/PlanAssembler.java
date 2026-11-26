package it.unicam.flowsync.planning.service;

import it.unicam.flowsync.common.error.ApiException;
import it.unicam.flowsync.configuration.domain.Resource;
import it.unicam.flowsync.orders.domain.Activity;
import it.unicam.flowsync.planning.domain.Assignment;
import it.unicam.flowsync.planning.domain.Plan;
import it.unicam.flowsync.planning.domain.PlanningRequest;
import it.unicam.flowsync.planning.service.PlanChangeValidator.Bar;
import it.unicam.flowsync.planning.web.PlanningDtos.PlanStatus;
import it.unicam.flowsync.planning.web.PlanningDtos.PlanSummary;
import it.unicam.flowsync.planning.web.PlanningDtos.RequestStatus;
import jakarta.persistence.EntityManager;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Conversioni condivise dalla pianificazione: id pubblici, stati del contratto, pesi delle tre varianti, barre del
 * Gantt e costruzione di un {@link Plan} con le sue assegnazioni e i KPI.
 */
@Component
public class PlanAssembler {

    private final EntityManager em;

    public PlanAssembler(EntityManager em) {
        this.em = em;
    }

    // ---------------------------------------------------------------- id pubblici

    public static String requestId(Long id) {
        return String.format("REQ-%04d", id);
    }

    public static String planId(Long id) {
        return id == null ? null : String.format("PLAN-%04d", id);
    }

    public static Long parseRequestId(String id) {
        return parse(id, "REQ-", "Planning request");
    }

    public static Long parsePlanId(String id) {
        return parse(id, "PLAN-", "Plan");
    }

    private static Long parse(String id, String prefix, String what) {
        if (id != null && id.startsWith(prefix)) {
            try {
                return Long.parseLong(id.substring(prefix.length()));
            } catch (NumberFormatException ignored) {
                // sotto: 404
            }
        }
        throw ApiException.notFound(what + " " + id + " not found");
    }

    // ---------------------------------------------------------------- stati

    public static RequestStatus apiStatus(PlanningRequest.Status status) {
        return switch (status) {
            case QUEUED, RUNNING -> RequestStatus.PENDING;
            case DONE -> RequestStatus.COMPLETED;
            case FAILED -> RequestStatus.FAILED;
        };
    }

    public static PlanStatus apiStatus(Plan.Status status) {
        return switch (status) {
            case CANDIDATE, SELECTED -> PlanStatus.PROPOSED;
            case APPROVED, EXECUTING, CLOSED -> PlanStatus.APPROVED;
            case REJECTED -> PlanStatus.REJECTED;
            case SUPERSEDED -> PlanStatus.SUPERSEDED;
        };
    }

    public static OffsetDateTime odt(Instant instant) {
        return instant == null ? null : instant.atOffset(ZoneOffset.UTC);
    }

    // ---------------------------------------------------------------- pesi

    /**
     * Pesi dell'obiettivo composto (chiavi del servizio AI) per ogni variante. BALANCED segue gli slider del
     * pianificatore (puntualità -> ritardo pesato, setup -> setup, con una quota fissa di makespan); FAST privilegia il
     * makespan; ECONOMIC privilegia pochi setup. Lo slider "straordinari" non ha ancora un termine nell'obiettivo:
     * i piani restano dentro i turni.
     */
    public static Map<String, Double> objectiveWeights(Plan.Variant variant, Map<String, Object> sliders) {
        double punctuality = number(sliders, "punctuality", 5);
        double setup = number(sliders, "setup", 5);
        Map<String, Double> raw = switch (variant) {
            case BALANCED -> Map.of("makespan", 2.0, "weighted_tardiness", punctuality, "setup", setup);
            case FAST -> Map.of("makespan", 7.0, "weighted_tardiness", Math.max(punctuality, 1) / 2, "setup", 1.0);
            case ECONOMIC -> Map.of("makespan", 1.0, "weighted_tardiness", Math.max(punctuality, 1) / 2, "setup", 7.0);
        };
        double sum = raw.values().stream().mapToDouble(Double::doubleValue).sum();
        Map<String, Double> out = new LinkedHashMap<>();
        for (String k : List.of("makespan", "weighted_tardiness", "setup")) {
            out.put(k, Math.round(raw.get(k) / sum * 1000) / 1000.0);
        }
        return out;
    }

    private static double number(Map<String, Object> map, String key, double fallback) {
        Object v = map == null ? null : map.get(key);
        return v instanceof Number n ? n.doubleValue() : fallback;
    }

    public static String variantLabel(Plan.Variant v) {
        return switch (v) {
            case ECONOMIC -> "Economico";
            case BALANCED -> "Bilanciato";
            case FAST -> "Rapido";
        };
    }

    // ---------------------------------------------------------------- barre

    /** Le assegnazioni di un PlanResult del servizio AI come barre (risorsa = la prima del modo scelto). */
    @SuppressWarnings("unchecked")
    public static List<Bar> barsOf(Map<String, Object> planResult) {
        List<Bar> bars = new ArrayList<>();
        for (Map<String, Object> a : (List<Map<String, Object>>) planResult.getOrDefault("assignments", List.of())) {
            List<String> resources = (List<String>) a.get("resource_ids");
            bars.add(new Bar((String) a.get("activity_id"), resources.get(0),
                    ((Number) a.get("start_min")).intValue(), ((Number) a.get("end_min")).intValue()));
        }
        return bars;
    }

    public static List<Bar> barsOf(Plan plan, PlanningContext ctx) {
        Map<Long, String> specIdOf = new LinkedHashMap<>();
        ctx.activities().values().forEach(a -> specIdOf.put(a.id(), a.specId()));
        return plan.getAssignments().stream()
                .filter(a -> specIdOf.containsKey(a.getActivity().getId()))
                .map(a -> new Bar(specIdOf.get(a.getActivity().getId()), a.getResource().getCode(),
                        a.getStartMin() != null ? a.getStartMin() : ctx.scale().toMinute(a.getStartAt(), true),
                        a.getEndMin() != null ? a.getEndMin() : ctx.scale().toMinute(a.getEndAt(), false)))
                .toList();
    }

    // ---------------------------------------------------------------- piani

    /**
     * Crea il piano con assegnazioni e KPI e lo aggiunge alla richiesta (il salvataggio segue per cascata).
     *
     * @param manual attività spostate a mano (decisione MODIFY)
     */
    public Plan newPlan(PlanningRequest request, PlanningContext ctx, Plan.Variant variant, Plan.Solver solver,
                        List<Bar> bars, Map<String, Double> weights, String modelVersion, boolean fallback,
                        Double confidence, Set<String> manual) {
        Plan plan = new Plan();
        plan.setRequest(request);
        plan.setVariant(variant);
        plan.setLabel(variantLabel(variant));
        plan.setSolver(solver);
        plan.setModelVersion(modelVersion);
        plan.setFallbackUsed(fallback);
        plan.setConfidence(confidence == null ? null : BigDecimal.valueOf(confidence).setScale(3, RoundingMode.HALF_UP));
        plan.setStatus(Plan.Status.CANDIDATE);
        plan.setObjectiveWeights(new LinkedHashMap<>(weights));
        for (Bar b : bars) {
            PlanningContext.ActivityInfo activity = ctx.activities().get(b.activityId());
            PlanningContext.ResourceInfo resource = ctx.resources().get(b.resourceId());
            Assignment a = new Assignment();
            a.setPlan(plan);
            a.setActivity(em.getReference(Activity.class, activity.id()));
            a.setResource(em.getReference(Resource.class, resource.id()));
            a.setStartMin(b.start());
            a.setEndMin(b.end());
            a.setStartAt(ctx.scale().toInstant(b.start(), false));
            a.setEndAt(ctx.scale().toInstant(b.end(), true));
            a.setEstimatedDurationMin(b.end() - b.start());
            a.setManuallyModified(manual.contains(b.activityId()));
            a.setLocked(ctx.frozen().containsKey(b.activityId()));       // ripianificazione: già iniziata
            plan.getAssignments().add(a);
        }
        applyKpis(plan, PlanKpis.of(ctx, bars), ctx.scale().minutesPerDay());
        request.getPlans().add(plan);
        return plan;
    }

    private static void applyKpis(Plan plan, PlanKpis kpis, int minutesPerDay) {
        plan.setMakespanMin(kpis.makespanMin());
        plan.setTotalTardinessMin(kpis.totalTardinessMin());
        plan.setOvertimeMin(kpis.overtimeMin());
        plan.setSetupCount(kpis.setupCount());
        plan.setAvgUtilization(BigDecimal.valueOf(kpis.avgUtilization()).setScale(4, RoundingMode.HALF_UP));
        plan.setKpiDetails(kpis.toMap());
        plan.setSummary(kpis.summary(minutesPerDay));
    }

    public static Map<String, Object> kpisOf(Plan plan) {
        if (plan.getKpiDetails() != null && !plan.getKpiDetails().isEmpty()) {
            return plan.getKpiDetails();
        }
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("makespanMin", plan.getMakespanMin());
        m.put("totalTardinessMin", plan.getTotalTardinessMin());
        m.put("setupCount", plan.getSetupCount());
        m.put("overtimeMin", plan.getOvertimeMin());
        m.put("avgUtilization", plan.getAvgUtilization());
        return m;
    }

    public static PlanSummary summaryOf(Plan plan) {
        return new PlanSummary(planId(plan.getId()), plan.getVariant() == null ? null : plan.getVariant().name(),
                apiStatus(plan.getStatus()), plan.getSolver().name(), plan.getModelVersion(),
                plan.getConfidence() == null ? null : plan.getConfidence().doubleValue(), odt(plan.getCreatedAt()),
                plan.getSummary(), kpisOf(plan), plan.getParentPlan() == null ? null : planId(plan.getParentPlan().getId()));
    }
}
