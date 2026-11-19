package it.unicam.flowsync.common.error;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.UUID;

/**
 * Assegna un identificativo a ogni richiesta: lo mette nei log (MDC), nell'header X-Request-Id della risposta
 * e nel campo traceId dei problemi RFC 7807, così un errore visto dall'utente si ritrova nei log.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class TraceIdFilter extends OncePerRequestFilter {

    public static final String MDC_KEY = "traceId";
    public static final String HEADER = "X-Request-Id";

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String incoming = request.getHeader(HEADER);
        // si accetta l'id del chiamante solo se ha una forma innocua (niente a-capo né caratteri strani nei log)
        String traceId = incoming != null && incoming.matches("[A-Za-z0-9-]{8,64}")
                ? incoming
                : UUID.randomUUID().toString().replace("-", "");
        MDC.put(MDC_KEY, traceId);
        response.setHeader(HEADER, traceId);
        try {
            chain.doFilter(request, response);
        } finally {
            MDC.remove(MDC_KEY);
        }
    }
}
