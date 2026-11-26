-- FlowSync · seed dev V104 · Dati per la demo della pianificazione (contratto A.4)
-- Le scadenze del seed V100 (novembre 2026) sono già passate: si spostano a partire dal giorno in cui si applica
-- questo seed, così "pianifica la prossima settimana" produce piani con e senza ritardi. C-104 resta senza
-- scadenza (è il dato mancante che l'interpretazione chiede). C-102…C-104 ricevono un grafo di processo.

UPDATE work_order SET due_at = TIMESTAMP(CURDATE() + INTERVAL 9 DAY, '15:00:00')  WHERE code = 'C-101';
UPDATE work_order SET due_at = TIMESTAMP(CURDATE() + INTERVAL 10 DAY, '15:00:00') WHERE code = 'C-102';
UPDATE work_order SET due_at = TIMESTAMP(CURDATE() + INTERVAL 12 DAY, '15:00:00') WHERE code = 'C-103';

-- fermo della fresa CNC2 il martedì della settimana prossima, tutto il giorno (orari in UTC: 8–17 a Roma).
-- Le date sono calcolate quando il seed si applica: per rigenerarle, ricreare il DB di sviluppo (docker compose down -v).
INSERT INTO unavailability (resource_id, starts_at, ends_at, reason, note, created_by)
SELECT r.id,
       TIMESTAMP(CURDATE() + INTERVAL (IF((9 - DAYOFWEEK(CURDATE())) % 7 = 0, 7, (9 - DAYOFWEEK(CURDATE())) % 7) + 1) DAY, '07:00:00'),
       TIMESTAMP(CURDATE() + INTERVAL (IF((9 - DAYOFWEEK(CURDATE())) % 7 = 0, 7, (9 - DAYOFWEEK(CURDATE())) % 7) + 1) DAY, '16:00:00'),
       'MAINTENANCE', 'Manutenzione programmata', u.id
FROM resource r, app_user u WHERE r.code = 'CNC2' AND u.username = 'amministratore';

INSERT INTO activity (work_order_id, code, name, declared_duration_min, setup_family)
SELECT o.id, v.code, v.name, v.dur, v.fam
FROM work_order o
         JOIN (SELECT 'C-102' ord, 'T' code, 'Taglio' name, 90 dur, 'ACCIAIO' fam
               UNION ALL SELECT 'C-102', 'P', 'Piegatura',    120, 'ACCIAIO'
               UNION ALL SELECT 'C-102', 'S', 'Saldatura',    150, 'ACCIAIO'
               UNION ALL SELECT 'C-102', 'C', 'Collaudo',     30,  NULL
               UNION ALL SELECT 'C-103', 'T', 'Taglio',       60,  'ACCIAIO'
               UNION ALL SELECT 'C-103', 'F', 'Fresatura',    240, 'ACCIAIO'
               UNION ALL SELECT 'C-103', 'V', 'Verniciatura', 90,  'RAL9005'
               UNION ALL SELECT 'C-103', 'C', 'Collaudo',     45,  NULL
               UNION ALL SELECT 'C-104', 'T', 'Taglio',       45,  'INOX'
               UNION ALL SELECT 'C-104', 'F', 'Fresatura',    120, 'INOX'
               UNION ALL SELECT 'C-104', 'S', 'Saldatura',    NULL, 'INOX'
               UNION ALL SELECT 'C-104', 'V', 'Verniciatura', 60,  'RAL7035'
               UNION ALL SELECT 'C-104', 'C', 'Collaudo',     30,  NULL) v ON v.ord = o.code;

INSERT INTO activity_resource (activity_id, resource_id, duration_min)
SELECT a.id, r.id, m.dur
FROM activity a
         JOIN work_order o ON o.id = a.work_order_id
         JOIN (SELECT 'C-102' ord, 'T' act, 'LASER' res, NULL dur
               UNION ALL SELECT 'C-102', 'P', 'PRESS', NULL
               UNION ALL SELECT 'C-102', 'S', 'WELD1', NULL
               UNION ALL SELECT 'C-102', 'S', 'WELD2', 170
               UNION ALL SELECT 'C-102', 'C', 'QC',    NULL
               UNION ALL SELECT 'C-103', 'T', 'LASER', NULL
               UNION ALL SELECT 'C-103', 'F', 'CNC1',  NULL
               UNION ALL SELECT 'C-103', 'F', 'CNC2',  210
               UNION ALL SELECT 'C-103', 'V', 'PAINT', NULL
               UNION ALL SELECT 'C-103', 'C', 'QC',    NULL
               UNION ALL SELECT 'C-104', 'T', 'LASER', NULL
               UNION ALL SELECT 'C-104', 'F', 'CNC2',  NULL
               UNION ALL SELECT 'C-104', 'F', 'CNC1',  140
               UNION ALL SELECT 'C-104', 'S', 'WELD2', NULL
               UNION ALL SELECT 'C-104', 'V', 'PAINT', NULL
               UNION ALL SELECT 'C-104', 'C', 'QC',    NULL) m ON m.ord = o.code AND m.act = a.code
         JOIN resource r ON r.code = m.res;

-- catene lineari: Taglio -> ... -> Collaudo
INSERT INTO precedence (predecessor_id, successor_id)
SELECT p.id, s.id
FROM (SELECT 'C-102' ord, 'T' pre, 'P' suc UNION ALL SELECT 'C-102', 'P', 'S' UNION ALL SELECT 'C-102', 'S', 'C'
      UNION ALL SELECT 'C-103', 'T', 'F' UNION ALL SELECT 'C-103', 'F', 'V' UNION ALL SELECT 'C-103', 'V', 'C'
      UNION ALL SELECT 'C-104', 'T', 'F' UNION ALL SELECT 'C-104', 'F', 'S' UNION ALL SELECT 'C-104', 'S', 'V'
      UNION ALL SELECT 'C-104', 'V', 'C') e
         JOIN work_order o ON o.code = e.ord
         JOIN activity p ON p.work_order_id = o.id AND p.code = e.pre
         JOIN activity s ON s.work_order_id = o.id AND s.code = e.suc;

-- cambio di materiale al laser e alla fresa (acciaio <-> inox): 20 minuti di pulizia
INSERT INTO setup_time (resource_id, from_family, to_family, setup_min)
SELECT r.id, f.a, f.b, 20
FROM resource r
         JOIN (SELECT 'ACCIAIO' a, 'INOX' b UNION ALL SELECT 'INOX', 'ACCIAIO') f
WHERE r.code IN ('LASER', 'CNC1', 'CNC2');
