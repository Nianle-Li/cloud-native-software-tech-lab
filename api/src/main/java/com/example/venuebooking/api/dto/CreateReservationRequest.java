package com.example.venuebooking.api.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;
import java.time.LocalTime;

public record CreateReservationRequest(
        @NotNull @Positive Long venueId,
        @NotBlank @Size(max = 100) String bookedBy,
        @NotNull @JsonFormat(pattern = "yyyy-MM-dd") LocalDate reservationDate,
        @NotNull @JsonFormat(pattern = "HH:mm") LocalTime startTime,
        @NotNull @JsonFormat(pattern = "HH:mm") LocalTime endTime,
        @NotNull @Positive Integer attendeeCount,
        @NotBlank @Size(max = 500) String purpose
) {
}
