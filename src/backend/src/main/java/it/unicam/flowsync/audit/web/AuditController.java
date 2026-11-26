package it.unicam.flowsync.audit.web;

import it.unicam.flowsync.audit.service.AuditQueryService;
import it.unicam.flowsync.audit.service.AuditQueryService.AuditEntry;
import it.unicam.flowsync.common.web.ApiPaths;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.OffsetDateTime;
import java.util.List;

/** Contratto A.8: registro di tracciabilità, solo ADMIN. */
@RestController
@RequestMapping(ApiPaths.V1)
public class AuditController {

    private final AuditQueryService audit;

    public AuditController(AuditQueryService audit) {
        this.audit = audit;
    }

    @GetMapping("/audit")
    @PreAuthorize("hasRole('ADMIN')")
    public List<AuditEntry> search(@RequestParam(required = false) String planId,
                                   @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime from,
                                   @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime to,
                                   @RequestParam(required = false) String action,
                                   @RequestParam(required = false) String user) {
        return audit.search(planId, from, to, action, user);
    }
}
