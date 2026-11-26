package it.unicam.flowsync.planning.service;

import it.unicam.flowsync.planning.service.PlanChangeValidator.Bar;
import it.unicam.flowsync.planning.service.PlanChangeValidator.Change;
import it.unicam.flowsync.planning.service.PlanChangeValidator.Edge;
import it.unicam.flowsync.planning.service.PlanChangeValidator.Result;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** Le regole della decisione MODIFY (contratto A.5) sul pezzo T -> F -> S di C-101. */
class PlanChangeValidatorTest {

    static final List<Bar> BARS = List.of(new Bar("T", "LASER", 0, 120), new Bar("F", "CNC1", 120, 300), new Bar("S", "WELD1", 300, 480));
    static final Map<String, Map<String, Integer>> DURATIONS = Map.of("T", Map.of("LASER", 120),
            "F", Map.of("CNC1", 180, "CNC2", 210), "S", Map.of("WELD1", 180, "WELD2", 180));
    static final List<Edge> EDGES = List.of(new Edge("T", "F", 0), new Edge("F", "S", 0));
    static final Map<String, List<int[]>> DOWN = Map.of("CNC2", List.of(new int[]{480, 960}));

    static Result apply(Change... changes) {
        return PlanChangeValidator.apply(BARS, List.of(changes), DURATIONS, EDGES, DOWN, 1920);
    }

    static String first(Result r) {
        return r.problems().get(0).code() + "@" + r.problems().get(0).path();
    }

    @Test
    void aValidMoveUsesTheDurationOfTheNewResource() {
        Result ok = apply(new Change("F", "CNC2", 120), new Change("S", "WELD1", 330));
        assertThat(ok.problems()).isEmpty();
        assertThat(ok.bars().get(1)).isEqualTo(new Bar("F", "CNC2", 120, 330));
    }

    @Test
    void movingToASlowerResourceCanBreakAPrecedence() {
        assertThat(first(apply(new Change("F", "CNC2", 120)))).isEqualTo("PRECEDENCE_VIOLATION@changes[0].start");
        assertThat(first(apply(new Change("S", "WELD2", 200)))).isEqualTo("PRECEDENCE_VIOLATION@changes[0].start");
    }

    @Test
    void everyRuleHasItsOwnCode() {
        assertThat(first(apply(new Change("F", "CNC2", 400)))).startsWith("RESOURCE_UNAVAILABLE");
        assertThat(first(apply(new Change("T", "CNC1", 0)))).isEqualTo("RESOURCE_NOT_ALLOWED@changes[0].resourceId");
        assertThat(first(apply(new Change("S", "WELD1", 1800)))).startsWith("OUT_OF_PERIOD");
        assertThat(first(apply(new Change("Z", "WELD1", 0)))).isEqualTo("UNKNOWN_ACTIVITY@changes[0].activityId");
        Result overlap = PlanChangeValidator.apply(List.of(new Bar("T", "LASER", 0, 120), new Bar("X", "LASER", 200, 260)),
                List.of(new Change("T", "LASER", 100)), Map.of("T", Map.of("LASER", 120)), List.of(), Map.of(), 1920);
        assertThat(first(overlap)).startsWith("OVERLAP");
    }
}
