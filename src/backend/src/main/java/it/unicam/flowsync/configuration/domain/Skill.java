package it.unicam.flowsync.configuration.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Competenza richiesta da un'attività e posseduta da una risorsa (es. SALDATURA). */
@Entity
@Table(name = "skill")
@Getter @Setter @NoArgsConstructor
public class Skill {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 30, unique = true)
    private String code;

    @Column(nullable = false, length = 100)
    private String name;
}
