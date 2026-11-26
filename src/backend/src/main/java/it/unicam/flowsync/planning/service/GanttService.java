package it.unicam.flowsync.planning.service;

import it.unicam.flowsync.common.error.ApiException;
import it.unicam.flowsync.planning.domain.Assignment;
import it.unicam.flowsync.planning.domain.Plan;
import it.unicam.flowsync.planning.repository.PlanRepository;
import it.unicam.flowsync.planning.service.PlanChangeValidator.Bar;
import it.unicam.flowsync.planning.web.PlanningDtos.Estimate;
import it.unicam.flowsync.planning.web.PlanningDtos.GanttBar;
import it.unicam.flowsync.planning.web.PlanningDtos.GanttPrecedence;
import it.unicam.flowsync.planning.web.PlanningDtos.GanttResource;
import it.unicam.flowsync.planning.web.PlanningDtos.GanttView;
import it.unicam.flowsync.planning.web.PlanningDtos.Unavailable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * {@code GET /plans/{id}/gantt} (contratto A.4): il piano nella scala dei minuti di lavoro, con tutto quello che serve
 * al frontend per disegnarlo e per controllare gli spostamenti senza conoscere i calendari.
 */
@Service
public class GanttService {

    private final PlanRepository plans;
    private final PlanningRunner runner;

    public GanttService(PlanRepository plans, PlanningRunner runner) {
        this.plans = plans;
        this.runner = runner;
    }

    @Transactional(readOnly = true)
    public GanttView gantt(String planId) {
        Plan plan = load(plans, planId);
        PlanningContext ctx = runner.contextOf(plan.getRequest());
        return view(plan, ctx);
    }

    static Plan load(PlanRepository plans, String planId) {
        return plans.findById(PlanAssembler.parsePlanId(planId))
                .orElseThrow(() -> ApiException.notFound("Plan " + planId + " not found"));
    }

    static GanttView view(Plan plan, PlanningContext ctx) {
        WorkTimeScale scale = ctx.scale();
        List<Bar> bars = PlanAssembler.barsOf(plan, ctx);
        Map<String, Integer> planned = bars.stream().collect(Collectors.toMap(Bar::activityId, b -> b.end() - b.start()));
        Map<String, Map<String, Integer>> durations = ctx.durations(planned);
        Set<String> manual = plan.getAssignments().stream().filter(Assignment::isManuallyModified)
                .map(a -> PlanningContext.specId(a.getActivity().getWorkOrder().getCode(), a.getActivity().getCode()))
                .collect(Collectors.toSet());

        // minuti in fondo ai giorni più corti: nessuno può lavorarci, il Gantt li mostra come non disponibili
        List<Unavailable> offShift = new ArrayList<>();
        int cursor = 0;
        for (int[] w : scale.workingWindows()) {
            if (w[0] > cursor) {
                offShift.add(new Unavailable(cursor, w[0], "Fuori turno"));
            }
            cursor = w[1];
        }
        if (cursor < scale.totalMinutes()) {
            offShift.add(new Unavailable(cursor, scale.totalMinutes(), "Fuori turno"));
        }

        List<GanttResource> resources = ctx.resources().values().stream()
                .map(r -> {
                    List<Unavailable> blocks = new ArrayList<>(offShift);
                    r.blocks().forEach(b -> blocks.add(new Unavailable(b.start(), b.end(), b.reason())));
                    blocks.sort(Comparator.comparingInt(Unavailable::start));
                    return new GanttResource(r.code(), r.name(), blocks);
                })
                .toList();

        List<GanttBar> ganttBars = bars.stream()
                .sorted(Comparator.comparing(Bar::resourceId).thenComparingInt(Bar::start))
                .map(b -> {
                    PlanningContext.ActivityInfo a = ctx.activities().get(b.activityId());
                    Integer declared = a.modes().get(b.resourceId());
                    Estimate estimate = declared == null ? new Estimate(b.end() - b.start(), null, null, null) : null;
                    return new GanttBar(b.activityId(), a.name(), a.orderCode(), b.resourceId(), b.start(), b.end(),
                            durations.get(b.activityId()), declared, estimate, manual.contains(b.activityId()));
                })
                .toList();

        Map<String, Integer> due = new LinkedHashMap<>();
        ctx.orders().forEach(o -> due.put(o.code(), o.dueMin()));

        return new GanttView(PlanAssembler.planId(plan.getId()), PlanAssembler.requestId(plan.getRequest().getId()),
                PlanAssembler.apiStatus(plan.getStatus()), plan.getVariant() == null ? null : plan.getVariant().name(),
                plan.getSolver().name(), plan.getModelVersion(),
                plan.getConfidence() == null ? null : plan.getConfidence().doubleValue(), PlanAssembler.kpisOf(plan),
                scale.days().stream().map(LocalDate::toString).toList(), scale.minutesPerDay(), resources, ganttBars,
                ctx.links().stream().map(l -> new GanttPrecedence(l.from(), l.to())).toList(), due, manual.size());
    }
}
