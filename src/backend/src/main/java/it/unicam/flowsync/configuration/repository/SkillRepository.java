package it.unicam.flowsync.configuration.repository;

import it.unicam.flowsync.configuration.domain.Skill;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

public interface SkillRepository extends JpaRepository<Skill, Long> {

    List<Skill> findAllByOrderByCodeAsc();

    List<Skill> findByCodeIn(Collection<String> codes);

    java.util.Optional<Skill> findByCode(String code);
}
