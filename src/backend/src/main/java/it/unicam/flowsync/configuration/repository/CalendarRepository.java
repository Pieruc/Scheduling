package it.unicam.flowsync.configuration.repository;

import it.unicam.flowsync.configuration.domain.WorkCalendar;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface CalendarRepository extends JpaRepository<WorkCalendar, Long> {

    @EntityGraph(attributePaths = "shifts")
    List<WorkCalendar> findAllByOrderByNameAsc();
}
