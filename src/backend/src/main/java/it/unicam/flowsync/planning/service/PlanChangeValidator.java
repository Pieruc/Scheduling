package it.unicam.flowsync.planning.service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Controlla le modifiche manuali a un piano (decisione MODIFY, contratto A.5) con le stesse regole del Gantt del
 * frontend: risorsa ammessa, periodo, indisponibilità, sovrapposizioni sulla stessa risorsa, precedenze.
 * I tempi sono minuti di lavoro ({@link WorkTimeScale}). Classe pura, testata senza Spring.
 */
public final class PlanChangeValidator {

    /** Una barra del Gantt. */
    public record Bar(String activityId, String resourceId, int start, int end) {
    }

    /** Una modifica: l'attività va sulla risorsa indicata, a partire da {@code start}. */
    public record Change(String activityId, String resourceId, int start) {
    }

    public record Edge(String from, String to, int lag) {
    }

    public record Problem(String code, String path, String message) {
    }

    /** Esito: le barre dopo le modifiche e gli eventuali problemi (lista vuota = ammissibile). */
    public record Result(List<Bar> bars, List<Problem> problems) {
    }

    private PlanChangeValidator() {
    }

    /**
     * @param durations   per attività, le risorse ammesse e la durata su ciascuna
     * @param unavailable per risorsa, i blocchi [inizio, fine) non lavorabili
     * @param total       fine del periodo in minuti di lavoro
     */
    public static Result apply(List<Bar> bars, List<Change> changes, Map<String, Map<String, Integer>> durations,
                               List<Edge> edges, Map<String, List<int[]>> unavailable, int total) {
        Map<String, Bar> byActivity = new LinkedHashMap<>();
        bars.forEach(b -> byActivity.put(b.activityId(), b));
        Map<String, Integer> changeIndex = new HashMap<>();
        List<Problem> problems = new ArrayList<>();

        for (int i = 0; i < changes.size(); i++) {
            Change c = changes.get(i);
            String path = "changes[" + i + "]";
            if (!byActivity.containsKey(c.activityId())) {
                problems.add(new Problem("UNKNOWN_ACTIVITY", path + ".activityId", "Activity " + c.activityId() + " is not in the plan"));
                continue;
            }
            Integer duration = durations.getOrDefault(c.activityId(), Map.of()).get(c.resourceId());
            if (duration == null) {
                problems.add(new Problem("RESOURCE_NOT_ALLOWED", path + ".resourceId",
                        "Activity " + c.activityId() + " cannot run on " + c.resourceId()));
                continue;
            }
            byActivity.put(c.activityId(), new Bar(c.activityId(), c.resourceId(), c.start(), c.start() + duration));
            changeIndex.put(c.activityId(), i);
        }
        if (!problems.isEmpty()) {
            return new Result(List.copyOf(byActivity.values()), problems);
        }

        // i controlli riguardano solo le barre spostate: il resto del piano era già ammissibile
        for (Map.Entry<String, Integer> moved : changeIndex.entrySet()) {
            Bar b = byActivity.get(moved.getKey());
            String path = "changes[" + moved.getValue() + "]";
            if (b.start() < 0 || b.end() > total) {
                problems.add(new Problem("OUT_OF_PERIOD", path + ".start", "Activity " + b.activityId() + " falls outside the planning period"));
            }
            for (int[] block : unavailable.getOrDefault(b.resourceId(), List.of())) {
                if (b.start() < block[1] && block[0] < b.end()) {
                    problems.add(new Problem("RESOURCE_UNAVAILABLE", path + ".start",
                            "Resource " + b.resourceId() + " is not available in that interval"));
                    break;
                }
            }
            for (Bar other : byActivity.values()) {
                if (!other.activityId().equals(b.activityId()) && other.resourceId().equals(b.resourceId())
                        && b.start() < other.end() && other.start() < b.end()) {
                    problems.add(new Problem("OVERLAP", path + ".start",
                            "Activity " + b.activityId() + " overlaps " + other.activityId() + " on " + b.resourceId()));
                }
            }
            for (Edge e : edges) {
                Bar pred = byActivity.get(e.from());
                Bar succ = byActivity.get(e.to());
                if (pred == null || succ == null) {
                    continue;
                }
                boolean touches = e.from().equals(b.activityId()) || e.to().equals(b.activityId());
                if (touches && succ.start() < pred.end() + e.lag()) {
                    problems.add(new Problem("PRECEDENCE_VIOLATION", path + ".start",
                            e.to() + " must start after " + e.from() + " ends"));
                }
            }
        }
        return new Result(List.copyOf(byActivity.values()), problems);
    }
}
