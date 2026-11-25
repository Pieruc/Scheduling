package it.unicam.flowsync.orders.web;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/** Corpi di richiesta e risposta del contratto A.3 (commesse e grafo di processo). */
public final class OrderDtos {

    private OrderDtos() {
    }

    private static <T> List<T> copy(List<T> list) {
        // copia che tollera elementi nulli: li segnala poi la validazione (422) invece di fallire nella deserializzazione
        return list == null ? List.of() : Collections.unmodifiableList(new ArrayList<>(list));
    }

    /** Stati del contratto. OPEN corrisponde a DRAFT e READY nel DB. */
    public enum ApiStatus { OPEN, PLANNED, IN_PROGRESS, DONE, CANCELLED }

    /**
     * Corpo di POST /orders e PUT /orders/{id}. "id" è il codice pubblico (es. C-101); priority 1 = bassa … 3 = alta.
     * "description" (proposta §8 del frontend) è il titolo della commessa. dueDate null = scadenza non ancora nota.
     */
    public record OrderRequest(
            @NotBlank @Size(max = 30) @Pattern(regexp = "[A-Za-z0-9._-]+", message = "only letters, digits, '.', '_' and '-'") String id,
            @Size(max = 150) String customer,
            @NotBlank @Size(max = 150) String description,
            String domainProfile,
            OffsetDateTime releaseDate,
            OffsetDateTime dueDate,
            @Min(1) @Max(3) int priority,
            @Positive @DecimalMax("999.99") double weight) {
    }

    public record OrderResponse(String id, String customer, String description, String domainProfile,
                                OffsetDateTime releaseDate, OffsetDateTime dueDate, int priority, double weight,
                                ApiStatus status, int activityCount) {
    }

    public record PriorityRequest(@Min(1) @Max(3) int priority) {
    }

    // ---------------- grafo di processo ----------------

    /** Un modo: la risorsa (una sola per modo) e la durata; durationMin null = da stimare con M1. */
    public record ModeDto(List<@NotBlank String> resourceIds, @Positive Integer durationMin) {

        public ModeDto {
            resourceIds = copy(resourceIds);
        }
    }

    /** setupFamily è facoltativo (estensione del contratto): se assente, si conserva quello salvato. */
    public record ActivityDto(
            @NotBlank @Size(max = 30) @Pattern(regexp = "[A-Za-z0-9._-]+", message = "only letters, digits, '.', '_' and '-'") String id,
            @NotBlank @Size(max = 150) String name,
            List<@NotBlank String> requiredSkills,
            @NotNull List<@NotNull @Valid ModeDto> modes,
            @Size(max = 40) String setupFamily) {

        public ActivityDto {
            requiredSkills = copy(requiredSkills);
            modes = modes == null ? null : copy(modes);
        }
    }

    /** Precedenza fine-inizio (FS): "to" inizia dopo la fine di "from" + minLagMin, entro maxLagMin se indicato. */
    public record PrecedenceDto(@NotBlank String from, @NotBlank String to, String type,
                                @PositiveOrZero Integer minLagMin, @PositiveOrZero Integer maxLagMin) {
    }

    public record ProcessGraphDto(@NotNull List<@NotNull @Valid ActivityDto> activities,
                                  List<@NotNull @Valid PrecedenceDto> precedences) {

        public ProcessGraphDto {
            activities = activities == null ? null : copy(activities);
            precedences = copy(precedences);
        }
    }
}
