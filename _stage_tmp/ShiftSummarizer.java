package it.unicam.flowsync.configuration.service;

import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Riassume i turni settimanali di un calendario in una riga leggibile, es. "Lun–Ven 8–12 / 13–17".
 * I giorni consecutivi con le stesse fasce si raggruppano; classe pura, senza dipendenze da JPA.
 */
public final class ShiftSummarizer {

    /** Una fascia di lavoro: giorno ISO (1 = lunedì … 7 = domenica), inizio e fine. */
    public record Slot(int dayOfWeek, LocalTime start, LocalTime end) {
    }

    private static final String[] DAYS = {"Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"};

    private ShiftSummarizer() {
    }

    public static String summarize(Collection<Slot> slots) {
        if (slots.isEmpty()) {
            return "Nessun turno";
        }
        String[] pattern = new String[8];               // indici 1..7, fasce del giorno come testo
        for (int d = 1; d <= 7; d++) {
            final int day = d;
            pattern[d] = slots.stream()
                    .filter(s -> s.dayOfWeek() == day)
                    .sorted(Comparator.comparing(Slot::start))
                    .map(s -> time(s.start()) + "–" + time(s.end()))
                    .collect(Collectors.joining(" / "));
        }
        List<String> parts = new ArrayList<>();
        int day = 1;
        while (day <= 7) {
            if (pattern[day].isEmpty()) {
                day++;
                continue;
            }
            int last = day;
            while (last < 7 && pattern[last + 1].equals(pattern[day])) {
                last++;
            }
            String days = last == day ? DAYS[day - 1] : DAYS[day - 1] + "–" + DAYS[last - 1];
            parts.add(days + " " + pattern[day]);
            day = last + 1;
        }
        return parts.isEmpty() ? "Nessun turno" : String.join(", ", parts);
    }

    private static String time(LocalTime t) {
        return t.getMinute() == 0 ? String.valueOf(t.getHour()) : t.getHour() + ":" + String.format("%02d", t.getMinute());
    }
}
