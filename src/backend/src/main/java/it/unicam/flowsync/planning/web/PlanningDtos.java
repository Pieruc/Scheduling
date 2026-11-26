package it.unicam.flowsync.planning.web;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

/** Corpi JSON dei contratti A.4 (richieste, piani, Gantt) e A.5 (decisioni). */
public final class PlanningDtos {

    private PlanningDtos() {
    }

    public enum RequestStatus { PENDING, COMPLETED, FAILED }

    public enum PlanStatus { PENDING, PROPOSED, APPROVED, REJECTED, SUPERSEDED, FAILED }

    public enum DecisionType { APPROVE, MODIFY, REJECT }

    /** I tre slider del frontend, da 0 a 10. */
    public record Weights(@Min(0) @Max(10) int punctuality, @Min(0) @Max(10) int overtime, @Min(0) @Max(10) int setup) {
    }

    // ---------------------------------------------------------------- interpretazione

    public record InterpretRequest(@NotBlank String text) {
    }

    public record Option(String value, String label) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record MissingData(String id, String kind, String orderId, String question, List<Option> options) {
    }

    public record InterpretResponse(OffsetDateTime horizonStart, OffsetDateTime horizonEnd, List<String> orderIds,
                                    List<String> hardConstraints, List<String> preferences, Weights weights,
                                    List<String> weightNotes, List<MissingData> missingData) {
    }

    // ---------------------------------------------------------------- richieste

    public record CreateRequest(String text, @NotNull OffsetDateTime horizonStart, @NotNull OffsetDateTime horizonEnd,
                                @NotEmpty List<@NotBlank String> orderIds, @Valid Weights weights,
                                Map<String, String> answers) {
    }

    public record Accepted(String id, RequestStatus status) {
    }

    public record PlanSummary(String id, String variant, PlanStatus status, String solver, String modelVersion,
                              Double confidence, OffsetDateTime createdAt, String summary, Map<String, Object> kpis,
                              String parentPlanId) {
    }

    public record RequestView(String id, RequestStatus status, String stage, OffsetDateTime createdAt, String createdBy,
                              String label, List<String> orderIds, OffsetDateTime horizonStart,
                              OffsetDateTime horizonEnd, Map<String, Object> weights, String recommendedPlanId,
                              Double elapsedSeconds, List<PlanSummary> plans, List<Map<String, Object>> baselines,
                              String rescheduleOf, Map<String, Object> event, String error) {
    }

    // ---------------------------------------------------------------- Gantt

    public record Unavailable(int start, int end, String reason) {
    }

    public record GanttResource(String id, String name, List<Unavailable> unavailable) {
    }

    public record Estimate(int value, Integer low, Integer high, Double confidence) {
    }

    public record GanttBar(String activityId, String activityName, String orderId, String resourceId, int start, int end,
                           Map<String, Integer> durations, Integer declaredMin, Estimate estimate, boolean manual) {
    }

    public record GanttPrecedence(String from, String to) {
    }

    public record GanttView(String planId, String requestId, PlanStatus status, String variant, String solver,
                            String modelVersion, Double confidence, Map<String, Object> kpis, List<String> days,
                            int minutesPerDay, List<GanttResource> resources, List<GanttBar> bars,
                            List<GanttPrecedence> precedences, Map<String, Integer> dueByOrder, int manualChanges) {
    }

    // ---------------------------------------------------------------- ripianificazione

    public enum EventType { RESOURCE_DOWN, URGENT_ORDER, DELAY }

    public enum Scope { MINIMAL, FULL }

    /** L'evento da cui nasce la ripianificazione; i campi usati dipendono dal tipo (contratto A.4). */
    public record RescheduleEvent(@NotNull EventType type, String resourceId, OffsetDateTime from, OffsetDateTime to,
                                  String orderId, OffsetDateTime dueDate, Integer delayMin) {
    }

    public record RescheduleRequest(@NotNull @Valid RescheduleEvent event, OffsetDateTime freezeBefore, String alertId,
                                    @Valid Weights weights, Scope scope, String note) {
    }

    // ---------------------------------------------------------------- decisioni

    public record Change(@NotBlank String activityId, @NotBlank String resourceId, @NotNull Integer start) {
    }

    public record DecisionRequest(@NotNull DecisionType decision, String reason, List<@NotNull @Valid Change> changes) {
    }

    public record DecisionResult(String planId, PlanStatus status) {
    }

    public record DecisionView(DecisionType decision, String reason, String decidedBy, OffsetDateTime decidedAt) {
    }
}
