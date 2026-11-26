package it.unicam.flowsync.audit.repository;

import it.unicam.flowsync.audit.domain.AuditLog;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AuditLogRepository extends JpaRepository<AuditLog, Long> {

    java.util.List<AuditLog> findTop2000ByOrderByOccurredAtDescIdDesc();
}
