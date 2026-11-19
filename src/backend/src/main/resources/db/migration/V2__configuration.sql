-- FlowSync · V2 · Configurazione: profili di dominio, calendari, risorse, competenze, indisponibilità

-- Profilo di dominio: fabbrica, pubblica amministrazione, progetti.
-- default_weights = pesi predefiniti degli obiettivi, es. {"tardiness":8,"overtime":5,"setup":3}
CREATE TABLE domain_profile (
    id              BIGINT       NOT NULL AUTO_INCREMENT,
    code            VARCHAR(30)  NOT NULL,
    name            VARCHAR(100) NOT NULL,
    domain          VARCHAR(20)  NOT NULL,
    default_weights JSON         NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uk_profile_code UNIQUE (code),
    CONSTRAINT ck_profile_domain CHECK (domain IN ('FACTORY', 'PUBLIC_ADMIN', 'PROJECT', 'OTHER'))
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

-- Calendario di lavoro (turni settimanali + festività)
CREATE TABLE work_calendar (
    id       BIGINT       NOT NULL AUTO_INCREMENT,
    name     VARCHAR(100) NOT NULL,
    timezone VARCHAR(40)  NOT NULL DEFAULT 'Europe/Rome',
    PRIMARY KEY (id),
    CONSTRAINT uk_calendar_name UNIQUE (name)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

CREATE TABLE calendar_shift (
    id          BIGINT   NOT NULL AUTO_INCREMENT,
    calendar_id BIGINT   NOT NULL,
    day_of_week TINYINT  NOT NULL,                     -- 1 = lunedì … 7 = domenica (ISO)
    start_time  TIME     NOT NULL,
    end_time    TIME     NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_shift_calendar FOREIGN KEY (calendar_id) REFERENCES work_calendar (id) ON DELETE CASCADE,
    CONSTRAINT ck_shift_day   CHECK (day_of_week BETWEEN 1 AND 7),
    CONSTRAINT ck_shift_times CHECK (end_time > start_time)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

CREATE TABLE calendar_holiday (
    calendar_id  BIGINT       NOT NULL,
    holiday_date DATE         NOT NULL,
    description  VARCHAR(100) NULL,
    PRIMARY KEY (calendar_id, holiday_date),
    CONSTRAINT fk_holiday_calendar FOREIGN KEY (calendar_id) REFERENCES work_calendar (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

CREATE TABLE skill (
    id   BIGINT       NOT NULL AUTO_INCREMENT,
    code VARCHAR(30)  NOT NULL,
    name VARCHAR(100) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uk_skill_code UNIQUE (code)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

-- Risorsa = macchina, persona, squadra o sala/sportello
CREATE TABLE resource (
    id          BIGINT       NOT NULL AUTO_INCREMENT,
    code        VARCHAR(30)  NOT NULL,
    name        VARCHAR(100) NOT NULL,
    type        VARCHAR(20)  NOT NULL,
    capacity    INT          NOT NULL DEFAULT 1,       -- attività in parallelo
    calendar_id BIGINT       NOT NULL,
    active      BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uk_resource_code UNIQUE (code),
    CONSTRAINT fk_resource_calendar FOREIGN KEY (calendar_id) REFERENCES work_calendar (id),
    CONSTRAINT ck_resource_type     CHECK (type IN ('MACHINE', 'PERSON', 'TEAM', 'ROOM')),
    CONSTRAINT ck_resource_capacity CHECK (capacity > 0)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

CREATE TABLE resource_skill (
    resource_id BIGINT  NOT NULL,
    skill_id    BIGINT  NOT NULL,
    level       TINYINT NOT NULL DEFAULT 1,             -- 1 base … 3 esperto
    PRIMARY KEY (resource_id, skill_id),
    CONSTRAINT fk_rs_resource FOREIGN KEY (resource_id) REFERENCES resource (id) ON DELETE CASCADE,
    CONSTRAINT fk_rs_skill    FOREIGN KEY (skill_id)    REFERENCES skill (id)    ON DELETE CASCADE,
    CONSTRAINT ck_rs_level    CHECK (level BETWEEN 1 AND 3)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

-- Indisponibilità: manutenzione, ferie, guasto (le fasce grigie del Gantt)
CREATE TABLE unavailability (
    id          BIGINT       NOT NULL AUTO_INCREMENT,
    resource_id BIGINT       NOT NULL,
    starts_at   DATETIME(6)  NOT NULL,
    ends_at     DATETIME(6)  NOT NULL,
    reason      VARCHAR(20)  NOT NULL,
    note        VARCHAR(255) NULL,
    created_by  BIGINT       NOT NULL,
    created_at  DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    KEY ix_unav_resource_time (resource_id, starts_at),
    CONSTRAINT fk_unav_resource FOREIGN KEY (resource_id) REFERENCES resource (id) ON DELETE CASCADE,
    CONSTRAINT fk_unav_user     FOREIGN KEY (created_by)  REFERENCES app_user (id),
    CONSTRAINT ck_unav_reason   CHECK (reason IN ('MAINTENANCE', 'LEAVE', 'BREAKDOWN', 'OTHER')),
    CONSTRAINT ck_unav_interval CHECK (ends_at > starts_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

-- Un operatore può essere collegato alla risorsa "persona" che lo rappresenta
ALTER TABLE app_user
    ADD COLUMN resource_id BIGINT NULL AFTER role,
    ADD CONSTRAINT fk_user_resource FOREIGN KEY (resource_id) REFERENCES resource (id) ON DELETE SET NULL;
