package it.unicam.flowsync.config;

import it.unicam.flowsync.planning.ai.AiProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;

/**
 * La generazione dei piani gira fuori dalla richiesta HTTP (contratto A.4: 202 e polling). Spring Boot fornisce
 * l'executor (spring.task.execution.*).
 */
@Configuration
@EnableAsync
@EnableConfigurationProperties(AiProperties.class)
public class AsyncConfig {
}
