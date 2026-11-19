package it.unicam.flowsync.configuration.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.DayOfWeek;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "work_calendar")
@Getter @Setter @NoArgsConstructor
public class WorkCalendar {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 100, unique = true)
    private String name;

    @Column(nullable = false, length = 40)
    private String timezone = "Europe/Rome";

    @OneToMany(mappedBy = "calendar", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("dayOfWeek, startTime")
    private List<Shift> shifts = new ArrayList<>();

    /** Fascia di lavoro settimanale, es. lunedì 8:00–12:00. */
    @Entity
    @Table(name = "calendar_shift")
    @Getter @Setter @NoArgsConstructor
    public static class Shift {

        @Id
        @GeneratedValue(strategy = GenerationType.IDENTITY)
        private Long id;

        @ManyToOne(fetch = FetchType.LAZY, optional = false)
        @JoinColumn(name = "calendar_id", nullable = false)
        private WorkCalendar calendar;

        /** 1 = lunedì … 7 = domenica, come DayOfWeek.getValue(). */
        @Column(name = "day_of_week", nullable = false, columnDefinition = "TINYINT")
        private int dayOfWeek;

        @Column(name = "start_time", nullable = false)
        private LocalTime startTime;

        @Column(name = "end_time", nullable = false)
        private LocalTime endTime;

        public DayOfWeek day() {
            return DayOfWeek.of(dayOfWeek);
        }
    }
}
