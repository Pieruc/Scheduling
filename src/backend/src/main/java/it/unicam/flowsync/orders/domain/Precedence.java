package it.unicam.flowsync.orders.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Un arco del grafo: "successor" può iniziare solo dopo la fine di "predecessor" (+ lag).
 * Autoanelli e cicli vanno rifiutati nel servizio prima del salvataggio (il DB non lo può fare).
 */
@Entity
@Table(name = "precedence",
       uniqueConstraints = @UniqueConstraint(name = "uk_precedence", columnNames = {"predecessor_id", "successor_id"}))
@Getter @Setter @NoArgsConstructor
public class Precedence {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "predecessor_id", nullable = false)
    private Activity predecessor;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "successor_id", nullable = false)
    private Activity successor;

    @Column(name = "lag_min", nullable = false)
    private int lagMin = 0;
}
