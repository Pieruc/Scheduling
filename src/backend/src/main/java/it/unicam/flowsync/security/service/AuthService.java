package it.unicam.flowsync.security.service;

import it.unicam.flowsync.common.error.ApiException;
import it.unicam.flowsync.security.domain.AppUser;
import it.unicam.flowsync.security.repository.AppUserRepository;
import it.unicam.flowsync.security.web.AuthDtos.TokenResponse;
import it.unicam.flowsync.security.web.AuthDtos.UserDto;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

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
        // stesso messaggio per utente inesistente, password errata e utente disattivato
        if (user == null || !passwordOk || !user.isActive()) {
            throw ApiException.unauthorized("Invalid username or password");
        }
        return tokens(user);
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
