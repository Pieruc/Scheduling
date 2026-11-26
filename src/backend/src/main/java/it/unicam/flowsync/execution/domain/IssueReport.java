package it.unicam.flowsync.execution.domain;

import it.unicam.flowsync.configuration.domain.Resource;
import it.unicam.flowsync.planning.domain.Assignment;
import it.unicam.flowsync.planning.domain.Plan;
import it.unicam.flowsync.security.domain.AppUser;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;

/** Segnalazione di un operatore (contratto A.6, POST /incidents): diventa un avviso finché non è risolta. */
@Entity
@Table(name = "issue_report")
@Getter @Setter @NoArgsConstructor
public class IssueReport {

    public enum Kind { BREAKDOWN, MISSING_MATERIAL, DELAY, OTHER }

    public enum Status { OPEN, ACKNOWLEDGED, RESOLVED }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "reported_by", nullable = false)
    private AppUser reportedBy;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "resource_id")
    private Resource resource;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "assignment_id")
    private Assignment assignment;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "plan_id")
    private Plan plan;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.VARCHAR)
    @Column(name = "issue_type", nullable = false, length = 20)
    private Kind kind;

    @Column(length = 500)
    private String description;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.VARCHAR)
    @Column(nullable = false, length = 20)
    private Status status = Status.OPEN;

    @Column(name = "reported_at", nullable = false)
    private Instant reportedAt = Instant.now();

    @Column(name = "resolved_at")
    private Instant resolvedAt;
}
