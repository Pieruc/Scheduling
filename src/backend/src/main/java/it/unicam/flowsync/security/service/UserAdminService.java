package it.unicam.flowsync.security.service;

import it.unicam.flowsync.common.error.ApiError;
import it.unicam.flowsync.common.error.ApiException;
import it.unicam.flowsync.security.domain.AppUser;
import it.unicam.flowsync.security.repository.AppUserRepository;
import it.unicam.flowsync.security.web.UserDtos.UpdateUserRequest;
import it.unicam.flowsync.security.web.UserDtos.UserResponse;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;

/**
 * Gestione degli utenti da parte dell'ADMIN: approvare o rifiutare le registrazioni, cambiare ruolo, disattivare.
 * Nota: un access token già emesso resta valido fino alla scadenza (15 min); il refresh invece è subito negato.
 */
@Service
public class UserAdminService {

    private final AppUserRepository users;

    public UserAdminService(AppUserRepository users) {
        this.users = users;
    }

    /** @param status se non nullo, solo gli utenti in quello stato (es. PENDING per le registrazioni da approvare) */
    @Transactional(readOnly = true)
    public List<UserResponse> list(AppUser.Status status) {
        return users.findAllByOrderByCreatedAtDesc().stream()
                .filter(u -> status == null || u.status() == status)
                .map(UserResponse::from)
                .toList();
    }

    @Transactional
    public UserResponse approve(String id, AppUser.Role role, String adminUsername) {
        AppUser user = load(id);
        if (user.status() != AppUser.Status.PENDING) {
            throw ApiException.conflict("NOT_PENDING", "User " + id + " is not waiting for approval");
        }
        user.setRole(role);
        user.setActive(true);
        user.setApprovedAt(Instant.now());
        user.setApprovedBy(users.findByUsername(adminUsername).orElse(null));
        return UserResponse.from(user);
    }

    @Transactional
    public UserResponse update(String id, UpdateUserRequest request, String adminUsername) {
        if (request.role() == null && request.active() == null) {
            throw ApiException.unprocessable("Nothing to change", List.of(
                    new ApiError("EMPTY_UPDATE", null, "Provide role and/or active")));
        }
        AppUser user = load(id);
        if (user.status() == AppUser.Status.PENDING) {
            throw ApiException.conflict("USER_PENDING", "User " + id + " must be approved first (POST /users/" + id + "/approve)");
        }
        boolean self = user.getUsername().equalsIgnoreCase(adminUsername);
        boolean losesAdmin = Boolean.FALSE.equals(request.active())
                || (request.role() != null && request.role() != AppUser.Role.ADMIN);
        if (self && losesAdmin) {
            // evita di restare senza amministratori per errore
            throw ApiException.conflict("SELF_LOCKOUT", "You cannot disable yourself or remove your own ADMIN role");
        }
        if (request.role() != null) {
            user.setRole(request.role());
        }
        if (request.active() != null) {
            user.setActive(request.active());
        }
        return UserResponse.from(user);
    }

    /** Rifiuto di una registrazione: si cancella l'account in attesa. Un utente già approvato si disattiva, non si cancella. */
    @Transactional
    public void rejectPending(String id) {
        AppUser user = load(id);
        if (user.status() != AppUser.Status.PENDING) {
            throw ApiException.conflict("NOT_PENDING", "Only pending registrations can be deleted; disable the user instead");
        }
        users.delete(user);
    }

    /** Gli id pubblici hanno la forma "U-12". */
    private AppUser load(String id) {
        Long key = null;
        if (id != null && id.startsWith("U-")) {
            try {
                key = Long.parseLong(id.substring(2));
            } catch (NumberFormatException ignored) {
                // gestito sotto come id inesistente
            }
        }
        if (key == null) {
            throw ApiException.notFound("User " + id + " not found");
        }
        return users.findById(key).orElseThrow(() -> ApiException.notFound("User " + id + " not found"));
    }
}
