package it.unicam.flowsync.execution.repository;

import it.unicam.flowsync.execution.domain.IssueReport;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

public interface IssueReportRepository extends JpaRepository<IssueReport, Long> {

    @EntityGraph(attributePaths = {"reportedBy", "resource", "plan"})
    List<IssueReport> findByStatusInOrderByReportedAtDesc(Collection<IssueReport.Status> statuses);
}
