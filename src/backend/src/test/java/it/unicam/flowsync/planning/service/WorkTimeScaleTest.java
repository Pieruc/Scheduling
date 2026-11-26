package it.unicam.flowsync.planning.service;

import it.unicam.flowsync.planning.service.WorkTimeScale.Shift;
import org.junit.jupiter.api.Test;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.Arrays;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** Scala dei minuti di lavoro: turni 8–12 / 13–17 da lunedì a venerdì, festa martedì 1/12 (ipotetica). */
class WorkTimeScaleTest {

    static final ZoneId ROME = ZoneId.of("Europe/Rome");
    static final Map<DayOfWeek, List<Shift>> WEEKLY = new EnumMap<>(DayOfWeek.class);

    static {
        // i turni arrivano in disordine: la scala li ordina
        List<Shift> two = List.of(new Shift(LocalTime.of(13, 0), LocalTime.of(17, 0)), new Shift(LocalTime.of(8, 0), LocalTime.of(12, 0)));
        for (DayOfWeek d : List.of(DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY, DayOfWeek.FRIDAY)) {
            WEEKLY.put(d, two);
        }
    }

    static Instant at(int month, int day, int hour, int minute) {
        return ZonedDateTime.of(2026, month, day, hour, minute, 0, 0, ROME).toInstant();
    }

    static String local(Instant i) {
        return i.atZone(ROME).toLocalDateTime().toString();
    }

    final WorkTimeScale scale = WorkTimeScale.of(at(11, 26, 8, 0), at(12, 2, 17, 0), ROME, WEEKLY, List.of(LocalDate.of(2026, 12, 1)));

    @Test
    void onlyWorkingDaysCount() {
        assertThat(scale.days()).extracting(LocalDate::toString)
                .containsExactly("2026-11-26", "2026-11-27", "2026-11-30", "2026-12-02");
        assertThat(scale.minutesPerDay()).isEqualTo(480);
        assertThat(scale.totalMinutes()).isEqualTo(1920);
    }

    @Test
    void instantsBecomeWorkMinutes() {
        assertThat(scale.toMinute(at(11, 26, 10, 30), true)).isEqualTo(150);
        assertThat(scale.toMinute(at(11, 26, 12, 30), true)).isEqualTo(240);      // pausa: stesso minuto
        assertThat(scale.toMinute(at(11, 26, 12, 30), false)).isEqualTo(240);
        assertThat(scale.toMinute(at(11, 27, 18, 0), false)).isEqualTo(960);      // dopo il turno = fine giornata
        assertThat(scale.toMinute(at(11, 28, 9, 0), true)).isEqualTo(960);       // sabato -> lunedì 8:00
        assertThat(scale.toMinute(at(11, 28, 9, 0), false)).isEqualTo(960);      // sabato -> venerdì 17:00
        assertThat(scale.toMinute(at(12, 1, 9, 0), true)).isEqualTo(1440);       // festa -> mercoledì
    }

    @Test
    void boundaryMinutesDependOnWhetherTheyStartOrEndAnActivity() {
        assertThat(local(scale.toInstant(240, false))).isEqualTo("2026-11-26T13:00");
        assertThat(local(scale.toInstant(240, true))).isEqualTo("2026-11-26T12:00");
        assertThat(local(scale.toInstant(480, true))).isEqualTo("2026-11-26T17:00");
        assertThat(local(scale.toInstant(480, false))).isEqualTo("2026-11-27T08:00");
        assertThat(local(scale.toInstant(1920, true))).isEqualTo("2026-12-02T17:00");
        assertThat(scale.toMinute(scale.toInstant(1700, false), true)).isEqualTo(1700);
    }

    @Test
    void shorterDaysLeaveAnUnusableTailAndBlocksAreRemoved() {
        Map<DayOfWeek, List<Shift>> shortFriday = new EnumMap<>(WEEKLY);
        shortFriday.put(DayOfWeek.FRIDAY, List.of(new Shift(LocalTime.of(8, 0), LocalTime.of(12, 0))));
        WorkTimeScale s = WorkTimeScale.of(at(11, 26, 8, 0), at(12, 2, 17, 0), ROME, shortFriday, List.of());
        assertThat(s.workingWindows()).extracting(Arrays::toString).containsExactly("[0, 720]", "[960, 2400]");
        assertThat(scale.availability(100, 1920, List.of(new int[]{480, 960}))).extracting(Arrays::toString)
                .containsExactly("[100, 480]", "[960, 1920]");
    }
}
