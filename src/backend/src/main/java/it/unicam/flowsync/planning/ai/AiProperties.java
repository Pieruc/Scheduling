package it.unicam.flowsync.planning.ai;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

/**
 * Indirizzo e tempi del servizio AI (contratto B). {@code timeLimitMs} va nella ProblemSpec; l'attesa della
 * risposta è {@code timeLimitMs + 2 s} (contratto B.4).
 */
@ConfigurationProperties(prefix = "flowsync.ai")
public record AiProperties(String baseUrl, String serviceKey, Integer timeLimitMs, Duration connectTimeout,
                           Integer retries) {

    public AiProperties {
        baseUrl = baseUrl == null || baseUrl.isBlank() ? "http://localhost:8000" : baseUrl;
        timeLimitMs = timeLimitMs == null ? 5000 : timeLimitMs;
        connectTimeout = connectTimeout == null ? Duration.ofSeconds(2) : connectTimeout;
        retries = retries == null ? 1 : retries;
    }

    public Duration readTimeout() {
        return Duration.ofMillis(timeLimitMs + 2000L);
    }
}
