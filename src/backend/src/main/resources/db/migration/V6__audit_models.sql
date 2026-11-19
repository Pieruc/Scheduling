-- FlowSync · V6 · Audit e versioni dei modelli AI

-- Registro di chi ha fatto cosa: piani generati, modifiche al Gantt, approvazioni, configurazione.
CREATE TABLE audit_log (
    id          BIGINT      NOT NULL AUTO_INCREMENT,
    actor_id    BIGINT      NULL,                      -- NULL = azione di sistema (es. fallback)
    action      VARCHAR(60) NOT NULL,                  -- es. PLAN_APPROVED, ASSIGNMENT_MOVED
    entity_type VARCHAR(60) NOT NULL,                  -- es. PLAN, ASSIGNMENT, RESOURCE
    entity_id   BIGINT      NULL,
    payload     JSON        NULL,                      -- prima/dopo, motivazione
    occurred_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    KEY ix_audit_entity (entity_type, entity_id),
    KEY ix_audit_time (occurred_at),
    CONSTRAINT fk_audit_user FOREIGN KEY (actor_id) REFERENCES app_user (id) ON DELETE SET NULL
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

-- Versioni dei modelli pubblicate dalla pipeline di training (contratto C).
-- Gli artefatti stanno su MinIO; qui solo il riferimento e le metriche.
CREATE TABLE model_version (
    id           BIGINT       NOT NULL AUTO_INCREMENT,
    model_name   VARCHAR(20)  NOT NULL,
    version      VARCHAR(40)  NOT NULL,
    artifact_uri VARCHAR(255) NOT NULL,                -- es. s3://models/m2-policy/1.3/model.pt
    metrics      JSON         NULL,                    -- gap medio, vittorie su ATC, MAE…
    status       VARCHAR(20)  NOT NULL DEFAULT 'CANDIDATE',
    registered_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    activated_at DATETIME(6)  NULL,
    -- colonna generata: vale model_name solo se ACTIVE, altrimenti NULL.
    -- Con l'indice univoco garantisce al massimo una versione ACTIVE per modello.
    active_model VARCHAR(20) GENERATED ALWAYS AS (CASE WHEN status = 'ACTIVE' THEN model_name END) STORED,
    PRIMARY KEY (id),
    CONSTRAINT uk_model_version UNIQUE (model_name, version),
    CONSTRAINT uk_model_one_active UNIQUE (active_model),
    CONSTRAINT ck_model_name   CHECK (model_name IN ('M1_CONTEXT', 'M2_POLICY', 'LLM_PARSER')),
    CONSTRAINT ck_model_status CHECK (status IN ('CANDIDATE', 'ACTIVE', 'RETIRED'))
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;
