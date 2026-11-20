package it.unicam.flowsync.security.domain;

import it.unicam.flowsync.configuration.domain.Resource;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;

@Entity
@Table(name = "app_user")
@Getter @Setter @NoArgsConstructor
public class AppUser {

    public enum Role { ADMIN, PLANNER, OPERATOR }

    /** Stato dell'account, derivato da active e approvedAt (migrazione V7). */
    public enum Status { PENDING, ACTIVE, DISABLED }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 50, unique = true)
    private String username;

    @Column(nullable = false, length = 120, unique = true)
    private String email;

    @Column(name = "password_hash", nullable = false, length = 100)
    private String passwordHash;

    @Column(name = "full_name", nullable = false, length = 120)
    private String fullName;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.VARCHAR)          // Hibernate 6.2+ su MySQL userebbe ENUM nativo
    @Column(nullable = false, length = 20)
    private Role role;

    /** Solo per gli operatori: la risorsa "persona" che li rappresenta nel Gantt. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "resource_id")
    private Resource resource;

    @Column(nullable = false, columnDefinition = "TINYINT(1)")
    private boolean active = true;

    /** Momento dell'approvazione da parte di un ADMIN; null per una registrazione ancora in attesa. */
    @Column(name = "approved_at")
    private Instant approvedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "approved_by")
    private AppUser approvedBy;

    @Column(name = "created_at", nullable = false, updatable = false, insertable = false)
    private Instant createdAt;

    public Status status() {
        if (active) {
            return Status.ACTIVE;
        }
        return approvedAt == null ? Status.PENDING : Status.DISABLED;
    }
}
