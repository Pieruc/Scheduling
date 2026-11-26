package it.unicam.flowsync.configuration.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Profilo di dominio (fabbrica, PA, progetti): pesi di default degli obiettivi e caratteristiche attive. */
@Entity
@Table(name = "domain_profile")
@Getter @Setter @NoArgsConstructor
public class DomainProfile {

    public enum Domain { FACTORY, PUBLIC_ADMIN, PROJECT, OTHER }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 30, unique = true)
    private String code;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(length = 255)
    private String description;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.VARCHAR)
    @Column(nullable = false, length = 20)
    private Domain domain;

    /** Pesi di default degli obiettivi, es. {"makespan":0.3,"weightedTardiness":0.5,"setup":0.2}. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "default_weights", nullable = false)
    private Map<String, Double> defaultWeights = new LinkedHashMap<>();

    /** Caratteristiche attive, es. SEQUENCE_DEPENDENT_SETUP. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "features")
    private List<String> features = new ArrayList<>();

    /** Il profilo usato di default dalle nuove pianificazioni (migrazione V10). */
    @Column(name = "in_use", nullable = false, columnDefinition = "TINYINT(1)")
    private boolean inUse;
}
