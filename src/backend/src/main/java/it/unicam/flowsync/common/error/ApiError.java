package it.unicam.flowsync.common.error;

/**
 * Un singolo errore dentro un problema RFC 7807 (campo "errors" del contratto, §0).
 *
 * @param code    codice stabile, leggibile dal frontend (es. UNKNOWN_SKILL)
 * @param path    campo dell'input a cui si riferisce (es. "skills[0]"), null se non applicabile
 * @param message descrizione per l'utente
 */
public record ApiError(String code, String path, String message) {
}
