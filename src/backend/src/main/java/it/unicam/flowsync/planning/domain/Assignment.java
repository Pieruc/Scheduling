package it.unicam.flowsync.planning.domain;

import it.unicam.flowsync.configuration.domain.Resource;
import it.unicam.flowsync.orders.domain.Activity;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.Instant;

/** Una barra del Gantt: attività su una risorsa, da start a end, con la stima di M1. */
@Entity
@Table(name = "assignment",
       uniqueConstraints = @UniqueConstraint(name = "uk_assignment", columnNames = {"plan_id", "activity_id"}))
@Getter @Setter @NoArgsConstructor
public class Assignment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "plan_id", nullable = false)
    private Plan plan;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "activity_id", nullable = false)
    private Activity activity;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "resource_id", nullable = false)
    private Resource resource;

    @Column(name = "start_at", nullable = false)
    private Instant startAt;

    @Column(name = "end_at", nullable = false)
    private Instant endAt;

    /** Inizio e fine in minuti di lavoro dall'inizio del periodo: la scala del Gantt (migrazione V9). */
    @Column(name = "start_min")
    private Integer startMin;

    @Column(name = "end_min")
    private Integer endMin;

    /** Mediana stimata da M1. */
    @Column(name = "estimated_duration_min", nullable = false)
    private int estimatedDurationMin;

    @Column(name = "estimate_p10_min")
    private Integer estimateP10Min;

    @Column(name = "estimate_p90_min")
    private Integer estimateP90Min;

    /** 0..1, mostrata nel pannello "Attività selezionata". */
    @Column(precision = 4, scale = 3)
    private BigDecimal confidence;

    /** true = la ripianificazione non la sposta. */
    @Column(nullable = false, columnDefinition = "TINYINT(1)")
    private boolean locked;

    @Column(name = "manually_modified", nullable = false, columnDefinition = "TINYINT(1)")
    private boolean manuallyModified;
}
