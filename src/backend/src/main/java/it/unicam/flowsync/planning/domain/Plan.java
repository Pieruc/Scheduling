package it.unicam.flowsync.planning.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** Un piano candidato (Piano A, B, C…) con i suoi KPI e le sue assegnazioni. */
@Entity
@Table(name = "plan")
@Getter @Setter @NoArgsConstructor
public class Plan {

    /** Chi ha prodotto il piano. MANUAL = ricostruito a mano dal pianificatore. */
    public enum Solver { POLICY, CP_SAT, ATC, EDD, MANUAL }

    /** Le tre alternative di ogni richiesta (contratto A.4). */
    public enum Variant { ECONOMIC, BALANCED, FAST }

    public enum Status { CANDIDATE, SELECTED, APPROVED, REJECTED, EXECUTING, CLOSED, SUPERSEDED }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "request_id", nullable = false)
    private PlanningRequest request;

    /** Piano da cui è nata una ripianificazione (es. dopo un guasto). */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "parent_plan_id")
    private Plan parentPlan;

    @Column(nullable = false, length = 100)
    private String label;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.VARCHAR)
    @Column(length = 10)
    private Variant variant;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.VARCHAR)
    @Column(nullable = false, length = 10)
    private Solver solver;

    /** Es. "m2-policy-1.3"; null per ATC/EDD. */
    @Column(name = "model_version", length = 40)
    private String modelVersion;

    @Column(name = "fallback_used", nullable = false, columnDefinition = "TINYINT(1)")
    private boolean fallbackUsed;

    /** Confidenza dichiarata dalla policy (0..1); null per le regole. */
    @Column(precision = 4, scale = 3)
    private BigDecimal confidence;

    /** Frase che riassume il compromesso, es. "Nessun ritardo, 3 cambi di setup". */
    @Column(length = 255)
    private String summary;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.VARCHAR)
    @Column(nullable = false, length = 20)
    private Status status = Status.CANDIDATE;

    @Column(name = "makespan_min")
    private Integer makespanMin;

    @Column(name = "total_tardiness_min")
    private Integer totalTardinessMin;

    @Column(name = "overtime_min")
    private Integer overtimeMin;

    @Column(name = "avg_utilization", precision = 5, scale = 4)
    private BigDecimal avgUtilization;

    @Column(name = "setup_count")
    private Integer setupCount;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "kpi_details")
    private Map<String, Object> kpiDetails;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "objective_weights", nullable = false)
    private Map<String, Object> objectiveWeights = new HashMap<>();

    @OneToMany(mappedBy = "plan", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("startAt")
    private List<Assignment> assignments = new ArrayList<>();

    @Column(name = "created_at", nullable = false, updatable = false, insertable = false)
    private Instant createdAt;

    @Version
    private int version;
}
