package it.unicam.flowsync.planning.domain;

import it.unicam.flowsync.security.domain.AppUser;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;

/** Decisione del pianificatore su un piano (contratto A.5): approvato, rifiutato o modificato (nuova versione). */
@Entity
@Table(name = "plan_decision")
@Getter @Setter @NoArgsConstructor
public class PlanDecision {

    /** Nel DB al participio (V5, V9); nell'API all'imperativo: APPROVE, REJECT, MODIFY. */
    public enum Decision { APPROVED, REJECTED, MODIFIED }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "plan_id", nullable = false)
    private Plan plan;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "decided_by", nullable = false)
    private AppUser decidedBy;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.VARCHAR)
    @Column(nullable = false, length = 10)
    private Decision decision;

    @Column(length = 500)
    private String reason;

    @Column(name = "decided_at", nullable = false)
    private Instant decidedAt = Instant.now();
}
