package it.unicam.flowsync.security.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

import java.nio.charset.StandardCharsets;
import java.time.Duration;

/**
 * Parametri dei token (flowsync.security.jwt.*). Il segreto arriva dall'ambiente (JWT_SECRET):
 * HS256 richiede almeno 256 bit, quindi 32 byte.
 */
@ConfigurationProperties(prefix = "flowsync.security.jwt")
public record JwtProperties(
        String secret,
        @DefaultValue("PT15M") Duration accessTtl,
        @DefaultValue("P7D") Duration refreshTtl) {

    public JwtProperties {
        if (secret == null || secret.getBytes(StandardCharsets.UTF_8).length < 32) {
            throw new IllegalStateException(
                    "flowsync.security.jwt.secret (variabile JWT_SECRET) deve avere almeno 32 byte");
        }
    }
}
