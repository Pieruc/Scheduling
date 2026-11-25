package it.unicam.flowsync.orders.domain;

import it.unicam.flowsync.configuration.domain.DomainProfile;
import it.unicam.flowsync.security.domain.AppUser;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/** Commessa (fabbrica), pratica (PA) o progetto: un insieme di attività con una scadenza. */
@Entity
@Table(name = "work_order")
@Getter @Setter @NoArgsConstructor
public class WorkOrder {

    public enum Priority { LOW, MEDIUM, HIGH }
    public enum Status { DRAFT, READY, PLANNED, IN_PROGRESS, DONE, CANCELLED }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 30, unique = true)
    private String code;

    @Column(nullable = false, length = 150)
    private String title;

    @Column(name = "client_name", length = 150)
    private String clientName;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "profile_id")
    private DomainProfile profile;

    /** Da quando la commessa può iniziare (releaseDate del contratto); null = subito. */
    @Column(name = "release_at")
    private Instant releaseAt;

    /** null = dato mancante: la validazione lo chiede al pianificatore prima di pianificare. */
    @Column(name = "due_at")
    private Instant dueAt;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.VARCHAR)
    @Column(nullable = false, length = 10)
    private Priority priority = Priority.MEDIUM;

    @Column(nullable = false, precision = 5, scale = 2)
    private BigDecimal weight = BigDecimal.ONE;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.VARCHAR)
    @Column(nullable = false, length = 20)
    private Status status = Status.DRAFT;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "created_by", nullable = false)
    private AppUser createdBy;

    @OneToMany(mappedBy = "workOrder", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<Activity> activities = new ArrayList<>();

    @Column(name = "created_at", nullable = false, updatable = false, insertable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false, updatable = false, insertable = false)
    private Instant updatedAt;

    /** Lock ottimistico: due pianificatori che modificano la stessa commessa non si sovrascrivono. */
    @Version
    private int version;

    public void addActivity(Activity activity) {
        activity.setWorkOrder(this);
        activities.add(activity);
    }
}
