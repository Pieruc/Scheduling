package it.unicam.flowsync.planning.service;

import it.unicam.flowsync.configuration.domain.Resource;
import it.unicam.flowsync.configuration.domain.Unavailability;
import it.unicam.flowsync.configuration.repository.UnavailabilityRepository;
import it.unicam.flowsync.orders.domain.WorkOrder;
import it.unicam.flowsync.orders.repository.WorkOrderRepository;
import it.unicam.flowsync.planning.web.PlanningDtos.InterpretResponse;
import it.unicam.flowsync.planning.web.PlanningDtos.MissingData;
import it.unicam.flowsync.planning.web.PlanningDtos.Weights;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * {@code POST /plan-requests/interpret} (contratto A.4). Per la demo è a <b>regole</b>, senza LLM: riconosce i codici
 * delle commesse (anche intervalli come "C-101…C-104"), alcune espressioni di periodo ("prossima settimana",
 * "domani", "questa settimana") e parole chiave sui pesi (straordinari, puntualità, setup). Propone le domande per i
 * dati mancanti (scadenze). La risposta ha la forma del contratto, quindi un LLM potrà sostituire queste regole
 * senza cambiare il frontend.
 */
@Service
public class InterpretService {

    private static final ZoneId ZONE = ZoneId.of("Europe/Rome");
    private static final LocalTime DAY_START = LocalTime.of(8, 0);
    private static final LocalTime DAY_END = LocalTime.of(17, 0);
    private static final Pattern RANGE = Pattern.compile(
            "\\b([A-Z]{1,4})-(\\d+)\\s*(?:…|\\.\\.\\.|–|—|-|\\ba\\b|fino a)\\s*\\1-(\\d+)\\b");
    private static final Pattern CODE = Pattern.compile("\\b[A-Z]{1,4}-\\d+\\b");
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("EEE d MMM", Locale.ITALIAN);
    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("H:mm", Locale.ITALIAN);

    private final WorkOrderRepository orders;
    private final UnavailabilityRepository unavailabilities;
    private final Clock clock;

    @Autowired
    public InterpretService(WorkOrderRepository orders, UnavailabilityRepository unavailabilities) {
        this(orders, unavailabilities, Clock.system(ZONE));
    }

    InterpretService(WorkOrderRepository orders, UnavailabilityRepository unavailabilities, Clock clock) {
        this.orders = orders;
        this.unavailabilities = unavailabilities;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public InterpretResponse interpret(String text) {
        String lower = text.toLowerCase(Locale.ITALIAN);
        Map<String, WorkOrder> open = new LinkedHashMap<>();
        orders.findAllByOrderByCodeAsc().stream()
                .filter(o -> o.getStatus() == WorkOrder.Status.DRAFT || o.getStatus() == WorkOrder.Status.READY)
                .forEach(o -> open.put(o.getCode(), o));

        Set<String> mentioned = codesIn(text);
        List<String> preferences = new ArrayList<>();
        List<WorkOrder> selected = new ArrayList<>();
        for (String code : mentioned) {
            if (open.containsKey(code)) {
                selected.add(open.get(code));
            } else {
                preferences.add("Commessa " + code + " non trovata o non più aperta: esclusa");
            }
        }
        if (mentioned.isEmpty()) {                       // nessun codice: tutte le commesse aperte con un grafo
            open.values().stream().filter(o -> !o.getActivities().isEmpty()).forEach(selected::add);
        }

        LocalDate today = LocalDate.now(clock);
        LocalDate from;
        LocalDate to;
        if (lower.contains("prossima settimana") || lower.contains("settimana prossima")) {
            from = today.with(TemporalAdjusters.next(DayOfWeek.MONDAY));
            to = from.plusDays(4);
        } else if (lower.contains("questa settimana")) {
            from = nextWorkingDay(today.minusDays(1));
            to = today.with(TemporalAdjusters.nextOrSame(DayOfWeek.FRIDAY));
            if (to.isBefore(from)) {
                to = from;
            }
        } else if (lower.contains("domani")) {
            from = nextWorkingDay(today);
            to = from.plusDays(6);
        } else {
            from = nextWorkingDay(today);
            to = from.plusDays(6);
        }
        OffsetDateTime horizonStart = from.atTime(DAY_START).atZone(ZONE).toOffsetDateTime();
        OffsetDateTime horizonEnd = to.atTime(DAY_END).atZone(ZONE).toOffsetDateTime();

        // pesi: si parte dal profilo di dominio della prima commessa, poi le parole chiave
        int punctuality = 5;
        int overtime = 5;
        int setup = 3;
        if (!selected.isEmpty() && selected.get(0).getProfile() != null) {
            Map<String, Double> w = selected.get(0).getProfile().getDefaultWeights();
            punctuality = scaled(w.get("weightedTardiness"), punctuality);
            setup = scaled(w.get("setup"), setup);
        }
        List<String> notes = new ArrayList<>();
        if (lower.contains("straordinar")) {
            overtime = 8;
            preferences.add("Evitare gli straordinari");
            notes.add("“Evitare straordinari” è salito a 8 perché lo hai scritto nella richiesta.");
        }
        if (lower.matches("(?s).*(puntual|in tempo|scadenz|ritard|urgent).*")) {
            punctuality = 9;
            preferences.add("Rispettare le scadenze");
            notes.add("“Puntualità” è salita a 9 perché la richiesta parla di scadenze o ritardi.");
        }
        if (lower.matches("(?s).*(setup|cambi|attrezzaggi).*")) {
            setup = 7;
            preferences.add("Ridurre i cambi di setup");
            notes.add("“Setup” è salito a 7 perché la richiesta chiede pochi cambi.");
        }

        List<String> hard = new ArrayList<>();
        List<MissingData> missing = new ArrayList<>();
        Set<Resource> resources = new LinkedHashSet<>();
        for (WorkOrder o : selected) {
            if (o.getDueAt() != null) {
                hard.add(o.getCode() + " entro " + o.getDueAt().atZone(ZONE).format(DAY));
            } else {
                missing.add(new MissingData("due-" + o.getCode(), "DUE_DATE", o.getCode(),
                        o.getCode() + " non ha una scadenza. Quando va consegnata?", null));
            }
            o.getActivities().forEach(a -> a.getModes().forEach(m -> resources.add(m.getResource())));
        }
        if (!resources.isEmpty()) {
            for (Unavailability u : unavailabilities.findOverlapping(resources, horizonStart.toInstant(), horizonEnd.toInstant())) {
                hard.add(u.getResource().getName() + ": " + PlanningContextFactory.reasonLabel(u).toLowerCase(Locale.ITALIAN)
                        + " " + u.getStartsAt().atZone(ZONE).format(DAY) + ", " + u.getStartsAt().atZone(ZONE).format(TIME)
                        + " – " + u.getEndsAt().atZone(ZONE).format(TIME));
            }
        }

        return new InterpretResponse(horizonStart, horizonEnd, selected.stream().map(WorkOrder::getCode).toList(), hard,
                preferences, new Weights(punctuality, overtime, setup), notes, missing);
    }

    /** Codici citati nel testo, nell'ordine; gli intervalli "C-101…C-104" diventano C-101, C-102, C-103, C-104. */
    static Set<String> codesIn(String text) {
        Set<String> out = new LinkedHashSet<>();
        Matcher range = RANGE.matcher(text);
        StringBuilder rest = new StringBuilder();
        int last = 0;
        while (range.find()) {
            String prefix = range.group(1);
            int a = Integer.parseInt(range.group(2));
            int b = Integer.parseInt(range.group(3));
            int width = range.group(2).length();
            if (b >= a && b - a <= 50) {
                for (int n = a; n <= b; n++) {
                    out.add(prefix + "-" + String.format("%0" + width + "d", n));
                }
                rest.append(text, last, range.start()).append(' ');
                last = range.end();
            }
        }
        rest.append(text.substring(last));
        Matcher single = CODE.matcher(rest);
        while (single.find()) {
            out.add(single.group());
        }
        return out;
    }

    private static LocalDate nextWorkingDay(LocalDate d) {
        LocalDate next = d.plusDays(1);
        while (next.getDayOfWeek() == DayOfWeek.SATURDAY || next.getDayOfWeek() == DayOfWeek.SUNDAY) {
            next = next.plusDays(1);
        }
        return next;
    }

    private static int scaled(Double weight, int fallback) {
        return weight == null ? fallback : (int) Math.max(0, Math.min(10, Math.round(weight * 10)));
    }
}
