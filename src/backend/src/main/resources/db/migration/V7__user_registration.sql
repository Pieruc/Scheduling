-- FlowSync · V7 · Registrazione con approvazione
-- Chi si registra nasce con active = FALSE e approved_at = NULL ("in attesa"); un ADMIN lo approva e gli assegna il ruolo.
-- Stato derivato (vedi AppUser.status()):
--   active = TRUE                          -> ACTIVE
--   active = FALSE e approved_at IS NULL   -> PENDING  (registrato, mai approvato)
--   active = FALSE e approved_at NOT NULL  -> DISABLED (disattivato da un ADMIN)

ALTER TABLE app_user
    ADD COLUMN approved_at DATETIME(6) NULL AFTER active,
    ADD COLUMN approved_by BIGINT      NULL AFTER approved_at,
    ADD CONSTRAINT fk_user_approved_by FOREIGN KEY (approved_by) REFERENCES app_user (id) ON DELETE SET NULL;

-- Gli utenti già esistenti e attivi si considerano approvati alla creazione
UPDATE app_user SET approved_at = created_at WHERE active = TRUE;
