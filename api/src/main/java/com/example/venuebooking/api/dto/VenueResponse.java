package com.example.venuebooking.api.dto;

import com.example.venuebooking.domain.Venue;
import com.example.venuebooking.domain.VenueStatus;
import com.fasterxml.jackson.annotation.JsonFormat;

import java.time.LocalTime;

public record VenueResponse(
        Long id,
        String name,
        String location,
        Integer capacity,
        @JsonFormat(pattern = "HH:mm") LocalTime openTime,
        @JsonFormat(pattern = "HH:mm") LocalTime closeTime,
        VenueStatus status
) {
    public static VenueResponse from(Venue venue) {
        return new VenueResponse(
                venue.getId(),
                venue.getName(),
                venue.getLocation(),
                venue.getCapacity(),
                venue.getOpenTime(),
                venue.getCloseTime(),
                venue.getStatus());
    }
}
