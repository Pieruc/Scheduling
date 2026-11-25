package it.unicam.flowsync.orders.service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Controlli strutturali sul grafo di processo di una commessa, prima di salvarlo: id doppi, modi non validi,
 * precedenze verso attività inesistenti, autoanelli e cicli (il DB non li può rifiutare da solo).
 * Classe pura, senza dipendenze da Spring o JPA: i riferimenti a risorse e competenze li controlla il servizio.
 */
public final class GraphValidator {

    /** Un modo: le risorse richieste (il modello ne ammette una) e la durata (null = da stimare). */
    public record Mode(List<String> resourceIds, Integer durationMin) {
    }

    public record Node(String id, List<Mode> modes) {
    }

    /** type null vale "FS"; minLag null vale 0. */
    public record Edge(String from, String to, String type, Integer minLag, Integer maxLag) {
    }

    /** Stessa forma degli errori RFC 7807 del contratto: codice, campo, messaggio. */
    public record Problem(String code, String path, String message) {
    }

    private GraphValidator() {
    }

    public static List<Problem> validate(List<Node> nodes, List<Edge> edges) {
        List<Problem> problems = new ArrayList<>();
        Set<String> ids = new HashSet<>();

        for (int i = 0; i < nodes.size(); i++) {
            Node n = nodes.get(i);
            String at = "activities[" + i + "]";
            if (!ids.add(n.id())) {
                problems.add(new Problem("DUPLICATE_ACTIVITY", at + ".id", "Activity " + n.id() + " appears more than once"));
            }
            if (n.modes() == null || n.modes().isEmpty()) {
                problems.add(new Problem("NO_MODE", at + ".modes", "Activity " + n.id() + " needs at least one mode"));
                continue;
            }
            Set<String> resources = new HashSet<>();
            for (int j = 0; j < n.modes().size(); j++) {
                Mode m = n.modes().get(j);
                String mp = at + ".modes[" + j + "]";
                if (m.resourceIds() == null || m.resourceIds().size() != 1) {
                    problems.add(new Problem("MODE_RESOURCE_COUNT", mp + ".resourceIds",
                            "Each mode must name exactly one resource"));
                } else if (!resources.add(m.resourceIds().get(0))) {
                    problems.add(new Problem("DUPLICATE_MODE", mp + ".resourceIds",
                            "Resource " + m.resourceIds().get(0) + " is already a mode of " + n.id()));
                }
            }
        }

        boolean referencesOk = true;
        Set<String> pairs = new HashSet<>();
        for (int k = 0; k < edges.size(); k++) {
            Edge e = edges.get(k);
            String at = "precedences[" + k + "]";
            if (e.type() != null && !"FS".equals(e.type())) {
                problems.add(new Problem("UNSUPPORTED_PRECEDENCE_TYPE", at + ".type", "Only finish-to-start (FS) precedences are supported"));
            }
            if (!ids.contains(e.from())) {
                problems.add(new Problem("UNKNOWN_ACTIVITY", at + ".from", "Activity " + e.from() + " does not exist"));
                referencesOk = false;
            }
            if (!ids.contains(e.to())) {
                problems.add(new Problem("UNKNOWN_ACTIVITY", at + ".to", "Activity " + e.to() + " does not exist"));
                referencesOk = false;
            }
            if (e.from() != null && e.from().equals(e.to())) {
                problems.add(new Problem("CYCLIC_PRECEDENCE", at, "Cycle " + e.from() + " -> " + e.from()));
                referencesOk = false;
            } else if (!pairs.add(e.from() + "\u0000" + e.to())) {
                problems.add(new Problem("DUPLICATE_PRECEDENCE", at, "Precedence " + e.from() + " -> " + e.to() + " appears more than once"));
            }
            int min = e.minLag() == null ? 0 : e.minLag();
            if (e.maxLag() != null && e.maxLag() < min) {
                problems.add(new Problem("INVALID_LAG", at + ".maxLagMin", "maxLagMin must not be lower than minLagMin"));
            }
        }

        // i cicli si cercano solo su un grafo con riferimenti validi, altrimenti il messaggio confonderebbe
        if (referencesOk) {
            List<String> cycle = findCycle(nodes.stream().map(Node::id).toList(), edges);
            if (!cycle.isEmpty()) {
                problems.add(new Problem("CYCLIC_PRECEDENCE", "precedences", "Cycle " + String.join(" -> ", cycle)));
            }
        }
        return problems;
    }

    /**
     * Restituisce un ciclo come elenco di id che inizia e finisce con la stessa attività (es. [A, B, A]),
     * oppure una lista vuota se il grafo è aciclico. Visita in profondità, in ordine di inserimento: risultato stabile.
     */
    public static List<String> findCycle(List<String> ids, List<Edge> edges) {
        Map<String, List<String>> next = new LinkedHashMap<>();
        ids.forEach(id -> next.putIfAbsent(id, new ArrayList<>()));
        for (Edge e : edges) {
            next.computeIfAbsent(e.from(), k -> new ArrayList<>()).add(e.to());
            next.putIfAbsent(e.to(), new ArrayList<>());
        }
        Map<String, Integer> state = new HashMap<>();   // assente = da visitare, 1 = nel cammino corrente, 2 = chiuso
        List<String> path = new ArrayList<>();
        for (String start : next.keySet()) {
            if (!state.containsKey(start)) {
                List<String> cycle = visit(start, next, state, path);
                if (!cycle.isEmpty()) {
                    return cycle;
                }
            }
        }
        return List.of();
    }

    private static List<String> visit(String node, Map<String, List<String>> next, Map<String, Integer> state, List<String> path) {
        state.put(node, 1);
        path.add(node);
        for (String succ : next.getOrDefault(node, List.of())) {
            Integer s = state.get(succ);
            if (s == null) {
                List<String> cycle = visit(succ, next, state, path);
                if (!cycle.isEmpty()) {
                    return cycle;
                }
            } else if (s == 1) {
                List<String> cycle = new ArrayList<>(path.subList(path.indexOf(succ), path.size()));
                cycle.add(succ);
                return cycle;
            }
        }
        path.remove(path.size() - 1);
        state.put(node, 2);
        return List.of();
    }
}
