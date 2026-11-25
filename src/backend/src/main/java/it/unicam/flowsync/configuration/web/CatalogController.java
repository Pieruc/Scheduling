package it.unicam.flowsync.configuration.web;

import it.unicam.flowsync.common.web.ApiPaths;
import it.unicam.flowsync.configuration.service.CatalogService;
import it.unicam.flowsync.configuration.web.ConfigurationDtos.CalendarResponse;
import it.unicam.flowsync.configuration.web.ConfigurationDtos.DomainProfileResponse;
import it.unicam.flowsync.configuration.web.ConfigurationDtos.SkillResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** GET /skills, /calendars e /domain-profiles (contratto A.2). La scrittura si aggiunge in un passo successivo. */
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

    @GetMapping("/domain-profiles")
    public List<DomainProfileResponse> domainProfiles() {
        return catalog.listDomainProfiles();
    }

    @GetMapping("/domain-profiles/{code}")
    public DomainProfileResponse domainProfile(@PathVariable String code) {
        return catalog.getDomainProfile(code);
    }
}
