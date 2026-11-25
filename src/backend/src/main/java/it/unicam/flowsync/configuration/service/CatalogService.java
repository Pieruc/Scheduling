package it.unicam.flowsync.configuration.service;

import it.unicam.flowsync.configuration.domain.WorkCalendar;
import it.unicam.flowsync.common.error.ApiException;
import it.unicam.flowsync.configuration.repository.CalendarRepository;
import it.unicam.flowsync.configuration.repository.DomainProfileRepository;
import it.unicam.flowsync.configuration.repository.SkillRepository;
import it.unicam.flowsync.configuration.web.ConfigurationDtos.CalendarResponse;
import it.unicam.flowsync.configuration.web.ConfigurationDtos.DomainProfileResponse;
import it.unicam.flowsync.configuration.web.ConfigurationDtos.SkillResponse;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/** Elenchi di sola lettura che alimentano le tendine del frontend (competenze, calendari, profili di dominio). */
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
                .map(c -> new CalendarResponse(String.valueOf(c.getId()), c.getName(), summary(c)))
                .toList();
    }

    private static String summary(WorkCalendar calendar) {
        return ShiftSummarizer.summarize(calendar.getShifts().stream()
                .map(s -> new ShiftSummarizer.Slot(s.getDayOfWeek(), s.getStartTime(), s.getEndTime()))
                .toList());
    }
}
