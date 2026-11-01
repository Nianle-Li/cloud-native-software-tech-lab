package com.example.venuebooking.api.dto;

import com.example.venuebooking.domain.Reservation;
import com.example.venuebooking.domain.ReservationStatus;
import com.fasterxml.jackson.annotation.JsonFormat;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;

public record ReservationResponse(
        Long id,
        Long venueId,
        String bookedBy,
        @JsonFormat(pattern = "yyyy-MM-dd") LocalDate reservationDate,
        @JsonFormat(pattern = "HH:mm") LocalTime startTime,
        @JsonFormat(pattern = "HH:mm") LocalTime endTime,
        Integer attendeeCount,
        String purpose,
        ReservationStatus status,
        OffsetDateTime createdAt,
        OffsetDateTime cancelledAt
) {
    public static ReservationResponse from(Reservation reservation) {
        return new ReservationResponse(
                reservation.getId(),
                reservation.getVenue().getId(),
                reservation.getBookedBy(),
                reservation.getReservationDate(),
                reservation.getStartTime(),
                reservation.getEndTime(),
                reservation.getAttendeeCount(),
                reservation.getPurpose(),
                reservation.getStatus(),
                reservation.getCreatedAt(),
                reservation.getCancelledAt());
    }
}
