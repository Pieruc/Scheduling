-- FlowSync · V8 · Campi richiesti dall'API delle commesse (contratto A.2–A.3)

-- releaseDate del contratto: da quando la commessa può iniziare (NULL = subito)
ALTER TABLE work_order
    ADD COLUMN release_at DATETIME(6) NULL AFTER profile_id;

-- requiredSkills è una lista: un'attività può richiedere più competenze
CREATE TABLE activity_skill (
    activity_id BIGINT NOT NULL,
    skill_id    BIGINT NOT NULL,
    PRIMARY KEY (activity_id, skill_id),
    CONSTRAINT fk_as_activity FOREIGN KEY (activity_id) REFERENCES activity (id) ON DELETE CASCADE,
    CONSTRAINT fk_as_skill    FOREIGN KEY (skill_id)    REFERENCES skill (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

INSERT INTO activity_skill (activity_id, skill_id)
SELECT id, required_skill_id FROM activity WHERE required_skill_id IS NOT NULL;

ALTER TABLE activity DROP FOREIGN KEY fk_activity_skill;
ALTER TABLE activity DROP COLUMN required_skill_id;

-- maxLagMin del contratto: ritardo massimo tra fine del predecessore e inizio del successore (NULL = nessun limite)
ALTER TABLE precedence
    ADD COLUMN max_lag_min INT NULL AFTER lag_min,
    ADD CONSTRAINT ck_prec_max_lag CHECK (max_lag_min IS NULL OR max_lag_min >= lag_min);

-- Profili di dominio: descrizione e caratteristiche attive (es. SEQUENCE_DEPENDENT_SETUP)
ALTER TABLE domain_profile
    ADD COLUMN description VARCHAR(255) NULL AFTER name,
    ADD COLUMN features    JSON         NULL AFTER default_weights;
