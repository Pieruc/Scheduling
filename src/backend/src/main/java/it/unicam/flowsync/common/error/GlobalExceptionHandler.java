package it.unicam.flowsync.common.error;

import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.ServletWebRequest;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

import java.util.List;

/**
 * Tutti gli errori dell'API escono come application/problem+json (contratto, §0).
 * Gli errori di sicurezza prima del controller (token mancante o scaduto) li gestisce
 * {@code ProblemSecurityHandler}, con lo stesso formato.
 */
@RestControllerAdvice
public class GlobalExceptionHandler extends ResponseEntityExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(ApiException.class)
    ResponseEntity<Object> handleApi(ApiException ex, HttpServletRequest request) {
        return problem(Problems.of(ex.getStatus(), ex.getSlug(), ex.getMessage(), request.getRequestURI(), ex.getErrors()));
    }

    /** @PreAuthorize rifiutato: l'utente è autenticato ma il suo ruolo non basta. */
    @ExceptionHandler(AccessDeniedException.class)
    ResponseEntity<Object> handleDenied(AccessDeniedException ex, HttpServletRequest request) {
        return problem(Problems.of(HttpStatus.FORBIDDEN, "forbidden",
                "Your role is not allowed to perform this operation", request.getRequestURI(), null));
    }

    @ExceptionHandler(AuthenticationException.class)
    ResponseEntity<Object> handleAuthentication(AuthenticationException ex, HttpServletRequest request) {
        return problem(Problems.of(HttpStatus.UNAUTHORIZED, "unauthorized",
                "Authentication required", request.getRequestURI(), null));
    }

    /** Rete di sicurezza per i vincoli unici violati in concorrenza (il controllo esplicito nel servizio può essere battuto). */
    @ExceptionHandler(DataIntegrityViolationException.class)
    ResponseEntity<Object> handleIntegrity(DataIntegrityViolationException ex, HttpServletRequest request) {
        log.warn("Violazione di integrità: {}", ex.getMostSpecificCause().getMessage());
        return problem(Problems.of(HttpStatus.CONFLICT, "conflict",
                "The operation conflicts with existing data", request.getRequestURI(),
                List.of(new ApiError("DATA_CONFLICT", null, "The operation conflicts with existing data"))));
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<Object> handleUnexpected(Exception ex, HttpServletRequest request) {
        log.error("Errore non gestito su {}", request.getRequestURI(), ex);
        return problem(Problems.of(HttpStatus.INTERNAL_SERVER_ERROR, "internal",
                "Unexpected error: quote the traceId when reporting it", request.getRequestURI(), null));
    }

    /** Bean Validation fallita: per il contratto è 422 con l'elenco dei campi (e non 400, riservato al JSON malformato). */
    @Override
    protected ResponseEntity<Object> handleMethodArgumentNotValid(MethodArgumentNotValidException ex, HttpHeaders headers,
                                                                  HttpStatusCode status, WebRequest request) {
        List<ApiError> errors = ex.getBindingResult().getFieldErrors().stream()
                .map(GlobalExceptionHandler::toApiError)
                .toList();
        String detail = "The request contains " + errors.size() + (errors.size() == 1 ? " error" : " errors");
        return problem(Problems.of(HttpStatus.UNPROCESSABLE_ENTITY, "validation", detail, pathOf(request), errors));
    }

    /** Tutte le altre eccezioni MVC (JSON malformato, metodo non ammesso, ...): stesso formato, con traceId. */
    @Override
    protected ResponseEntity<Object> handleExceptionInternal(Exception ex, Object body, HttpHeaders headers,
                                                             HttpStatusCode statusCode, WebRequest request) {
        String detail = statusCode.value() == 400 ? "Malformed request" : ex.getMessage();
        ProblemDetail problem = Problems.of(statusCode, statusCode.value() == 400 ? "bad-request" : "request", detail,
                pathOf(request), null);
        return ResponseEntity.status(statusCode).headers(headers).contentType(MediaType.APPLICATION_PROBLEM_JSON).body(problem);
    }

    private static ApiError toApiError(FieldError fe) {
        // "NotBlank" -> "NOT_BLANK": stabile e indipendente dal testo del messaggio
        String code = fe.getCode() == null ? "INVALID" : fe.getCode().replaceAll("([a-z])([A-Z])", "$1_$2").toUpperCase();
        return new ApiError(code, fe.getField(), fe.getDefaultMessage());
    }

    private static String pathOf(WebRequest request) {
        return request instanceof ServletWebRequest servlet ? servlet.getRequest().getRequestURI() : null;
    }

    private static ResponseEntity<Object> problem(ProblemDetail problem) {
        return ResponseEntity.status(problem.getStatus()).contentType(MediaType.APPLICATION_PROBLEM_JSON).body(problem);
    }
}
