package it.unicam.flowsync.configuration.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.io.Serializable;
import java.util.Objects;

/** Collegamento risorsa-competenza (tabella resource_skill) con il livello di esperienza. */
@Entity
@Table(name = "resource_skill")
@Getter @Setter @NoArgsConstructor
public class ResourceSkill {

    @EmbeddedId
    private Key id = new Key();

    @MapsId("resourceId")
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "resource_id", nullable = false)
    private Resource resource;

    @MapsId("skillId")
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "skill_id", nullable = false)
    private Skill skill;

    /** 1 base … 3 esperto. */
    @Column(nullable = false, columnDefinition = "TINYINT")
    private int level = 1;

    /** La risorsa e la competenza devono essere già salvate (servono i loro id). */
    public ResourceSkill(Resource resource, Skill skill, int level) {
        this.resource = resource;
        this.skill = skill;
        this.level = level;
        this.id = new Key(resource.getId(), skill.getId());
    }

    @Embeddable
    @Getter @Setter @NoArgsConstructor
    public static class Key implements Serializable {

        @Column(name = "resource_id")
        private Long resourceId;

        @Column(name = "skill_id")
        private Long skillId;

        public Key(Long resourceId, Long skillId) {
            this.resourceId = resourceId;
            this.skillId = skillId;
        }

        @Override
        public boolean equals(Object o) {
            return o instanceof Key k && Objects.equals(resourceId, k.resourceId) && Objects.equals(skillId, k.skillId);
        }

        @Override
        public int hashCode() {
            return Objects.hash(resourceId, skillId);
        }
    }

    @Override
    public boolean equals(Object o) {
        return o instanceof ResourceSkill other && Objects.equals(id, other.id);
    }

    @Override
    public int hashCode() {
        return Objects.hash(id);
    }
}
