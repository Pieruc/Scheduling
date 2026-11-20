package it.unicam.flowsync.security.service;

import it.unicam.flowsync.common.error.ApiError;
import it.unicam.flowsync.common.error.ApiException;
import it.unicam.flowsync.security.domain.AppUser;
import it.unicam.flowsync.security.repository.AppUserRepository;
import it.unicam.flowsync.security.web.AuthDtos.RegisterRequest;
import it.unicam.flowsync.security.web.AuthDtos.RegistrationResponse;
import it.unicam.flowsync.security.web.AuthDtos.TokenResponse;
import it.unicam.flowsync.security.web.AuthDtos.UserDto;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Locale;

@Service
public class AuthService {

    private final AppUserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwt;
    /** Hash di una password qualunque: si confronta anche quando l'utente non esiste, per non rivelarlo dal tempo di risposta. */
    private final String dummyHash;

    public AuthService(AppUserRepository users, PasswordEncoder passwordEncoder, JwtService jwt) {
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.jwt = jwt;
        this.dummyHash = passwordEncoder.encode("not-a-real-password");
    }

    @Transactional(readOnly = true)
    public TokenResponse login(String username, String password) {
        AppUser user = users.findByUsername(username).orElse(null);
        boolean passwordOk = passwordEncoder.matches(password, user != null ? user.getPasswordHash() : dummyHash);
        // stesso messaggio per utente inesistente e password errata: non si rivela quali username esistono
        if (user == null || !passwordOk) {
            throw ApiException.unauthorized("Invalid username or password");
        }
        // la password è giusta, quindi si può dire perché l'accesso è negato
        if (user.status() == AppUser.Status.PENDING) {
            throw ApiException.forbidden("ACCOUNT_PENDING", "The account is waiting for approval by an administrator");
        }
        if (user.status() == AppUser.Status.DISABLED) {
            throw ApiException.forbidden("ACCOUNT_DISABLED", "The account has been disabled by an administrator");
        }
        return tokens(user);
    }

    /**
     * Crea un account disattivato e senza ruolo effettivo: finché un ADMIN non lo approva non si può fare login.
     * Il ruolo salvato (OPERATOR) è solo un segnaposto richiesto dallo schema; l'ADMIN sceglie quello vero all'approvazione.
     */
    @Transactional
    public RegistrationResponse register(RegisterRequest request) {
        String username = request.username().trim();
        String email = request.email().trim().toLowerCase(Locale.ROOT);
        if (users.existsByUsername(username)) {
            throw ApiException.conflict("DUPLICATE_USERNAME", "Username " + username + " is already taken");
        }
        if (users.existsByEmail(email)) {
            throw ApiException.conflict("DUPLICATE_EMAIL", "An account with this email already exists");
        }
        if (request.password().getBytes(StandardCharsets.UTF_8).length > 72) {
            throw ApiException.unprocessable("The password is too long", List.of(
                    new ApiError("PASSWORD_TOO_LONG", "password", "At most 72 bytes (fewer characters if accented)")));
        }
        AppUser user = new AppUser();
        user.setUsername(username);
        user.setEmail(email);
        user.setFullName(request.fullName().trim());
        user.setPasswordHash(passwordEncoder.encode(request.password()));
        user.setRole(AppUser.Role.OPERATOR);
        user.setActive(false);
        user = users.save(user);
        return new RegistrationResponse("U-" + user.getId(), user.getUsername(), AppUser.Status.PENDING.name(),
                "Registration received: an administrator must approve the account before you can log in");
    }

    @Transactional(readOnly = true)
    public TokenResponse refresh(String refreshToken) {
        Jwt token = jwt.parseRefresh(refreshToken);
        // si rilegge l'utente: ruolo cambiato o account disattivato dopo l'emissione del token valgono subito
        AppUser user = users.findByUsername(token.getSubject())
                .filter(AppUser::isActive)
                .orElseThrow(() -> ApiException.unauthorized("Invalid or expired refresh token"));
        return tokens(user);
    }

    @Transactional(readOnly = true)
    public UserDto me(String username) {
        return users.findByUsername(username)
                .filter(AppUser::isActive)
                .map(AuthService::toDto)
                .orElseThrow(() -> ApiException.unauthorized("User not found or disabled"));
    }

    private TokenResponse tokens(AppUser user) {
        return new TokenResponse(jwt.accessToken(user), jwt.refreshToken(user), jwt.accessExpiresInSeconds(), toDto(user));
    }

    private static UserDto toDto(AppUser user) {
        return new UserDto("U-" + user.getId(), user.getUsername(), List.of(user.getRole().name()));
    }
}
