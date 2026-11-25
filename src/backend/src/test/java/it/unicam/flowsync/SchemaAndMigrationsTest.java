package it.unicam.flowsync;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Il primo test da guardare: se il contesto parte, le migrazioni Flyway (V1–V8 + seed V100–V101) sono state applicate
 * e Hibernate (ddl-auto: validate) ha trovato tutte le entità coerenti con lo schema.
 */
class SchemaAndMigrationsTest extends AbstractApiTest {

    @Autowired
    JdbcTemplate jdbc;

    @Test
    void migrationsAreApplied() {
        Integer applied = jdbc.queryForObject("SELECT COUNT(*) FROM flyway_schema_history WHERE success = 1", Integer.class);
        assertThat(applied).isGreaterThanOrEqualTo(11);  // V1–V8 + seed V100, V101, V102
    }

    @Test
    void demoUsersHaveBcryptHashes() {
        Integer users = jdbc.queryForObject("SELECT COUNT(*) FROM app_user WHERE username IN ('amministratore', 'pianificatore', 'operatore') AND password_hash LIKE '$2%'", Integer.class);
        assertThat(users).isEqualTo(3);
    }
}
