package it.unicam.flowsync.planning.web;

import it.unicam.flowsync.common.web.ApiPaths;
import it.unicam.flowsync.planning.service.DecisionService;
import it.unicam.flowsync.planning.service.GanttService;
import it.unicam.flowsync.planning.service.InterpretService;
import it.unicam.flowsync.planning.service.PlanningService;
import it.unicam.flowsync.planning.service.RescheduleService;
import it.unicam.flowsync.planning.web.PlanningDtos.Accepted;
import it.unicam.flowsync.planning.web.PlanningDtos.CreateRequest;
import it.unicam.flowsync.planning.web.PlanningDtos.DecisionRequest;
import it.unicam.flowsync.planning.web.PlanningDtos.DecisionResult;
import it.unicam.flowsync.planning.web.PlanningDtos.DecisionView;
import it.unicam.flowsync.planning.web.PlanningDtos.GanttView;
import it.unicam.flowsync.planning.web.PlanningDtos.InterpretRequest;
import it.unicam.flowsync.planning.web.PlanningDtos.InterpretResponse;
import it.unicam.flowsync.planning.web.PlanningDtos.RequestStatus;
import it.unicam.flowsync.planning.web.PlanningDtos.RequestView;
import it.unicam.flowsync.planning.web.PlanningDtos.RescheduleRequest;
import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.time.OffsetDateTime;
import java.util.List;

/** Contratti A.4 (richieste, piani, Gantt) e A.5 (decisioni). Scrivono PLANNER e ADMIN; leggono tutti gli autenticati. */
@RestController
@RequestMapping(ApiPaths.V1)
public class PlanningController {

    private final PlanningService planning;
    private final InterpretService interpreter;
    private final GanttService gantt;
    private final DecisionService decisions;
    private final RescheduleService reschedules;

    public PlanningController(PlanningService planning, InterpretService interpreter, GanttService gantt,
                              DecisionService decisions, RescheduleService reschedules) {
        this.planning = planning;
        this.interpreter = interpreter;
        this.gantt = gantt;
        this.decisions = decisions;
        this.reschedules = reschedules;
    }

    @PostMapping("/plan-requests/interpret")
    @PreAuthorize("hasAnyRole('PLANNER', 'ADMIN')")
    public InterpretResponse interpret(@Valid @RequestBody InterpretRequest body) {
        return interpreter.interpret(body.text());
    }

    /** 202 + Location: i piani arrivano dopo, il frontend interroga GET /plan-requests/{id}. */
    @PostMapping("/plan-requests")
    @PreAuthorize("hasAnyRole('PLANNER', 'ADMIN')")
    public ResponseEntity<Accepted> create(@Valid @RequestBody CreateRequest body, @AuthenticationPrincipal Jwt user) {
        Accepted accepted = planning.create(body, user.getSubject());
        return ResponseEntity.status(HttpStatus.ACCEPTED)
                .location(URI.create(ApiPaths.V1 + "/plan-requests/" + accepted.id()))
                .body(accepted);
    }

    @GetMapping("/plan-requests")
    @PreAuthorize("isAuthenticated()")
    public List<RequestView> list(@RequestParam(required = false) Integer limit,
                                  @RequestParam(required = false) String q,
                                  @RequestParam(required = false) RequestStatus status,
                                  @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME)
                                  OffsetDateTime from) {
        return planning.list(limit, q, status, from);
    }

    @GetMapping("/plan-requests/{id}")
    @PreAuthorize("isAuthenticated()")
    public RequestView get(@PathVariable String id) {
        return planning.get(id);
    }

    @GetMapping("/plans/{id}/gantt")
    @PreAuthorize("isAuthenticated()")
    public GanttView gantt(@PathVariable String id) {
        return gantt.gantt(id);
    }

    @PostMapping("/plans/{id}/decisions")
    @PreAuthorize("hasAnyRole('PLANNER', 'ADMIN')")
    public ResponseEntity<DecisionResult> decide(@PathVariable String id, @Valid @RequestBody DecisionRequest body,
                                                 @AuthenticationPrincipal Jwt user) {
        return ResponseEntity.status(HttpStatus.CREATED).body(decisions.decide(id, body, user.getSubject()));
    }

    @GetMapping("/plans/{id}/decisions")
    @PreAuthorize("isAuthenticated()")
    public List<DecisionView> history(@PathVariable String id) {
        return decisions.history(id);
    }

    /** 202 + Location come una nuova richiesta; 409 se il piano non è APPROVED. */
    @PostMapping("/plans/{id}/reschedule")
    @PreAuthorize("hasAnyRole('PLANNER', 'ADMIN')")
    public ResponseEntity<Accepted> reschedule(@PathVariable String id, @Valid @RequestBody RescheduleRequest body,
                                               @AuthenticationPrincipal Jwt user) {
        Accepted accepted = reschedules.reschedule(id, body, user.getSubject());
        return ResponseEntity.status(HttpStatus.ACCEPTED)
                .location(URI.create(ApiPaths.V1 + "/plan-requests/" + accepted.id()))
                .body(accepted);
    }
}
