package it.unicam.flowsync.execution.service;

import it.unicam.flowsync.execution.domain.ExecutionEvent;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

/**
 * Stato di un'attività ricavato dai suoi eventi di esecuzione (contratto A.6): TODO, IN_PROGRESS, PAUSED, DONE,
 * minuti lavorati (solo gli intervalli chiusi), inizio e fine reali. Classe pura.
 */
public record ExecutionState(State state, int workedMin, Instant runningSince, Instant actualStart, Instant actualEnd) {

    public enum State { TODO, IN_PROGRESS, PAUSED, DONE }

    public record Event(ExecutionEvent.Type type, Instant at) {
    }

    public static final ExecutionState TODO = new ExecutionState(State.TODO, 0, null, null, null);

    /** @param events in ordine di tempo */
    public static ExecutionState of(List<Event> events) {
        State state = State.TODO;
        long worked = 0;
        Instant running = null;
        Instant start = null;
        Instant end = null;
        for (Event e : events) {
            switch (e.type()) {
                case START, RESUME -> {
                    if (start == null) {
                        start = e.at();
                    }
                    running = e.at();
                    state = State.IN_PROGRESS;
                }
                case PAUSE -> {
                    if (running != null) {
                        worked += Duration.between(running, e.at()).toSeconds();
                    }
                    running = null;
                    state = State.PAUSED;
                }
                case COMPLETE -> {
                    if (running != null) {
                        worked += Duration.between(running, e.at()).toSeconds();
                    }
                    running = null;
                    end = e.at();
                    state = State.DONE;
                }
            }
        }
        return new ExecutionState(state, (int) (worked / 60), running, start, end);
    }

    /**
     * Il nuovo evento è ammesso nello stato attuale? START solo da TODO, PAUSE solo in corso, RESUME solo in pausa,
     * COMPLETE da in corso o in pausa.
     */
    public boolean allows(ExecutionEvent.Type next) {
        return switch (next) {
            case START -> state == State.TODO;
            case PAUSE -> state == State.IN_PROGRESS;
            case RESUME -> state == State.PAUSED;
            case COMPLETE -> state == State.IN_PROGRESS || state == State.PAUSED;
        };
    }
}
