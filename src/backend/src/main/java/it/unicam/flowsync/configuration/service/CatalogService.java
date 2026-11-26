package it.unicam.flowsync.configuration.service;

import it.unicam.flowsync.configuration.domain.WorkCalendar;
import it.unicam.flowsync.common.error.ApiException;
import it.unicam.flowsync.configuration.repository.CalendarRepository;
import it.unicam.flowsync.configuration.repository.DomainProfileRepository;
import it.unicam.flowsync.configuration.repository.SkillRepository;
import it.unicam.flowsync.configuration.web.ConfigurationDtos.CalendarResponse;
import it.unicam.flowsync.configuration.web.ConfigurationDtos.DomainProfileResponse;
import it.unicam.flowsync.configuration.web.ConfigurationDtos.SkillResponse;
import it.unicam.flowsync.common.error.ApiError;
import it.unicam.flowsync.configuration.domain.DomainProfile;
import it.unicam.flowsync.configuration.domain.Skill;
import it.unicam.flowsync.configuration.web.ConfigurationDtos.CalendarRequest;
import it.unicam.flowsync.configuration.web.ConfigurationDtos.DomainProfileRequest;
import it.unicam.flowsync.configuration.web.ConfigurationDtos.HolidayDto;
import it.unicam.flowsync.configuration.web.ConfigurationDtos.ShiftDto;
import it.unicam.flowsync.configuration.web.ConfigurationDtos.SkillRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Competenze, calendari e profili di dominio (contratto A.2): elenchi per le tendine del frontend e scritture ADMIN. */
@Service
public class CatalogService {

    private final SkillRepository skills;
    private final CalendarRepository calendars;
    private final DomainProfileRepository profiles;

    public CatalogService(SkillRepository skills, CalendarRepository calendars, DomainProfileRepository profiles) {
        this.skills = skills;
        this.calendars = calendars;
        this.profiles = profiles;
    }

    @Transactional(readOnly = true)
    public List<DomainProfileResponse> listDomainProfiles() {
        return profiles.findAllByOrderByCodeAsc().stream().map(DomainProfileResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public DomainProfileResponse getDomainProfile(String code) {
        return profiles.findByCode(code).map(DomainProfileResponse::from)
                .orElseThrow(() -> ApiException.notFound("Domain profile " + code + " not found"));
    }

    @Transactional(readOnly = true)
    public List<SkillResponse> listSkills() {
        return skills.findAllByOrderByCodeAsc().stream()
                .map(s -> new SkillResponse(s.getCode(), s.getName()))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<CalendarResponse> listCalendars() {
        return calendars.findAllByOrderByNameAsc().stream()
                .map(c -> CalendarResponse.from(c, summary(c)))
                .toList();
    }

    @Transactional
    public CalendarResponse createCalendar(CalendarRequest request) {
        WorkCalendar calendar = new WorkCalendar();
        apply(calendar, request);
        calendar = calendars.save(calendar);
        return CalendarResponse.from(calendar, summary(calendar));
    }

    @Transactional
    public CalendarResponse updateCalendar(String id, CalendarRequest request) {
        WorkCalendar calendar = findCalendar(id);
        apply(calendar, request);
        return CalendarResponse.from(calendar, summary(calendar));
    }

    private WorkCalendar findCalendar(String id) {
        try {
            return calendars.findById(Long.parseLong(id))
                    .orElseThrow(() -> ApiException.notFound("Calendar " + id + " not found"));
        } catch (NumberFormatException e) {
            throw ApiException.notFound("Calendar " + id + " not found");
        }
    }

    /** Controlla il corpo (422 con path) e sostituisce turni e festività del calendario. */
    private void apply(WorkCalendar calendar, CalendarRequest request) {
        List<ApiError> errors = new ArrayList<>();
        calendars.findByName(request.name().trim())
                .filter(other -> !other.getId().equals(calendar.getId()))
                .ifPresent(other -> errors.add(new ApiError("DUPLICATE_CALENDAR", "name",
                        "A calendar named " + request.name() + " already exists")));
        if (request.workDays().isEmpty()) {
            errors.add(new ApiError("NO_WORK_DAYS", "workDays", "At least one working day is required"));
        }
        Set<Integer> days = new HashSet<>();
        for (int i = 0; i < request.workDays().size(); i++) {
            int day = request.workDays().get(i);
            if (day < 1 || day > 7) {
                errors.add(new ApiError("INVALID_DAY", "workDays[" + i + "]", "Days go from 1 (Monday) to 7 (Sunday)"));
            } else if (!days.add(day)) {
                errors.add(new ApiError("DUPLICATE_DAY", "workDays[" + i + "]", "Day " + day + " is listed twice"));
            }
        }
        if (request.shifts().isEmpty()) {
            errors.add(new ApiError("NO_SHIFTS", "shifts", "At least one shift is required"));
        }
        for (int i = 0; i < request.shifts().size(); i++) {
            ShiftDto s = request.shifts().get(i);
            if (!s.end().isAfter(s.start())) {
                errors.add(new ApiError("INVALID_SHIFT", "shifts[" + i + "].end", "A shift must end after it starts"));
                continue;
            }
            for (int j = 0; j < i; j++) {
                ShiftDto o = request.shifts().get(j);
                if (s.start().isBefore(o.end()) && o.start().isBefore(s.end())) {
                    errors.add(new ApiError("OVERLAPPING_SHIFTS", "shifts[" + i + "].start",
                            "Shift " + s.start() + "–" + s.end() + " overlaps " + o.start() + "–" + o.end()));
                }
            }
        }
        List<HolidayDto> holidays = request.holidays() == null ? List.of() : request.holidays();
        Set<LocalDate> dates = new HashSet<>();
        for (int i = 0; i < holidays.size(); i++) {
            if (!dates.add(holidays.get(i).date())) {
                errors.add(new ApiError("DUPLICATE_HOLIDAY", "holidays[" + i + "].date", holidays.get(i).date() + " is listed twice"));
            }
        }
        if (!errors.isEmpty()) {
            throw ApiException.unprocessable("The calendar is not valid", errors);
        }

        calendar.setName(request.name().trim());
        calendar.getShifts().clear();
        for (int day : days.stream().sorted().toList()) {
            for (ShiftDto s : request.shifts()) {
                WorkCalendar.Shift shift = new WorkCalendar.Shift();
                shift.setCalendar(calendar);
                shift.setDayOfWeek(day);
                shift.setStartTime(s.start());
                shift.setEndTime(s.end());
                calendar.getShifts().add(shift);
            }
        }
        calendar.getHolidays().clear();
        holidays.forEach(h -> calendar.getHolidays().add(new WorkCalendar.Holiday(h.date(),
                h.name() == null || h.name().isBlank() ? null : h.name().trim())));
    }

    @Transactional
    public SkillResponse createSkill(SkillRequest request) {
        if (skills.findByCode(request.code()).isPresent()) {
            throw ApiException.unprocessable("Skill " + request.code() + " already exists",
                    List.of(new ApiError("DUPLICATE_SKILL", "code", "Skill " + request.code() + " already exists")));
        }
        Skill skill = new Skill();
        skill.setCode(request.code());
        skill.setName(request.name().trim());
        skill = skills.save(skill);
        return new SkillResponse(skill.getCode(), skill.getName());
    }

    private static final List<String> WEIGHT_KEYS = List.of("makespan", "weightedTardiness", "setup");

    /** PUT /domain-profiles/{code}: i pesi usano le chiavi del contratto e sommano a 1; un solo profilo inUse. */
    @Transactional
    public DomainProfileResponse updateDomainProfile(String code, DomainProfileRequest request) {
        DomainProfile profile = profiles.findByCode(code)
                .orElseThrow(() -> ApiException.notFound("Domain profile " + code + " not found"));
        List<ApiError> errors = new ArrayList<>();
        Map<String, Double> weights = new LinkedHashMap<>();
        double sum = 0;
        for (Map.Entry<String, Double> e : request.defaultObjectiveWeights().entrySet()) {
            String path = "defaultObjectiveWeights." + e.getKey();
            if (!WEIGHT_KEYS.contains(e.getKey())) {
                errors.add(new ApiError("UNKNOWN_WEIGHT", path, "Allowed weights: " + String.join(", ", WEIGHT_KEYS)));
            } else if (e.getValue() == null || e.getValue() < 0) {
                errors.add(new ApiError("INVALID_WEIGHT", path, "A weight must be zero or positive"));
            } else {
                weights.put(e.getKey(), e.getValue());
                sum += e.getValue();
            }
        }
        if (errors.isEmpty() && Math.abs(sum - 1.0) > 0.001) {
            errors.add(new ApiError("WEIGHTS_NOT_NORMALISED", "defaultObjectiveWeights",
                    "The weights must add up to 1 (they add up to " + Math.round(sum * 1000) / 1000.0 + ")"));
        }
        if (!errors.isEmpty()) {
            throw ApiException.unprocessable("The domain profile is not valid", errors);
        }
        profile.setName(request.name().trim());
        profile.setDescription(request.description() == null || request.description().isBlank() ? null : request.description().trim());
        profile.setDefaultWeights(weights);
        if (request.features() != null) {
            profile.setFeatures(new ArrayList<>(request.features().stream().map(String::trim).distinct().toList()));
        }
        if (Boolean.TRUE.equals(request.inUse())) {
            profiles.findAll().forEach(p -> p.setInUse(p == profile || p.getId().equals(profile.getId())));
        } else if (Boolean.FALSE.equals(request.inUse())) {
            profile.setInUse(false);
        }
        return DomainProfileResponse.from(profile);
    }

    private static String summary(WorkCalendar calendar) {
        return ShiftSummarizer.summarize(calendar.getShifts().stream()
                .map(s -> new ShiftSummarizer.Slot(s.getDayOfWeek(), s.getStartTime(), s.getEndTime()))
                .toList());
    }
}
