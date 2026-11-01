package com.example.venuebooking.api.error;

import org.springframework.http.HttpStatus;

public class ReservationNotFoundException extends ApiException {

    public ReservationNotFoundException(Long id) {
        super(HttpStatus.NOT_FOUND, "RESERVATION_NOT_FOUND", "预约不存在: " + id);
    }
}
