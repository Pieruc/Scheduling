package it.unicam.flowsync;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.jayway.jsonpath.JsonPath;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Contratti A.4 e A.5 dall'inizio alla fine: interpretazione, richiesta (202 + polling), tre piani e baseline, Gantt,
 * modifica manuale, approvazione. Il servizio AI è sostituito da un piccolo server HTTP locale che mette le attività
 * una dopo l'altra (piano banale ma ammissibile), così il test non dipende da Python.
 * Le commesse sono proprie del test (P-9xx) per non toccare quelle del seed.
 */
class PlanningApiTest extends AbstractApiTest {

    private static final String AUTH = "Authorization";
    private static final ObjectMapper JSON = new ObjectMapper();
    private static HttpServer ai;
    private static volatile boolean aiDown;

    @BeforeAll
    static void startFakeAi() throws IOException {
        ai = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        ai.createContext("/health", exchange -> {
            byte[] body = "{\"status\":\"UP\",\"models_loaded\":{},\"cp_sat_available\":false}".getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        ai.createContext("/optimize", exchange -> {
            byte[] body;
            int status = 200;
            if (aiDown) {
                status = 503;
                body = "{\"title\":\"Service unavailable\"}".getBytes(StandardCharsets.UTF_8);
            } else {
                body = JSON.writeValueAsBytes(serialPlan(JSON.readValue(exchange.getRequestBody(), Map.class)));
            }
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(status, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        ai.start();
    }

    @AfterAll
    static void stopFakeAi() {
        ai.stop(0);
    }

    @DynamicPropertySource
    static void aiUrl(DynamicPropertyRegistry registry) {
        registry.add("flowsync.ai.base-url", () -> "http://127.0.0.1:" + ai.getAddress().getPort());
        registry.add("flowsync.ai.retries", () -> 0);
    }

    /** Le attività in fila, nell'ordine della spec, sul primo modo; 60 minuti se la durata manca. */
    @SuppressWarnings("unchecked")
    static Map<String, Object> serialPlan(Map<String, Object> spec) {
        List<Map<String, Object>> assignments = new ArrayList<>();
        int cursor = 0;
        for (Map<String, Object> a : (List<Map<String, Object>>) spec.get("activities")) {
            Map<String, Object> mode = ((List<Map<String, Object>>) a.get("modes")).get(0);
            int duration = mode.get("duration_min") == null ? 60 : ((Number) mode.get("duration_min")).intValue();
            Map<String, Object> as = new LinkedHashMap<>();
            as.put("activity_id", a.get("id"));
            as.put("mode_index", 0);
            as.put("resource_ids", mode.get("resource_ids"));
            as.put("start_min", cursor);
            as.put("end_min", cursor + duration);
            assignments.add(as);
            cursor += duration;
        }
        Map<String, Object> options = (Map<String, Object>) spec.get("options");
        Object solver = options.get("solver");
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("request_id", spec.get("request_id"));
        result.put("status", solver == null ? "FALLBACK" : "OK");
        result.put("solver", solver == null ? "ATC" : solver);
        result.put("model_versions", Map.of());
        result.put("assignments", assignments);
        result.put("warnings", List.of());
        return result;
    }

    private void order(String id, String due) throws Exception {
        mvc.perform(post("/api/v1/orders").header(AUTH, bearer("pianificatore")).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"id\":\"" + id + "\",\"customer\":\"ACME\",\"description\":\"Test " + id + "\","
                                + "\"domainProfile\":\"FACTORY\",\"releaseDate\":null,\"dueDate\":" + (due == null ? "null" : "\"" + due + "\"")
                                + ",\"priority\":2,\"weight\":1.0}"))
                .andExpect(status().isCreated());
        mvc.perform(put("/api/v1/orders/" + id + "/process-graph").header(AUTH, bearer("pianificatore"))
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"activities":[
                                  {"id":"A","name":"Taglio","requiredSkills":[],"modes":[{"resourceIds":["LASER"],"durationMin":120}]},
                                  {"id":"B","name":"Collaudo","requiredSkills":[],"modes":[{"resourceIds":["QC"],"durationMin":null},{"resourceIds":["ROSSI"],"durationMin":90}]}],
                                 "precedences":[{"from":"A","to":"B","type":"FS","minLagMin":0,"maxLagMin":null}]}"""))
                .andExpect(status().isOk());
    }

    private String request(String body) throws Exception {
        return mvc.perform(post("/api/v1/plan-requests").header(AUTH, bearer("pianificatore"))
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isAccepted())
                .andExpect(header().string("Location", startsWith("/api/v1/plan-requests/REQ-")))
                .andExpect(jsonPath("$.status").value("PENDING"))
                .andReturn().getResponse().getContentAsString();
    }

    /** Polling come il frontend, finché la richiesta non è più PENDING. */
    private String waitFor(String requestId) throws Exception {
        for (int i = 0; i < 100; i++) {
            String body = mvc.perform(get("/api/v1/plan-requests/" + requestId).header(AUTH, bearer("operatore")))
                    .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
            if (!"PENDING".equals(JsonPath.read(body, "$.status"))) {
                return body;
            }
            Thread.sleep(100);
        }
        throw new AssertionError(requestId + " still PENDING");
    }

    private static final String HORIZON = "\"horizonStart\":\"2027-01-11T08:00:00+01:00\",\"horizonEnd\":\"2027-01-15T17:00:00+01:00\"";

    @Test
    void fromTheRequestToTheApprovedPlan() throws Exception {
        order("P-901", "2027-01-12T17:00:00+01:00");
        order("P-902", null);

        mvc.perform(post("/api/v1/plan-requests/interpret").header(AUTH, bearer("pianificatore"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"text\":\"Pianifica P-901…P-902 la prossima settimana, evita gli straordinari\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.orderIds", hasSize(2)))
                .andExpect(jsonPath("$.weights.overtime").value(8))
                .andExpect(jsonPath("$.missingData[0].id").value("due-P-902"));

        // P-902 non ha scadenza: senza risposta è 422 sul path della risposta
        mvc.perform(post("/api/v1/plan-requests").header(AUTH, bearer("pianificatore")).contentType(MediaType.APPLICATION_JSON)
                        .content("{" + HORIZON + ",\"orderIds\":[\"P-901\",\"P-902\"],\"weights\":{\"punctuality\":8,\"overtime\":7,\"setup\":4}}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errors[0].path").value("answers.due-P-902"));

        String accepted = request("{\"text\":\"Pianifica P-901 e P-902\"," + HORIZON + ",\"orderIds\":[\"P-901\",\"P-902\"],"
                + "\"weights\":{\"punctuality\":8,\"overtime\":7,\"setup\":4},"
                + "\"answers\":{\"due-P-902\":\"2027-01-14T17:00:00+01:00\"}}");
        String requestId = JsonPath.read(accepted, "$.id");
        String done = waitFor(requestId);
        List<String> variants = JsonPath.read(done, "$.plans[*].variant");
        org.assertj.core.api.Assertions.assertThat(variants).containsExactly("ECONOMIC", "BALANCED", "FAST");
        org.assertj.core.api.Assertions.assertThat(JsonPath.<String>read(done, "$.status")).isEqualTo("COMPLETED");
        org.assertj.core.api.Assertions.assertThat(JsonPath.<List<String>>read(done, "$.baselines[*].solver")).containsExactly("ATC", "EDD");
        String planId = JsonPath.read(done, "$.recommendedPlanId");

        // la risposta alla domanda è diventata la scadenza della commessa
        mvc.perform(get("/api/v1/orders/P-902").header(AUTH, bearer("pianificatore")))
                .andExpect(jsonPath("$.dueDate").value("2027-01-14T16:00:00Z"));

        // Gantt: 5 giorni da 480 minuti, 4 barre in fila, la durata stimata di B su QC
        mvc.perform(get("/api/v1/plans/" + planId + "/gantt").header(AUTH, bearer("operatore")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.minutesPerDay").value(480))
                .andExpect(jsonPath("$.days", hasSize(5)))
                .andExpect(jsonPath("$.bars", hasSize(4)))
                .andExpect(jsonPath("$.bars[?(@.activityId == 'P-901/B')].estimate.value").value(org.hamcrest.Matchers.contains(60)))
                .andExpect(jsonPath("$.bars[?(@.activityId == 'P-901/B')].durations.ROSSI").value(org.hamcrest.Matchers.contains(90)))
                .andExpect(jsonPath("$.dueByOrder['P-901']").value(960));          // martedì 17:00 = fine del secondo giorno

        // MODIFY non ammissibile: B prima della fine di A
        mvc.perform(post("/api/v1/plans/" + planId + "/decisions").header(AUTH, bearer("pianificatore"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"decision\":\"MODIFY\",\"reason\":\"prova\",\"changes\":[{\"activityId\":\"P-901/B\",\"resourceId\":\"ROSSI\",\"start\":0}]}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errors[0].code").value("PRECEDENCE_VIOLATION"))
                .andExpect(jsonPath("$.errors[0].path").value("changes[0].start"));
        // MODIFY senza motivazione
        mvc.perform(post("/api/v1/plans/" + planId + "/decisions").header(AUTH, bearer("pianificatore"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"decision\":\"MODIFY\",\"changes\":[{\"activityId\":\"P-902/B\",\"resourceId\":\"ROSSI\",\"start\":900}]}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errors[0].path").value("reason"));

        // MODIFY valido: il collaudo di P-902 passa a Rossi a fine coda -> nuova versione PROPOSED
        String modified = mvc.perform(post("/api/v1/plans/" + planId + "/decisions").header(AUTH, bearer("pianificatore"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"decision\":\"MODIFY\",\"reason\":\"QC impegnato\",\"changes\":[{\"activityId\":\"P-902/B\",\"resourceId\":\"ROSSI\",\"start\":900}]}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("PROPOSED"))
                .andReturn().getResponse().getContentAsString();
        String versionId = JsonPath.read(modified, "$.planId");
        mvc.perform(get("/api/v1/plans/" + versionId + "/gantt").header(AUTH, bearer("pianificatore")))
                .andExpect(jsonPath("$.manualChanges").value(1))
                .andExpect(jsonPath("$.solver").value("MANUAL"));

        // la versione di partenza non è più decidibile
        mvc.perform(post("/api/v1/plans/" + planId + "/decisions").header(AUTH, bearer("pianificatore"))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"decision\":\"APPROVE\"}"))
                .andExpect(status().isConflict());

        // APPROVE: gli altri piani della richiesta diventano SUPERSEDED, le commesse PLANNED
        mvc.perform(post("/api/v1/plans/" + versionId + "/decisions").header(AUTH, bearer("pianificatore"))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"decision\":\"APPROVE\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("APPROVED"));
        String after = waitFor(requestId);
        org.assertj.core.api.Assertions.assertThat(JsonPath.<List<String>>read(after, "$.plans[?(@.status == 'PROPOSED')].id")).isEmpty();
        mvc.perform(get("/api/v1/orders/P-901").header(AUTH, bearer("pianificatore")))
                .andExpect(jsonPath("$.status").value("PLANNED"));
        mvc.perform(get("/api/v1/plans/" + planId + "/decisions").header(AUTH, bearer("operatore")))
                .andExpect(jsonPath("$[0].decision").value("MODIFY"))
                .andExpect(jsonPath("$[0].decidedBy").value("pianificatore"));

        // l'operatore legge ma non decide
        mvc.perform(post("/api/v1/plans/" + versionId + "/decisions").header(AUTH, bearer("operatore"))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"decision\":\"REJECT\",\"reason\":\"no\"}"))
                .andExpect(status().isForbidden());

        executionIncidentAndReschedule(versionId);
    }

    private String execution(String planId, String activityId, String event, String timestamp) {
        return "{\"planId\":\"" + planId + "\",\"activityId\":\"" + activityId + "\",\"event\":\"" + event
                + "\",\"timestamp\":\"" + timestamp + "\"}";
    }

    /** A.6, A.4 (ripianificazione), A.7 e A.8 sul piano appena approvato. */
    private void executionIncidentAndReschedule(String planId) throws Exception {
        // la precedente non è finita: B non può iniziare
        mvc.perform(post("/api/v1/executions").header(AUTH, bearer("operatore")).contentType(MediaType.APPLICATION_JSON)
                        .content(execution(planId, "P-901/B", "START", "2027-01-11T08:00:00+01:00")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.errors[0].code").value("PREDECESSOR_NOT_DONE"));
        // fine prima dell'inizio: non ammessa
        mvc.perform(post("/api/v1/executions").header(AUTH, bearer("operatore")).contentType(MediaType.APPLICATION_JSON)
                        .content(execution(planId, "P-901/A", "END", "2027-01-11T08:00:00+01:00")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.errors[0].code").value("ILLEGAL_TRANSITION"));
        mvc.perform(post("/api/v1/executions").header(AUTH, bearer("operatore")).contentType(MediaType.APPLICATION_JSON)
                        .content(execution(planId, "P-901/A", "START", "2027-01-11T08:05:00+01:00")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.state").value("IN_PROGRESS"))
                .andExpect(jsonPath("$.actualStart").value("2027-01-11T07:05:00Z"));
        // un'attività alla volta
        mvc.perform(post("/api/v1/executions").header(AUTH, bearer("operatore")).contentType(MediaType.APPLICATION_JSON)
                        .content(execution(planId, "P-902/A", "START", "2027-01-11T08:10:00+01:00")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.errors[0].code").value("ANOTHER_IN_PROGRESS"));
        mvc.perform(post("/api/v1/executions").header(AUTH, bearer("operatore")).contentType(MediaType.APPLICATION_JSON)
                        .content(execution(planId, "P-901/A", "PAUSE", "2027-01-11T09:05:00+01:00")))
                .andExpect(jsonPath("$.state").value("PAUSED"))
                .andExpect(jsonPath("$.workedMin").value(60));
        mvc.perform(post("/api/v1/executions").header(AUTH, bearer("operatore")).contentType(MediaType.APPLICATION_JSON)
                        .content(execution(planId, "P-901/A", "RESUME", "2027-01-11T09:15:00+01:00")))
                .andExpect(jsonPath("$.state").value("IN_PROGRESS"));
        mvc.perform(post("/api/v1/executions").header(AUTH, bearer("operatore")).contentType(MediaType.APPLICATION_JSON)
                        .content(execution(planId, "P-901/A", "END", "2027-01-11T10:15:00+01:00")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.state").value("DONE"))
                .andExpect(jsonPath("$.workedMin").value(120));
        mvc.perform(get("/api/v1/executions").param("planId", planId).header(AUTH, bearer("pianificatore")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(4)))
                .andExpect(jsonPath("$[?(@.activityId == 'P-901/A')].state").value(org.hamcrest.Matchers.contains("DONE")));
        mvc.perform(get("/api/v1/operator/today").header(AUTH, bearer("operatore")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.operatorName").isNotEmpty());
        mvc.perform(get("/api/v1/operator/today").header(AUTH, bearer("pianificatore")))
                .andExpect(status().isForbidden());

        // segnalazione -> avviso con l'evento già pronto per la ripianificazione
        mvc.perform(post("/api/v1/incidents").header(AUTH, bearer("operatore")).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"kind\":\"OTHER\",\"resourceId\":\"QC\"}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errors[0].path").value("note"));
        String created = mvc.perform(post("/api/v1/incidents").header(AUTH, bearer("operatore")).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"kind\":\"BREAKDOWN\",\"resourceId\":\"QC\",\"planId\":\"" + planId
                                + "\",\"note\":\"Non si accende\",\"timestamp\":\"2027-01-11T10:30:00+01:00\"}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        String alertId = JsonPath.read(created, "$.id");
        mvc.perform(get("/api/v1/alerts").header(AUTH, bearer("pianificatore")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id == '" + alertId + "')].event.type").value(org.hamcrest.Matchers.contains("RESOURCE_DOWN")))
                .andExpect(jsonPath("$[?(@.id == '" + alertId + "')].link.planId").value(org.hamcrest.Matchers.contains(planId)));

        // ripianificazione: A è già finita e resta dove era; l'avviso si chiude
        mvc.perform(post("/api/v1/plans/" + planId + "/reschedule").header(AUTH, bearer("pianificatore"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"event\":{\"type\":\"RESOURCE_DOWN\",\"resourceId\":\"QC\",\"from\":\"2027-01-11T10:30:00+01:00\",\"to\":\"2027-01-11T09:00:00+01:00\"}}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errors[0].path").value("event.to"));
        String accepted = mvc.perform(post("/api/v1/plans/" + planId + "/reschedule").header(AUTH, bearer("pianificatore"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"event\":{\"type\":\"RESOURCE_DOWN\",\"resourceId\":\"QC\",\"from\":\"2027-01-11T10:30:00+01:00\",\"to\":null},"
                                + "\"freezeBefore\":\"2027-01-11T10:45:00+01:00\",\"alertId\":\"" + alertId + "\",\"scope\":\"MINIMAL\"}"))
                .andExpect(status().isAccepted())
                .andReturn().getResponse().getContentAsString();
        String rescheduled = waitFor(JsonPath.read(accepted, "$.id"));
        org.assertj.core.api.Assertions.assertThat(JsonPath.<String>read(rescheduled, "$.status")).isEqualTo("COMPLETED");
        org.assertj.core.api.Assertions.assertThat(JsonPath.<String>read(rescheduled, "$.rescheduleOf")).isEqualTo(planId);
        org.assertj.core.api.Assertions.assertThat(JsonPath.<String>read(rescheduled, "$.event.type")).isEqualTo("RESOURCE_DOWN");
        String newPlan = JsonPath.read(rescheduled, "$.recommendedPlanId");
        mvc.perform(get("/api/v1/plans/" + newPlan + "/gantt").header(AUTH, bearer("pianificatore")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.bars", hasSize(4)));
        // un'attività congelata non si sposta
        mvc.perform(post("/api/v1/plans/" + newPlan + "/decisions").header(AUTH, bearer("pianificatore"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"decision\":\"MODIFY\",\"reason\":\"prova\",\"changes\":[{\"activityId\":\"P-901/A\",\"resourceId\":\"LASER\",\"start\":600}]}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errors[0].code").value("FROZEN_ACTIVITY"));
        mvc.perform(get("/api/v1/alerts").header(AUTH, bearer("pianificatore")))
                .andExpect(jsonPath("$[?(@.id == '" + alertId + "')]").isEmpty());
        // approvando il nuovo piano, quello di partenza è sostituito
        mvc.perform(post("/api/v1/plans/" + newPlan + "/decisions").header(AUTH, bearer("pianificatore"))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"decision\":\"APPROVE\"}"))
                .andExpect(status().isCreated());
        mvc.perform(get("/api/v1/plans/" + planId + "/gantt").header(AUTH, bearer("pianificatore")))
                .andExpect(jsonPath("$.status").value("SUPERSEDED"));
        mvc.perform(post("/api/v1/plans/" + planId + "/reschedule").header(AUTH, bearer("pianificatore"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"event\":{\"type\":\"DELAY\",\"orderId\":\"P-901\",\"delayMin\":60}}"))
                .andExpect(status().isConflict());

        // A.8: decisioni, ripianificazione e piani generati nel registro
        mvc.perform(get("/api/v1/audit").param("planId", planId).header(AUTH, bearer("amministratore")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.action == 'RESCHEDULE')]").isNotEmpty())
                .andExpect(jsonPath("$[?(@.action == 'DECISION')].details.decision").value(org.hamcrest.Matchers.hasItem("APPROVE")));
        mvc.perform(get("/api/v1/audit").param("action", "PLAN_GENERATED").header(AUTH, bearer("amministratore")))
                .andExpect(jsonPath("$[0].inputHash").value(startsWith("sha256:")))
                .andExpect(jsonPath("$[0].details.planIds", hasSize(3)));
        mvc.perform(get("/api/v1/audit").header(AUTH, bearer("pianificatore"))).andExpect(status().isForbidden());

        // A.7 e A.6: stato dei servizi e KPI del periodo
        mvc.perform(get("/api/v1/models/status").header(AUTH, bearer("pianificatore")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.aiServiceUp").value(true))
                .andExpect(jsonPath("$.confidenceThreshold").value(0.6));
        mvc.perform(get("/api/v1/models/active").header(AUTH, bearer("operatore")))
                .andExpect(status().isOk());
        mvc.perform(get("/api/v1/kpis").param("from", "2027-01-01T00:00:00Z").param("to", "2027-02-01T00:00:00Z")
                        .header(AUTH, bearer("pianificatore")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.points[0].date").value("2027-01-11"))
                .andExpect(jsonPath("$.points[0].planAdherence").isNumber());
    }

    @Test
    void invalidRequestsAreRejectedBeforeStarting() throws Exception {
        mvc.perform(post("/api/v1/plan-requests").header(AUTH, bearer("pianificatore")).contentType(MediaType.APPLICATION_JSON)
                        .content("{" + HORIZON + ",\"orderIds\":[\"NOPE-1\"]}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errors[0].code").value("UNKNOWN_ORDER"))
                .andExpect(jsonPath("$.errors[0].path").value("orderIds[0]"));
        mvc.perform(post("/api/v1/plan-requests").header(AUTH, bearer("pianificatore")).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"horizonStart\":\"2027-01-15T08:00:00+01:00\",\"horizonEnd\":\"2027-01-11T08:00:00+01:00\",\"orderIds\":[\"C-101\"]}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errors[0].path").value("horizonEnd"));
        mvc.perform(get("/api/v1/plan-requests/REQ-9999").header(AUTH, bearer("pianificatore")))
                .andExpect(status().isNotFound());
    }

    @Test
    void anUnreachableAiServiceFailsTheRequestWithAReason() throws Exception {
        order("P-903", "2027-01-13T17:00:00+01:00");
        aiDown = true;
        try {
            String accepted = request("{" + HORIZON + ",\"orderIds\":[\"P-903\"]}");
            String failed = waitFor(JsonPath.read(accepted, "$.id"));
            org.assertj.core.api.Assertions.assertThat(JsonPath.<String>read(failed, "$.status")).isEqualTo("FAILED");
            org.assertj.core.api.Assertions.assertThat(JsonPath.<String>read(failed, "$.error")).contains("servizio AI");
        } finally {
            aiDown = false;
        }
    }
}
