package it.unicam.flowsync.orders.repository;

import it.unicam.flowsync.orders.domain.WorkOrder;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface WorkOrderRepository extends JpaRepository<WorkOrder, Long> {

    @EntityGraph(attributePaths = "profile")
    List<WorkOrder> findAllByOrderByCodeAsc();

    @EntityGraph(attributePaths = "profile")
    Optional<WorkOrder> findByCode(String code);

    boolean existsByCode(String code);

    /** Numero di attività per commessa, in una sola query: [id commessa, conteggio]. */
    @Query("select a.workOrder.id, count(a) from Activity a group by a.workOrder.id")
    List<Object[]> countActivitiesByOrder();

    @Query("select count(a) from Activity a where a.workOrder.id = :orderId")
    long countActivities(@Param("orderId") Long orderId);
}
