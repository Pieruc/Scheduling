package it.unicam.flowsync.configuration.web;

import it.unicam.flowsync.common.web.ApiPaths;
import it.unicam.flowsync.configuration.service.CatalogService;
import it.unicam.flowsync.configuration.web.ConfigurationDtos.CalendarResponse;
import it.unicam.flowsync.configuration.web.ConfigurationDtos.DomainProfileResponse;
import it.unicam.flowsync.configuration.web.ConfigurationDtos.SkillResponse;
import it.unicam.flowsync.configuration.web.ConfigurationDtos.CalendarRequest;
import it.unicam.flowsync.configuration.web.ConfigurationDtos.DomainProfileRequest;
import it.unicam.flowsync.configuration.web.ConfigurationDtos.SkillRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.util.List;

/** /skills, /calendars e /domain-profiles (contratto A.2): lettura per tutti, scrittura solo ADMIN. */
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

    @PostMapping("/calendars")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<CalendarResponse> createCalendar(@Valid @RequestBody CalendarRequest request) {
        CalendarResponse created = catalog.createCalendar(request);
        return ResponseEntity.created(URI.create(ApiPaths.V1 + "/calendars/" + created.id())).body(created);
    }

    @PutMapping("/calendars/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public CalendarResponse updateCalendar(@PathVariable String id, @Valid @RequestBody CalendarRequest request) {
        return catalog.updateCalendar(id, request);
    }

    @PostMapping("/skills")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<SkillResponse> createSkill(@Valid @RequestBody SkillRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(catalog.createSkill(request));
    }

    @PutMapping("/domain-profiles/{code}")
    @PreAuthorize("hasRole('ADMIN')")
    public DomainProfileResponse updateDomainProfile(@PathVariable String code, @Valid @RequestBody DomainProfileRequest request) {
        return catalog.updateDomainProfile(code, request);
    }
}
