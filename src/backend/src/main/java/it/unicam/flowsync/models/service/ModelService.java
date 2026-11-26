package it.unicam.flowsync.models.service;

import it.unicam.flowsync.models.domain.ModelVersion;
import it.unicam.flowsync.models.repository.ModelVersionRepository;
import it.unicam.flowsync.planning.ai.AiClient;
import it.unicam.flowsync.planning.domain.Plan;
import it.unicam.flowsync.planning.repository.PlanRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Informazioni sui modelli (contratto A.7, sola lettura): versioni pubblicate dalla pipeline (contratto C) e stato
 * del servizio AI. Le metriche arrivano in snake_case e si restituiscono in camelCase (gap_vs_cp_sat -> gapVsCpSat).
 */
@Service
public class ModelService {

    public static final double CONFIDENCE_THRESHOLD = 0.6;
    private static final int STATUS_DAYS = 30;

    public record ActiveModel(String version, OffsetDateTime publishedAt, String datasetVersion, String specVersion,
                              Map<String, Object> metrics) {
    }

    public record ActiveModels(ActiveModel policy, ActiveModel context) {
    }

    public record ModelEntry(String version, String component, OffsetDateTime publishedAt, String status,
                             Map<String, Object> metrics) {
    }

    public record ModelsStatus(boolean aiServiceUp, boolean cpSatAvailable, double confidenceThreshold, int days,
                               Map<String, Long> plansBySolver) {
    }

    private final ModelVersionRepository versions;
    private final PlanRepository plans;
    private final AiClient ai;

    public ModelService(ModelVersionRepository versions, PlanRepository plans, AiClient ai) {
        this.versions = versions;
        this.plans = plans;
        this.ai = ai;
    }

    /** Le versioni attive di M2 (policy) e M1 (context); null finché la pipeline non ne pubblica una. */
    @Transactional(readOnly = true)
    public ActiveModels active() {
        return new ActiveModels(active(ModelVersion.Name.M2_POLICY), active(ModelVersion.Name.M1_CONTEXT));
    }

    private ActiveModel active(ModelVersion.Name name) {
        return versions.findFirstByModelNameAndStatus(name, ModelVersion.Status.ACTIVE)
                .map(v -> new ActiveModel(v.getVersion(), publishedAt(v), v.getDatasetVersion(), v.getSpecVersion(),
                        camel(v.getMetrics())))
                .orElse(null);
    }

    @Transactional(readOnly = true)
    public List<ModelEntry> all() {
        return versions.findAllByOrderByRegisteredAtDescIdDesc().stream()
                .map(v -> new ModelEntry(v.getVersion(), component(v.getModelName()), publishedAt(v), v.getStatus().name(),
                        camel(v.getMetrics())))
                .toList();
    }

    /** Servizi attivi (dal /health del servizio AI) e piani per solutore degli ultimi 30 giorni. */
    @Transactional(readOnly = true)
    public ModelsStatus status() {
        Map<String, Object> health = ai.health();
        boolean up = health != null && "UP".equals(health.get("status"));
        boolean cpSat = health != null && Boolean.TRUE.equals(health.get("cp_sat_available"));
        Map<String, Long> bySolver = new LinkedHashMap<>();
        for (Plan.Solver s : List.of(Plan.Solver.POLICY, Plan.Solver.CP_SAT, Plan.Solver.ATC, Plan.Solver.EDD)) {
            bySolver.put(s.name(), 0L);
        }
        for (Object[] row : plans.countBySolverSince(Instant.now().minus(Duration.ofDays(STATUS_DAYS)))) {
            Plan.Solver solver = (Plan.Solver) row[0];
            if (solver != Plan.Solver.MANUAL) {
                bySolver.put(solver.name(), ((Number) row[1]).longValue());
            }
        }
        return new ModelsStatus(up, cpSat, CONFIDENCE_THRESHOLD, STATUS_DAYS, bySolver);
    }

    private static String component(ModelVersion.Name name) {
        return switch (name) {
            case M2_POLICY -> "POLICY";
            case M1_CONTEXT -> "CONTEXT";
            case LLM_PARSER -> "LLM_PARSER";
        };
    }

    private static OffsetDateTime publishedAt(ModelVersion v) {
        Instant at = v.getActivatedAt() != null ? v.getActivatedAt() : v.getRegisteredAt();
        return at == null ? null : at.atOffset(ZoneOffset.UTC);
    }

    /** gap_vs_cp_sat -> gapVsCpSat. */
    static Map<String, Object> camel(Map<String, Object> metrics) {
        Map<String, Object> out = new LinkedHashMap<>();
        if (metrics == null) {
            return out;
        }
        metrics.forEach((k, v) -> {
            StringBuilder b = new StringBuilder();
            boolean up = false;
            for (char c : k.toCharArray()) {
                if (c == '_') {
                    up = true;
                } else {
                    b.append(up ? Character.toUpperCase(c) : c);
                    up = false;
                }
            }
            out.put(b.toString(), v);
        });
        return out;
    }
}
