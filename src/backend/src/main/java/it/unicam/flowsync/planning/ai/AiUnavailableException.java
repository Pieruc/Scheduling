package it.unicam.flowsync.planning.ai;

/** Il servizio AI non risponde, va in timeout o risponde 5xx anche dopo i tentativi previsti. */
public class AiUnavailableException extends RuntimeException {

    public AiUnavailableException(String message, Throwable cause) {
        super(message, cause);
    }
}
