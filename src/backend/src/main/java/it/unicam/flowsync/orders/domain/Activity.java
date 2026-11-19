package it.unicam.flowsync.orders.domain;

import it.unicam.flowsync.configuration.domain.Resource;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.util.HashSet;
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

    @Column(nullable = false, length = 30)
    private String code;

    @Column(nullable = false, length = 150)
    private String name;

    /** null = la durata la stima M1. */
    @Column(name = "declared_duration_min")
    private Integer declaredDurationMin;

    @Column(name = "required_skill_id")
    private Long requiredSkillId;

    /** Famiglia per i setup dipendenti dalla sequenza (es. colore in verniciatura). */
    @Column(name = "setup_family", length = 40)
    private String setupFamily;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.VARCHAR)
    @Column(nullable = false, length = 20)
    private Status status = Status.PENDING;

    /**
     * Risorse ammesse ("modi"). La durata specifica per risorsa, se serve,
     * richiede di mappare activity_resource come entità con chiave composta.
     */
    @ManyToMany
    @JoinTable(name = "activity_resource",
               joinColumns = @JoinColumn(name = "activity_id"),
               inverseJoinColumns = @JoinColumn(name = "resource_id"))
    private Set<Resource> eligibleResources = new HashSet<>();
}
