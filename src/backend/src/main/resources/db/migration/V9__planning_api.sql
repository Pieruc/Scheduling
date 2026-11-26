-- FlowSync · V9 · Campi richiesti dalla pianificazione del contratto A.4–A.5 (v1.1)

-- Richiesta: etichetta per gli elenchi, fase in corso, confronto con le regole, calendario di riferimento
ALTER TABLE planning_request
    ADD COLUMN label       VARCHAR(150) NULL AFTER requested_by,
    ADD COLUMN calendar_id BIGINT       NULL AFTER horizon_end,
    ADD COLUMN stage       VARCHAR(20)  NULL AFTER status,
    ADD COLUMN baselines   JSON         NULL AFTER objective_weights,
    ADD COLUMN elapsed_ms  INT          NULL AFTER completed_at,
    ADD CONSTRAINT fk_request_calendar FOREIGN KEY (calendar_id) REFERENCES work_calendar (id),
    ADD CONSTRAINT ck_request_stage CHECK (stage IS NULL OR stage IN ('VALIDATION', 'CONTEXT', 'POLICY', 'BASELINES'));

-- Piano: variante (3 per richiesta), confidenza della policy, frase di riepilogo; CP_SAT tra i solutori
ALTER TABLE plan
    ADD COLUMN variant    VARCHAR(10)   NULL AFTER label,
    ADD COLUMN confidence DECIMAL(4, 3) NULL AFTER fallback_used,
    ADD COLUMN summary    VARCHAR(255)  NULL AFTER confidence,
    ADD CONSTRAINT ck_plan_variant CHECK (variant IS NULL OR variant IN ('ECONOMIC', 'BALANCED', 'FAST'));
ALTER TABLE plan DROP CHECK ck_plan_solver;
ALTER TABLE plan ADD CONSTRAINT ck_plan_solver CHECK (solver IN ('POLICY', 'CP_SAT', 'ATC', 'EDD', 'MANUAL'));

-- Assegnazione: inizio e fine anche in minuti di lavoro del periodo (la scala del Gantt)
ALTER TABLE assignment
    ADD COLUMN start_min INT NULL AFTER end_at,
    ADD COLUMN end_min   INT NULL AFTER start_min;

-- Decisione: anche le modifiche manuali (MODIFY del contratto) restano nello storico
ALTER TABLE plan_decision DROP CHECK ck_decision;
ALTER TABLE plan_decision ADD CONSTRAINT ck_decision CHECK (decision IN ('APPROVED', 'REJECTED', 'MODIFIED'));

-- Risorsa: costo orario (costPerHour del contratto A.2 v1.1), serve al costo stimato dei piani
ALTER TABLE resource
    ADD COLUMN cost_per_hour DECIMAL(8, 2) NULL AFTER capacity,
    ADD CONSTRAINT ck_resource_cost CHECK (cost_per_hour IS NULL OR cost_per_hour >= 0);
