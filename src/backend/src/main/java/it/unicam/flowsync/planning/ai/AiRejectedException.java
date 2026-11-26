package it.unicam.flowsync.planning.ai;

/** Il servizio AI ha rifiutato la ProblemSpec (4xx): è un errore dei dati, ripetere la chiamata non serve. */
public class AiRejectedException extends RuntimeException {

    private final int status;

    public AiRejectedException(int status, String body) {
        super("The AI service rejected the problem (" + status + "): " + body);
        this.status = status;
    }

    public int getStatus() {
        return status;
    }
}
