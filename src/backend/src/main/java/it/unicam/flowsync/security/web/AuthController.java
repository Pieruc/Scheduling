package it.unicam.flowsync.security.web;

import it.unicam.flowsync.common.web.ApiPaths;
import it.unicam.flowsync.security.service.AuthService;
import it.unicam.flowsync.security.web.AuthDtos.LoginRequest;
import it.unicam.flowsync.security.web.AuthDtos.RefreshRequest;
import it.unicam.flowsync.security.web.AuthDtos.TokenResponse;
import it.unicam.flowsync.security.web.AuthDtos.UserDto;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Contratto A.1: login, rinnovo del token, utente corrente. */
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

    @PostMapping("/refresh")
    public TokenResponse refresh(@Valid @RequestBody RefreshRequest request) {
        return auth.refresh(request.refreshToken());
    }

    @GetMapping("/me")
    public UserDto me(@AuthenticationPrincipal Jwt jwt) {
        return auth.me(jwt.getSubject());
    }
}
