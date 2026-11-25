package it.unicam.flowsync.orders.repository;

import it.unicam.flowsync.orders.domain.Precedence;
import it.unicam.flowsync.orders.domain.WorkOrder;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface PrecedenceRepository extends JpaRepository<Precedence, Long> {

    /** Gli archi di una commessa (predecessore e successore stanno sempre nella stessa commessa). */
    @Query("select p from Precedence p join fetch p.predecessor pr join fetch p.successor where pr.workOrder = :order order by p.id")
    List<Precedence> findByOrder(@Param("order") WorkOrder order);
}
