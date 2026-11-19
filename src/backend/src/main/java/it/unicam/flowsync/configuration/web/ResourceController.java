package it.unicam.flowsync.configuration.web;

import it.unicam.flowsync.common.web.ApiPaths;
import it.unicam.flowsync.configuration.service.ResourceService;
import it.unicam.flowsync.configuration.web.ConfigurationDtos.ResourceRequest;
import it.unicam.flowsync.configuration.web.ConfigurationDtos.ResourceResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.util.List;

/** Contratto A.2: lettura per tutti gli utenti autenticati, scrittura solo ADMIN. */
@RestController
@RequestMapping(ApiPaths.V1 + "/resources")
public class ResourceController {

    private final ResourceService service;

    public ResourceController(ResourceService service) {
        this.service = service;
    }

    @GetMapping
    public List<ResourceResponse> list(@RequestParam(required = false) Boolean active) {
        return service.list(active);
    }

    @GetMapping("/{id}")
    public ResourceResponse get(@PathVariable String id) {
        return service.get(id);
    }

    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ResourceResponse> create(@Valid @RequestBody ResourceRequest request) {
        ResourceResponse created = service.create(request);
        return ResponseEntity.created(URI.create(ApiPaths.V1 + "/resources/" + created.id())).body(created);
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResourceResponse update(@PathVariable String id, @Valid @RequestBody ResourceRequest request) {
        return service.update(id, request);
    }

    /** Disattiva la risorsa (non la cancella). */
    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deactivate(@PathVariable String id) {
        service.deactivate(id);
    }
}
