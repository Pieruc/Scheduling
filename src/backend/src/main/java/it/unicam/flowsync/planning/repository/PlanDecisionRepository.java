package it.unicam.flowsync.planning.repository;

import it.unicam.flowsync.planning.domain.Plan;
import it.unicam.flowsync.planning.domain.PlanDecision;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PlanDecisionRepository extends JpaRepository<PlanDecision, Long> {

    @EntityGraph(attributePaths = "decidedBy")
    List<PlanDecision> findByPlanOrderByDecidedAtAscIdAsc(Plan plan);
}
