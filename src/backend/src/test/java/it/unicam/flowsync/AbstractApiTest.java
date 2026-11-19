package it.unicam.flowsync;

import com.jayway.jsonpath.JsonPath;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.MySQLContainer;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Base dei test di integrazione: applicazione completa su un MySQL 8 vero (Docker), con le migrazioni Flyway
 * e il profilo dev (utenti demo, password "flowsync-dev"). Il container è unico per tutta la suite.
 * Richiede Docker in esecuzione.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("dev")
public abstract class AbstractApiTest {

    @ServiceConnection
    static final MySQLContainer<?> MYSQL = new MySQLContainer<>("mysql:8.4");

    static {
        MYSQL.start();
    }

    @Autowired
    protected MockMvc mvc;

    /** Esegue il login con un utente demo (admin, gneri, mrossi) e restituisce il JSON della risposta. */
    protected String loginResponse(String username) throws Exception {
        return mvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"" + username + "\",\"password\":\"flowsync-dev\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
    }

    protected String accessToken(String username) throws Exception {
        return JsonPath.read(loginResponse(username), "$.accessToken");
    }

    /** Valore dell'header Authorization per un utente demo. */
    protected String bearer(String username) throws Exception {
        return "Bearer " + accessToken(username);
    }
}
