package it.unicam.flowsync.execution.repository;

import it.unicam.flowsync.execution.domain.ExecutionEvent;
import it.unicam.flowsync.orders.domain.Activity;
import it.unicam.flowsync.planning.domain.Assignment;
import it.unicam.flowsync.security.domain.AppUser;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;

public interface ExecutionEventRepository extends JpaRepository<ExecutionEvent, Long> {

    /** Gli eventi delle assegnazioni indicate, in ordine di tempo: da qui si ricava lo stato di ogni attività. */
    @Query("select e from ExecutionEvent e where e.assignment in :assignments order by e.occurredAt, e.id")
    List<ExecutionEvent> findByAssignments(@Param("assignments") Collection<Assignment> assignments);

    /**
     * Gli eventi delle attività indicate, in qualunque versione del piano: un'attività si esegue una volta sola,
     * anche se una ripianificazione l'ha copiata in un piano nuovo.
     */
    @Query("select e from ExecutionEvent e join fetch e.assignment a join fetch a.activity act "
            + "where act in :activities order by e.occurredAt, e.id")
    List<ExecutionEvent> findByActivities(@Param("activities") Collection<Activity> activities);

    /** Gli eventi di un operatore: serve a controllare che abbia una sola attività in corso. */
    @EntityGraph(attributePaths = {"assignment", "assignment.activity", "assignment.activity.workOrder"})
    List<ExecutionEvent> findByOperatorOrderByOccurredAtAscIdAsc(AppUser operator);
}
