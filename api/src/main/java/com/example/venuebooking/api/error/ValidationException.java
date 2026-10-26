package com.example.venuebooking.api.error;

import org.springframework.http.HttpStatus;

import java.util.List;

public class ValidationException extends ApiException {

    private final List<ValidationDetail> details;

    public ValidationException(String message, List<ValidationDetail> details) {
        super(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", message);
        this.details = details;
    }

    public List<ValidationDetail> getDetails() {
        return details;
    }
}
