package it.unicam.flowsync.configuration.web;

import it.unicam.flowsync.configuration.domain.DomainProfile;
import it.unicam.flowsync.configuration.domain.Resource;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Corpi di richiesta e risposta del contratto A.2 (risorse, calendari, competenze). */
public final class ConfigurationDtos {

    private ConfigurationDtos() {
    }

    /**
     * Corpo di POST /resources e PUT /resources/{id}. Il campo "id" è il codice pubblico della risorsa (es. R-CNC-01).
     * Campi in più (costPerHour, unavailability: PROPOSTA §8 del frontend) sono ignorati finché non entrano nel contratto.
     */
    public record ResourceRequest(
            @NotBlank @Size(max = 30) @Pattern(regexp = "[A-Za-z0-9._-]+", message = "only letters, digits, '.', '_' and '-'") String id,
            @NotBlank @Size(max = 100) String name,
            @NotNull Resource.Type type,
            @Min(1) int capacity,
            List<@NotBlank String> skills,
            @NotBlank String calendarId) {

        public ResourceRequest {
            // copia difensiva che tollera elementi nulli: li segnala poi @NotBlank (422) invece di fallire qui
            skills = skills == null ? List.of() : Collections.unmodifiableList(new ArrayList<>(skills));
        }
    }

    public record ResourceResponse(String id, String name, Resource.Type type, int capacity,
                                   List<String> skills, String calendarId, boolean active) {

        public static ResourceResponse from(Resource r) {
            List<String> skillCodes = r.getSkills().stream()
                    .map(rs -> rs.getSkill().getCode())
                    .sorted()
                    .toList();
            return new ResourceResponse(r.getCode(), r.getName(), r.getType(), r.getCapacity(), skillCodes,
                    String.valueOf(r.getCalendar().getId()), r.isActive());
        }
    }

    public record SkillResponse(String code, String name) {
    }

    /** shiftsSummary: descrizione breve dei turni, es. "Lun–Ven 8–12 / 13–17". */
    public record CalendarResponse(String id, String name, String shiftsSummary) {
    }

    /**
     * Profilo di dominio (contratto A.2). I pesi hanno le chiavi del contratto: makespan, weightedTardiness, setup
     * (una chiave assente vale 0). Senza descrizione salvata si mostra il nome.
     */
    public record DomainProfileResponse(String code, String name, String description,
                                        Map<String, Double> defaultObjectiveWeights, List<String> features) {

        private static final List<String> WEIGHT_KEYS = List.of("makespan", "weightedTardiness", "setup");

        public static DomainProfileResponse from(DomainProfile p) {
            Map<String, Double> weights = new LinkedHashMap<>();
            Map<String, Double> stored = p.getDefaultWeights() == null ? Map.of() : p.getDefaultWeights();
            for (String key : WEIGHT_KEYS) {
                Double value = stored.get(key);
                weights.put(key, value == null ? 0.0 : value);
            }
            return new DomainProfileResponse(p.getCode(), p.getName(),
                    p.getDescription() == null ? p.getName() : p.getDescription(),
                    weights, p.getFeatures() == null ? List.of() : List.copyOf(p.getFeatures()));
        }
    }
}
