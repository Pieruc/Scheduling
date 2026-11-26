package it.unicam.flowsync.planning.service;

import it.unicam.flowsync.planning.service.PlanChangeValidator.Bar;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * KPI di un piano (contratto A.4) calcolati dal backend sulle barre, nella scala dei minuti di lavoro. Si usano gli
 * stessi conti per i piani del servizio AI, per le baseline e per le versioni modificate a mano, così i numeri sono
 * confrontabili. Classe pura.
 *
 * @param overtimeMin sempre 0 finché i turni straordinari non sono modellati: i piani stanno dentro i turni
 */
public record PlanKpis(int makespanMin, int totalTardinessMin, int lateOrders, int totalSetupMin, int setupCount,
                       int overtimeMin, double avgUtilization, BigDecimal estimatedCost) {

    public static PlanKpis of(PlanningContext ctx, List<Bar> bars) {
        int makespan = bars.stream().mapToInt(Bar::end).max().orElse(0);

        Map<String, Integer> orderEnd = new HashMap<>();
        for (Bar b : bars) {
            String order = ctx.activities().get(b.activityId()).orderCode();
            orderEnd.merge(order, b.end(), Math::max);
        }
        int tardiness = 0;
        int late = 0;
        for (PlanningContext.OrderInfo o : ctx.orders()) {
            Integer end = orderEnd.get(o.code());
            if (o.dueMin() != null && end != null && end > o.dueMin()) {
                tardiness += end - o.dueMin();
                late++;
            }
        }

        // setup: sulle barre di ogni risorsa in ordine di inizio, un cambio di famiglia è un setup
        Map<String, List<Bar>> byResource = new LinkedHashMap<>();
        bars.forEach(b -> byResource.computeIfAbsent(b.resourceId(), k -> new ArrayList<>()).add(b));
        int setupCount = 0;
        int setupMin = 0;
        for (Map.Entry<String, List<Bar>> e : byResource.entrySet()) {
            List<Bar> seq = e.getValue().stream().sorted(Comparator.comparingInt(Bar::start)).toList();
            for (int i = 1; i < seq.size(); i++) {
                String from = ctx.activities().get(seq.get(i - 1).activityId()).setupFamily();
                String to = ctx.activities().get(seq.get(i).activityId()).setupFamily();
                if (from != null && to != null && !from.equals(to)) {
                    setupCount++;
                    setupMin += ctx.setupRules().stream()
                            .filter(r -> r.resourceCode().equals(e.getKey()) && r.fromFamily().equals(from) && r.toFamily().equals(to))
                            .mapToInt(PlanningContext.SetupRule::minutes).findFirst().orElse(0);
                }
            }
        }

        // utilizzo: minuti di lavorazione / makespan, in media sulle risorse coinvolte nella richiesta
        double utilization = 0;
        if (makespan > 0 && !ctx.resources().isEmpty()) {
            Map<String, Integer> busy = new HashMap<>();
            bars.forEach(b -> busy.merge(b.resourceId(), b.end() - b.start(), Integer::sum));
            utilization = ctx.resources().keySet().stream()
                    .mapToDouble(r -> busy.getOrDefault(r, 0) / (double) makespan).average().orElse(0);
        }

        BigDecimal cost = BigDecimal.ZERO;
        for (Bar b : bars) {
            BigDecimal perHour = ctx.resources().get(b.resourceId()).costPerHour();
            if (perHour != null) {
                cost = cost.add(perHour.multiply(BigDecimal.valueOf(b.end() - b.start())));
            }
        }
        cost = cost.divide(BigDecimal.valueOf(60), 0, RoundingMode.HALF_UP);

        return new PlanKpis(makespan, tardiness, late, setupMin, setupCount, 0,
                Math.round(utilization * 10000) / 10000.0, cost);
    }

    /** Il formato JSON del contratto A.4. */
    public Map<String, Object> toMap() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("makespanMin", makespanMin);
        m.put("totalTardinessMin", totalTardinessMin);
        m.put("lateOrders", lateOrders);
        m.put("totalSetupMin", totalSetupMin);
        m.put("setupCount", setupCount);
        m.put("overtimeMin", overtimeMin);
        m.put("avgUtilization", avgUtilization);
        m.put("estimatedCost", estimatedCost);
        return m;
    }

    /** Una frase per la scheda del piano, es. "Nessun ritardo, 3 cambi di setup, costo stimato 9.600 €". */
    public String summary(int minutesPerDay) {
        String lateness = lateOrders == 0 ? "Nessun ritardo"
                : lateOrders + (lateOrders == 1 ? " commessa" : " commesse") + " in ritardo ("
                + hours(totalTardinessMin) + " h di lavoro in totale)";
        String setups = setupCount == 0 ? "nessun cambio di setup"
                : setupCount + (setupCount == 1 ? " cambio" : " cambi") + " di setup";
        String days = String.format(Locale.ITALY, "%.1f", makespanMin / (double) minutesPerDay);
        String costText = estimatedCost.signum() == 0 ? "" : String.format(Locale.ITALY, ", costo stimato %,d €",
                estimatedCost.longValue());
        return lateness + ", " + setups + ", finisce in " + days + " giorni lavorativi" + costText + ".";
    }

    private static String hours(int minutes) {
        return String.format(Locale.ITALY, "%.1f", minutes / 60.0);
    }
}
