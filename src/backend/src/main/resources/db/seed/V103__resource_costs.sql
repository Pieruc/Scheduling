-- FlowSync · dati di esempio (SOLO profilo dev) · costi orari dell'officina demo, in euro/ora (valori di esempio)
UPDATE resource SET cost_per_hour = 65 WHERE code = 'LASER';
UPDATE resource SET cost_per_hour = 80 WHERE code = 'CNC1';
UPDATE resource SET cost_per_hour = 72 WHERE code = 'CNC2';
UPDATE resource SET cost_per_hour = 50 WHERE code = 'PRESS';
UPDATE resource SET cost_per_hour = 55 WHERE code IN ('WELD1', 'WELD2');
UPDATE resource SET cost_per_hour = 45 WHERE code = 'PAINT';
UPDATE resource SET cost_per_hour = 40 WHERE code = 'QC';
UPDATE resource SET cost_per_hour = 30 WHERE code = 'ROSSI';
