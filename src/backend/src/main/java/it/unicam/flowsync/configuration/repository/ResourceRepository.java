package it.unicam.flowsync.configuration.repository;

import it.unicam.flowsync.configuration.domain.Resource;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface ResourceRepository extends JpaRepository<Resource, Long> {

    // calendario e competenze si caricano insieme alla risorsa: la lista non fa una query per riga

    @EntityGraph(attributePaths = {"calendar", "skills", "skills.skill"})
    List<Resource> findAllByOrderByCodeAsc();

    @EntityGraph(attributePaths = {"calendar", "skills", "skills.skill"})
    List<Resource> findAllByActiveOrderByCodeAsc(boolean active);

    @EntityGraph(attributePaths = {"calendar", "skills", "skills.skill"})
    Optional<Resource> findByCode(String code);

    boolean existsByCode(String code);

    List<Resource> findByCodeIn(Collection<String> codes);
}
