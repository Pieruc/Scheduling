package it.unicam.flowsync.planning.service;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * I dati di una richiesta di pianificazione già convertiti nella scala dei minuti di lavoro ({@link WorkTimeScale}):
 * commesse, attività, risorse ammesse, fermi, precedenze e setup. Solo dati (nessuna entità JPA), quindi si può usare
 * fuori dalla transazione mentre si aspetta il servizio AI. Lo stesso contesto produce la ProblemSpec (contratto B.1),
 * il Gantt (A.4) e il controllo delle modifiche manuali (A.5).
 * <p>
 * Gli id delle attività sono {@code <commessa>/<codice>} (es. "C-101/T"): i codici sono unici solo dentro una
 * commessa, e lo stesso id compare nel Gantt e nelle modifiche del frontend.
 */
public final class PlanningContext {

    /** Un fermo di una risorsa, già in minuti di lavoro: [start, end). */
    public record Block(int start, int end, String reason) {
    }

    public record ResourceInfo(Long id, String code, String name, String type, BigDecimal costPerHour,
                               List<String> skills, List<Block> blocks) {
    }

    /** {@code modes}: codice risorsa -> durata in minuti, null se va stimata. */
    public record ActivityInfo(String specId, Long id, String orderCode, String name, Integer declaredMin,
                               String setupFamily, List<String> requiredSkills, Map<String, Integer> modes) {
    }

    public record OrderInfo(String code, Long id, int releaseMin, Integer dueMin, double weight, int priority) {
    }

    public record Link(String from, String to, int lagMin, Integer maxLagMin) {
    }

    public record SetupRule(String resourceCode, String fromFamily, String toFamily, int minutes) {
    }

    static final int DEFAULT_DURATION_MIN = 60;

    private final WorkTimeScale scale;
    private final Instant horizonStart;
    private final ZoneId zone;
    private final Long calendarId;
    private final List<OrderInfo> orders;
    private final Map<String, ActivityInfo> activities;
    private final Map<String, ResourceInfo> resources;
    private final List<Link> links;
    private final List<SetupRule> setupRules;
    /** Ripianificazione: attività già iniziate, che restano dove sono (id -> barra nella scala di questo periodo). */
    private final Map<String, PlanChangeValidator.Bar> frozen;

    public PlanningContext(WorkTimeScale scale, Instant horizonStart, ZoneId zone, Long calendarId,
                           List<OrderInfo> orders, List<ActivityInfo> activities, List<ResourceInfo> resources,
                           List<Link> links, List<SetupRule> setupRules) {
        this.scale = scale;
        this.horizonStart = horizonStart;
        this.zone = zone;
        this.calendarId = calendarId;
        this.orders = List.copyOf(orders);
        this.activities = new LinkedHashMap<>();
        activities.forEach(a -> this.activities.put(a.specId(), a));
        this.resources = new LinkedHashMap<>();
        resources.forEach(r -> this.resources.put(r.code(), r));
        this.links = List.copyOf(links);
        this.setupRules = List.copyOf(setupRules);
        this.frozen = Map.of();
    }

    private PlanningContext(PlanningContext base, List<OrderInfo> orders, Map<String, PlanChangeValidator.Bar> frozen) {
        this.scale = base.scale;
        this.horizonStart = base.horizonStart;
        this.zone = base.zone;
        this.calendarId = base.calendarId;
        this.orders = List.copyOf(orders);
        this.activities = base.activities;
        this.resources = base.resources;
        this.links = base.links;
        this.setupRules = base.setupRules;
        this.frozen = Map.copyOf(frozen);
    }

    /** Lo stesso contesto con le commesse cambiate (es. un ritardo sul rilascio) e alcune attività congelate. */
    public PlanningContext withFrozen(List<OrderInfo> orders, Map<String, PlanChangeValidator.Bar> frozen) {
        return new PlanningContext(this, orders, frozen);
    }

    public Map<String, PlanChangeValidator.Bar> frozen() {
        return frozen;
    }

    public static String specId(String orderCode, String activityCode) {
        return orderCode + "/" + activityCode;
    }

    public WorkTimeScale scale() {
        return scale;
    }

    public Long calendarId() {
        return calendarId;
    }

    public List<OrderInfo> orders() {
        return orders;
    }

    public Map<String, ActivityInfo> activities() {
        return activities;
    }

    public Map<String, ResourceInfo> resources() {
        return resources;
    }

    public List<Link> links() {
        return links;
    }

    public List<SetupRule> setupRules() {
        return setupRules;
    }

    public List<PlanChangeValidator.Edge> edges() {
        return links.stream().map(l -> new PlanChangeValidator.Edge(l.from(), l.to(), l.lagMin())).toList();
    }

    public Map<String, List<int[]>> unavailableBlocks() {
        Map<String, List<int[]>> out = new LinkedHashMap<>();
        resources.values().forEach(r -> out.put(r.code(),
                r.blocks().stream().map(b -> new int[]{b.start(), b.end()}).toList()));
        return out;
    }

    /**
     * Durata di ogni attività su ogni risorsa ammessa, senza buchi: dove manca si usa la stima del piano
     * ({@code estimates}, la durata che il piano ha dato all'attività), altrimenti la media delle durate note
     * dell'attività, altrimenti {@value #DEFAULT_DURATION_MIN} minuti (la stessa regola del servizio AI).
     */
    public Map<String, Map<String, Integer>> durations(Map<String, Integer> estimates) {
        Map<String, Map<String, Integer>> out = new LinkedHashMap<>();
        for (ActivityInfo a : activities.values()) {
            List<Integer> known = a.modes().values().stream().filter(d -> d != null).toList();
            int fallback = estimates.containsKey(a.specId()) ? estimates.get(a.specId())
                    : known.isEmpty() ? DEFAULT_DURATION_MIN
                    : (int) Math.round(known.stream().mapToInt(Integer::intValue).average().orElse(DEFAULT_DURATION_MIN));
            Map<String, Integer> byResource = new LinkedHashMap<>();
            a.modes().forEach((res, d) -> byResource.put(res, d == null ? fallback : d));
            out.put(a.specId(), byResource);
        }
        return out;
    }

    /**
     * ProblemSpec del contratto B.1, con le chiavi in snake_case come le vuole il servizio AI.
     *
     * @param solver null = policy (o metodo di riserva); "ATC" / "EDD" = baseline richiesta esplicitamente
     */
    public Map<String, Object> problemSpec(String requestId, String domainProfile, Map<String, Double> weights,
                                           String solver, int timeLimitMs) {
        Map<String, Object> spec = new LinkedHashMap<>();
        spec.put("spec_version", "1.0");
        spec.put("request_id", requestId);
        spec.put("domain_profile", domainProfile);
        spec.put("horizon", Map.of("start", horizonStart.atZone(zone).toOffsetDateTime().toString(),
                "length_min", scale.totalMinutes()));
        spec.put("objective_weights", weights);

        List<Map<String, Object>> res = new ArrayList<>();
        for (ResourceInfo r : resources.values()) {
            List<int[]> blocks = new ArrayList<>(r.blocks().stream().map(b -> new int[]{b.start(), b.end()}).toList());
            frozen.values().stream().filter(b -> b.resourceId().equals(r.code()))       // occupata da un'attività in corso
                    .forEach(b -> blocks.add(new int[]{b.start(), b.end()}));
            List<List<Integer>> windows = scale.availability(0, scale.totalMinutes(), blocks).stream()
                    .map(w -> List.of(w[0], w[1])).toList();
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", r.code());
            m.put("type", r.type());
            m.put("capacity", 1);
            m.put("skills", r.skills());
            m.put("availability", windows);
            res.add(m);
        }
        spec.put("resources", res);

        List<Map<String, Object>> jobs = new ArrayList<>();
        for (OrderInfo o : orders) {
            boolean open = activities.values().stream()
                    .anyMatch(a -> a.orderCode().equals(o.code()) && !frozen.containsKey(a.specId()));
            if (!open) {
                continue;                                       // tutto congelato: niente da pianificare
            }
            // il resto della commessa parte dopo le sue attività congelate (prudente anche se il grafo non è una catena)
            int release = Math.max(o.releaseMin(), frozen.values().stream()
                    .filter(b -> activities.get(b.activityId()).orderCode().equals(o.code()))
                    .mapToInt(PlanChangeValidator.Bar::end).max().orElse(0));
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", o.code());
            m.put("release_min", release);
            m.put("due_min", o.dueMin());
            m.put("weight", o.weight());
            m.put("priority", o.priority());
            jobs.add(m);
        }
        spec.put("jobs", jobs);

        List<Map<String, Object>> acts = new ArrayList<>();
        for (ActivityInfo a : activities.values()) {
            if (frozen.containsKey(a.specId())) {
                continue;
            }
            List<Map<String, Object>> modes = new ArrayList<>();
            a.modes().forEach((resource, duration) -> {
                Map<String, Object> mode = new LinkedHashMap<>();
                mode.put("resource_ids", List.of(resource));
                mode.put("duration_min", duration);
                modes.add(mode);
            });
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", a.specId());
            m.put("job_id", a.orderCode());
            m.put("required_skills", a.requiredSkills());
            m.put("modes", modes);
            acts.add(m);
        }
        spec.put("activities", acts);

        List<Map<String, Object>> precedences = new ArrayList<>();
        for (Link l : links) {
            if (frozen.containsKey(l.from()) || frozen.containsKey(l.to())) {
                continue;
            }
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("from", l.from());
            m.put("to", l.to());
            m.put("type", "FS");
            m.put("min_lag_min", l.lagMin());
            if (l.maxLagMin() != null) {
                m.put("max_lag_min", l.maxLagMin());
            }
            precedences.add(m);
        }
        spec.put("precedences", precedences);
        spec.put("setup_times", setupTimes());

        Map<String, Object> options = new LinkedHashMap<>();
        options.put("time_limit_ms", timeLimitMs);
        options.put("allow_fallback", true);
        if (solver != null) {
            options.put("solver", solver);
        }
        spec.put("options", options);
        return spec;
    }

    /** I setup sono per famiglia nel DB e per coppia di attività nella ProblemSpec: si espandono qui. */
    private List<Map<String, Object>> setupTimes() {
        List<Map<String, Object>> out = new ArrayList<>();
        for (SetupRule rule : setupRules) {
            if (!resources.containsKey(rule.resourceCode())) {
                continue;
            }
            for (ActivityInfo a : activities.values()) {
                for (ActivityInfo b : activities.values()) {
                    if (a != b && !frozen.containsKey(a.specId()) && !frozen.containsKey(b.specId())
                            && rule.fromFamily().equals(a.setupFamily()) && rule.toFamily().equals(b.setupFamily())
                            && a.modes().containsKey(rule.resourceCode()) && b.modes().containsKey(rule.resourceCode())) {
                        out.add(Map.of("resource_id", rule.resourceCode(), "from_activity", a.specId(),
                                "to_activity", b.specId(), "duration_min", rule.minutes()));
                    }
                }
            }
        }
        return out;
    }
}
