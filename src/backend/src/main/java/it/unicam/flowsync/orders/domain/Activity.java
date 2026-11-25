package it.unicam.flowsync.orders.domain;

import it.unicam.flowsync.configuration.domain.Skill;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.util.LinkedHashSet;
import java.util.Set;

/** Un nodo del grafo: un'operazione da svolgere su una delle risorse ammesse. */
@Entity
@Table(name = "activity",
       uniqueConstraints = @UniqueConstraint(name = "uk_activity_code", columnNames = {"work_order_id", "code"}))
@Getter @Setter @NoArgsConstructor
public class Activity {

    public enum Status { PENDING, IN_PROGRESS, DONE, CANCELLED }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "work_order_id", nullable = false)
    private WorkOrder workOrder;

    /** Codice univoco dentro la commessa: è l'id dell'attività nell'API (es. "T"). */
    @Column(nullable = false, length = 30)
    private String code;

    @Column(nullable = false, length = 150)
    private String name;

    /** Durata comune a tutti i modi; null = diversa per risorsa, oppure da stimare con M1. */
    @Column(name = "declared_duration_min")
    private Integer declaredDurationMin;

    /** Famiglia per i setup dipendenti dalla sequenza (es. colore in verniciatura). */
    @Column(name = "setup_family", length = 40)
    private String setupFamily;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.VARCHAR)
    @Column(nullable = false, length = 20)
    private Status status = Status.PENDING;

    /** Competenze richieste (tabella activity_skill, migrazione V8). */
    @ManyToMany
    @JoinTable(name = "activity_skill",
               joinColumns = @JoinColumn(name = "activity_id"),
               inverseJoinColumns = @JoinColumn(name = "skill_id"))
    private Set<Skill> requiredSkills = new LinkedHashSet<>();

    /** Modi: risorse ammesse con l'eventuale durata specifica. Si modificano solo dal servizio. */
    @OneToMany(mappedBy = "activity", cascade = CascadeType.ALL, orphanRemoval = true)
    private Set<ActivityResource> modes = new LinkedHashSet<>();
}
