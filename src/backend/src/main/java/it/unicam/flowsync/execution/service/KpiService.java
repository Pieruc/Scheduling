package it.unicam.flowsync.execution.service;

import it.unicam.flowsync.execution.domain.ExecutionEvent;
import it.unicam.flowsync.execution.repository.ExecutionEventRepository;
import it.unicam.flowsync.execution.web.ExecutionDtos.KpiPoint;
import it.unicam.flowsync.execution.web.ExecutionDtos.Kpis;
import it.unicam.flowsync.execution.web.ExecutionDtos.ResourceUtilization;
import it.unicam.flowsync.orders.domain.WorkOrder;
import it.unicam.flowsync.planning.domain.Assignment;
import it.unicam.flowsync.planning.domain.Plan;
import it.unicam.flowsync.planning.repository.PlanRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.DayOfWeek;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * {@code GET /kpis} (contratto A.6): una riga per settimana (il lunedì) dei piani approvati, in esecuzione o chiusi,
 * secondo l'inizio del loro periodo.
 * <ul>
 *   <li>makespanMin, avgUtilization: media dei piani della settimana; lateOrders: somma.</li>
 *   <li>planAdherence: attività finite entro la fine prevista (15 minuti di tolleranza) / attività finite.</li>
 *   <li>onTimeRate: commesse finite entro la scadenza / commesse finite (con scadenza).</li>
 *   <li>utilizationByResource: minuti di lavorazione / somma dei makespan dei piani del periodo.</li>
 * </ul>
 * Senza esecuzioni registrate planAdherence e onTimeRate sono null.
 */
@Service
public class KpiService {

    private static final ZoneId ZONE = ZoneId.of("Europe/Rome");
    private static final Duration TOLERANCE = Duration.ofMinutes(15);
    private static final List<Plan.Status> COUNTED = List.of(Plan.Status.APPROVED, Plan.Status.EXECUTING, Plan.Status.CLOSED);

    private final PlanRepository plans;
    private final ExecutionEventRepository events;

    public KpiService(PlanRepository plans, ExecutionEventRepository events) {
        this.plans = plans;
        this.events = events;
    }

    @Transactional(readOnly = true)
    public Kpis kpis(OffsetDateTime from, OffsetDateTime to, String profile) {
        Instant end = to != null ? to.toInstant() : Instant.now().plus(Duration.ofDays(14));
        Instant start = from != null ? from.toInstant() : end.minus(Duration.ofDays(70));
        List<Plan> selected = plans.findByStatusIn(COUNTED).stream()
                .filter(p -> !p.getRequest().getHorizonStart().isBefore(start) && p.getRequest().getHorizonStart().isBefore(end))
                .filter(p -> profile == null || profile.isBlank() || p.getRequest().getWorkOrders().stream()
                        .anyMatch(o -> o.getProfile() != null && o.getProfile().getCode().equalsIgnoreCase(profile)))
                .toList();

        Map<LocalDate, List<Plan>> byWeek = new TreeMap<>();
        selected.forEach(p -> byWeek.computeIfAbsent(p.getRequest().getHorizonStart().atZone(ZONE).toLocalDate()
                .with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)), k -> new ArrayList<>()).add(p));

        List<KpiPoint> points = new ArrayList<>();
        for (Map.Entry<LocalDate, List<Plan>> week : byWeek.entrySet()) {
            List<Plan> ps = week.getValue();
            Integer makespan = (int) Math.round(ps.stream().mapToInt(p -> p.getMakespanMin() == null ? 0 : p.getMakespanMin())
                    .average().orElse(0));
            int late = ps.stream().mapToInt(KpiService::lateOrders).sum();
            Double utilization = ps.stream().filter(p -> p.getAvgUtilization() != null)
                    .mapToDouble(p -> p.getAvgUtilization().doubleValue()).average().stream().boxed().findFirst().orElse(null);

            List<Assignment> all = ps.stream().flatMap(p -> p.getAssignments().stream()).toList();
            Map<Long, Instant> completedAt = new HashMap<>();         // per attività: vale anche dopo una ripianificazione
            if (!all.isEmpty()) {
                for (ExecutionEvent e : events.findByActivities(all.stream().map(Assignment::getActivity).distinct().toList())) {
                    if (e.getEventType() == ExecutionEvent.Type.COMPLETE) {
                        completedAt.put(e.getAssignment().getActivity().getId(), e.getOccurredAt());
                    }
                }
            }
            long done = all.stream().filter(a -> completedAt.containsKey(a.getActivity().getId())).count();
            long onPlan = all.stream().filter(a -> completedAt.containsKey(a.getActivity().getId())
                    && !completedAt.get(a.getActivity().getId()).isAfter(a.getEndAt().plus(TOLERANCE))).count();
            Double adherence = done == 0 ? null : round(onPlan / (double) done);

            Map<Long, WorkOrder> orders = new HashMap<>();
            Map<Long, Instant> orderEnd = new HashMap<>();
            for (Assignment a : all) {
                WorkOrder o = a.getActivity().getWorkOrder();
                orders.put(o.getId(), o);
                Instant c = completedAt.get(a.getActivity().getId());
                if (c != null) {
                    orderEnd.merge(o.getId(), c, (x, y) -> x.isAfter(y) ? x : y);
                }
            }
            List<WorkOrder> finished = orders.values().stream()
                    .filter(o -> o.getStatus() == WorkOrder.Status.DONE && o.getDueAt() != null && orderEnd.containsKey(o.getId()))
                    .toList();
            long onTime = finished.stream().filter(o -> !orderEnd.get(o.getId()).isAfter(o.getDueAt())).count();
            Double onTimeRate = finished.isEmpty() ? null : round(onTime / (double) finished.size());

            points.add(new KpiPoint(week.getKey(), makespan, late, utilization == null ? null : round(utilization),
                    adherence, onTimeRate));
        }

        Map<String, long[]> busy = new HashMap<>();               // codice -> [minuti di lavorazione]
        Map<String, String> names = new HashMap<>();
        long totalMakespan = 0;
        for (Plan p : selected) {
            totalMakespan += p.getMakespanMin() == null ? 0 : p.getMakespanMin();
            for (Assignment a : p.getAssignments()) {
                int minutes = a.getStartMin() != null && a.getEndMin() != null ? a.getEndMin() - a.getStartMin()
                        : a.getEstimatedDurationMin();
                busy.computeIfAbsent(a.getResource().getCode(), k -> new long[1])[0] += minutes;
                names.put(a.getResource().getCode(), a.getResource().getName());
            }
        }
        long denominator = totalMakespan;
        List<ResourceUtilization> utilization = busy.entrySet().stream()
                .map(e -> new ResourceUtilization(e.getKey(), names.get(e.getKey()),
                        denominator == 0 ? 0 : round(Math.min(1.0, e.getValue()[0] / (double) denominator))))
                .sorted(Comparator.comparingDouble(ResourceUtilization::utilization).reversed()
                        .thenComparing(ResourceUtilization::resourceId))
                .toList();
        return new Kpis(points, utilization);
    }

    private static int lateOrders(Plan p) {
        Object late = p.getKpiDetails() == null ? null : p.getKpiDetails().get("lateOrders");
        return late instanceof Number n ? n.intValue() : 0;
    }

    private static double round(double v) {
        return Math.round(v * 1000) / 1000.0;
    }
}
