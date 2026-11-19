package it.unicam.flowsync.configuration.service;

import it.unicam.flowsync.configuration.domain.WorkCalendar;
import it.unicam.flowsync.configuration.repository.CalendarRepository;
import it.unicam.flowsync.configuration.repository.SkillRepository;
import it.unicam.flowsync.configuration.web.ConfigurationDtos.CalendarResponse;
import it.unicam.flowsync.configuration.web.ConfigurationDtos.SkillResponse;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/** Elenchi di sola lettura che alimentano le tendine del frontend (competenze e calendari). */
@Service
public class CatalogService {

    private final SkillRepository skills;
    private final CalendarRepository calendars;

    public CatalogService(SkillRepository skills, CalendarRepository calendars) {
        this.skills = skills;
        this.calendars = calendars;
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
