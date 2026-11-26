package it.unicam.flowsync.models.web;

import it.unicam.flowsync.common.web.ApiPaths;
import it.unicam.flowsync.models.service.ModelService;
import it.unicam.flowsync.models.service.ModelService.ActiveModels;
import it.unicam.flowsync.models.service.ModelService.ModelEntry;
import it.unicam.flowsync.models.service.ModelService.ModelsStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** Contratto A.7: solo lettura; un modello si pubblica dalla pipeline (contratto C). */
@RestController
@RequestMapping(ApiPaths.V1 + "/models")
public class ModelController {

    private final ModelService models;

    public ModelController(ModelService models) {
        this.models = models;
    }

    @GetMapping("/active")
    @PreAuthorize("isAuthenticated()")
    public ActiveModels active() {
        return models.active();
    }

    @GetMapping
    @PreAuthorize("hasRole('ADMIN')")
    public List<ModelEntry> all() {
        return models.all();
    }

    @GetMapping("/status")
    @PreAuthorize("isAuthenticated()")
    public ModelsStatus status() {
        return models.status();
    }
}
