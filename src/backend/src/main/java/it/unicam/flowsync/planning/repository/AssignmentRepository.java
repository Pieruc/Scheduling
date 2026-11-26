package it.unicam.flowsync.planning.repository;

import it.unicam.flowsync.configuration.domain.Resource;
import it.unicam.flowsync.planning.domain.Assignment;
import it.unicam.flowsync.planning.domain.Plan;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;

public interface AssignmentRepository extends JpaRepository<Assignment, Long> {

    /** Le assegnazioni dei piani negli stati indicati sulle risorse indicate, in ordine di inizio previsto. */
    @Query("select a from Assignment a join fetch a.plan p join fetch a.activity act join fetch act.workOrder "
            + "join fetch a.resource r where p.status in :statuses and r in :resources order by a.startAt, a.id")
    List<Assignment> findInPlans(@Param("statuses") Collection<Plan.Status> statuses,
                                 @Param("resources") Collection<Resource> resources);

    @Query("select a from Assignment a join fetch a.activity act join fetch act.workOrder join fetch a.resource "
            + "where a.plan = :plan order by a.startAt, a.id")
    List<Assignment> findByPlan(@Param("plan") Plan plan);
}
