package it.unicam.flowsync.planning.service;

import it.unicam.flowsync.planning.service.PlanChangeValidator.Bar;
import it.unicam.flowsync.planning.service.PlanningContext.ActivityInfo;
import it.unicam.flowsync.planning.service.PlanningContext.Block;
import it.unicam.flowsync.planning.service.PlanningContext.Link;
import it.unicam.flowsync.planning.service.PlanningContext.OrderInfo;
import it.unicam.flowsync.planning.service.PlanningContext.ResourceInfo;
import it.unicam.flowsync.planning.service.PlanningContext.SetupRule;
import it.unicam.flowsync.planning.domain.Plan;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** ProblemSpec, durate, KPI e pesi delle varianti su un contesto piccolo, senza DB. */
class PlanningContextTest {

    static PlanningContext context() {
        WorkTimeScale scale = WorkTimeScale.of(WorkTimeScaleTest.at(11, 26, 8, 0), WorkTimeScaleTest.at(11, 27, 17, 0),
                WorkTimeScaleTest.ROME, WorkTimeScaleTest.WEEKLY, List.of());
        Map<String, Integer> milling = new LinkedHashMap<>();
        milling.put("CNC1", 180);
        milling.put("CNC2", 150);
        Map<String, Integer> painting = new LinkedHashMap<>();
        painting.put("PAINT", null);                                   // da stimare
        return new PlanningContext(scale, WorkTimeScaleTest.at(11, 26, 8, 0), WorkTimeScaleTest.ROME, 1L,
                List.of(new OrderInfo("C-101", 1L, 0, 600, 3.0, 3), new OrderInfo("C-102", 2L, 0, null, 1.0, 1)),
                List.of(new ActivityInfo("C-101/T", 11L, "C-101", "Taglio", 120, "ACCIAIO", List.of(), Map.of("LASER", 120)),
                        new ActivityInfo("C-101/F", 12L, "C-101", "Fresatura", 180, "ACCIAIO", List.of(), milling),
                        new ActivityInfo("C-101/V", 13L, "C-101", "Verniciatura", null, "RAL7035", List.of(), painting),
                        new ActivityInfo("C-102/V", 21L, "C-102", "Verniciatura", 45, "RAL9005", List.of(), Map.of("PAINT", 45))),
                List.of(new ResourceInfo(1L, "LASER", "Laser", "MACHINE", new BigDecimal("65"), List.of(), List.of()),
                        new ResourceInfo(2L, "CNC1", "Fresa 1", "MACHINE", new BigDecimal("80"), List.of(), List.of()),
                        new ResourceInfo(3L, "CNC2", "Fresa 2", "MACHINE", new BigDecimal("72"), List.of(), List.of(new Block(0, 480, "Manutenzione"))),
                        new ResourceInfo(4L, "PAINT", "Verniciatura", "MACHINE", null, List.of(), List.of())),
                List.of(new Link("C-101/T", "C-101/F", 0, null), new Link("C-101/F", "C-101/V", 0, null)),
                List.of(new SetupRule("PAINT", "RAL7035", "RAL9005", 30), new SetupRule("PAINT", "RAL9005", "RAL7035", 30)));
    }

    @Test
    @SuppressWarnings("unchecked")
    void theProblemSpecFollowsContractB() {
        Map<String, Object> spec = context().problemSpec("REQ-0001-BALANCED", "FACTORY",
                Map.of("makespan", 1.0), "ATC", 5000);
        assertThat(spec.get("horizon")).isEqualTo(Map.of("start", "2026-11-26T08:00+01:00", "length_min", 960));
        List<Map<String, Object>> resources = (List<Map<String, Object>>) spec.get("resources");
        assertThat(resources.get(2).get("availability")).isEqualTo(List.of(List.of(480, 960)));   // CNC2 ferma il primo giorno
        List<Map<String, Object>> activities = (List<Map<String, Object>>) spec.get("activities");
        assertThat(activities.get(2).get("modes").toString()).contains("duration_min=null");
        List<Map<String, Object>> setups = (List<Map<String, Object>>) spec.get("setup_times");
        assertThat(setups).hasSize(2);                                 // per coppia di attività, sulla verniciatura
        assertThat(((Map<String, Object>) spec.get("options")).get("solver")).isEqualTo("ATC");
    }

    @Test
    void missingDurationsAreFilledLikeTheAiService() {
        assertThat(context().durations(Map.of("C-101/V", 75)).get("C-101/V").get("PAINT")).isEqualTo(75);
        assertThat(context().durations(Map.of()).get("C-101/V").get("PAINT")).isEqualTo(60);
    }

    @Test
    void kpisAreComputedOnTheBars() {
        PlanKpis k = PlanKpis.of(context(), List.of(new Bar("C-101/T", "LASER", 0, 120), new Bar("C-101/F", "CNC1", 120, 300),
                new Bar("C-101/V", "PAINT", 600, 660), new Bar("C-102/V", "PAINT", 660, 705)));
        assertThat(k.makespanMin()).isEqualTo(705);
        assertThat(k.totalTardinessMin()).isEqualTo(60);              // C-101 finisce a 660, scadenza 600
        assertThat(k.lateOrders()).isEqualTo(1);
        assertThat(k.setupCount()).isEqualTo(1);                      // RAL7035 -> RAL9005
        assertThat(k.totalSetupMin()).isEqualTo(30);
        assertThat(k.estimatedCost()).isEqualByComparingTo("370");    // (120*65 + 180*80) / 60
        assertThat(k.avgUtilization()).isEqualTo(0.1436);             // (120+180+0+105) / 705 / 4
    }

    @Test
    void theThreeVariantsWeighTheObjectivesDifferently() {
        Map<String, Object> sliders = Map.of("punctuality", 8, "overtime", 7, "setup", 4);
        Map<String, Double> balanced = PlanAssembler.objectiveWeights(Plan.Variant.BALANCED, sliders);
        assertThat(balanced.values().stream().mapToDouble(Double::doubleValue).sum()).isCloseTo(1.0, org.assertj.core.data.Offset.offset(0.01));
        assertThat(balanced.get("weighted_tardiness")).isGreaterThan(balanced.get("setup"));
        assertThat(PlanAssembler.objectiveWeights(Plan.Variant.FAST, sliders).get("makespan")).isGreaterThan(0.5);
        assertThat(PlanAssembler.objectiveWeights(Plan.Variant.ECONOMIC, sliders).get("setup")).isGreaterThan(0.5);
    }
}
