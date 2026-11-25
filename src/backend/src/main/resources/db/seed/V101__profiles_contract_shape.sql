-- FlowSync · dati di esempio (SOLO profilo dev) · profili di dominio nel formato del contratto A.2
-- Pesi con le chiavi del contratto (makespan, weightedTardiness, setup), che sommano a 1.
UPDATE domain_profile
SET description     = 'Job shop flessibile con setup: commesse di produzione su macchine e reparti',
    default_weights = JSON_OBJECT('makespan', 0.3, 'weightedTardiness', 0.5, 'setup', 0.2),
    features        = JSON_ARRAY('SEQUENCE_DEPENDENT_SETUP', 'ALTERNATIVE_RESOURCES', 'OVERTIME')
WHERE code = 'FACTORY';

UPDATE domain_profile
SET description     = 'Pratiche che passano tra uffici con scadenze di legge',
    default_weights = JSON_OBJECT('makespan', 0.2, 'weightedTardiness', 0.8, 'setup', 0.0),
    features        = JSON_ARRAY('HARD_DEADLINES', 'ALTERNATIVE_RESOURCES')
WHERE code = 'PA';

INSERT INTO domain_profile (code, name, description, domain, default_weights, features)
VALUES ('PROJECT', 'Progetti', 'Attività di progetto con precedenze e risorse condivise (RCPSP)', 'PROJECT',
        JSON_OBJECT('makespan', 0.6, 'weightedTardiness', 0.4, 'setup', 0.0),
        JSON_ARRAY('GENERAL_PRECEDENCES', 'SHARED_RESOURCES'));
