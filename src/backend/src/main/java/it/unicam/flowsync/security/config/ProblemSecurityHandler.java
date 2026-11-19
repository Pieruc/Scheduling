package it.unicam.flowsync.security.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import it.unicam.flowsync.common.error.Problems;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

/** 401 e 403 sollevati dai filtri di sicurezza (prima di arrivare a un controller), nel formato problem+json. */
@Component
public class ProblemSecurityHandler implements AuthenticationEntryPoint, AccessDeniedHandler {

    private final ObjectMapper mapper;

    public ProblemSecurityHandler(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    @Override
    public void commence(HttpServletRequest request, HttpServletResponse response, AuthenticationException ex)
            throws IOException {
        response.setHeader("WWW-Authenticate", "Bearer");
        write(response, Problems.of(HttpStatus.UNAUTHORIZED, "unauthorized",
                "Missing, invalid or expired access token", request.getRequestURI(), null));
    }

    @Override
    public void handle(HttpServletRequest request, HttpServletResponse response, AccessDeniedException ex)
            throws IOException {
        write(response, Problems.of(HttpStatus.FORBIDDEN, "forbidden",
                "Your role is not allowed to perform this operation", request.getRequestURI(), null));
    }

    private void write(HttpServletResponse response, ProblemDetail problem) throws IOException {
        response.setStatus(problem.getStatus());
        response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        mapper.writeValue(response.getOutputStream(), problem);
    }
}
