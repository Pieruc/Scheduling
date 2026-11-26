-- FlowSync · V10 · Ripianificazione, esecuzione, segnalazioni, profili e modelli (contratto A.2, A.4, A.6, A.7 v1.1)

-- Ripianificazione: la richiesta nasce da un piano approvato e da un evento; le attività iniziate prima di
-- freeze_before restano dove sono
ALTER TABLE planning_request
    ADD COLUMN reschedule_of BIGINT      NULL AFTER calendar_id,
    ADD COLUMN trigger_event JSON        NULL AFTER reschedule_of,
    ADD COLUMN freeze_before DATETIME(6) NULL AFTER trigger_event,
    ADD CONSTRAINT fk_request_reschedule FOREIGN KEY (reschedule_of) REFERENCES plan (id);

-- Profilo usato di default dalle nuove pianificazioni (uno solo, lo garantisce il backend)
ALTER TABLE domain_profile
    ADD COLUMN in_use TINYINT(1) NOT NULL DEFAULT 0 AFTER features;
UPDATE domain_profile SET in_use = 1 WHERE code = 'FACTORY';

-- Esecuzione: nota facoltativa dell'operatore
ALTER TABLE execution_event
    ADD COLUMN note VARCHAR(500) NULL AFTER occurred_at;

-- Segnalazione: il piano a cui si riferisce (anche senza attività), per il link "Ripianifica" dell'avviso
ALTER TABLE issue_report
    ADD COLUMN plan_id BIGINT NULL AFTER assignment_id,
    ADD CONSTRAINT fk_issue_plan FOREIGN KEY (plan_id) REFERENCES plan (id);

-- Versioni dei modelli: i campi del contratto C che A.7 mostra
ALTER TABLE model_version
    ADD COLUMN dataset_version VARCHAR(40) NULL AFTER artifact_uri,
    ADD COLUMN spec_version    VARCHAR(10) NULL AFTER dataset_version;
