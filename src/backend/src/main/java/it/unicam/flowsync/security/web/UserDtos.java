package it.unicam.flowsync.security.web;

import it.unicam.flowsync.security.domain.AppUser;
import jakarta.validation.constraints.NotNull;

import java.time.Instant;

/** Corpi della gestione utenti (/users, solo ADMIN). */
public final class UserDtos {

    private UserDtos() {
    }

    /** role è null finché l'account è in attesa: il ruolo salvato in quel momento è solo un segnaposto. */
    public record UserResponse(String id, String username, String email, String fullName, AppUser.Role role,
                               AppUser.Status status, Instant createdAt, Instant approvedAt) {

        public static UserResponse from(AppUser u) {
            AppUser.Status status = u.status();
            return new UserResponse("U-" + u.getId(), u.getUsername(), u.getEmail(), u.getFullName(),
                    status == AppUser.Status.PENDING ? null : u.getRole(), status, u.getCreatedAt(), u.getApprovedAt());
        }
    }

    /** Approvazione di una registrazione: l'ADMIN sceglie il ruolo. */
    public record ApproveRequest(@NotNull AppUser.Role role) {
    }

    /** Modifica di un utente già approvato: cambio ruolo e/o disattivazione-riattivazione. Campi null = invariati. */
    public record UpdateUserRequest(AppUser.Role role, Boolean active) {
    }
}
