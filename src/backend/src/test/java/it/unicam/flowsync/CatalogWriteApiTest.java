package it.unicam.flowsync;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Contratto A.2 v1.1, scritture: calendari, competenze, profili di dominio. I calendari del test hanno nomi che
 * vengono dopo quelli del seed ("Zz …"), perché altri test leggono il primo calendario dell'elenco.
 */
class CatalogWriteApiTest extends AbstractApiTest {

    private static final String AUTH = HttpHeaders.AUTHORIZATION;

    private static String calendar(String name, String shifts) {
        return "{\"name\":\"" + name + "\",\"workDays\":[1,2,3,4,5],\"shifts\":" + shifts
                + ",\"holidays\":[{\"date\":\"2026-12-25\",\"name\":\"Natale\"}]}";
    }

    @Test
    void calendarsAreCreatedAndUpdatedWithTheFullShape() throws Exception {
        String body = mvc.perform(post("/api/v1/calendars").header(AUTH, bearer("amministratore"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(calendar("Zz Due turni", "[{\"start\":\"08:00\",\"end\":\"12:00\"},{\"start\":\"13:00\",\"end\":\"17:00\"}]")))
                .andExpect(status().isCreated())
                .andExpect(header().exists("Location"))
                .andExpect(jsonPath("$.shiftsSummary").value("Lun–Ven 8–12 / 13–17"))
                .andExpect(jsonPath("$.workDays", hasSize(5)))
                .andExpect(jsonPath("$.shifts", hasSize(2)))
                .andExpect(jsonPath("$.holidays[0].name").value("Natale"))
                .andReturn().getResponse().getContentAsString();
        String id = JsonPath.read(body, "$.id");

        mvc.perform(put("/api/v1/calendars/" + id).header(AUTH, bearer("amministratore"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Zz Turno unico\",\"workDays\":[1,2,3,4,5,6],\"shifts\":[{\"start\":\"06:00\",\"end\":\"14:00\"}],\"holidays\":[]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Zz Turno unico"))
                .andExpect(jsonPath("$.workDays", hasSize(6)))
                .andExpect(jsonPath("$.shifts[0].start").value("06:00"))
                .andExpect(jsonPath("$.holidays", hasSize(0)));
        mvc.perform(get("/api/v1/calendars").header(AUTH, bearer("operatore")))
                .andExpect(jsonPath("$[?(@.id == '" + id + "')].name").value(org.hamcrest.Matchers.contains("Zz Turno unico")));
    }

    @Test
    void invalidCalendarsAreRejectedWithPaths() throws Exception {
        mvc.perform(post("/api/v1/calendars").header(AUTH, bearer("amministratore")).contentType(MediaType.APPLICATION_JSON)
                        .content(calendar("Zz Sovrapposti", "[{\"start\":\"08:00\",\"end\":\"12:00\"},{\"start\":\"11:00\",\"end\":\"15:00\"}]")))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errors[0].code").value("OVERLAPPING_SHIFTS"))
                .andExpect(jsonPath("$.errors[0].path").value("shifts[1].start"));
        mvc.perform(post("/api/v1/calendars").header(AUTH, bearer("amministratore")).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Zz Vuoto\",\"workDays\":[],\"shifts\":[{\"start\":\"08:00\",\"end\":\"07:00\"}]}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errors[0].path").value("workDays"))
                .andExpect(jsonPath("$.errors[1].path").value("shifts[0].end"));
        mvc.perform(post("/api/v1/calendars").header(AUTH, bearer("pianificatore")).contentType(MediaType.APPLICATION_JSON)
                        .content(calendar("Zz Vietato", "[{\"start\":\"08:00\",\"end\":\"12:00\"}]")))
                .andExpect(status().isForbidden());
        mvc.perform(put("/api/v1/calendars/999999").header(AUTH, bearer("amministratore")).contentType(MediaType.APPLICATION_JSON)
                        .content(calendar("Zz Nessuno", "[{\"start\":\"08:00\",\"end\":\"12:00\"}]")))
                .andExpect(status().isNotFound());
    }

    @Test
    void skillsAreCreatedOnce() throws Exception {
        mvc.perform(post("/api/v1/skills").header(AUTH, bearer("amministratore")).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\"T_TORNITURA\",\"name\":\"Tornitura\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.code").value("T_TORNITURA"));
        mvc.perform(post("/api/v1/skills").header(AUTH, bearer("amministratore")).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\"T_TORNITURA\",\"name\":\"Ancora\"}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errors[0].path").value("code"));
    }

    @Test
    void domainProfilesKeepNormalisedWeightsAndOneProfileInUse() throws Exception {
        mvc.perform(put("/api/v1/domain-profiles/PROJECT").header(AUTH, bearer("amministratore")).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Progetti\",\"defaultObjectiveWeights\":{\"makespan\":0.5,\"weightedTardiness\":0.4,\"setup\":0.3}}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errors[0].code").value("WEIGHTS_NOT_NORMALISED"));
        mvc.perform(put("/api/v1/domain-profiles/PROJECT").header(AUTH, bearer("amministratore")).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Progetti\",\"defaultObjectiveWeights\":{\"speed\":1.0}}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errors[0].path").value("defaultObjectiveWeights.speed"));

        String factory = mvc.perform(get("/api/v1/domain-profiles/FACTORY").header(AUTH, bearer("amministratore")))
                .andReturn().getResponse().getContentAsString();
        mvc.perform(put("/api/v1/domain-profiles/PROJECT").header(AUTH, bearer("amministratore")).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Progetti\",\"description\":\"Attività di progetto\",\"defaultObjectiveWeights\":"
                                + "{\"makespan\":0.6,\"weightedTardiness\":0.4,\"setup\":0.0},\"features\":[\"PRECEDENCE_LAGS\"],\"inUse\":true}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.inUse").value(true))
                .andExpect(jsonPath("$.defaultObjectiveWeights.makespan").value(0.6));
        mvc.perform(get("/api/v1/domain-profiles/FACTORY").header(AUTH, bearer("amministratore")))
                .andExpect(jsonPath("$.inUse").value(false));
        // FACTORY torna com'era e di nuovo in uso (altri test leggono i suoi pesi)
        mvc.perform(put("/api/v1/domain-profiles/FACTORY").header(AUTH, bearer("amministratore")).contentType(MediaType.APPLICATION_JSON)
                        .content(factory.replace("\"inUse\":false", "\"inUse\":true")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.inUse").value(true));
        mvc.perform(put("/api/v1/domain-profiles/PROJECT").header(AUTH, bearer("pianificatore")).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"x\",\"defaultObjectiveWeights\":{\"makespan\":1.0}}"))
                .andExpect(status().isForbidden());
    }
}
