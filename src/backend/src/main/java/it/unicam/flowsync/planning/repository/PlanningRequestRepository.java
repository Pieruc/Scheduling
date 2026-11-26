package it.unicam.flowsync.planning.repository;

import it.unicam.flowsync.planning.domain.PlanningRequest;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PlanningRequestRepository extends JpaRepository<PlanningRequest, Long> {

    /** Dalla più recente: l'elenco del contratto A.4. */
    @EntityGraph(attributePaths = {"requestedBy", "workOrders"})
    List<PlanningRequest> findAllByOrderByIdDesc();
}
