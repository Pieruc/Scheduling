package it.unicam.flowsync.execution.service;

import it.unicam.flowsync.execution.domain.ExecutionEvent.Type;
import it.unicam.flowsync.execution.service.ExecutionState.Event;
import it.unicam.flowsync.execution.service.ExecutionState.State;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class ExecutionStateTest {

    static Instant at(String hhmm) {
        return Instant.parse("2027-01-11T" + hhmm + ":00Z");
    }

    @Test
    void stateAndWorkedMinutesFollowTheEvents() {
        assertThat(ExecutionState.of(List.of()).state()).isEqualTo(State.TODO);
        ExecutionState running = ExecutionState.of(List.of(new Event(Type.START, at("08:00"))));
        assertThat(running.state()).isEqualTo(State.IN_PROGRESS);
        assertThat(running.runningSince()).isEqualTo(at("08:00"));
        ExecutionState paused = ExecutionState.of(List.of(new Event(Type.START, at("08:00")), new Event(Type.PAUSE, at("09:30"))));
        assertThat(paused.state()).isEqualTo(State.PAUSED);
        assertThat(paused.workedMin()).isEqualTo(90);
        assertThat(paused.runningSince()).isNull();
        ExecutionState done = ExecutionState.of(List.of(new Event(Type.START, at("08:00")), new Event(Type.PAUSE, at("09:00")),
                new Event(Type.RESUME, at("10:00")), new Event(Type.COMPLETE, at("10:45"))));
        assertThat(done.state()).isEqualTo(State.DONE);
        assertThat(done.workedMin()).isEqualTo(105);
        assertThat(done.actualStart()).isEqualTo(at("08:00"));
        assertThat(done.actualEnd()).isEqualTo(at("10:45"));
    }

    @Test
    void onlyTheContractTransitionsAreAllowed() {
        assertThat(ExecutionState.TODO.allows(Type.START)).isTrue();
        assertThat(ExecutionState.TODO.allows(Type.COMPLETE)).isFalse();
        assertThat(ExecutionState.TODO.allows(Type.PAUSE)).isFalse();
        ExecutionState paused = ExecutionState.of(List.of(new Event(Type.START, at("08:00")), new Event(Type.PAUSE, at("09:00"))));
        assertThat(paused.allows(Type.RESUME)).isTrue();
        assertThat(paused.allows(Type.COMPLETE)).isTrue();
        assertThat(paused.allows(Type.START)).isFalse();
    }
}
