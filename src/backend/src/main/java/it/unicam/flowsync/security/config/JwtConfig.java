package it.unicam.flowsync.security.config;

import com.nimbusds.jose.jwk.source.ImmutableSecret;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;

/** Firma e verifica dei JWT con un segreto condiviso (HS256): il backend è l'unico emittente e verificatore. */
@Configuration
@EnableConfigurationProperties(JwtProperties.class)
public class JwtConfig {

    public static final String ISSUER = "flowsync";
    public static final String CLAIM_TOKEN_USE = "token_use";
    public static final String ACCESS = "access";
    public static final String REFRESH = "refresh";

    @Bean
    SecretKey jwtSecretKey(JwtProperties properties) {
        return new SecretKeySpec(properties.secret().getBytes(StandardCharsets.UTF_8), "HmacSHA256");
    }

    @Bean
    JwtEncoder jwtEncoder(SecretKey jwtSecretKey) {
        return new NimbusJwtEncoder(new ImmutableSecret<>(jwtSecretKey));
    }

    /** Decoder usato dal resource server: accetta SOLO access token (un refresh token non apre le API). */
    @Bean
    JwtDecoder jwtDecoder(SecretKey jwtSecretKey) {
        return decoder(jwtSecretKey, ACCESS);
    }

    /** Decoder che accetta solo i token del tipo indicato, con firma, scadenza ed emittente verificati. */
    public static NimbusJwtDecoder decoder(SecretKey key, String expectedUse) {
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withSecretKey(key).macAlgorithm(MacAlgorithm.HS256).build();
        decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(
                JwtValidators.createDefaultWithIssuer(ISSUER), tokenUse(expectedUse)));
        return decoder;
    }

    private static OAuth2TokenValidator<Jwt> tokenUse(String expected) {
        return jwt -> expected.equals(jwt.getClaimAsString(CLAIM_TOKEN_USE))
                ? OAuth2TokenValidatorResult.success()
                : OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token", "Wrong token type", null));
    }
}
