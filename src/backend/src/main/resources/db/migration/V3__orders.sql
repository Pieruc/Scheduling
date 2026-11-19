-- FlowSync · V3 · Commesse, attività, precedenze, setup

CREATE TABLE work_order (
    id          BIGINT        NOT NULL AUTO_INCREMENT,
    code        VARCHAR(30)   NOT NULL,                -- es. C-101
    title       VARCHAR(150)  NOT NULL,
    client_name VARCHAR(150)  NULL,
    profile_id  BIGINT        NULL,
    due_at      DATETIME(6)   NULL,                    -- NULL = dato mancante, la validazione lo chiede
    priority    VARCHAR(10)   NOT NULL DEFAULT 'MEDIUM',
    weight      DECIMAL(5, 2) NOT NULL DEFAULT 1.00,   -- peso nel ritardo pesato
    status      VARCHAR(20)   NOT NULL DEFAULT 'DRAFT',
    created_by  BIGINT        NOT NULL,
    created_at  DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at  DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    version     INT           NOT NULL DEFAULT 0,      -- lock ottimistico (@Version)
    PRIMARY KEY (id),
    CONSTRAINT uk_order_code UNIQUE (code),
    KEY ix_order_status_due (status, due_at),
    CONSTRAINT fk_order_profile FOREIGN KEY (profile_id) REFERENCES domain_profile (id),
    CONSTRAINT fk_order_user    FOREIGN KEY (created_by) REFERENCES app_user (id),
    CONSTRAINT ck_order_priority CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH')),
    CONSTRAINT ck_order_weight   CHECK (weight > 0),
    CONSTRAINT ck_order_status   CHECK (status IN ('DRAFT', 'READY', 'PLANNED', 'IN_PROGRESS', 'DONE', 'CANCELLED'))
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

CREATE TABLE activity (
    id                    BIGINT       NOT NULL AUTO_INCREMENT,
    work_order_id         BIGINT       NOT NULL,
    code                  VARCHAR(30)  NOT NULL,       -- univoco dentro la commessa
    name                  VARCHAR(150) NOT NULL,
    declared_duration_min INT          NULL,           -- NULL = la stima la fa M1
    required_skill_id     BIGINT       NULL,
    setup_family          VARCHAR(40)  NULL,           -- famiglia per i setup dipendenti dalla sequenza
    status                VARCHAR(20)  NOT NULL DEFAULT 'PENDING',
    PRIMARY KEY (id),
    CONSTRAINT uk_activity_code UNIQUE (work_order_id, code),
    CONSTRAINT fk_activity_order FOREIGN KEY (work_order_id)     REFERENCES work_order (id) ON DELETE CASCADE,
    CONSTRAINT fk_activity_skill FOREIGN KEY (required_skill_id) REFERENCES skill (id),
    CONSTRAINT ck_activity_duration CHECK (declared_duration_min IS NULL OR declared_duration_min > 0),
    CONSTRAINT ck_activity_status   CHECK (status IN ('PENDING', 'IN_PROGRESS', 'DONE', 'CANCELLED'))
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

-- Risorse ammesse per un'attività ("modi" del flexible job shop).
-- duration_min opzionale: durata diversa su quella risorsa (es. CNC 2 più lenta)
CREATE TABLE activity_resource (
    activity_id  BIGINT NOT NULL,
    resource_id  BIGINT NOT NULL,
    duration_min INT    NULL,
    PRIMARY KEY (activity_id, resource_id),
    CONSTRAINT fk_ar_activity FOREIGN KEY (activity_id) REFERENCES activity (id) ON DELETE CASCADE,
    CONSTRAINT fk_ar_resource FOREIGN KEY (resource_id) REFERENCES resource (id) ON DELETE CASCADE,
    CONSTRAINT ck_ar_duration CHECK (duration_min IS NULL OR duration_min > 0)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

-- Precedenze (archi del grafo). Tipo finish-to-start con ritardo minimo opzionale.
-- Niente CHECK predecessor <> successor: MySQL vieta CHECK su colonne con ON DELETE CASCADE.
-- Autoanelli e cicli li rifiuta il servizio (ricerca di cicli sul grafo prima del salvataggio).
CREATE TABLE precedence (
    id             BIGINT NOT NULL AUTO_INCREMENT,
    predecessor_id BIGINT NOT NULL,
    successor_id   BIGINT NOT NULL,
    lag_min        INT    NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    CONSTRAINT uk_precedence UNIQUE (predecessor_id, successor_id),
    CONSTRAINT fk_prec_pred FOREIGN KEY (predecessor_id) REFERENCES activity (id) ON DELETE CASCADE,
    CONSTRAINT fk_prec_succ FOREIGN KEY (successor_id)   REFERENCES activity (id) ON DELETE CASCADE,
    CONSTRAINT ck_prec_lag CHECK (lag_min >= 0)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

-- Matrice dei setup dipendenti dalla sequenza: passare da una famiglia all'altra costa N minuti.
-- resource_id NULL = valore generale; con resource_id = valore specifico di quella macchina.
CREATE TABLE setup_time (
    id          BIGINT      NOT NULL AUTO_INCREMENT,
    resource_id BIGINT      NULL,
    from_family VARCHAR(40) NOT NULL,
    to_family   VARCHAR(40) NOT NULL,
    setup_min   INT         NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uk_setup UNIQUE (resource_id, from_family, to_family),
    CONSTRAINT fk_setup_resource FOREIGN KEY (resource_id) REFERENCES resource (id) ON DELETE CASCADE,
    CONSTRAINT ck_setup_min CHECK (setup_min >= 0)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;
