package it.unicam.flowsync.planning.service;

/** Evento: una richiesta è stata salvata e va elaborata (dopo il commit, fuori dalla richiesta HTTP). */
public record PlanningRequested(Long requestId) {
}
