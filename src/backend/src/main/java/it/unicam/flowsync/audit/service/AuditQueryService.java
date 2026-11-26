package it.unicam.flowsync.audit.service;

import it.unicam.flowsync.audit.domain.AuditLog;
import it.unicam.flowsync.audit.repository.AuditLogRepository;
import it.unicam.flowsync.security.domain.AppUser;
import it.unicam.flowsync.security.repository.AppUserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * {@code GET /audit} (contratto A.8): i record dal più recente, con i filtri del frontend. Il registro si scrive
 * con {@link AuditService}; qui si legge soltanto. Al massimo gli ultimi 2000 record, filtrati in memoria.
 */
@Service
public class AuditQueryService {

    /** I campi di {@code details} del contratto (sempre presenti, null se il record non li ha). */
    private static final List<String> DETAILS = List.of("decision", "reason", "newPlanId", "changes", "planIds",
            "confidence", "trigger");

    public record AuditEntry(String id, OffsetDateTime timestamp, String planId, String user, String action,
                             String modelVersion, String solver, String inputHash, String outputHash,
                             Map<String, Object> details) {
    }

    private final AuditLogRepository log;
    private final AppUserRepository users;

    public AuditQueryService(AuditLogRepository log, AppUserRepository users) {
        this.log = log;
        this.users = users;
    }

    @Transactional(readOnly = true)
    public List<AuditEntry> search(String planId, OffsetDateTime from, OffsetDateTime to, String action, String user) {
        List<AuditLog> rows = log.findTop2000ByOrderByOccurredAtDescIdDesc();
        Set<Long> actorIds = new HashSet<>();
        rows.forEach(r -> {
            if (r.getActorId() != null) {
                actorIds.add(r.getActorId());
            }
        });
        Map<Long, String> names = new HashMap<>();
        for (AppUser u : users.findAllById(actorIds)) {
            names.put(u.getId(), u.getUsername());
        }
        Instant since = from == null ? null : from.toInstant();
        Instant until = to == null ? null : to.toInstant();
        return rows.stream()
                .filter(r -> since == null || !r.getOccurredAt().isBefore(since))
                .filter(r -> until == null || r.getOccurredAt().isBefore(until))
                .filter(r -> action == null || action.isBlank() || r.getAction().equalsIgnoreCase(action))
                .map(r -> entry(r, names))
                .filter(e -> user == null || user.isBlank() || e.user().equalsIgnoreCase(user))
                .filter(e -> planId == null || planId.isBlank() || planId.equals(e.planId())
                        || (e.details().get("planIds") instanceof List<?> ids && ids.contains(planId))
                        || planId.equals(e.details().get("newPlanId")))
                .toList();
    }

    private static AuditEntry entry(AuditLog r, Map<Long, String> names) {
        Map<String, Object> p = r.getPayload() == null ? Map.of() : r.getPayload();
        String planId = p.get("planId") instanceof String s ? s
                : "PLAN".equals(r.getEntityType()) && r.getEntityId() != null ? String.format("PLAN-%04d", r.getEntityId())
                : null;
        Map<String, Object> details = new LinkedHashMap<>();
        DETAILS.forEach(k -> details.put(k, p.get(k)));
        // i campi del record che non sono nel contratto restano leggibili (es. l'errore di AI_UNAVAILABLE)
        p.forEach((k, v) -> {
            if (!details.containsKey(k) && !List.of("planId", "modelVersion", "solver", "inputHash", "outputHash").contains(k)) {
                details.put(k, v);
            }
        });
        return new AuditEntry(String.format("AUD-%04d", r.getId()), r.getOccurredAt().atOffset(ZoneOffset.UTC), planId,
                r.getActorId() == null ? "system" : Objects.requireNonNullElse(names.get(r.getActorId()), "user-" + r.getActorId()),
                r.getAction(), (String) p.get("modelVersion"), (String) p.get("solver"), (String) p.get("inputHash"),
                (String) p.get("outputHash"), details);
    }
}
