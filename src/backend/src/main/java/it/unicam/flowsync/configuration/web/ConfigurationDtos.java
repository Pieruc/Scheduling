package it.unicam.flowsync.configuration.web;

import com.fasterxml.jackson.annotation.JsonFormat;
import it.unicam.flowsync.configuration.domain.DomainProfile;
import it.unicam.flowsync.configuration.domain.Resource;
import it.unicam.flowsync.configuration.domain.Unavailability;
import it.unicam.flowsync.configuration.domain.WorkCalendar;
import java.time.LocalDate;
import java.time.LocalTime;
import jakarta.validation.Valid;
import jakarta.validation.constraints.PositiveOrZero;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
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
     * {@code costPerHour} e {@code unavailability} sono della v1.1: null = lascia com'è (una lista vuota cancella i fermi).
     */
    public record ResourceRequest(
            @NotBlank @Size(max = 30) @Pattern(regexp = "[A-Za-z0-9._-]+", message = "only letters, digits, '.', '_' and '-'") String id,
            @NotBlank @Size(max = 100) String name,
            @NotNull Resource.Type type,
            @Min(1) int capacity,
            List<@NotBlank String> skills,
            @NotBlank String calendarId,
            @PositiveOrZero BigDecimal costPerHour,
            List<@NotNull @Valid UnavailabilityDto> unavailability) {

        public ResourceRequest {
            // copia difensiva che tollera elementi nulli: li segnala poi @NotBlank (422) invece di fallire qui
            skills = skills == null ? List.of() : Collections.unmodifiableList(new ArrayList<>(skills));
        }
    }

    /** Un fermo: {@code reason} è un testo libero ("Manutenzione", "Guasto", ...). */
    public record UnavailabilityDto(@NotNull OffsetDateTime from, @NotNull OffsetDateTime to, @Size(max = 255) String reason) {
    }

    public record ResourceResponse(String id, String name, Resource.Type type, int capacity,
                                   List<String> skills, String calendarId, boolean active,
                                   BigDecimal costPerHour, List<UnavailabilityDto> unavailability) {

        public static ResourceResponse from(Resource r) {
            List<String> skillCodes = r.getSkills().stream()
                    .map(rs -> rs.getSkill().getCode())
                    .sorted()
                    .toList();
            List<UnavailabilityDto> blocks = r.getUnavailability().stream()
                    .map(u -> new UnavailabilityDto(u.getStartsAt().atOffset(ZoneOffset.UTC), u.getEndsAt().atOffset(ZoneOffset.UTC),
                            reasonLabel(u)))
                    .toList();
            return new ResourceResponse(r.getCode(), r.getName(), r.getType(), r.getCapacity(), skillCodes,
                    String.valueOf(r.getCalendar().getId()), r.isActive(), r.getCostPerHour(), blocks);
        }

        /** La nota se c'è, altrimenti il motivo in italiano. */
        public static String reasonLabel(Unavailability u) {
            if (u.getNote() != null && !u.getNote().isBlank()) {
                return u.getNote();
            }
            return switch (u.getReason()) {
                case MAINTENANCE -> "Manutenzione";
                case BREAKDOWN -> "Guasto";
                case LEAVE -> "Assenza";
                case OTHER -> "Non disponibile";
            };
        }
    }

    public record SkillResponse(String code, String name) {
    }

    /** Un turno di ogni giorno lavorativo, es. 08:00–12:00. */
    public record ShiftDto(@NotNull @JsonFormat(pattern = "HH:mm") LocalTime start,
                           @NotNull @JsonFormat(pattern = "HH:mm") LocalTime end) {
    }

    public record HolidayDto(@NotNull LocalDate date, @Size(max = 100) String name) {
    }

    /**
     * Calendario (contratto A.2 v1.1): gli stessi turni in tutti i giorni lavorativi (1 = lunedì … 7 = domenica).
     * shiftsSummary: descrizione breve dei turni, es. "Lun–Ven 8–12 / 13–17", calcolata dal backend.
     */
    public record CalendarResponse(String id, String name, String shiftsSummary, List<Integer> workDays,
                                   List<ShiftDto> shifts, List<HolidayDto> holidays) {

        public static CalendarResponse from(WorkCalendar c, String summary) {
            List<Integer> days = c.getShifts().stream().map(WorkCalendar.Shift::getDayOfWeek).distinct().sorted().toList();
            List<ShiftDto> shifts = days.isEmpty() ? List.of() : c.getShifts().stream()
                    .filter(s -> s.getDayOfWeek() == days.get(0))
                    .map(s -> new ShiftDto(s.getStartTime(), s.getEndTime()))
                    .sorted(java.util.Comparator.comparing(ShiftDto::start))
                    .toList();
            List<HolidayDto> holidays = c.getHolidays().stream()
                    .map(h -> new HolidayDto(h.getDate(), h.getDescription()))
                    .sorted(java.util.Comparator.comparing(HolidayDto::date))
                    .toList();
            return new CalendarResponse(String.valueOf(c.getId()), c.getName(), summary, days, shifts, holidays);
        }
    }

    /** POST e PUT /calendars: stesso corpo della risposta, senza id e shiftsSummary. */
    public record CalendarRequest(@NotBlank @Size(max = 100) String name, @NotNull List<@NotNull Integer> workDays,
                                  @NotNull List<@NotNull @Valid ShiftDto> shifts,
                                  List<@NotNull @Valid HolidayDto> holidays) {
    }

    /** POST /skills: 422 se il codice esiste già. */
    public record SkillRequest(@NotBlank @Size(max = 30) @Pattern(regexp = "[A-Z0-9_]+", message = "uppercase letters, digits and _")
                               String code, @NotBlank @Size(max = 100) String name) {
    }

    /** PUT /domain-profiles/{code}: i pesi hanno somma 1; inUse = profilo di default delle nuove pianificazioni. */
    public record DomainProfileRequest(@NotBlank @Size(max = 100) String name, @Size(max = 255) String description,
                                       @NotNull Map<String, Double> defaultObjectiveWeights, List<@NotBlank String> features,
                                       Boolean inUse) {
    }

    /**
     * Profilo di dominio (contratto A.2). I pesi hanno le chiavi del contratto: makespan, weightedTardiness, setup
     * (una chiave assente vale 0). Senza descrizione salvata si mostra il nome.
     */
    public record DomainProfileResponse(String code, String name, String description,
                                        Map<String, Double> defaultObjectiveWeights, List<String> features,
                                        boolean inUse) {

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
                    weights, p.getFeatures() == null ? List.of() : List.copyOf(p.getFeatures()), p.isInUse());
        }
    }
}
