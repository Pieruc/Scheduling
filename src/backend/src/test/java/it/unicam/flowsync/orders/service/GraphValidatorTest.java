package it.unicam.flowsync.orders.service;

import it.unicam.flowsync.orders.service.GraphValidator.Edge;
import it.unicam.flowsync.orders.service.GraphValidator.Mode;
import it.unicam.flowsync.orders.service.GraphValidator.Node;
import it.unicam.flowsync.orders.service.GraphValidator.Problem;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** Logica pura del controllo del grafo (senza Spring né Docker). */
class GraphValidatorTest {

    private static Node n(String id, String... resources) {
        return new Node(id, Arrays.stream(resources).map(r -> new Mode(List.of(r), 60)).toList());
    }

    private static Edge e(String from, String to) {
        return new Edge(from, to, "FS", 0, null);
    }

    private static List<String> codes(List<Problem> problems) {
        return problems.stream().map(p -> p.code() + "@" + p.path()).toList();
    }

    @Test
    void theSeededGraphOfC101IsValid() {
        List<Node> nodes = List.of(n("T", "LASER"), n("F", "CNC1", "CNC2"), n("P", "PRESS"), n("S", "WELD1", "WELD2"),
                n("V", "PAINT"), n("C", "QC"));
        List<Edge> edges = List.of(e("T", "F"), e("T", "P"), e("F", "S"), e("P", "S"), e("S", "V"), e("V", "C"));
        assertThat(GraphValidator.validate(nodes, edges)).isEmpty();
    }

    @Test
    void aCycleIsReportedWithItsPath() {
        List<Problem> problems = GraphValidator.validate(List.of(n("A", "R"), n("B", "R"), n("C", "R")),
                List.of(e("A", "B"), e("B", "C"), e("C", "A")));
        assertThat(codes(problems)).containsExactly("CYCLIC_PRECEDENCE@precedences");
        assertThat(problems.get(0).message()).isEqualTo("Cycle A -> B -> C -> A");
    }

    @Test
    void aCycleIsFoundAfterAnAcyclicBranch() {
        assertThat(GraphValidator.findCycle(List.of("A", "B", "C", "D"),
                List.of(e("A", "D"), e("A", "B"), e("B", "C"), e("C", "B")))).containsExactly("B", "C", "B");
    }

    @Test
    void selfLoopsAreCycles() {
        assertThat(codes(GraphValidator.validate(List.of(n("A", "R")), List.of(e("A", "A")))))
                .containsExactly("CYCLIC_PRECEDENCE@precedences[0]");
    }

    @Test
    void activitiesAndModesAreChecked() {
        assertThat(codes(GraphValidator.validate(List.of(n("A", "R"), n("A", "R")), List.of())))
                .containsExactly("DUPLICATE_ACTIVITY@activities[1].id");
        assertThat(codes(GraphValidator.validate(List.of(new Node("A", List.of())), List.of())))
                .containsExactly("NO_MODE@activities[0].modes");
        assertThat(codes(GraphValidator.validate(List.of(new Node("A", List.of(new Mode(List.of("R1", "R2"), 10)))), List.of())))
                .containsExactly("MODE_RESOURCE_COUNT@activities[0].modes[0].resourceIds");
        assertThat(codes(GraphValidator.validate(List.of(n("A", "R", "R")), List.of())))
                .containsExactly("DUPLICATE_MODE@activities[0].modes[1].resourceIds");
    }

    @Test
    void precedencesAreChecked() {
        List<Node> ab = List.of(n("A", "R"), n("B", "R"));
        assertThat(codes(GraphValidator.validate(List.of(n("A", "R")), List.of(e("A", "Z")))))
                .containsExactly("UNKNOWN_ACTIVITY@precedences[0].to");
        assertThat(codes(GraphValidator.validate(ab, List.of(new Edge("A", "B", "SS", 0, null)))))
                .containsExactly("UNSUPPORTED_PRECEDENCE_TYPE@precedences[0].type");
        assertThat(codes(GraphValidator.validate(ab, List.of(e("A", "B"), e("A", "B")))))
                .containsExactly("DUPLICATE_PRECEDENCE@precedences[1]");
        assertThat(codes(GraphValidator.validate(ab, List.of(new Edge("A", "B", null, 30, 10)))))
                .containsExactly("INVALID_LAG@precedences[0].maxLagMin");
        assertThat(GraphValidator.validate(ab, List.of(new Edge("A", "B", null, null, null)))).isEmpty();   // null = FS, lag 0
    }
}
