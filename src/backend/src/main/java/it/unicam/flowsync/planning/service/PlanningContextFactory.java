package it.unicam.flowsync.planning.service;

import it.unicam.flowsync.common.error.ApiError;
import it.unicam.flowsync.common.error.ApiException;
import it.unicam.flowsync.configuration.domain.Resource;
import it.unicam.flowsync.configuration.domain.Skill;
import it.unicam.flowsync.configuration.domain.Unavailability;
import it.unicam.flowsync.configuration.domain.WorkCalendar;
import it.unicam.flowsync.configuration.repository.UnavailabilityRepository;
import it.unicam.flowsync.configuration.web.ConfigurationDtos;
import it.unicam.flowsync.orders.domain.Activity;
import it.unicam.flowsync.orders.domain.ActivityResource;
import it.unicam.flowsync.orders.domain.Precedence;
import it.unicam.flowsync.orders.domain.WorkOrder;
import it.unicam.flowsync.orders.repository.PrecedenceRepository;
import it.unicam.flowsync.planning.service.PlanningContext.ActivityInfo;
import it.unicam.flowsync.planning.service.PlanningContext.Block;
import it.unicam.flowsync.planning.service.PlanningContext.Link;
import it.unicam.flowsync.planning.service.PlanningContext.OrderInfo;
import it.unicam.flowsync.planning.service.PlanningContext.ResourceInfo;
import it.unicam.flowsync.planning.service.PlanningContext.SetupRule;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Legge dal DB commesse, grafi, risorse, calendario e fermi e li converte in un {@link PlanningContext}.
 * Gli errori che rendono impossibile pianificare diventano 422 con il path del campo della richiesta.
 */
@Component
public class PlanningContextFactory {

    private final PrecedenceRepository precedences;
    private final UnavailabilityRepository unavailabilities;
    private final JdbcTemplate jdbc;

    public PlanningContextFactory(PrecedenceRepository precedences, UnavailabilityRepository unavailabilities,
                                  JdbcTemplate jdbc) {
        this.precedences = precedences;
        this.unavailabilities = unavailabilities;
        this.jdbc = jdbc;
    }

    /**
     * @param orders   le commesse nell'ordine della richiesta (i path degli errori usano l'indice)
     * @param calendar calendario di riferimento; null = quello più usato dalle risorse coinvolte
     */
    @Transactional(readOnly = true)
    public PlanningContext build(List<WorkOrder> orders, Instant from, Instant to, WorkCalendar calendar) {
        List<ApiError> errors = new ArrayList<>();
        Map<String, Resource> resources = new LinkedHashMap<>();
        for (int i = 0; i < orders.size(); i++) {
            WorkOrder order = orders.get(i);
            if (order.getActivities().isEmpty()) {
                errors.add(new ApiError("NO_ACTIVITIES", "orderIds[" + i + "]",
                        "Order " + order.getCode() + " has no process graph yet"));
            }
            for (Activity a : order.getActivities()) {
                if (a.getModes().isEmpty()) {
                    errors.add(new ApiError("NO_RESOURCES", "orderIds[" + i + "]",
                            "Activity " + a.getCode() + " of " + order.getCode() + " has no allowed resource"));
                }
                a.getModes().forEach(m -> resources.putIfAbsent(m.getResource().getCode(), m.getResource()));
            }
        }
        if (!errors.isEmpty()) {
            throw ApiException.unprocessable("Some orders cannot be planned", errors);
        }

        WorkCalendar cal = calendar != null ? calendar : mostUsedCalendar(resources.values());
        ZoneId zone = ZoneId.of(cal.getTimezone());
        Map<DayOfWeek, List<WorkTimeScale.Shift>> weekly = new EnumMap<>(DayOfWeek.class);
        for (WorkCalendar.Shift s : cal.getShifts()) {
            weekly.computeIfAbsent(s.day(), d -> new ArrayList<>()).add(new WorkTimeScale.Shift(s.getStartTime(), s.getEndTime()));
        }
        WorkTimeScale scale;
        try {
            scale = WorkTimeScale.of(from, to, zone, weekly, cal.holidayDates());
        } catch (IllegalArgumentException e) {
            throw ApiException.unprocessable("Invalid planning period",
                    List.of(new ApiError("INVALID_HORIZON", "horizonEnd", e.getMessage())));
        }

        // fermi delle risorse, in minuti di lavoro; se il periodo inizia a giornata iniziata (ripianificazione),
        // i minuti del primo giorno prima dell'inizio non sono disponibili
        Map<String, List<Block>> blocks = new LinkedHashMap<>();
        int startMin = scale.toMinute(from, true);
        if (startMin > 0) {
            resources.keySet().forEach(code -> blocks.computeIfAbsent(code, k -> new ArrayList<>())
                    .add(new Block(0, startMin, "Prima dell'inizio del periodo")));
        }
        for (Unavailability u : unavailabilities.findOverlapping(resources.values(), from, to)) {
            int start = scale.toMinute(u.getStartsAt(), true);
            int end = scale.toMinute(u.getEndsAt(), false);
            if (start < end) {
                blocks.computeIfAbsent(u.getResource().getCode(), k -> new ArrayList<>())
                        .add(new Block(start, end, reasonLabel(u)));
            }
        }
        List<ResourceInfo> resourceInfos = resources.values().stream()
                .map(r -> new ResourceInfo(r.getId(), r.getCode(), r.getName(), aiType(r.getType()), r.getCostPerHour(),
                        r.getSkills().stream().map(s -> s.getSkill().getCode()).sorted().toList(),
                        List.copyOf(blocks.getOrDefault(r.getCode(), List.of()))))
                .toList();

        List<OrderInfo> orderInfos = new ArrayList<>();
        List<ActivityInfo> activityInfos = new ArrayList<>();
        List<Link> links = new ArrayList<>();
        for (WorkOrder order : orders) {
            int release = Math.max(startMin, order.getReleaseAt() == null ? 0 : scale.toMinute(order.getReleaseAt(), true));
            Integer due = order.getDueAt() == null ? null : scale.toMinute(order.getDueAt(), false);
            orderInfos.add(new OrderInfo(order.getCode(), order.getId(), release, due, order.getWeight().doubleValue(),
                    switch (order.getPriority()) { case LOW -> 1; case MEDIUM -> 2; case HIGH -> 3; }));
            order.getActivities().stream().sorted(Comparator.comparing(Activity::getId)).forEach(a -> {
                Map<String, Integer> modes = new LinkedHashMap<>();
                a.getModes().stream()
                        .sorted(Comparator.comparing((ActivityResource m) -> m.getResource().getCode()))
                        .forEach(m -> modes.put(m.getResource().getCode(),
                                m.getDurationMin() != null ? m.getDurationMin() : a.getDeclaredDurationMin()));
                activityInfos.add(new ActivityInfo(PlanningContext.specId(order.getCode(), a.getCode()), a.getId(),
                        order.getCode(), a.getName(), a.getDeclaredDurationMin(), a.getSetupFamily(),
                        a.getRequiredSkills().stream().map(Skill::getCode).sorted().toList(), modes));
            });
            for (Precedence p : precedences.findByOrder(order)) {
                links.add(new Link(PlanningContext.specId(order.getCode(), p.getPredecessor().getCode()),
                        PlanningContext.specId(order.getCode(), p.getSuccessor().getCode()), p.getLagMin(), p.getMaxLagMin()));
            }
        }

        // resource_id nullo = regola valida per tutte le risorse; una regola specifica vince su quella generale
        List<SetupRule> setups = new ArrayList<>();
        List<SetupRule> general = new ArrayList<>();
        jdbc.query("""
                        select r.code, s.from_family, s.to_family, s.setup_min
                        from setup_time s left join resource r on r.id = s.resource_id""",
                rs -> {
                    SetupRule rule = new SetupRule(rs.getString(1), rs.getString(2), rs.getString(3), rs.getInt(4));
                    (rule.resourceCode() == null ? general : setups).add(rule);
                });
        for (SetupRule g : general) {
            for (String code : resources.keySet()) {
                boolean specific = setups.stream().anyMatch(r -> r.resourceCode().equals(code)
                        && r.fromFamily().equals(g.fromFamily()) && r.toFamily().equals(g.toFamily()));
                if (!specific) {
                    setups.add(new SetupRule(code, g.fromFamily(), g.toFamily(), g.minutes()));
                }
            }
        }

        return new PlanningContext(scale, from, zone, cal.getId(), orderInfos, activityInfos, resourceInfos, links, setups);
    }

    private static WorkCalendar mostUsedCalendar(java.util.Collection<Resource> resources) {
        Map<Long, List<Resource>> byCalendar = resources.stream()
                .collect(Collectors.groupingBy(r -> r.getCalendar().getId(), LinkedHashMap::new, Collectors.toList()));
        return byCalendar.values().stream()
                .max(Comparator.comparingInt(List::size))
                .map(list -> list.get(0).getCalendar())
                .orElseThrow(() -> ApiException.unprocessable("No resource to plan on",
                        List.of(new ApiError("NO_RESOURCES", "orderIds", "The selected orders use no resource"))));
    }

    /** Il servizio AI conosce MACHINE, PERSON e ROOM: una squadra conta come persona. */
    private static String aiType(Resource.Type type) {
        return switch (type) {
            case MACHINE -> "MACHINE";
            case PERSON, TEAM -> "PERSON";
            case ROOM -> "ROOM";
        };
    }

    static String reasonLabel(Unavailability u) {
        return ConfigurationDtos.ResourceResponse.reasonLabel(u);
    }
}
