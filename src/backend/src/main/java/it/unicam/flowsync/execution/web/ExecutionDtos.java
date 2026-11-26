package it.unicam.flowsync.execution.web;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

/** Corpi JSON del contratto A.6: giornata dell'operatore, esecuzioni, segnalazioni, avvisi, KPI. */
public final class ExecutionDtos {

    private ExecutionDtos() {
    }

    public enum ExecutionEventType { START, PAUSE, RESUME, END }

    public enum IncidentKind { BREAKDOWN, MISSING_MATERIAL, DELAY, OTHER }

    public record Shift(@JsonFormat(pattern = "HH:mm") LocalTime start, @JsonFormat(pattern = "HH:mm") LocalTime end) {
    }

    public record ResourceRef(String id, String name) {
    }

    public record WaitingFor(String activityName, OffsetDateTime plannedEnd) {
    }

    /** Un'attività del piano con il suo stato reale (stesso formato in operator/today ed executions). */
    public record ActivityExecution(String planId, String activityId, String activityName, String orderId, String customer,
                                    String resourceId, String resourceName, OffsetDateTime plannedStart,
                                    OffsetDateTime plannedEnd, String state, int workedMin, OffsetDateTime runningSince,
                                    OffsetDateTime actualStart, OffsetDateTime actualEnd, WaitingFor waitingFor) {
    }

    public record OperatorToday(LocalDate date, String operatorName, String department, List<Shift> shifts,
                                List<ResourceRef> resources, List<ActivityExecution> activities) {
    }

    public record ExecutionRequest(@NotBlank String planId, @NotBlank String activityId, List<String> resourceIds,
                                   @NotNull ExecutionEventType event, OffsetDateTime timestamp,
                                   @Size(max = 500) String note) {
    }

    public record IncidentRequest(@NotNull IncidentKind kind, String resourceId, String planId, String activityId,
                                  @Size(max = 500) String note, OffsetDateTime timestamp) {
    }

    public record Created(String id) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record AlertLink(String label, String planId, String planRequestId) {
    }

    public record Alert(String id, String type, String title, String detail, OffsetDateTime createdAt, AlertLink link,
                        Map<String, Object> event) {
    }

    public record KpiPoint(LocalDate date, Integer makespanMin, int lateOrders, Double avgUtilization,
                           Double planAdherence, Double onTimeRate) {
    }

    public record ResourceUtilization(String resourceId, String resourceName, double utilization) {
    }

    public record Kpis(List<KpiPoint> points, List<ResourceUtilization> utilizationByResource) {
    }
}
