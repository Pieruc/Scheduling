package it.unicam.flowsync.models.repository;

import it.unicam.flowsync.models.domain.ModelVersion;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ModelVersionRepository extends JpaRepository<ModelVersion, Long> {

    Optional<ModelVersion> findFirstByModelNameAndStatus(ModelVersion.Name name, ModelVersion.Status status);

    List<ModelVersion> findAllByOrderByRegisteredAtDescIdDesc();
}
