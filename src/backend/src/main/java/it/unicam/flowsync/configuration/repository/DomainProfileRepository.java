package it.unicam.flowsync.configuration.repository;

import it.unicam.flowsync.configuration.domain.DomainProfile;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface DomainProfileRepository extends JpaRepository<DomainProfile, Long> {

    List<DomainProfile> findAllByOrderByCodeAsc();

    Optional<DomainProfile> findByCode(String code);
}
