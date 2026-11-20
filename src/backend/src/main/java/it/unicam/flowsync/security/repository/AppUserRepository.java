package it.unicam.flowsync.security.repository;

import it.unicam.flowsync.security.domain.AppUser;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface AppUserRepository extends JpaRepository<AppUser, Long> {

    Optional<AppUser> findByUsername(String username);

    // la collation della tabella (utf8mb4_0900_ai_ci) non distingue maiuscole: "Admin" esiste se esiste "admin"
    boolean existsByUsername(String username);

    boolean existsByEmail(String email);

    List<AppUser> findAllByOrderByCreatedAtDesc();
}
