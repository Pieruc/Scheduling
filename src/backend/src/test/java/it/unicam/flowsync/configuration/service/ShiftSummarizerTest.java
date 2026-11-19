package it.unicam.flowsync.configuration.service;

import it.unicam.flowsync.configuration.service.ShiftSummarizer.Slot;
import org.junit.jupiter.api.Test;

import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class ShiftSummarizerTest {

    private static Slot slot(int day, String from, String to) {
        return new Slot(day, LocalTime.parse(from), LocalTime.parse(to));
    }

    private static List<Slot> days(int first, int last, String... times) {
        List<Slot> slots = new ArrayList<>();
        for (int d = first; d <= last; d++) {
            for (int i = 0; i < times.length; i += 2) {
                slots.add(slot(d, times[i], times[i + 1]));
            }
        }
        return slots;
    }

    @Test
    void groupsConsecutiveDaysWithTheSameShifts() {
        assertThat(ShiftSummarizer.summarize(days(1, 5, "08:00", "12:00", "13:00", "17:00")))
                .isEqualTo("Lun–Ven 8–12 / 13–17");
    }

    @Test
    void worksOnASixDayContinuousCalendar() {
        assertThat(ShiftSummarizer.summarize(days(1, 6, "06:00", "22:00"))).isEqualTo("Lun–Sab 6–22");
    }

    @Test
    void separatesDaysWithDifferentShifts() {
        List<Slot> slots = days(1, 5, "08:00", "12:00");
        slots.add(slot(6, "08:30", "12:00"));
        assertThat(ShiftSummarizer.summarize(slots)).isEqualTo("Lun–Ven 8–12, Sab 8:30–12");
    }

    @Test
    void doesNotMergeDaysThatAreNotConsecutive() {
        List<Slot> slots = new ArrayList<>(days(1, 1, "08:00", "12:00"));
        slots.addAll(days(3, 3, "08:00", "12:00"));
        assertThat(ShiftSummarizer.summarize(slots)).isEqualTo("Lun 8–12, Mer 8–12");
    }

    @Test
    void sortsShiftsInsideADay() {
        List<Slot> slots = List.of(slot(2, "13:00", "17:00"), slot(2, "08:00", "12:00"));
        assertThat(ShiftSummarizer.summarize(slots)).isEqualTo("Mar 8–12 / 13–17");
    }

    @Test
    void emptyCalendar() {
        assertThat(ShiftSummarizer.summarize(List.of())).isEqualTo("Nessun turno");
    }
}
