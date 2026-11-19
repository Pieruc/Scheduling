package it.unicam.flowsync.configuration.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.LinkedHashSet;
import java.util.Set;

/** Macchina, persona, squadra o sala/sportello: una riga del Gantt. */
@Entity
@Table(name = "resource")
@Getter @Setter @NoArgsConstructor
public class Resource {

    public enum Type { MACHINE, PERSON, TEAM, ROOM }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 30, unique = true)
    private String code;

    @Column(nullable = false, length = 100)
    private String name;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.VARCHAR)
    @Column(nullable = false, length = 20)
    private Type type;

    /** Quante attività può svolgere in parallelo. */
    @Column(nullable = false)
    private int capacity = 1;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "calendar_id", nullable = false)
    private WorkCalendar calendar;

    @Column(nullable = false, columnDefinition = "TINYINT(1)")
    private boolean active = true;

    /** Competenze della risorsa con il livello (1 base … 3 esperto). Si modifica solo dal servizio. */
    @OneToMany(mappedBy = "resource", cascade = CascadeType.ALL, orphanRemoval = true)
    private Set<ResourceSkill> skills = new LinkedHashSet<>();

    @Column(name = "created_at", nullable = false, updatable = false, insertable = false)
    private Instant createdAt;
}
