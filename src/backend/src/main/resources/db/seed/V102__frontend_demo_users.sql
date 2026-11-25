-- FlowSync · dati di esempio (SOLO profilo dev) · utenti demo allineati al frontend
-- Il nome utente è il ruolo, facile da ricordare; password "demo" per tutti (solo sviluppo).
-- Nuova migrazione invece di modificare V100: chi l'ha già applicata riceve solo questo aggiornamento.
UPDATE app_user SET username = 'amministratore', email = 'amministratore@flowsync.local'
WHERE username = 'admin';
UPDATE app_user SET username = 'pianificatore', email = 'pianificatore@flowsync.local'
WHERE username = 'gneri';
UPDATE app_user SET username = 'operatore', email = 'operatore@flowsync.local'
WHERE username = 'mrossi';

UPDATE app_user
SET password_hash = '$2b$10$nHQxffl8a6IKVNXn45JDou0zjdXJKy2DpBd8c7l0ubm3sOoLUKEru'
WHERE username IN ('amministratore', 'pianificatore', 'operatore');
