package com.example.venuebooking.api.error;

import org.springframework.http.HttpStatus;

public class TimeConflictException extends ApiException {

    public TimeConflictException() {
        super(HttpStatus.CONFLICT, "TIME_CONFLICT", "该场地在所选时段已被预约");
    }
}
