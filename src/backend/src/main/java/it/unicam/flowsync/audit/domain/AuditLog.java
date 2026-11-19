package it.unicam.flowsync.audit.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.Map;

/**
 * Registro di chi ha fatto cosa. actorId è un semplice id (non una relazione) così il modulo Audit
 * non dipende dal modulo Security e i record restano anche se l'utente viene disattivato.
 */
@Entity
@Table(name = "audit_log")
@Getter @Setter @NoArgsConstructor
public class AuditLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** null = azione di sistema (es. intervento del fallback ATC). */
    @Column(name = "actor_id")
    private Long actorId;

    /** Es. PLAN_APPROVED, ASSIGNMENT_MOVED, UNAVAILABILITY_CREATED. */
    @Column(nullable = false, length = 60)
    private String action;

    @Column(name = "entity_type", nullable = false, length = 60)
    private String entityType;

    @Column(name = "entity_id")
    private Long entityId;

    /** Prima/dopo e motivazione, es. {"from":{...},"to":{...},"note":"..."}. */
    @JdbcTypeCode(SqlTypes.JSON)
    private Map<String, Object> payload;

    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt = Instant.now();
}
