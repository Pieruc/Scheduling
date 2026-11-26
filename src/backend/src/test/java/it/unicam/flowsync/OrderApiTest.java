package it.unicam.flowsync;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Contratto A.2 (profili di dominio) e A.3 (commesse e grafo di processo). Le commesse del seed (C-101 … C-104) si
 * leggono soltanto; ogni test che scrive usa codici propri (T-...) perché il database è condiviso tra le classi.
 */
class OrderApiTest extends AbstractApiTest {

    private static final String AUTH = HttpHeaders.AUTHORIZATION;

    private static String order(String id, String profile, String release, String due, int priority) {
        return "{\"id\":\"" + id + "\",\"customer\":\"ACME\",\"description\":\"Commessa " + id + "\","
                + "\"domainProfile\":" + (profile == null ? "null" : "\"" + profile + "\"") + ","
                + "\"releaseDate\":" + (release == null ? "null" : "\"" + release + "\"") + ","
                + "\"dueDate\":" + (due == null ? "null" : "\"" + due + "\"") + ","
                + "\"priority\":" + priority + ",\"weight\":1.5}";
    }

    private ResultActions create(String id) throws Exception {
        return mvc.perform(post("/api/v1/orders").header(AUTH, bearer("pianificatore")).contentType(MediaType.APPLICATION_JSON)
                .content(order(id, "FACTORY", "2027-01-10T08:00:00+01:00", "2027-01-20T18:00:00+01:00", 2)));
    }

    private ResultActions putGraph(String id, String json) throws Exception {
        return mvc.perform(put("/api/v1/orders/" + id + "/process-graph").header(AUTH, bearer("pianificatore"))
                .contentType(MediaType.APPLICATION_JSON).content(json));
    }

    /** Tre attività in fila: A (taglio laser) -> B (fresatura su CNC1 o CNC2, durate diverse) -> C (saldatura, competenza WELD). */
    private static final String THREE_STEPS = """
            {"activities":[
              {"id":"A","name":"Taglio","requiredSkills":[],"modes":[{"resourceIds":["LASER"],"durationMin":30}]},
              {"id":"B","name":"Fresatura","requiredSkills":["CNC"],"modes":[{"resourceIds":["CNC1"],"durationMin":60},{"resourceIds":["CNC2"],"durationMin":75}],"setupFamily":"ACCIAIO"},
              {"id":"C","name":"Saldatura","requiredSkills":["WELD"],"modes":[{"resourceIds":["WELD1"],"durationMin":null}]}],
             "precedences":[{"from":"A","to":"B","type":"FS","minLagMin":0,"maxLagMin":null},
                            {"from":"B","to":"C","type":"FS","minLagMin":15,"maxLagMin":120}]}""";

    // ---------------- profili di dominio ----------------

    @Test
    void domainProfilesUseTheContractWeights() throws Exception {
        mvc.perform(get("/api/v1/domain-profiles").header(AUTH, bearer("operatore")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.code=='FACTORY')].defaultObjectiveWeights.makespan").value(0.3))
                .andExpect(jsonPath("$[?(@.code=='FACTORY')].features[0]").value("SEQUENCE_DEPENDENT_SETUP"))
                .andExpect(jsonPath("$[?(@.code=='PROJECT')]").isNotEmpty());
        mvc.perform(get("/api/v1/domain-profiles/PA").header(AUTH, bearer("pianificatore")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.defaultObjectiveWeights.weightedTardiness").value(0.8));
        mvc.perform(get("/api/v1/domain-profiles/NOPE").header(AUTH, bearer("pianificatore"))).andExpect(status().isNotFound());
    }

    // ---------------- lettura delle commesse del seed ----------------

    @Test
    void operatorsCannotSeeOrders() throws Exception {
        mvc.perform(get("/api/v1/orders").header(AUTH, bearer("operatore"))).andExpect(status().isForbidden());
    }

    @Test
    void seededOrdersAreMappedToTheContract() throws Exception {
        mvc.perform(get("/api/v1/orders/C-101").header(AUTH, bearer("pianificatore")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value("C-101"))
                .andExpect(jsonPath("$.customer").value("Rinaldi Carrelli"))
                .andExpect(jsonPath("$.description").value("Telaio carrello"))
                .andExpect(jsonPath("$.domainProfile").value("FACTORY"))
                .andExpect(jsonPath("$.dueDate").isNotEmpty())             // il seed V104 la sposta in avanti per la demo
                .andExpect(jsonPath("$.priority").value(3))
                .andExpect(jsonPath("$.weight").value(3.0))
                .andExpect(jsonPath("$.status").value("OPEN"))
                .andExpect(jsonPath("$.activityCount").value(6));
        mvc.perform(get("/api/v1/orders/C-104").header(AUTH, bearer("amministratore")))
                .andExpect(jsonPath("$.dueDate").value(nullValue()));       // il "dato mancante" del mockup
    }

    @Test
    void ordersCanBeFilteredByDueDateAndStatus() throws Exception {
        // le scadenze del seed dipendono dal giorno in cui si applica V104: si filtra con date lontane
        mvc.perform(get("/api/v1/orders").param("dueBefore", "2099-01-01T00:00:00Z").header(AUTH, bearer("pianificatore")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id=='C-101')]").isNotEmpty())
                .andExpect(jsonPath("$[?(@.id=='C-104')]").isEmpty());          // senza scadenza: escluso
        mvc.perform(get("/api/v1/orders").param("dueBefore", "2000-01-01T00:00:00Z").header(AUTH, bearer("pianificatore")))
                .andExpect(jsonPath("$[?(@.id=='C-101')]").isEmpty());
        mvc.perform(get("/api/v1/orders").param("status", "OPEN").header(AUTH, bearer("pianificatore")))
                .andExpect(jsonPath("$[?(@.id=='C-101')]").isNotEmpty());
        mvc.perform(get("/api/v1/orders").param("status", "DONE").header(AUTH, bearer("pianificatore")))
                .andExpect(jsonPath("$[?(@.id=='C-101')]").isEmpty());
    }

    @Test
    void theSeededGraphIsReadable() throws Exception {
        mvc.perform(get("/api/v1/orders/C-101/process-graph").header(AUTH, bearer("pianificatore")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.activities.length()").value(6))
                .andExpect(jsonPath("$.activities[0].id").value("T"))
                .andExpect(jsonPath("$.activities[0].modes[0].resourceIds[0]").value("LASER"))
                .andExpect(jsonPath("$.activities[0].modes[0].durationMin").value(120))
                .andExpect(jsonPath("$.activities[1].modes.length()").value(2))       // fresatura: CNC1 o CNC2
                .andExpect(jsonPath("$.activities[4].id").value("V"))
                .andExpect(jsonPath("$.activities[4].modes[0].durationMin").value(nullValue()))   // da stimare con M1
                .andExpect(jsonPath("$.precedences.length()").value(6))
                .andExpect(jsonPath("$.precedences[0].from").value("T"))
                .andExpect(jsonPath("$.precedences[0].type").value("FS"));
    }

    // ---------------- creazione, modifica, annullamento ----------------

    @Test
    void plannerCreatesAnOrder() throws Exception {
        create("T-ORD-NEW")
                .andExpect(status().isCreated())
                .andExpect(header().string(HttpHeaders.LOCATION, "/api/v1/orders/T-ORD-NEW"))
                .andExpect(jsonPath("$.status").value("OPEN"))
                .andExpect(jsonPath("$.priority").value(2))
                .andExpect(jsonPath("$.weight").value(1.5))
                .andExpect(jsonPath("$.releaseDate").value("2027-01-10T07:00:00Z"))
                .andExpect(jsonPath("$.activityCount").value(0));
    }

    @Test
    void invalidOrdersAreRejected() throws Exception {
        create("T-ORD-DUP").andExpect(status().isCreated());
        create("T-ORD-DUP").andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errors[0].code").value("DUPLICATE_ORDER"))
                .andExpect(jsonPath("$.errors[0].path").value("id"));

        mvc.perform(post("/api/v1/orders").header(AUTH, bearer("pianificatore")).contentType(MediaType.APPLICATION_JSON)
                        .content(order("T-ORD-P", "NOPE", null, null, 2)))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errors[0].code").value("UNKNOWN_PROFILE"));
        mvc.perform(post("/api/v1/orders").header(AUTH, bearer("pianificatore")).contentType(MediaType.APPLICATION_JSON)
                        .content(order("T-ORD-D", null, "2027-02-01T08:00:00Z", "2027-01-01T08:00:00Z", 2)))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errors[0].code").value("DUE_BEFORE_RELEASE"));
        mvc.perform(post("/api/v1/orders").header(AUTH, bearer("pianificatore")).contentType(MediaType.APPLICATION_JSON)
                        .content(order("T-ORD-PR", null, null, null, 4)))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errors[0].path").value("priority"));
    }

    @Test
    void anOrderCanBeUpdatedAndItsPriorityChanged() throws Exception {
        create("T-ORD-UPD");
        mvc.perform(put("/api/v1/orders/T-ORD-UPD").header(AUTH, bearer("pianificatore")).contentType(MediaType.APPLICATION_JSON)
                        .content(order("T-ORD-UPD", "PA", null, null, 1)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.domainProfile").value("PA"))
                .andExpect(jsonPath("$.dueDate").value(nullValue()))
                .andExpect(jsonPath("$.priority").value(1));
        mvc.perform(patch("/api/v1/orders/T-ORD-UPD/priority").header(AUTH, bearer("pianificatore"))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"priority\":3}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.priority").value(3));
        mvc.perform(put("/api/v1/orders/T-ORD-UPD").header(AUTH, bearer("pianificatore")).contentType(MediaType.APPLICATION_JSON)
                        .content(order("T-ORD-OTHER", null, null, null, 1)))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errors[0].code").value("ID_MISMATCH"));
    }

    @Test
    void deleteCancelsTheOrder() throws Exception {
        create("T-ORD-DEL");
        mvc.perform(delete("/api/v1/orders/T-ORD-DEL").header(AUTH, bearer("pianificatore"))).andExpect(status().isNoContent());
        mvc.perform(delete("/api/v1/orders/T-ORD-DEL").header(AUTH, bearer("pianificatore"))).andExpect(status().isNoContent());
        mvc.perform(get("/api/v1/orders/T-ORD-DEL").header(AUTH, bearer("pianificatore")))
                .andExpect(jsonPath("$.status").value("CANCELLED"));
        mvc.perform(put("/api/v1/orders/T-ORD-DEL").header(AUTH, bearer("pianificatore")).contentType(MediaType.APPLICATION_JSON)
                        .content(order("T-ORD-DEL", null, null, null, 2)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.errors[0].code").value("ORDER_NOT_OPEN"));
        putGraph("T-ORD-DEL", THREE_STEPS)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.errors[0].code").value("ORDER_NOT_EDITABLE"));
    }

    // ---------------- grafo di processo ----------------

    @Test
    void aGraphIsSavedAndReadBack() throws Exception {
        create("T-ORD-G1");
        putGraph("T-ORD-G1", THREE_STEPS)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.activities.length()").value(3))
                .andExpect(jsonPath("$.activities[1].modes[1].resourceIds[0]").value("CNC2"))
                .andExpect(jsonPath("$.activities[1].modes[1].durationMin").value(75))
                .andExpect(jsonPath("$.activities[2].requiredSkills[0]").value("WELD"))
                .andExpect(jsonPath("$.activities[2].modes[0].durationMin").value(nullValue()))
                .andExpect(jsonPath("$.precedences[1].minLagMin").value(15))
                .andExpect(jsonPath("$.precedences[1].maxLagMin").value(120));

        mvc.perform(get("/api/v1/orders/T-ORD-G1/process-graph").header(AUTH, bearer("pianificatore")))
                .andExpect(jsonPath("$.activities[1].setupFamily").value("ACCIAIO"))
                .andExpect(jsonPath("$.activities[1].modes[0].durationMin").value(60))
                .andExpect(jsonPath("$.precedences.length()").value(2));
        mvc.perform(get("/api/v1/orders/T-ORD-G1").header(AUTH, bearer("pianificatore")))
                .andExpect(jsonPath("$.activityCount").value(3));
    }

    @Test
    void replacingAGraphKeepsTheActivitiesThatStay() throws Exception {
        create("T-ORD-G2");
        putGraph("T-ORD-G2", THREE_STEPS).andExpect(status().isOk());
        // C sparisce, B cambia durata su CNC1 e perde CNC2, D arriva dopo B; setupFamily di B non inviato: resta
        putGraph("T-ORD-G2", """
                {"activities":[
                  {"id":"A","name":"Taglio","requiredSkills":[],"modes":[{"resourceIds":["LASER"],"durationMin":30}]},
                  {"id":"B","name":"Fresatura","requiredSkills":["CNC"],"modes":[{"resourceIds":["CNC1"],"durationMin":90}]},
                  {"id":"D","name":"Collaudo","requiredSkills":[],"modes":[{"resourceIds":["QC"],"durationMin":20}]}],
                 "precedences":[{"from":"A","to":"B"},{"from":"B","to":"D"}]}""")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.activities.length()").value(3))
                .andExpect(jsonPath("$.activities[1].id").value("B"))
                .andExpect(jsonPath("$.activities[1].modes.length()").value(1))
                .andExpect(jsonPath("$.activities[1].modes[0].durationMin").value(90))
                .andExpect(jsonPath("$.activities[1].setupFamily").value("ACCIAIO"))
                .andExpect(jsonPath("$.activities[2].id").value("D"))
                .andExpect(jsonPath("$.precedences[1].to").value("D"))
                .andExpect(jsonPath("$.precedences[1].minLagMin").value(0));
    }

    @Test
    void aCycleIsRejectedWithItsPath() throws Exception {
        create("T-ORD-CYC");
        putGraph("T-ORD-CYC", """
                {"activities":[
                  {"id":"A","name":"Uno","modes":[{"resourceIds":["LASER"],"durationMin":10}]},
                  {"id":"B","name":"Due","modes":[{"resourceIds":["PRESS"],"durationMin":10}]},
                  {"id":"C","name":"Tre","modes":[{"resourceIds":["QC"],"durationMin":10}]}],
                 "precedences":[{"from":"A","to":"B"},{"from":"B","to":"C"},{"from":"C","to":"A"}]}""")
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errors[0].code").value("CYCLIC_PRECEDENCE"))
                .andExpect(jsonPath("$.errors[0].message").value("Cycle A -> B -> C -> A"));
        mvc.perform(get("/api/v1/orders/T-ORD-CYC/process-graph").header(AUTH, bearer("pianificatore")))
                .andExpect(jsonPath("$.activities.length()").value(0));      // nulla è stato salvato
    }

    @Test
    void wrongReferencesAreReportedOneByOne() throws Exception {
        create("T-ORD-REF");
        putGraph("T-ORD-REF", """
                {"activities":[
                  {"id":"A","name":"Uno","requiredSkills":["NOPE"],"modes":[{"resourceIds":["GHOST"],"durationMin":10}]},
                  {"id":"B","name":"Due","modes":[{"resourceIds":["CNC1","CNC2"],"durationMin":10}]}],
                 "precedences":[{"from":"A","to":"Z","type":"SS"}]}""")
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errors[?(@.code=='MODE_RESOURCE_COUNT')].path").value("activities[1].modes[0].resourceIds"))
                .andExpect(jsonPath("$.errors[?(@.code=='UNSUPPORTED_PRECEDENCE_TYPE')]").isNotEmpty())
                .andExpect(jsonPath("$.errors[?(@.code=='UNKNOWN_ACTIVITY')].path").value("precedences[0].to"))
                .andExpect(jsonPath("$.errors[?(@.code=='UNKNOWN_RESOURCE')].path").value("activities[0].modes[0].resourceIds[0]"))
                .andExpect(jsonPath("$.errors[?(@.code=='UNKNOWN_SKILL')].path").value("activities[0].requiredSkills[0]"));
    }
}
