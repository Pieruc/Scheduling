package it.unicam.flowsync.common.persistence;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

import java.time.LocalTime;

/**
 * Orari dei turni (colonne TIME) letti e scritti come testo "HH:mm:ss". Con {@code hibernate.jdbc.time_zone: UTC}
 * Hibernate legge un TIME come istante UTC e lo converte nel fuso della JVM: su una JVM a Roma le 08:00 diventano
 * 09:00. Un orario di turno non ha fuso, quindi qui non si converte nulla.
 */
@Converter
public class LocalTimeAsTextConverter implements AttributeConverter<LocalTime, String> {

    @Override
    public String convertToDatabaseColumn(LocalTime time) {
        return time == null ? null : time.toString().length() == 5 ? time + ":00" : time.toString();
    }

    @Override
    public LocalTime convertToEntityAttribute(String text) {
        return text == null ? null : LocalTime.parse(text);
    }
}
