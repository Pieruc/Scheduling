package it.unicam.flowsync.security.service;

import it.unicam.flowsync.common.error.ApiException;
import it.unicam.flowsync.security.config.JwtConfig;
import it.unicam.flowsync.security.config.JwtProperties;
import it.unicam.flowsync.security.domain.AppUser;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Emette access e refresh token e verifica i refresh token. */
@Service
public class JwtService {

    private final JwtEncoder encoder;
    private final JwtDecoder refreshDecoder;
    private final JwtProperties properties;

    public JwtService(JwtEncoder encoder, SecretKey jwtSecretKey, JwtProperties properties) {
        this.encoder = encoder;
        this.refreshDecoder = JwtConfig.decoder(jwtSecretKey, JwtConfig.REFRESH);
        this.properties = properties;
    }

    public String accessToken(AppUser user) {
        return issue(user, JwtConfig.ACCESS, properties.accessTtl());
    }

    public String refreshToken(AppUser user) {
        return issue(user, JwtConfig.REFRESH, properties.refreshTtl());
    }

    /** Durata dell'access token in secondi (campo expiresIn del contratto A.1). */
    public long accessExpiresInSeconds() {
        return properties.accessTtl().toSeconds();
    }

    /** Verifica firma, scadenza e tipo: un access token non è accettato come refresh token. */
    public Jwt parseRefresh(String token) {
        try {
            return refreshDecoder.decode(token);
        } catch (JwtException e) {
            throw ApiException.unauthorized("Invalid or expired refresh token");
        }
    }

    private String issue(AppUser user, String use, Duration ttl) {
        Instant now = Instant.now();
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer(JwtConfig.ISSUER)
                .subject(user.getUsername())
                .id(UUID.randomUUID().toString())
                .issuedAt(now)
                .expiresAt(now.plus(ttl))
                .claim("uid", user.getId())
                .claim("roles", List.of(user.getRole().name()))
                .claim(JwtConfig.CLAIM_TOKEN_USE, use)
                .build();
        JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).build();
        return encoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
    }
}
