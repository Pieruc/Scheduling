-- FlowSync · V1 · Utenti e ruoli
-- Convenzioni (valide per tutte le migrazioni):
--   * id BIGINT AUTO_INCREMENT, nomi snake_case, InnoDB + utf8mb4
--   * date/ore in DATETIME(6) sempre in UTC (il fuso lo applica il frontend)
--   * gli "enum" sono VARCHAR + CHECK: aggiungere un valore = una nuova migrazione
--     con ALTER ... CHECK, senza riscrivere la colonna (ENUM di MySQL lo richiederebbe)

CREATE TABLE app_user (
    id            BIGINT       NOT NULL AUTO_INCREMENT,
    username      VARCHAR(50)  NOT NULL,
    email         VARCHAR(120) NOT NULL,
    password_hash VARCHAR(100) NOT NULL,              -- BCrypt
    full_name     VARCHAR(120) NOT NULL,
    role          VARCHAR(20)  NOT NULL,
    active        BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uk_user_username UNIQUE (username),
    CONSTRAINT uk_user_email    UNIQUE (email),
    CONSTRAINT ck_user_role     CHECK (role IN ('ADMIN', 'PLANNER', 'OPERATOR'))
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;
