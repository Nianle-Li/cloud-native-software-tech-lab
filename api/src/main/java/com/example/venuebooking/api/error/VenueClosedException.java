package com.example.venuebooking.api.error;

import org.springframework.http.HttpStatus;

public class VenueClosedException extends ApiException {

    public VenueClosedException() {
        super(HttpStatus.CONFLICT, "VENUE_CLOSED", "该场地已停用，不能创建预约");
    }
}
