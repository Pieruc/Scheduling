package it.unicam.flowsync.security.web;

import jakarta.validation.constraints.NotBlank;

import java.util.List;

/** Corpi di richiesta e risposta di /auth (contratto A.1). */
public final class AuthDtos {

    private AuthDtos() {
    }

    public record LoginRequest(@NotBlank String username, @NotBlank String password) {
    }

    public record RefreshRequest(@NotBlank String refreshToken) {
    }

    /** id nel formato opaco del contratto ("U-1"); roles è una lista anche se oggi ogni utente ha un solo ruolo. */
    public record UserDto(String id, String username, List<String> roles) {
    }

    public record TokenResponse(String accessToken, String refreshToken, long expiresIn, UserDto user) {
    }
}
