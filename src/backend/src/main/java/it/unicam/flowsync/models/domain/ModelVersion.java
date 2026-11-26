package it.unicam.flowsync.models.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.Map;

/** Versione di un modello pubblicata dalla pipeline (contratto C); il backend la legge soltanto (A.7). */
@Entity
@Table(name = "model_version")
@Getter @Setter @NoArgsConstructor
public class ModelVersion {

    public enum Name { M1_CONTEXT, M2_POLICY, LLM_PARSER }

    public enum Status { CANDIDATE, ACTIVE, RETIRED }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.VARCHAR)
    @Column(name = "model_name", nullable = false, length = 20)
    private Name modelName;

    @Column(nullable = false, length = 40)
    private String version;

    @Column(name = "artifact_uri", nullable = false, length = 255)
    private String artifactUri;

    @Column(name = "dataset_version", length = 40)
    private String datasetVersion;

    @Column(name = "spec_version", length = 10)
    private String specVersion;

    /** Chiavi in snake_case, come le scrive la pipeline (contratto C). */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "metrics")
    private Map<String, Object> metrics;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.VARCHAR)
    @Column(nullable = false, length = 20)
    private Status status = Status.CANDIDATE;

    @Column(name = "registered_at", nullable = false, insertable = false, updatable = false)
    private Instant registeredAt;

    @Column(name = "activated_at")
    private Instant activatedAt;
}
