package com.example.venuebooking.api.dto;

import com.example.venuebooking.domain.VenueStatus;
import com.fasterxml.jackson.annotation.JsonFormat;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.time.LocalTime;

public record CreateVenueRequest(
        @NotBlank @Size(max = 100) String name,
        @NotBlank @Size(max = 200) String location,
        @NotNull @Positive Integer capacity,
        @NotNull @JsonFormat(pattern = "HH:mm") LocalTime openTime,
        @NotNull @JsonFormat(pattern = "HH:mm") LocalTime closeTime,
        VenueStatus status
) {
}
