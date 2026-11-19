-- FlowSync · V5 · Decisioni sui piani, esecuzione in reparto, segnalazioni

CREATE TABLE plan_decision (
    id         BIGINT       NOT NULL AUTO_INCREMENT,
    plan_id    BIGINT       NOT NULL,
    decided_by BIGINT       NOT NULL,
    decision   VARCHAR(10)  NOT NULL,
    reason     VARCHAR(500) NULL,
    decided_at DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT fk_decision_plan FOREIGN KEY (plan_id)    REFERENCES plan (id) ON DELETE CASCADE,
    CONSTRAINT fk_decision_user FOREIGN KEY (decided_by) REFERENCES app_user (id),
    CONSTRAINT ck_decision CHECK (decision IN ('APPROVED', 'REJECTED'))
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

-- Eventi registrati dall'operatore (pulsanti Inizia / Pausa / Termina).
-- Sono i dati reali da cui M1 impara le durate.
CREATE TABLE execution_event (
    id            BIGINT      NOT NULL AUTO_INCREMENT,
    assignment_id BIGINT      NOT NULL,
    operator_id   BIGINT      NOT NULL,
    event_type    VARCHAR(10) NOT NULL,
    occurred_at   DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    KEY ix_event_assignment_time (assignment_id, occurred_at),
    CONSTRAINT fk_event_assignment FOREIGN KEY (assignment_id) REFERENCES assignment (id),
    CONSTRAINT fk_event_operator   FOREIGN KEY (operator_id)   REFERENCES app_user (id),
    CONSTRAINT ck_event_type CHECK (event_type IN ('START', 'PAUSE', 'RESUME', 'COMPLETE'))
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

CREATE TABLE issue_report (
    id            BIGINT       NOT NULL AUTO_INCREMENT,
    reported_by   BIGINT       NOT NULL,
    resource_id   BIGINT       NULL,
    assignment_id BIGINT       NULL,
    issue_type    VARCHAR(20)  NOT NULL,
    description   VARCHAR(500) NULL,
    status        VARCHAR(20)  NOT NULL DEFAULT 'OPEN',
    reported_at   DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    resolved_at   DATETIME(6)  NULL,
    PRIMARY KEY (id),
    KEY ix_issue_status (status, reported_at),
    CONSTRAINT fk_issue_user       FOREIGN KEY (reported_by)   REFERENCES app_user (id),
    CONSTRAINT fk_issue_resource   FOREIGN KEY (resource_id)   REFERENCES resource (id),
    CONSTRAINT fk_issue_assignment FOREIGN KEY (assignment_id) REFERENCES assignment (id),
    CONSTRAINT ck_issue_type   CHECK (issue_type IN ('BREAKDOWN', 'MISSING_MATERIAL', 'DELAY', 'OTHER')),
    CONSTRAINT ck_issue_status CHECK (status IN ('OPEN', 'ACKNOWLEDGED', 'RESOLVED'))
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

-- Vista per esportare il dataset di M1: durata reale vs stimata per ogni attività completata.
-- (Durata lorda START -> COMPLETE; le pause si sottraggono lato Python, se servono.)
CREATE VIEW v_activity_actuals AS
SELECT asg.id                                                         AS assignment_id,
       act.id                                                         AS activity_id,
       act.name                                                       AS activity_name,
       act.setup_family                                               AS setup_family,
       act.declared_duration_min                                      AS declared_duration_min,
       asg.resource_id                                                AS resource_id,
       asg.estimated_duration_min                                     AS estimated_duration_min,
       MIN(CASE WHEN ev.event_type = 'START'    THEN ev.occurred_at END) AS started_at,
       MAX(CASE WHEN ev.event_type = 'COMPLETE' THEN ev.occurred_at END) AS completed_at,
       TIMESTAMPDIFF(MINUTE,
                     MIN(CASE WHEN ev.event_type = 'START'    THEN ev.occurred_at END),
                     MAX(CASE WHEN ev.event_type = 'COMPLETE' THEN ev.occurred_at END)) AS actual_duration_min
FROM assignment asg
         JOIN activity act ON act.id = asg.activity_id
         JOIN execution_event ev ON ev.assignment_id = asg.id
GROUP BY asg.id, act.id, act.name, act.setup_family, act.declared_duration_min,
         asg.resource_id, asg.estimated_duration_min
HAVING completed_at IS NOT NULL;
