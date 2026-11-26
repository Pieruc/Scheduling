package it.unicam.flowsync.planning.repository;

import it.unicam.flowsync.planning.domain.Plan;
import it.unicam.flowsync.planning.domain.PlanningRequest;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PlanRepository extends JpaRepository<Plan, Long> {

    List<Plan> findByRequestOrderByIdAsc(PlanningRequest request);

    List<Plan> findByStatusIn(java.util.Collection<Plan.Status> statuses);

    /** Per /models/status: quanti piani per solutore dalla data indicata. */
    @org.springframework.data.jpa.repository.Query(
            "select p.solver, count(p) from Plan p where p.createdAt >= :since group by p.solver")
    List<Object[]> countBySolverSince(@org.springframework.data.repository.query.Param("since") java.time.Instant since);
}
