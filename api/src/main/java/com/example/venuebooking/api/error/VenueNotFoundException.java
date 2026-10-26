package com.example.venuebooking.api.error;

import org.springframework.http.HttpStatus;

public class VenueNotFoundException extends ApiException {

    public VenueNotFoundException(Long id) {
        super(HttpStatus.NOT_FOUND, "VENUE_NOT_FOUND", "场地不存在: " + id);
    }
}
