package it.unicam.flowsync.execution.domain;

import it.unicam.flowsync.planning.domain.Assignment;
import it.unicam.flowsync.security.domain.AppUser;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;

/**
 * Pulsanti Inizia / Pausa / Riprendi / Termina dell'operatore.
 * Append-only: non si modifica, si aggiunge. È la fonte delle durate reali per M1.
 */
@Entity
@Table(name = "execution_event")
@Getter @Setter @NoArgsConstructor
public class ExecutionEvent {

    public enum Type { START, PAUSE, RESUME, COMPLETE }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "assignment_id", nullable = false)
    private Assignment assignment;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "operator_id", nullable = false)
    private AppUser operator;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.VARCHAR)
    @Column(name = "event_type", nullable = false, length = 10)
    private Type eventType;

    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt = Instant.now();

    @Column(length = 500)
    private String note;
}
