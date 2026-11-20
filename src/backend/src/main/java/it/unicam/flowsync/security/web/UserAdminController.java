package it.unicam.flowsync.security.web;

import it.unicam.flowsync.common.web.ApiPaths;
import it.unicam.flowsync.security.domain.AppUser;
import it.unicam.flowsync.security.service.UserAdminService;
import it.unicam.flowsync.security.web.UserDtos.ApproveRequest;
import it.unicam.flowsync.security.web.UserDtos.UpdateUserRequest;
import it.unicam.flowsync.security.web.UserDtos.UserResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** Gestione utenti e approvazione delle registrazioni: tutto riservato all'ADMIN. */
@RestController
@RequestMapping(ApiPaths.V1 + "/users")
@PreAuthorize("hasRole('ADMIN')")
public class UserAdminController {

    private final UserAdminService service;

    public UserAdminController(UserAdminService service) {
        this.service = service;
    }

    /** GET /users?status=PENDING per le registrazioni da approvare. */
    @GetMapping
    public List<UserResponse> list(@RequestParam(required = false) AppUser.Status status) {
        return service.list(status);
    }

    @PostMapping("/{id}/approve")
    public UserResponse approve(@PathVariable String id, @Valid @RequestBody ApproveRequest request,
                                @AuthenticationPrincipal Jwt admin) {
        return service.approve(id, request.role(), admin.getSubject());
    }

    @PatchMapping("/{id}")
    public UserResponse update(@PathVariable String id, @RequestBody UpdateUserRequest request,
                               @AuthenticationPrincipal Jwt admin) {
        return service.update(id, request, admin.getSubject());
    }

    /** Rifiuta (cancella) una registrazione in attesa. */
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void reject(@PathVariable String id) {
        service.rejectPending(id);
    }
}
