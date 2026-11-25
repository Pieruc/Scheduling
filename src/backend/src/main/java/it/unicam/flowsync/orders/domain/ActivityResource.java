package it.unicam.flowsync.orders.domain;

import it.unicam.flowsync.configuration.domain.Resource;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.io.Serializable;
import java.util.Objects;

/**
 * Un "modo" di un'attività (tabella activity_resource): su quale risorsa può essere svolta e, se diversa
 * da quella dichiarata, con quale durata (es. CNC 2 più lenta di CNC 1).
 */
@Entity
@Table(name = "activity_resource")
@Getter @Setter @NoArgsConstructor
public class ActivityResource {

    @EmbeddedId
    private Key id = new Key();

    @MapsId("activityId")
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "activity_id", nullable = false)
    private Activity activity;

    @MapsId("resourceId")
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "resource_id", nullable = false)
    private Resource resource;

    /** null = vale la durata dichiarata dell'attività (o la stima di M1 se manca anche quella). */
    @Column(name = "duration_min")
    private Integer durationMin;

    /** L'attività e la risorsa devono essere già salvate (servono i loro id). */
    public ActivityResource(Activity activity, Resource resource, Integer durationMin) {
        this.activity = activity;
        this.resource = resource;
        this.durationMin = durationMin;
        this.id = new Key(activity.getId(), resource.getId());
    }

    @Embeddable
    @Getter @Setter @NoArgsConstructor
    public static class Key implements Serializable {

        @Column(name = "activity_id")
        private Long activityId;

        @Column(name = "resource_id")
        private Long resourceId;

        public Key(Long activityId, Long resourceId) {
            this.activityId = activityId;
            this.resourceId = resourceId;
        }

        @Override
        public boolean equals(Object o) {
            return o instanceof Key k && Objects.equals(activityId, k.activityId) && Objects.equals(resourceId, k.resourceId);
        }

        @Override
        public int hashCode() {
            return Objects.hash(activityId, resourceId);
        }
    }

    @Override
    public boolean equals(Object o) {
        return o instanceof ActivityResource other && Objects.equals(id, other.id);
    }

    @Override
    public int hashCode() {
        return Objects.hash(id);
    }
}
