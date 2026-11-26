package it.unicam.flowsync.planning.ai;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.HttpServerErrorException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;

import java.util.Map;

/**
 * Client del servizio AI (contratto B): {@code POST /optimize} con la ProblemSpec in snake_case, così com'è.
 * <p>
 * Comportamento del contratto B.4 senza librerie in più: attesa = time_limit + 2 s, un nuovo tentativo sugli errori
 * di rete e sui 5xx (lo stesso {@code request_id} rende il retry idempotente), nessun tentativo sui 4xx. Il circuit
 * breaker di Resilience4j resta da aggiungere: con una richiesta alla volta in demo non cambia il comportamento.
 */
@Component
public class AiClient {

    private static final Logger LOG = LoggerFactory.getLogger(AiClient.class);
    private static final ParameterizedTypeReference<Map<String, Object>> JSON_OBJECT = new ParameterizedTypeReference<>() {
    };

    private final RestClient http;
    private final RestClient healthHttp;
    private final AiProperties props;

    public AiClient(RestClient.Builder builder, AiProperties props) {
        this.props = props;
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(props.connectTimeout());
        factory.setReadTimeout(props.readTimeout());
        this.http = builder.baseUrl(props.baseUrl())
                .requestFactory(factory)
                .defaultHeaders(h -> {
                    if (props.serviceKey() != null && !props.serviceKey().isBlank()) {
                        h.set("X-Service-Key", props.serviceKey());
                    }
                })
                .build();
        SimpleClientHttpRequestFactory quick = new SimpleClientHttpRequestFactory();
        quick.setConnectTimeout(java.time.Duration.ofSeconds(1));
        quick.setReadTimeout(java.time.Duration.ofSeconds(2));
        this.healthHttp = builder.requestFactory(quick).build();
    }

    public int timeLimitMs() {
        return props.timeLimitMs();
    }

    /**
     * {@code GET /health} del servizio AI (contratto B.3); null se non risponde. Usa un'attesa breve: serve alla
     * pagina sullo stato dei modelli, che non deve bloccarsi se il servizio è spento.
     */
    public Map<String, Object> health() {
        try {
            return healthHttp.get().uri("/health").retrieve().body(JSON_OBJECT);
        } catch (RuntimeException e) {
            LOG.warn("AI service health check failed: {}", e.getMessage());
            return null;
        }
    }

    /** ProblemSpec -> PlanResult (mappe JSON con le chiavi del contratto B). */
    public Map<String, Object> optimize(Map<String, Object> spec) {
        RuntimeException last = null;
        for (int attempt = 0; attempt <= props.retries(); attempt++) {
            try {
                return http.post().uri("/optimize")
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(spec)
                        .retrieve()
                        .body(JSON_OBJECT);
            } catch (HttpClientErrorException e) {
                throw new AiRejectedException(e.getStatusCode().value(), e.getResponseBodyAsString());
            } catch (ResourceAccessException | HttpServerErrorException e) {
                last = e;
                LOG.warn("AI service call {} failed: {}", attempt + 1, e.getMessage());
            }
        }
        throw new AiUnavailableException("The AI service at " + props.baseUrl() + " is not reachable", last);
    }
}
