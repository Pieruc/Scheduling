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

    /** Festività (tabella calendar_holiday): non sono giorni lavorativi. */
    @ElementCollection
    @CollectionTable(name = "calendar_holiday", joinColumns = @JoinColumn(name = "calendar_id"))
    @OrderBy("date")
    private java.util.List<Holiday> holidays = new ArrayList<>();

    /** Le date delle festività, per la scala dei minuti di lavoro. */
    public java.util.Set<java.time.LocalDate> holidayDates() {
        java.util.Set<java.time.LocalDate> dates = new java.util.HashSet<>();
        holidays.forEach(h -> dates.add(h.getDate()));
        return dates;
    }

    /** Una festività: data e nome (es. 25/12, "Natale"). */
    @Embeddable
    @Getter @Setter @NoArgsConstructor
    public static class Holiday {

        @Column(name = "holiday_date", nullable = false)
        private java.time.LocalDate date;

        @Column(name = "description", length = 100)
        private String description;

        public Holiday(java.time.LocalDate date, String description) {
            this.date = date;
            this.description = description;
        }
    }

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

        @Convert(converter = it.unicam.flowsync.common.persistence.LocalTimeAsTextConverter.class)
        @Column(name = "start_time", nullable = false, columnDefinition = "TIME")
        private LocalTime startTime;

        @Convert(converter = it.unicam.flowsync.common.persistence.LocalTimeAsTextConverter.class)
        @Column(name = "end_time", nullable = false, columnDefinition = "TIME")
        private LocalTime endTime;

        public DayOfWeek day() {
            return DayOfWeek.of(dayOfWeek);
        }
    }
}
