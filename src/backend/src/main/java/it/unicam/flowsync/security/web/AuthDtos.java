package it.unicam.flowsync.security.web;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.util.List;

/** Corpi di richiesta e risposta di /auth (contratto A.1). */
public final class AuthDtos {

    private AuthDtos() {
    }

    public record LoginRequest(@NotBlank String username, @NotBlank String password) {
    }

    public record RefreshRequest(@NotBlank String refreshToken) {
    }

    /**
     * Registrazione pubblica. Non c'è il ruolo: lo sceglie l'ADMIN quando approva (un campo "role" inviato qui è ignorato).
     * Password tra 8 e 72 caratteri: BCrypt considera al massimo 72 byte.
     */
    public record RegisterRequest(
            @NotBlank @Size(min = 3, max = 50)
            @Pattern(regexp = "[A-Za-z0-9._-]+", message = "only letters, digits, '.', '_' and '-'") String username,
            @NotBlank @Email @Size(max = 120) String email,
            @NotBlank @Size(max = 120) String fullName,
            @NotBlank @Size(min = 8, max = 72) String password) {
    }

    /** Risposta alla registrazione: nessun token, l'account è in attesa (status = PENDING). */
    public record RegistrationResponse(String id, String username, String status, String message) {
    }

    /** id nel formato opaco del contratto ("U-1"); roles è una lista anche se oggi ogni utente ha un solo ruolo. */
    public record UserDto(String id, String username, String fullName, String department, List<String> roles) {
    }

    public record TokenResponse(String accessToken, String refreshToken, long expiresIn, UserDto user) {
    }
}
