package it.unicam.flowsync.planning.service;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class InterpretCodesTest {

    @Test
    void rangesAndSingleCodesAreRecognised() {
        assertThat(InterpretService.codesIn("Pianifica C-101…C-104 per la prossima settimana"))
                .containsExactly("C-101", "C-102", "C-103", "C-104");
        assertThat(InterpretService.codesIn("C-101 - C-102 e poi C-110")).containsExactly("C-101", "C-102", "C-110");
        assertThat(InterpretService.codesIn("solo C-103, C-101")).containsExactly("C-103", "C-101");
    }
}
