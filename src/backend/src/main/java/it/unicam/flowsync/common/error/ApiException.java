package it.unicam.flowsync.common.error;

import org.springframework.http.HttpStatus;

import java.util.List;

/**
 * Eccezione di dominio che il {@link GlobalExceptionHandler} trasforma in application/problem+json.
 * Si creano con i metodi statici, uno per ogni codice HTTP del contratto (§0).
 */
public class ApiException extends RuntimeException {

    private final HttpStatus status;
    private final String slug;
    private final List<ApiError> errors;

    private ApiException(HttpStatus status, String slug, String detail, List<ApiError> errors) {
        super(detail);
        this.status = status;
        this.slug = slug;
        this.errors = errors == null ? List.of() : List.copyOf(errors);
    }

    /** 401: credenziali o token non validi. */
    public static ApiException unauthorized(String detail) {
        return new ApiException(HttpStatus.UNAUTHORIZED, "unauthorized", detail, null);
    }

    /** 404: la risorsa richiesta non esiste. */
    public static ApiException notFound(String detail) {
        return new ApiException(HttpStatus.NOT_FOUND, "not-found", detail, null);
    }

    /** 409: conflitto di stato (es. codice già esistente). */
    public static ApiException conflict(String code, String detail) {
        return new ApiException(HttpStatus.CONFLICT, "conflict", detail, List.of(new ApiError(code, null, detail)));
    }

    /** 422: input sintatticamente valido ma inconsistente. */
    public static ApiException unprocessable(String detail, List<ApiError> errors) {
        return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "validation", detail, errors);
    }

    public HttpStatus getStatus() {
        return status;
    }

    public String getSlug() {
        return slug;
    }

    public List<ApiError> getErrors() {
        return errors;
    }
}
