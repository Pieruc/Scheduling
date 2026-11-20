package it.unicam.flowsync.security.web;

import it.unicam.flowsync.common.web.ApiPaths;
import it.unicam.flowsync.security.service.AuthService;
import it.unicam.flowsync.security.web.AuthDtos.LoginRequest;
import it.unicam.flowsync.security.web.AuthDtos.RefreshRequest;
import it.unicam.flowsync.security.web.AuthDtos.RegisterRequest;
import it.unicam.flowsync.security.web.AuthDtos.RegistrationResponse;
import it.unicam.flowsync.security.web.AuthDtos.TokenResponse;
import it.unicam.flowsync.security.web.AuthDtos.UserDto;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Contratto A.1: login, rinnovo del token, utente corrente e registrazione (da approvare). */
@RestController
@RequestMapping(ApiPaths.V1 + "/auth")
public class AuthController {

    private final AuthService auth;

    public AuthController(AuthService auth) {
        this.auth = auth;
    }

    @PostMapping("/login")
    public TokenResponse login(@Valid @RequestBody LoginRequest request) {
        return auth.login(request.username(), request.password());
    }

    /** Pubblico: crea un account in attesa di approvazione (201, nessun token). */
    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public RegistrationResponse register(@Valid @RequestBody RegisterRequest request) {
        return auth.register(request);
    }

    @PostMapping("/refresh")
    public TokenResponse refresh(@Valid @RequestBody RefreshRequest request) {
        return auth.refresh(request.refreshToken());
    }

    @GetMapping("/me")
    public UserDto me(@AuthenticationPrincipal Jwt jwt) {
        return auth.me(jwt.getSubject());
    }
}
