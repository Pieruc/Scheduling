package it.unicam.flowsync.configuration.repository;

import it.unicam.flowsync.configuration.domain.Resource;
import it.unicam.flowsync.configuration.domain.Unavailability;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Collection;
import java.util.List;

public interface UnavailabilityRepository extends JpaRepository<Unavailability, Long> {

    /** Fermi delle risorse indicate che toccano l'intervallo [from, to). */
    @Query("select u from Unavailability u join fetch u.resource r where r in :resources "
            + "and u.startsAt < :to and u.endsAt > :from order by u.startsAt")
    List<Unavailability> findOverlapping(@Param("resources") Collection<Resource> resources,
                                         @Param("from") Instant from, @Param("to") Instant to);

    @EntityGraph(attributePaths = "resource")
    List<Unavailability> findByReasonAndEndsAtAfterOrderByStartsAtAsc(Unavailability.Reason reason, Instant after);
}
