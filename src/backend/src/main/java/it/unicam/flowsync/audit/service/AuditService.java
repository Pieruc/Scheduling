package it.unicam.flowsync.audit.service;

import it.unicam.flowsync.audit.domain.AuditLog;
import it.unicam.flowsync.audit.repository.AuditLogRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;

/** Registro delle azioni rilevanti (contratto A.8): decisioni sui piani, errori del servizio AI, ecc. */
@Service
public class AuditService {

    private final AuditLogRepository log;

    public AuditService(AuditLogRepository log) {
        this.log = log;
    }

    /** Si unisce alla transazione in corso, se c'è: la voce sparisce se l'azione viene annullata. */
    @Transactional
    public void record(Long actorId, String action, String entityType, Long entityId, Map<String, Object> payload) {
        AuditLog entry = new AuditLog();
        entry.setActorId(actorId);
        entry.setAction(action);
        entry.setEntityType(entityType);
        entry.setEntityId(entityId);
        entry.setPayload(payload);
        log.save(entry);
    }
}
