-- FlowSync · V4 · Richieste di pianificazione, piani candidati, assegnazioni

-- Una richiesta = un clic su "Conferma e genera piani".
-- problem_spec è la ProblemSpec esatta inviata al servizio AI (snapshot): serve a riprodurre
-- il piano anche se commesse o risorse cambiano dopo, e diventa un esempio per il training.
CREATE TABLE planning_request (
    id                   BIGINT       NOT NULL AUTO_INCREMENT,
    requested_by         BIGINT       NOT NULL,
    horizon_start        DATETIME(6)  NOT NULL,
    horizon_end          DATETIME(6)  NOT NULL,
    prompt_text          TEXT         NULL,            -- testo libero, se usato l'LLM
    problem_spec         JSON         NOT NULL,
    spec_version         VARCHAR(10)  NOT NULL DEFAULT '1.0',
    objective_weights    JSON         NOT NULL,        -- {"tardiness":8,"overtime":7,"setup":4}
    candidates_requested INT          NOT NULL DEFAULT 3,
    status               VARCHAR(20)  NOT NULL DEFAULT 'QUEUED',
    error_message        VARCHAR(500) NULL,
    created_at           DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    completed_at         DATETIME(6)  NULL,
    PRIMARY KEY (id),
    KEY ix_request_status (status, created_at),
    CONSTRAINT fk_request_user FOREIGN KEY (requested_by) REFERENCES app_user (id),
    CONSTRAINT ck_request_status     CHECK (status IN ('QUEUED', 'RUNNING', 'DONE', 'FAILED')),
    CONSTRAINT ck_request_horizon    CHECK (horizon_end > horizon_start),
    CONSTRAINT ck_request_candidates CHECK (candidates_requested BETWEEN 1 AND 10)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

CREATE TABLE planning_request_order (
    request_id    BIGINT NOT NULL,
    work_order_id BIGINT NOT NULL,
    PRIMARY KEY (request_id, work_order_id),
    CONSTRAINT fk_pro_request FOREIGN KEY (request_id)    REFERENCES planning_request (id) ON DELETE CASCADE,
    CONSTRAINT fk_pro_order   FOREIGN KEY (work_order_id) REFERENCES work_order (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

-- Piano = un candidato restituito dal servizio AI (o dal fallback ATC/EDD).
-- I KPI principali sono colonne (per ordinare e filtrare), il resto va in kpi_details.
CREATE TABLE plan (
    id                  BIGINT        NOT NULL AUTO_INCREMENT,
    request_id          BIGINT        NOT NULL,
    parent_plan_id      BIGINT        NULL,            -- ripianificazione a partire da un piano
    label               VARCHAR(100)  NOT NULL,        -- es. "Piano B · Equilibrato"
    solver              VARCHAR(10)   NOT NULL,
    model_version       VARCHAR(40)   NULL,            -- es. "m2-policy-1.3"; NULL per ATC/EDD
    fallback_used       BOOLEAN       NOT NULL DEFAULT FALSE,
    status              VARCHAR(20)   NOT NULL DEFAULT 'CANDIDATE',
    makespan_min        INT           NULL,
    total_tardiness_min INT           NULL,
    overtime_min        INT           NULL,
    avg_utilization     DECIMAL(5, 4) NULL,            -- 0.8100 = 81%
    setup_count         INT           NULL,
    kpi_details         JSON          NULL,
    objective_weights   JSON          NOT NULL,
    created_at          DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    version             INT           NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    KEY ix_plan_status (status),
    CONSTRAINT fk_plan_request FOREIGN KEY (request_id)     REFERENCES planning_request (id) ON DELETE CASCADE,
    CONSTRAINT fk_plan_parent  FOREIGN KEY (parent_plan_id) REFERENCES plan (id) ON DELETE SET NULL,
    CONSTRAINT ck_plan_solver  CHECK (solver IN ('POLICY', 'ATC', 'EDD', 'MANUAL')),
    CONSTRAINT ck_plan_status  CHECK (status IN ('CANDIDATE', 'SELECTED', 'APPROVED', 'REJECTED',
                                                 'EXECUTING', 'CLOSED', 'SUPERSEDED'))
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

-- Assegnazione = una barra del Gantt: attività -> risorsa, inizio, fine, stima di M1.
CREATE TABLE assignment (
    id                     BIGINT       NOT NULL AUTO_INCREMENT,
    plan_id                BIGINT       NOT NULL,
    activity_id            BIGINT       NOT NULL,
    resource_id            BIGINT       NOT NULL,
    start_at               DATETIME(6)  NOT NULL,
    end_at                 DATETIME(6)  NOT NULL,
    estimated_duration_min INT          NOT NULL,      -- mediana stimata da M1
    estimate_p10_min       INT          NULL,          -- intervallo di confidenza
    estimate_p90_min       INT          NULL,
    confidence             DECIMAL(4, 3) NULL,         -- 0.820
    locked                 BOOLEAN      NOT NULL DEFAULT FALSE,  -- rispettata in ripianificazione
    manually_modified      BOOLEAN      NOT NULL DEFAULT FALSE,
    PRIMARY KEY (id),
    CONSTRAINT uk_assignment UNIQUE (plan_id, activity_id),
    KEY ix_assignment_resource_time (resource_id, start_at),
    CONSTRAINT fk_asg_plan     FOREIGN KEY (plan_id)     REFERENCES plan (id) ON DELETE CASCADE,
    CONSTRAINT fk_asg_activity FOREIGN KEY (activity_id) REFERENCES activity (id),
    CONSTRAINT fk_asg_resource FOREIGN KEY (resource_id) REFERENCES resource (id),
    CONSTRAINT ck_asg_interval   CHECK (end_at > start_at),
    CONSTRAINT ck_asg_confidence CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;
