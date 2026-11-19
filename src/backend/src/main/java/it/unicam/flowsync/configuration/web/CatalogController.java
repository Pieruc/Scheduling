package it.unicam.flowsync.configuration.web;

import it.unicam.flowsync.common.web.ApiPaths;
import it.unicam.flowsync.configuration.service.CatalogService;
import it.unicam.flowsync.configuration.web.ConfigurationDtos.CalendarResponse;
import it.unicam.flowsync.configuration.web.ConfigurationDtos.SkillResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** GET /skills e GET /calendars (contratto A.2). La creazione si aggiunge nel prossimo passo. */
@RestController
@RequestMapping(ApiPaths.V1)
public class CatalogController {

    private final CatalogService catalog;

    public CatalogController(CatalogService catalog) {
        this.catalog = catalog;
    }

    @GetMapping("/skills")
    public List<SkillResponse> skills() {
        return catalog.listSkills();
    }

    @GetMapping("/calendars")
    public List<CalendarResponse> calendars() {
        return catalog.listCalendars();
    }
}
