package it.unicam.flowsync.common.error;

import org.slf4j.MDC;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;

import java.net.URI;
import java.util.List;

/** Costruisce i problemi RFC 7807 nel formato del contratto (§0): type, title, status, detail, instance, traceId, errors. */
public final class Problems {

    private static final String TYPE_BASE = "https://flowsync.local/errors/";

    private Problems() {
    }

    public static ProblemDetail of(HttpStatusCode status, String slug, String detail, String path, List<ApiError> errors) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
        problem.setType(URI.create(TYPE_BASE + slug));
        problem.setTitle(titleOf(status));
        if (path != null) {
            problem.setInstance(URI.create(path));
        }
        String traceId = MDC.get(TraceIdFilter.MDC_KEY);
        if (traceId != null) {
            problem.setProperty("traceId", traceId);
        }
        if (errors != null && !errors.isEmpty()) {
            problem.setProperty("errors", errors);
        }
        return problem;
    }

    private static String titleOf(HttpStatusCode status) {
        return switch (status.value()) {
            case 400 -> "Bad request";
            case 401 -> "Unauthorized";
            case 403 -> "Forbidden";
            case 404 -> "Not found";
            case 409 -> "Conflict";
            case 422 -> "Validation failed";
            case 503 -> "Service unavailable";
            default -> status.is5xxServerError() ? "Internal server error" : HttpStatus.valueOf(status.value()).getReasonPhrase();
        };
    }
}
