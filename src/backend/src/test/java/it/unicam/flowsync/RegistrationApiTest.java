package it.unicam.flowsync;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Registrazione pubblica con approvazione dell'ADMIN, e gestione utenti. Ogni test usa username propri. */
class RegistrationApiTest extends AbstractApiTest {

    private static final String AUTH = HttpHeaders.AUTHORIZATION;
    private static final String PASSWORD = "secret-pass-1";

    private ResultActions register(String username, String email, String password) throws Exception {
        return mvc.perform(post("/api/v1/auth/register").contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"" + username + "\",\"email\":\"" + email + "\",\"fullName\":\"Test " + username
                        + "\",\"password\":\"" + password + "\"}"));
    }

    /** Registra un utente e restituisce il suo id pubblico ("U-n"). */
    private String registered(String username) throws Exception {
        String body = register(username, username + "@test.local", PASSWORD)
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.id");
    }

    private ResultActions login(String username, String password) throws Exception {
        return mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"" + username + "\",\"password\":\"" + password + "\"}"));
    }

    private ResultActions approve(String id, String role) throws Exception {
        return mvc.perform(post("/api/v1/users/" + id + "/approve").header(AUTH, bearer("admin"))
                .contentType(MediaType.APPLICATION_JSON).content("{\"role\":\"" + role + "\"}"));
    }

    // ---------- registrazione ----------

    @Test
    void registrationCreatesAPendingAccountWithoutTokens() throws Exception {
        register("newbie", "newbie@test.local", PASSWORD)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").isNotEmpty())
                .andExpect(jsonPath("$.username").value("newbie"))
                .andExpect(jsonPath("$.status").value("PENDING"))
                .andExpect(jsonPath("$.accessToken").doesNotExist());

        login("newbie", PASSWORD)
                .andExpect(status().isForbidden())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.errors[0].code").value("ACCOUNT_PENDING"));
    }

    @Test
    void aWrongPasswordOnAPendingAccountRevealsNothing() throws Exception {
        registered("pending-wrongpw");
        login("pending-wrongpw", "not-the-password")
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.detail").value("Invalid username or password"));
    }

    @Test
    void aRoleSentAtRegistrationIsIgnored() throws Exception {
        mvc.perform(post("/api/v1/auth/register").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"sneaky\",\"email\":\"sneaky@test.local\",\"fullName\":\"S\","
                                + "\"password\":\"" + PASSWORD + "\",\"role\":\"ADMIN\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("PENDING"));

        mvc.perform(get("/api/v1/users").param("status", "PENDING").header(AUTH, bearer("admin")))
                .andExpect(jsonPath("$[?(@.username=='sneaky' && @.role == null)]").isNotEmpty());   // nessun ruolo finché in attesa
        login("sneaky", PASSWORD).andExpect(status().isForbidden());
    }

    @Test
    void duplicateUsernameOrEmailIs409() throws Exception {
        registered("twin");
        register("twin", "other@test.local", PASSWORD)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.errors[0].code").value("DUPLICATE_USERNAME"));
        register("TWIN", "other2@test.local", PASSWORD)                 // maiuscole: stesso utente per il DB
                .andExpect(status().isConflict());
        register("twin2", "TWIN@test.local", PASSWORD)                  // email normalizzata in minuscolo
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.errors[0].code").value("DUPLICATE_EMAIL"));
    }

    @Test
    void invalidRegistrationIs422() throws Exception {
        register("shortpw", "shortpw@test.local", "1234567")
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errors[0].path").value("password"));
        register("bad mail", "not-an-email", PASSWORD)
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errors.length()").value(2));       // username con spazio + email
    }

    // ---------- approvazione ----------

    @Test
    void adminApprovesWithARoleAndTheUserCanLogIn() throws Exception {
        String id = registered("approved-one");

        mvc.perform(get("/api/v1/users").param("status", "PENDING").header(AUTH, bearer("admin")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.username=='approved-one')]").isNotEmpty());

        approve(id, "PLANNER")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ACTIVE"))
                .andExpect(jsonPath("$.role").value("PLANNER"))
                .andExpect(jsonPath("$.approvedAt").isNotEmpty());

        login("approved-one", PASSWORD)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user.roles[0]").value("PLANNER"));

        approve(id, "ADMIN")                                            // già approvato
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.errors[0].code").value("NOT_PENDING"));
    }

    @Test
    void onlyAdminsManageUsers() throws Exception {
        String id = registered("needs-admin");
        mvc.perform(get("/api/v1/users").header(AUTH, bearer("gneri"))).andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/users/" + id + "/approve").header(AUTH, bearer("gneri"))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"role\":\"ADMIN\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/users")).andExpect(status().isUnauthorized());
    }

    @Test
    void approvalRequiresARole() throws Exception {
        String id = registered("no-role");
        mvc.perform(post("/api/v1/users/" + id + "/approve").header(AUTH, bearer("admin"))
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errors[0].path").value("role"));
    }

    @Test
    void adminRejectsAPendingRegistration() throws Exception {
        String id = registered("rejected-one");
        mvc.perform(delete("/api/v1/users/" + id).header(AUTH, bearer("admin"))).andExpect(status().isNoContent());
        login("rejected-one", PASSWORD).andExpect(status().isUnauthorized());     // l'account non esiste più
        mvc.perform(delete("/api/v1/users/" + id).header(AUTH, bearer("admin"))).andExpect(status().isNotFound());
    }

    @Test
    void approvedUsersAreDisabledNotDeleted() throws Exception {
        String id = registered("to-disable");
        approve(id, "OPERATOR").andExpect(status().isOk());
        String refresh = JsonPath.read(login("to-disable", PASSWORD).andReturn().getResponse().getContentAsString(),
                "$.refreshToken");

        mvc.perform(delete("/api/v1/users/" + id).header(AUTH, bearer("admin")))
                .andExpect(status().isConflict());

        mvc.perform(patch("/api/v1/users/" + id).header(AUTH, bearer("admin"))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"active\":false}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("DISABLED"));

        login("to-disable", PASSWORD)
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errors[0].code").value("ACCOUNT_DISABLED"));
        mvc.perform(post("/api/v1/auth/refresh").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"refreshToken\":\"" + refresh + "\"}"))
                .andExpect(status().isUnauthorized());                     // il refresh rilegge l'utente

        mvc.perform(patch("/api/v1/users/" + id).header(AUTH, bearer("admin"))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"active\":true,\"role\":\"PLANNER\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ACTIVE"))
                .andExpect(jsonPath("$.role").value("PLANNER"));
    }

    @Test
    void aPendingUserCannotBeEditedBeforeApproval() throws Exception {
        String id = registered("pending-edit");
        mvc.perform(patch("/api/v1/users/" + id).header(AUTH, bearer("admin"))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"active\":true}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.errors[0].code").value("USER_PENDING"));
    }

    @Test
    void anAdminCannotLockThemselvesOut() throws Exception {
        for (String body : new String[]{"{\"active\":false}", "{\"role\":\"PLANNER\"}"}) {
            mvc.perform(patch("/api/v1/users/U-1").header(AUTH, bearer("admin"))
                            .contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.errors[0].code").value("SELF_LOCKOUT"));
        }
    }

    @Test
    void unknownUserIdsAre404() throws Exception {
        for (String id : new String[]{"U-999999", "U-abc", "42"}) {
            mvc.perform(post("/api/v1/users/" + id + "/approve").header(AUTH, bearer("admin"))
                            .contentType(MediaType.APPLICATION_JSON).content("{\"role\":\"OPERATOR\"}"))
                    .andExpect(status().isNotFound());
        }
    }
}
