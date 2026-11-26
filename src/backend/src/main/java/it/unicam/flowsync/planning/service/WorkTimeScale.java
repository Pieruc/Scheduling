package it.unicam.flowsync.planning.service;

import java.time.DayOfWeek;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Scala dei tempi in <b>minuti di lavoro</b> di un periodo (contratto A.4, Gantt): si contano solo i minuti dentro i
 * turni dei giorni lavorativi. Ogni giorno lavorativo occupa {@code minutesPerDay} minuti consecutivi, quindi il
 * giorno {@code d} va da {@code d * minutesPerDay}: il Gantt disegna i giorni a larghezza fissa senza conoscere i
 * calendari. Un giorno più corto degli altri lascia in fondo minuti che nessuno può usare ({@link #workingWindows()}).
 * <p>
 * La stessa scala serve alla ProblemSpec: i minuti che il servizio AI vede sono già minuti di lavoro, quindi i piani
 * non mettono mai attività fuori turno. Classe pura (solo java.time), testata senza Spring.
 */
public final class WorkTimeScale {

    /** Un turno di un giorno, es. 08:00–12:00. */
    public record Shift(LocalTime start, LocalTime end) {

        int minutes() {
            return (int) Duration.between(start, end).toMinutes();
        }
    }

    private final ZoneId zone;
    private final List<LocalDate> days;
    private final List<List<Shift>> shiftsOfDay;
    private final int minutesPerDay;

    private WorkTimeScale(ZoneId zone, List<LocalDate> days, List<List<Shift>> shiftsOfDay, int minutesPerDay) {
        this.zone = zone;
        this.days = days;
        this.shiftsOfDay = shiftsOfDay;
        this.minutesPerDay = minutesPerDay;
    }

    /**
     * @param weekly   turni per giorno della settimana (giorni senza turni = non lavorativi)
     * @param holidays festività, che non sono giorni lavorativi
     */
    public static WorkTimeScale of(Instant from, Instant to, ZoneId zone, Map<DayOfWeek, List<Shift>> weekly,
                                   Collection<LocalDate> holidays) {
        if (!to.isAfter(from)) {
            throw new IllegalArgumentException("The end of the period must follow its start");
        }
        Set<LocalDate> closed = Set.copyOf(holidays);
        List<LocalDate> days = new ArrayList<>();
        List<List<Shift>> shifts = new ArrayList<>();
        int max = 0;
        for (LocalDate d = from.atZone(zone).toLocalDate(); !d.isAfter(to.atZone(zone).toLocalDate()); d = d.plusDays(1)) {
            List<Shift> ofDay = weekly.getOrDefault(d.getDayOfWeek(), List.of()).stream()
                    .sorted(Comparator.comparing(Shift::start)).toList();
            if (ofDay.isEmpty() || closed.contains(d)) {
                continue;
            }
            days.add(d);
            shifts.add(ofDay);
            max = Math.max(max, ofDay.stream().mapToInt(Shift::minutes).sum());
        }
        if (days.isEmpty()) {
            throw new IllegalArgumentException("The period contains no working day");
        }
        return new WorkTimeScale(zone, List.copyOf(days), List.copyOf(shifts), max);
    }

    public List<LocalDate> days() {
        return days;
    }

    public int minutesPerDay() {
        return minutesPerDay;
    }

    public int totalMinutes() {
        return days.size() * minutesPerDay;
    }

    /**
     * Istante reale -> minuto di lavoro. Fuori turno: con {@code roundUp} si va all'inizio del lavoro successivo
     * (inizi, rilasci), altrimenti alla fine del lavoro precedente (scadenze). Tra due turni dello stesso giorno le
     * due letture coincidono, perché la pausa non conta.
     */
    public int toMinute(Instant instant, boolean roundUp) {
        ZonedDateTime at = instant.atZone(zone);
        LocalDate date = at.toLocalDate();
        if (date.isBefore(days.get(0))) {
            return 0;
        }
        if (date.isAfter(days.get(days.size() - 1))) {
            return totalMinutes();
        }
        int idx = days.indexOf(date);
        if (idx < 0) {                                         // giorno non lavorativo nel mezzo del periodo
            int next = 0;
            while (days.get(next).isBefore(date)) {
                next++;
            }
            return roundUp ? next * minutesPerDay : endOfDay(next - 1);
        }
        int base = idx * minutesPerDay;
        int done = 0;
        LocalTime time = at.toLocalTime();
        for (Shift s : shiftsOfDay.get(idx)) {
            if (time.isBefore(s.start())) {
                return base + done;
            }
            if (time.isBefore(s.end())) {
                return base + done + (int) Duration.between(s.start(), time).toMinutes();
            }
            done += s.minutes();
        }
        return roundUp ? Math.min((idx + 1) * minutesPerDay, totalMinutes()) : base + done;
    }

    /**
     * Minuto di lavoro -> istante reale. Un minuto che cade sul confine tra due turni è la fine del primo se
     * {@code asEnd} (le 12:00 per un'attività che finisce lì), altrimenti l'inizio del secondo (le 13:00).
     */
    public Instant toInstant(int minute, boolean asEnd) {
        int m = Math.max(0, Math.min(minute, totalMinutes()));
        int d = m / minutesPerDay;
        int off = m % minutesPerDay;
        if (d == days.size() || (asEnd && off == 0 && d > 0)) {
            d -= 1;
            off = minutesPerDay;
        }
        List<Shift> shifts = shiftsOfDay.get(d);
        off = Math.min(off, shifts.stream().mapToInt(Shift::minutes).sum());
        for (int i = 0; i < shifts.size(); i++) {
            Shift s = shifts.get(i);
            boolean last = i == shifts.size() - 1;
            if (off < s.minutes() || (off == s.minutes() && (asEnd || last))) {
                return days.get(d).atTime(s.start()).plusMinutes(off).atZone(zone).toInstant();
            }
            off -= s.minutes();
        }
        Shift lastShift = shifts.get(shifts.size() - 1);
        return days.get(d).atTime(lastShift.end()).atZone(zone).toInstant();
    }

    /** Intervalli [inizio, fine) davvero lavorabili: tolgono la coda dei giorni più corti di minutesPerDay. */
    public List<int[]> workingWindows() {
        List<int[]> windows = new ArrayList<>();
        for (int d = 0; d < days.size(); d++) {
            int start = d * minutesPerDay;
            int end = endOfDay(d);
            if (!windows.isEmpty() && windows.get(windows.size() - 1)[1] == start) {
                windows.get(windows.size() - 1)[1] = end;
            } else {
                windows.add(new int[]{start, end});
            }
        }
        return windows;
    }

    /**
     * Finestre di disponibilità [inizio, fine) dentro {@code [from, to)}: i minuti lavorabili meno i blocchi indicati
     * (manutenzioni, guasti), già convertiti in minuti di lavoro.
     */
    public List<int[]> availability(int from, int to, List<int[]> blocks) {
        List<int[]> free = new ArrayList<>();
        for (int[] w : workingWindows()) {
            int s = Math.max(w[0], from);
            int e = Math.min(w[1], to);
            if (s < e) {
                free.add(new int[]{s, e});
            }
        }
        for (int[] b : blocks) {
            List<int[]> next = new ArrayList<>();
            for (int[] f : free) {
                if (b[1] <= f[0] || b[0] >= f[1]) {
                    next.add(f);
                    continue;
                }
                if (b[0] > f[0]) {
                    next.add(new int[]{f[0], b[0]});
                }
                if (b[1] < f[1]) {
                    next.add(new int[]{b[1], f[1]});
                }
            }
            free = next;
        }
        return free;
    }

    private int endOfDay(int d) {
        return d * minutesPerDay + shiftsOfDay.get(d).stream().mapToInt(Shift::minutes).sum();
    }
}
