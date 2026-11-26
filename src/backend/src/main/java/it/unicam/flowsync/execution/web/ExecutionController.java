package it.unicam.flowsync.execution.web;

import it.unicam.flowsync.common.web.ApiPaths;
import it.unicam.flowsync.execution.service.ExecutionService;
import it.unicam.flowsync.execution.service.IncidentService;
import it.unicam.flowsync.execution.service.KpiService;
import it.unicam.flowsync.execution.web.ExecutionDtos.ActivityExecution;
import it.unicam.flowsync.execution.web.ExecutionDtos.Alert;
import it.unicam.flowsync.execution.web.ExecutionDtos.Created;
import it.unicam.flowsync.execution.web.ExecutionDtos.ExecutionRequest;
import it.unicam.flowsync.execution.web.ExecutionDtos.IncidentRequest;
import it.unicam.flowsync.execution.web.ExecutionDtos.Kpis;
import it.unicam.flowsync.execution.web.ExecutionDtos.OperatorToday;
import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.OffsetDateTime;
import java.util.List;

/** Contratto A.6: giornata dell'operatore, esecuzioni, segnalazioni, avvisi e KPI. */
@RestController
@RequestMapping(ApiPaths.V1)
public class ExecutionController {

    private final ExecutionService executions;
    private final IncidentService incidents;
    private final KpiService kpis;

    public ExecutionController(ExecutionService executions, IncidentService incidents, KpiService kpis) {
        this.executions = executions;
        this.incidents = incidents;
        this.kpis = kpis;
    }

    @GetMapping("/operator/today")
    @PreAuthorize("hasRole('OPERATOR')")
    public OperatorToday today(@AuthenticationPrincipal Jwt user) {
        return executions.today(user.getSubject());
    }

    /** 201 con l'attività aggiornata; 409 se il passaggio non è ammesso. */
    @PostMapping("/executions")
    @PreAuthorize("hasRole('OPERATOR')")
    public ResponseEntity<ActivityExecution> record(@Valid @RequestBody ExecutionRequest body, @AuthenticationPrincipal Jwt user) {
        return ResponseEntity.status(HttpStatus.CREATED).body(executions.record(body, user.getSubject()));
    }

    @GetMapping("/executions")
    @PreAuthorize("isAuthenticated()")
    public List<ActivityExecution> ofPlan(@RequestParam String planId) {
        return executions.ofPlan(planId);
    }

    @PostMapping("/incidents")
    @PreAuthorize("hasRole('OPERATOR')")
    public ResponseEntity<Created> report(@Valid @RequestBody IncidentRequest body, @AuthenticationPrincipal Jwt user) {
        return ResponseEntity.status(HttpStatus.CREATED).body(incidents.report(body, user.getSubject()));
    }

    @GetMapping("/alerts")
    @PreAuthorize("hasAnyRole('PLANNER', 'ADMIN')")
    public List<Alert> alerts() {
        return incidents.alerts();
    }

    @GetMapping("/kpis")
    @PreAuthorize("isAuthenticated()")
    public Kpis kpis(@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime from,
                     @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime to,
                     @RequestParam(required = false) String profile) {
        return kpis.kpis(from, to, profile);
    }
}
