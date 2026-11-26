package it.unicam.flowsync.planning.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import it.unicam.flowsync.audit.service.AuditService;
import it.unicam.flowsync.execution.repository.ExecutionEventRepository;
import it.unicam.flowsync.planning.domain.Assignment;
import it.unicam.flowsync.orders.domain.WorkOrder;
import it.unicam.flowsync.planning.ai.AiClient;
import it.unicam.flowsync.planning.ai.AiRejectedException;
import it.unicam.flowsync.planning.ai.AiUnavailableException;
import it.unicam.flowsync.planning.domain.Plan;
import it.unicam.flowsync.planning.domain.PlanningRequest;
import it.unicam.flowsync.planning.repository.PlanningRequestRepository;
import it.unicam.flowsync.planning.service.PlanChangeValidator.Bar;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Elabora una richiesta di pianificazione (contratto A.4) in background: ricostruisce il contesto, chiede al servizio
 * AI i tre piani (ECONOMIC, BALANCED, FAST) e le due baseline (ATC, EDD) e salva il risultato. Le fasi (stage) sono
 * salvate in transazioni brevi, così il polling del frontend le vede mentre la richiesta è in corso. Le chiamate al
 * servizio AI avvengono fuori da ogni transazione.
 */
@Component
public class PlanningRunner {

    private static final Logger LOG = LoggerFactory.getLogger(PlanningRunner.class);
    private static final List<Plan.Variant> VARIANTS = List.of(Plan.Variant.ECONOMIC, Plan.Variant.BALANCED, Plan.Variant.FAST);
    private static final List<String> BASELINES = List.of("ATC", "EDD");

    private final PlanningRequestRepository requests;
    private final PlanningContextFactory contexts;
    private final PlanAssembler assembler;
    private final AiClient ai;
    private final AuditService audit;
    private final TransactionTemplate tx;
    private final ExecutionEventRepository executions;
    private final ObjectMapper json;

    public PlanningRunner(PlanningRequestRepository requests, PlanningContextFactory contexts, PlanAssembler assembler,
                          AiClient ai, AuditService audit, TransactionTemplate tx, ExecutionEventRepository executions,
                          ObjectMapper json) {
        this.requests = requests;
        this.contexts = contexts;
        this.assembler = assembler;
        this.ai = ai;
        this.audit = audit;
        this.tx = tx;
        this.executions = executions;
        this.json = json;
    }

    private record Prepared(PlanningContext ctx, String profile, Map<String, Object> sliders) {
    }

    private record Outcome(Plan.Variant variant, Map<String, Double> weights, Map<String, Object> result) {
    }

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onRequested(PlanningRequested event) {
        run(event.requestId());
    }

    public void run(Long id) {
        long t0 = System.nanoTime();
        String code = PlanAssembler.requestId(id);
        try {
            Prepared prepared = tx.execute(s -> {
                PlanningRequest r = requests.findById(id).orElseThrow();
                r.setStatus(PlanningRequest.Status.RUNNING);
                r.setStage("CONTEXT");
                return new Prepared(contextOf(r), profileOf(r), r.getObjectiveWeights());
            });
            PlanningContext ctx = prepared.ctx();

            stage(id, "POLICY");
            List<Outcome> outcomes = new ArrayList<>();
            for (Plan.Variant v : VARIANTS) {
                Map<String, Double> weights = PlanAssembler.objectiveWeights(v, prepared.sliders());
                Map<String, Object> spec = ctx.problemSpec(code + "-" + v, prepared.profile(), weights, null, ai.timeLimitMs());
                outcomes.add(new Outcome(v, weights, ai.optimize(spec)));
            }

            stage(id, "BASELINES");
            List<Map<String, Object>> baselines = new ArrayList<>();
            Map<String, Double> balanced = PlanAssembler.objectiveWeights(Plan.Variant.BALANCED, prepared.sliders());
            for (String rule : BASELINES) {
                Map<String, Object> result = ai.optimize(ctx.problemSpec(code + "-" + rule, prepared.profile(), balanced,
                        rule, ai.timeLimitMs()));
                Map<String, Object> entry = new LinkedHashMap<>();
                entry.put("solver", rule);
                entry.put("kpis", feasible(result) ? PlanKpis.of(ctx, withFrozen(ctx, PlanAssembler.barsOf(result))).toMap() : null);
                baselines.add(entry);
            }

            int elapsed = (int) ((System.nanoTime() - t0) / 1_000_000);
            tx.executeWithoutResult(s -> {
                PlanningRequest r = requests.findById(id).orElseThrow();
                List<String> problems = new ArrayList<>();
                for (Outcome o : outcomes) {
                    if (!feasible(o.result())) {
                        problems.add(o.variant() + ": " + warnings(o.result()));
                        continue;
                    }
                    assembler.newPlan(r, ctx, o.variant(), Plan.Solver.valueOf((String) o.result().get("solver")),
                            withFrozen(ctx, PlanAssembler.barsOf(o.result())), o.weights(), modelVersion(o.result()),
                            "FALLBACK".equals(o.result().get("status")), confidence(o.result()), Set.of());
                }
                r.setBaselines(baselines);
                r.setElapsedMs(elapsed);
                r.setStage(null);
                r.setCompletedAt(Instant.now());
                if (r.getPlans().isEmpty()) {
                    r.setStatus(PlanningRequest.Status.FAILED);
                    r.setErrorMessage(truncate("Nessun piano ammissibile. " + String.join("; ", problems)));
                } else {
                    r.setStatus(PlanningRequest.Status.DONE);
                    requests.saveAndFlush(r);                      // gli id dei piani servono al registro
                    recordGenerated(r, prepared, outcomes);
                }
            });
        } catch (AiUnavailableException e) {
            LOG.warn("Planning request {} failed: {}", code, e.getMessage());
            fail(id, "Il servizio AI non è raggiungibile: riprova tra poco.", "AI_UNAVAILABLE", e.getMessage());
        } catch (AiRejectedException e) {
            LOG.warn("Planning request {} rejected by the AI service: {}", code, e.getMessage());
            fail(id, "Il servizio AI ha rifiutato i dati della richiesta.", "AI_REJECTED", e.getMessage());
        } catch (RuntimeException e) {
            LOG.error("Planning request {} failed", code, e);
            fail(id, "Errore durante la pianificazione: " + e.getMessage(), "PLANNING_FAILED", String.valueOf(e));
        }
    }

    /**
     * Il contesto di una richiesta salvata, con le commesse in ordine di codice. Per una ripianificazione congela le
     * attività del piano di partenza già iniziate (inizio previsto prima di freezeBefore, o un evento di esecuzione)
     * e applica un evento DELAY spostando in avanti il rilascio della commessa.
     */
    public PlanningContext contextOf(PlanningRequest r) {
        List<WorkOrder> orders = r.getWorkOrders().stream().sorted(Comparator.comparing(WorkOrder::getCode)).toList();
        PlanningContext ctx = contexts.build(orders, r.getHorizonStart(), r.getHorizonEnd(), r.getCalendar());
        Plan source = r.getRescheduleOf();
        if (source == null) {
            return ctx;
        }
        Instant freeze = r.getFreezeBefore() != null ? r.getFreezeBefore() : r.getHorizonStart();
        Set<Long> started = new java.util.HashSet<>();                 // attività con un evento di esecuzione
        if (!source.getAssignments().isEmpty()) {
            executions.findByActivities(source.getAssignments().stream().map(Assignment::getActivity).distinct().toList())
                    .forEach(e -> started.add(e.getAssignment().getActivity().getId()));
        }
        Map<Long, String> specIdOf = new LinkedHashMap<>();
        ctx.activities().values().forEach(a -> specIdOf.put(a.id(), a.specId()));
        Map<String, Bar> frozen = new LinkedHashMap<>();
        for (Assignment a : source.getAssignments()) {
            String id = specIdOf.get(a.getActivity().getId());
            if (id == null || !ctx.resources().containsKey(a.getResource().getCode())) {
                continue;
            }
            if (a.getStartAt().isBefore(freeze) || started.contains(a.getActivity().getId())) {
                int start = ctx.scale().toMinute(a.getStartAt(), true);
                int end = Math.max(start, ctx.scale().toMinute(a.getEndAt(), false));
                frozen.put(id, new Bar(id, a.getResource().getCode(), start, end));
            }
        }
        List<PlanningContext.OrderInfo> adjusted = ctx.orders();
        Map<String, Object> event = r.getTriggerEvent();
        if (event != null && "DELAY".equals(event.get("type")) && event.get("delayMin") instanceof Number delay) {
            Object order = event.get("orderId");
            adjusted = ctx.orders().stream()
                    .map(o -> o.code().equals(order)
                            ? new PlanningContext.OrderInfo(o.code(), o.id(), Math.max(o.releaseMin(), delay.intValue()),
                            o.dueMin(), o.weight(), o.priority())
                            : o)
                    .toList();
        }
        return ctx.withFrozen(adjusted, frozen);
    }

    /** Le barre calcolate dal servizio AI più quelle congelate, che nel piano restano dove sono. */
    static List<Bar> withFrozen(PlanningContext ctx, List<Bar> bars) {
        if (ctx.frozen().isEmpty()) {
            return bars;
        }
        List<Bar> all = new ArrayList<>(ctx.frozen().values());
        bars.stream().filter(b -> !ctx.frozen().containsKey(b.activityId())).forEach(all::add);
        return all;
    }

    /** Contratto A.8: PLAN_GENERATED per ogni richiesta completata, FALLBACK_USED se un piano viene dalla riserva. */
    private void recordGenerated(PlanningRequest r, Prepared prepared, List<Outcome> outcomes) {
        List<String> planIds = new ArrayList<>();
        r.getPlans().forEach(p -> planIds.add(PlanAssembler.planId(p.getId())));
        Plan main = r.getPlans().stream().filter(p -> p.getVariant() == Plan.Variant.BALANCED).findFirst()
                .orElse(r.getPlans().get(0));
        Outcome mainOutcome = outcomes.stream().filter(o -> o.variant() == main.getVariant()).findFirst().orElse(outcomes.get(0));
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("planIds", planIds);
        payload.put("planId", PlanAssembler.planId(main.getId()));
        payload.put("solver", main.getSolver().name());
        payload.put("modelVersion", main.getModelVersion());
        payload.put("inputHash", hash(prepared.ctx().problemSpec(PlanAssembler.requestId(r.getId()) + "-" + main.getVariant(),
                prepared.profile(), main.getObjectiveWeights().entrySet().stream()
                        .collect(java.util.stream.Collectors.toMap(Map.Entry::getKey,
                                e -> ((Number) e.getValue()).doubleValue(), (a, b) -> a, LinkedHashMap::new)),
                null, ai.timeLimitMs())));
        payload.put("outputHash", hash(mainOutcome.result().get("assignments")));
        Map<String, Object> event = r.getTriggerEvent();
        payload.put("trigger", event == null ? null : event.get("type"));
        audit.record(r.getRequestedBy().getId(), "PLAN_GENERATED", "PLANNING_REQUEST", r.getId(), payload);
        List<String> fallbacks = r.getPlans().stream().filter(Plan::isFallbackUsed)
                .map(p -> PlanAssembler.planId(p.getId())).toList();
        if (!fallbacks.isEmpty()) {
            Map<String, Object> fb = new LinkedHashMap<>();
            fb.put("planIds", fallbacks);
            fb.put("planId", fallbacks.get(0));
            fb.put("solver", main.getSolver().name());
            fb.put("trigger", "POLICY_UNAVAILABLE");
            fb.put("confidence", main.getConfidence() == null ? null : main.getConfidence().doubleValue());
            audit.record(null, "FALLBACK_USED", "PLANNING_REQUEST", r.getId(), fb);
        }
    }

    /** sha256 del JSON: con la stessa versione del modello, lo stesso input dà lo stesso piano (contratto A.8). */
    private String hash(Object value) {
        try {
            byte[] digest = java.security.MessageDigest.getInstance("SHA-256").digest(json.writeValueAsBytes(value));
            return "sha256:" + java.util.HexFormat.of().formatHex(digest);
        } catch (Exception e) {
            return null;
        }
    }

    private static String profileOf(PlanningRequest r) {
        return r.getWorkOrders().stream()
                .filter(o -> o.getProfile() != null)
                .map(o -> o.getProfile().getCode())
                .findFirst().orElse(null);
    }

    private void stage(Long id, String stage) {
        tx.executeWithoutResult(s -> requests.findById(id).ifPresent(r -> r.setStage(stage)));
    }

    private void fail(Long id, String message, String auditAction, String detail) {
        tx.executeWithoutResult(s -> {
            requests.findById(id).ifPresent(r -> {
                r.setStatus(PlanningRequest.Status.FAILED);
                r.setStage(null);
                r.setErrorMessage(truncate(message));
                r.setCompletedAt(Instant.now());
            });
            audit.record(null, auditAction, "PLANNING_REQUEST", id, Map.of("error", String.valueOf(truncate(detail))));
        });
    }

    private static boolean feasible(Map<String, Object> result) {
        Object status = result.get("status");
        return ("OK".equals(status) || "FALLBACK".equals(status)) && result.get("assignments") instanceof List<?> l && !l.isEmpty();
    }

    @SuppressWarnings("unchecked")
    private static String warnings(Map<String, Object> result) {
        Object w = result.get("warnings");
        return w instanceof List<?> list && !list.isEmpty() ? String.join(", ", (List<String>) list) : "piano non ammissibile";
    }

    @SuppressWarnings("unchecked")
    private static String modelVersion(Map<String, Object> result) {
        Object versions = result.get("model_versions");
        if (versions instanceof Map<?, ?> m && !m.isEmpty()) {
            return truncateTo(String.join(",", ((Map<String, String>) m).values()), 40);
        }
        return null;
    }

    private static Double confidence(Map<String, Object> result) {
        return result.get("confidence") instanceof Number n ? n.doubleValue() : null;
    }

    private static String truncate(String s) {
        return truncateTo(s, 500);
    }

    private static String truncateTo(String s, int max) {
        return s == null || s.length() <= max ? s : s.substring(0, max);
    }
}
