-- FlowSync · dati di esempio (SOLO profilo dev: location classpath:db/seed)
-- Officina dei mockup: 8 risorse, commesse C-101…C-104.
-- Password di tutti gli utenti demo: flowsync-dev  (hash BCrypt). Da non usare fuori da dev.

INSERT INTO app_user (username, email, password_hash, full_name, role) VALUES
 ('admin',   'admin@flowsync.local',   '$2b$10$3TAlv1.rPLWzE4liT3IEFO3N32Fb48ixisW0qbA9aG/Iw4MsAp3mK', 'Amministratore',   'ADMIN'),
 ('gneri',   'g.neri@flowsync.local',  '$2b$10$3TAlv1.rPLWzE4liT3IEFO3N32Fb48ixisW0qbA9aG/Iw4MsAp3mK', 'Giulia Neri',      'PLANNER'),
 ('mrossi',  'm.rossi@flowsync.local', '$2b$10$3TAlv1.rPLWzE4liT3IEFO3N32Fb48ixisW0qbA9aG/Iw4MsAp3mK', 'Marco Rossi',      'OPERATOR');

INSERT INTO domain_profile (code, name, domain, default_weights) VALUES
 ('FACTORY', 'Officina meccanica', 'FACTORY',      JSON_OBJECT('tardiness', 8, 'overtime', 5, 'setup', 3)),
 ('PA',      'Sportello comunale', 'PUBLIC_ADMIN', JSON_OBJECT('tardiness', 9, 'overtime', 7, 'setup', 1));

INSERT INTO work_calendar (name) VALUES ('Turno standard');
SET @cal = LAST_INSERT_ID();
INSERT INTO calendar_shift (calendar_id, day_of_week, start_time, end_time) VALUES
 (@cal, 1, '08:00', '12:00'), (@cal, 1, '13:00', '17:00'),
 (@cal, 2, '08:00', '12:00'), (@cal, 2, '13:00', '17:00'),
 (@cal, 3, '08:00', '12:00'), (@cal, 3, '13:00', '17:00'),
 (@cal, 4, '08:00', '12:00'), (@cal, 4, '13:00', '17:00'),
 (@cal, 5, '08:00', '12:00'), (@cal, 5, '13:00', '17:00');
INSERT INTO calendar_holiday (calendar_id, holiday_date, description) VALUES
 (@cal, '2026-12-08', 'Immacolata'), (@cal, '2026-12-25', 'Natale'), (@cal, '2026-12-26', 'Santo Stefano');

INSERT INTO skill (code, name) VALUES ('WELD', 'Saldatura'), ('CNC', 'Fresatura CNC'), ('PAINT', 'Verniciatura');

INSERT INTO resource (code, name, type, calendar_id) VALUES
 ('LASER',  'Taglio laser',        'MACHINE', @cal),
 ('CNC1',   'Fresa CNC 1',         'MACHINE', @cal),
 ('CNC2',   'Fresa CNC 2',         'MACHINE', @cal),
 ('PRESS',  'Pressa piegatrice',   'MACHINE', @cal),
 ('WELD1',  'Saldatrice S1',       'MACHINE', @cal),
 ('WELD2',  'Saldatrice S2',       'MACHINE', @cal),
 ('PAINT',  'Cabina verniciatura', 'MACHINE', @cal),
 ('QC',     'Collaudo',            'MACHINE', @cal),
 ('ROSSI',  'Marco Rossi',         'PERSON',  @cal);

INSERT INTO resource_skill (resource_id, skill_id, level)
SELECT r.id, s.id, 3 FROM resource r JOIN skill s ON s.code = 'WELD' WHERE r.code = 'ROSSI';

UPDATE app_user SET resource_id = (SELECT id FROM resource WHERE code = 'ROSSI') WHERE username = 'mrossi';

-- Manutenzione Fresa CNC 2: giovedì 19/11/2026 8:00–17:00 ora italiana = 7:00–16:00 UTC
INSERT INTO unavailability (resource_id, starts_at, ends_at, reason, note, created_by)
SELECT r.id, '2026-11-19 07:00:00', '2026-11-19 16:00:00', 'MAINTENANCE', 'Manutenzione programmata', u.id
FROM resource r, app_user u WHERE r.code = 'CNC2' AND u.username = 'admin';

-- Commesse (scadenze in UTC; C-104 senza scadenza: è il "dato mancante" del mockup)
INSERT INTO work_order (code, title, client_name, profile_id, due_at, priority, weight, status, created_by)
SELECT v.code, v.title, v.client, p.id, v.due, v.prio, v.w, 'READY', u.id
FROM (SELECT 'C-101' code, 'Telaio carrello' title, 'Rinaldi Carrelli' client, '2026-11-20 16:00:00' due, 'HIGH' prio, 3.00 w
      UNION ALL SELECT 'C-102', 'Staffe acciaio', 'Edil Marche',  '2026-11-23 16:00:00', 'MEDIUM', 2.00
      UNION ALL SELECT 'C-103', 'Albero motore',  'Motori Esino', '2026-11-25 16:00:00', 'MEDIUM', 2.00
      UNION ALL SELECT 'C-104', 'Flange inox',    'Inox Service', NULL,                  'LOW',    1.00) v
     JOIN domain_profile p ON p.code = 'FACTORY'
     JOIN app_user u ON u.username = 'gneri';

-- Attività di C-101 (il grafo del mockup): Taglio -> Fresatura / Piegatura -> Saldatura -> Verniciatura -> Collaudo
INSERT INTO activity (work_order_id, code, name, declared_duration_min, setup_family)
SELECT o.id, v.code, v.name, v.dur, v.fam
FROM work_order o
         JOIN (SELECT 'T' code, 'Taglio' name, 120 dur, 'ACCIAIO' fam
               UNION ALL SELECT 'F', 'Fresatura',    180,  'ACCIAIO'
               UNION ALL SELECT 'P', 'Piegatura',    60,   'ACCIAIO'
               UNION ALL SELECT 'S', 'Saldatura',    180,  'ACCIAIO'
               UNION ALL SELECT 'V', 'Verniciatura', NULL, 'RAL7035'
               UNION ALL SELECT 'C', 'Collaudo',     60,   NULL) v
WHERE o.code = 'C-101';

-- Risorse ammesse per le attività di C-101
INSERT INTO activity_resource (activity_id, resource_id)
SELECT a.id, r.id
FROM activity a
         JOIN work_order o ON o.id = a.work_order_id AND o.code = 'C-101'
         JOIN (SELECT 'T' act, 'LASER' res UNION ALL SELECT 'F', 'CNC1' UNION ALL SELECT 'F', 'CNC2'
               UNION ALL SELECT 'P', 'PRESS' UNION ALL SELECT 'S', 'WELD1' UNION ALL SELECT 'S', 'WELD2'
               UNION ALL SELECT 'V', 'PAINT' UNION ALL SELECT 'C', 'QC') m ON m.act = a.code
         JOIN resource r ON r.code = m.res;

-- Precedenze di C-101
INSERT INTO precedence (predecessor_id, successor_id)
SELECT p.id, s.id
FROM (SELECT 'T' pre, 'F' suc UNION ALL SELECT 'T', 'P' UNION ALL SELECT 'F', 'S'
      UNION ALL SELECT 'P', 'S' UNION ALL SELECT 'S', 'V' UNION ALL SELECT 'V', 'C') e
         JOIN work_order o ON o.code = 'C-101'
         JOIN activity p ON p.work_order_id = o.id AND p.code = e.pre
         JOIN activity s ON s.work_order_id = o.id AND s.code = e.suc;

-- Setup dipendenti dalla sequenza in verniciatura: cambiare colore costa 30 minuti
INSERT INTO setup_time (resource_id, from_family, to_family, setup_min)
SELECT r.id, 'RAL7035', 'RAL9005', 30 FROM resource r WHERE r.code = 'PAINT'
UNION ALL
SELECT r.id, 'RAL9005', 'RAL7035', 30 FROM resource r WHERE r.code = 'PAINT';
