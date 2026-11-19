package it.unicam.flowsync;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

import java.util.stream.Collectors;
import java.util.stream.Stream;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Contratto A.2: risorse, competenze e calendari. Ogni test usa codici propri (T-...) perché il database è condiviso. */
class ResourceApiTest extends AbstractApiTest {

    private static final String AUTH = HttpHeaders.AUTHORIZATION;

    private String calendarId() throws Exception {
        String body = mvc.perform(get("/api/v1/calendars").header(AUTH, bearer("admin")))
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$[0].id");
    }

    private static String json(String id, String name, int capacity, String calendarId, String... skills) {
        String list = Stream.of(skills).map(s -> "\"" + s + "\"").collect(Collectors.joining(","));
        return "{\"id\":\"" + id + "\",\"name\":\"" + name + "\",\"type\":\"MACHINE\",\"capacity\":" + capacity
                + ",\"skills\":[" + list + "],\"calendarId\":\"" + calendarId + "\"}";
    }

    private void create(String id, String... skills) throws Exception {
        mvc.perform(post("/api/v1/resources").header(AUTH, bearer("admin")).contentType(MediaType.APPLICATION_JSON)
                        .content(json(id, "Macchina " + id, 1, calendarId(), skills)))
                .andExpect(status().isCreated());
    }

    // ---------- lettura ----------

    @Test
    void listRequiresAuthentication() throws Exception {
        mvc.perform(get("/api/v1/resources")).andExpect(status().isUnauthorized());
    }

    @Test
    void anyRoleCanReadTheSeededResources() throws Exception {
        for (String user : new String[]{"admin", "gneri", "mrossi"}) {
            mvc.perform(get("/api/v1/resources").header(AUTH, bearer(user)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$[?(@.id=='LASER')]").isNotEmpty())
                    .andExpect(jsonPath("$[?(@.id=='ROSSI')]").isNotEmpty());
        }
    }

    @Test
    void detailShowsSkillsAndCalendar() throws Exception {
        mvc.perform(get("/api/v1/resources/ROSSI").header(AUTH, bearer("gneri")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value("ROSSI"))
                .andExpect(jsonPath("$.name").value("Marco Rossi"))
                .andExpect(jsonPath("$.type").value("PERSON"))
                .andExpect(jsonPath("$.capacity").value(1))
                .andExpect(jsonPath("$.skills[0]").value("WELD"))
                .andExpect(jsonPath("$.calendarId").isNotEmpty())
                .andExpect(jsonPath("$.active").value(true));
    }

    @Test
    void unknownResourceIs404() throws Exception {
        mvc.perform(get("/api/v1/resources/NOPE").header(AUTH, bearer("gneri")))
                .andExpect(status().isNotFound())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.status").value(404));
    }

    @Test
    void skillsAreListedByCode() throws Exception {
        mvc.perform(get("/api/v1/skills").header(AUTH, bearer("gneri")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].code").value("CNC"))
                .andExpect(jsonPath("$[0].name").value("Fresatura CNC"));
    }

    @Test
    void calendarsCarryAReadableShiftSummary() throws Exception {
        mvc.perform(get("/api/v1/calendars").header(AUTH, bearer("gneri")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].name").value("Turno standard"))
                .andExpect(jsonPath("$[0].shiftsSummary").value("Lun–Ven 8–12 / 13–17"));
    }

    // ---------- creazione ----------

    @Test
    void adminCreatesAResource() throws Exception {
        mvc.perform(post("/api/v1/resources").header(AUTH, bearer("admin")).contentType(MediaType.APPLICATION_JSON)
                        .content(json("T-NEW", "Tornio nuovo", 2, calendarId(), "WELD", "CNC")))
                .andExpect(status().isCreated())
                .andExpect(header().string(HttpHeaders.LOCATION, "/api/v1/resources/T-NEW"))
                .andExpect(jsonPath("$.id").value("T-NEW"))
                .andExpect(jsonPath("$.capacity").value(2))
                .andExpect(jsonPath("$.skills[0]").value("CNC"))
                .andExpect(jsonPath("$.skills[1]").value("WELD"))
                .andExpect(jsonPath("$.active").value(true));

        mvc.perform(get("/api/v1/resources/T-NEW").header(AUTH, bearer("gneri")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.skills.length()").value(2));
    }

    @Test
    void plannerCannotCreate() throws Exception {
        mvc.perform(post("/api/v1/resources").header(AUTH, bearer("gneri")).contentType(MediaType.APPLICATION_JSON)
                        .content(json("T-FORBIDDEN", "No", 1, calendarId())))
                .andExpect(status().isForbidden())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.status").value(403));
    }

    @Test
    void duplicateCodeIs409() throws Exception {
        create("T-DUP");
        mvc.perform(post("/api/v1/resources").header(AUTH, bearer("admin")).contentType(MediaType.APPLICATION_JSON)
                        .content(json("T-DUP", "Altra", 1, calendarId())))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.errors[0].code").value("DUPLICATE_RESOURCE"));
    }

    @Test
    void unknownSkillIs422() throws Exception {
        mvc.perform(post("/api/v1/resources").header(AUTH, bearer("admin")).contentType(MediaType.APPLICATION_JSON)
                        .content(json("T-BADSKILL", "X", 1, calendarId(), "CNC", "NOPE")))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errors[0].code").value("UNKNOWN_SKILL"))
                .andExpect(jsonPath("$.errors[0].path").value("skills[1]"));

        mvc.perform(get("/api/v1/resources/T-BADSKILL").header(AUTH, bearer("admin")))
                .andExpect(status().isNotFound());       // nulla è stato salvato
    }

    @Test
    void unknownCalendarIs422() throws Exception {
        mvc.perform(post("/api/v1/resources").header(AUTH, bearer("admin")).contentType(MediaType.APPLICATION_JSON)
                        .content(json("T-BADCAL", "X", 1, "999999")))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errors[0].code").value("UNKNOWN_CALENDAR"))
                .andExpect(jsonPath("$.errors[0].path").value("calendarId"));
    }

    @Test
    void invalidFieldsAreReportedOneByOne() throws Exception {
        mvc.perform(post("/api/v1/resources").header(AUTH, bearer("admin")).contentType(MediaType.APPLICATION_JSON)
                        .content(json("T-BADCAP", "X", 0, calendarId())))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errors[0].code").value("MIN"))
                .andExpect(jsonPath("$.errors[0].path").value("capacity"));
    }

    // ---------- modifica e disattivazione ----------

    @Test
    void adminUpdatesAResourceAndReplacesItsSkills() throws Exception {
        create("T-UPD", "CNC");
        mvc.perform(put("/api/v1/resources/T-UPD").header(AUTH, bearer("admin")).contentType(MediaType.APPLICATION_JSON)
                        .content(json("T-UPD", "Nome nuovo", 3, calendarId(), "WELD")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Nome nuovo"))
                .andExpect(jsonPath("$.capacity").value(3))
                .andExpect(jsonPath("$.skills.length()").value(1))
                .andExpect(jsonPath("$.skills[0]").value("WELD"));

        mvc.perform(get("/api/v1/resources/T-UPD").header(AUTH, bearer("gneri")))
                .andExpect(jsonPath("$.skills[0]").value("WELD"));
    }

    @Test
    void bodyIdMustMatchThePath() throws Exception {
        create("T-MISMATCH");
        mvc.perform(put("/api/v1/resources/T-MISMATCH").header(AUTH, bearer("admin")).contentType(MediaType.APPLICATION_JSON)
                        .content(json("T-OTHER", "X", 1, calendarId())))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errors[0].code").value("ID_MISMATCH"));
    }

    @Test
    void updatingAnUnknownResourceIs404() throws Exception {
        mvc.perform(put("/api/v1/resources/T-GHOST").header(AUTH, bearer("admin")).contentType(MediaType.APPLICATION_JSON)
                        .content(json("T-GHOST", "X", 1, calendarId())))
                .andExpect(status().isNotFound());
    }

    @Test
    void deleteDeactivatesInsteadOfRemoving() throws Exception {
        create("T-DEL");
        mvc.perform(delete("/api/v1/resources/T-DEL").header(AUTH, bearer("gneri"))).andExpect(status().isForbidden());

        mvc.perform(delete("/api/v1/resources/T-DEL").header(AUTH, bearer("admin"))).andExpect(status().isNoContent());
        mvc.perform(delete("/api/v1/resources/T-DEL").header(AUTH, bearer("admin"))).andExpect(status().isNoContent());   // idempotente

        mvc.perform(get("/api/v1/resources/T-DEL").header(AUTH, bearer("gneri")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.active").value(false));

        mvc.perform(get("/api/v1/resources").param("active", "true").header(AUTH, bearer("gneri")))
                .andExpect(jsonPath("$[?(@.id=='T-DEL')]").isEmpty());
        mvc.perform(get("/api/v1/resources").param("active", "false").header(AUTH, bearer("gneri")))
                .andExpect(jsonPath("$[?(@.id=='T-DEL')]").isNotEmpty());
    }
}
