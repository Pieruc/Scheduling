package it.unicam.flowsync.planning.domain;

import it.unicam.flowsync.configuration.domain.WorkCalendar;
import it.unicam.flowsync.orders.domain.WorkOrder;
import it.unicam.flowsync.security.domain.AppUser;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.*;

/** Un clic su "Conferma e genera piani": cosa è stato chiesto al servizio AI e con quali pesi. */
@Entity
@Table(name = "planning_request")
@Getter @Setter @NoArgsConstructor
public class PlanningRequest {

    public enum Status { QUEUED, RUNNING, DONE, FAILED }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "requested_by", nullable = false)
    private AppUser requestedBy;

    /** Descrizione breve per gli elenchi, es. "Commesse C-101 – C-104" (migrazione V9). */
    @Column(length = 150)
    private String label;

    /** Calendario che definisce la scala in minuti di lavoro del periodo (migrazione V9). */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "calendar_id")
    private WorkCalendar calendar;

    /** Fase in corso mentre la richiesta è in lavorazione (VALIDATION, CONTEXT, POLICY, BASELINES). */
    @Column(length = 20)
    private String stage;

    /** Confronto con le regole sugli stessi dati: [{"solver":"ATC","kpis":{...}}, ...] (migrazione V9). */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "baselines")
    private List<Map<String, Object>> baselines;

    @Column(name = "elapsed_ms")
    private Integer elapsedMs;

    /** Ripianificazione (contratto A.4): il piano approvato da cui si riparte, l'evento e l'istante di congelamento. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "reschedule_of")
    private Plan rescheduleOf;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "trigger_event")
    private Map<String, Object> triggerEvent;

    @Column(name = "freeze_before")
    private Instant freezeBefore;

    @Column(name = "horizon_start", nullable = false)
    private Instant horizonStart;

    @Column(name = "horizon_end", nullable = false)
    private Instant horizonEnd;

    /** Testo libero se il pianificatore ha usato l'LLM, altrimenti null. */
    @Column(name = "prompt_text", columnDefinition = "TEXT")
    private String promptText;

    /** Snapshot della ProblemSpec inviata a POST /optimize: rende il piano riproducibile. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "problem_spec", nullable = false)
    private Map<String, Object> problemSpec = new HashMap<>();

    @Column(name = "spec_version", nullable = false, length = 10)
    private String specVersion = "1.0";

    /** Es. {"tardiness": 8, "overtime": 7, "setup": 4}. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "objective_weights", nullable = false)
    private Map<String, Object> objectiveWeights = new HashMap<>();

    @Column(name = "candidates_requested", nullable = false)
    private int candidatesRequested = 3;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.VARCHAR)
    @Column(nullable = false, length = 20)
    private Status status = Status.QUEUED;

    @Column(name = "error_message", length = 500)
    private String errorMessage;

    @ManyToMany
    @JoinTable(name = "planning_request_order",
               joinColumns = @JoinColumn(name = "request_id"),
               inverseJoinColumns = @JoinColumn(name = "work_order_id"))
    private Set<WorkOrder> workOrders = new HashSet<>();

    @OneToMany(mappedBy = "request", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<Plan> plans = new ArrayList<>();

    @Column(name = "created_at", nullable = false, updatable = false, insertable = false)
    private Instant createdAt;

    @Column(name = "completed_at")
    private Instant completedAt;
}
