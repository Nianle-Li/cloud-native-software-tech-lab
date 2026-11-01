package com.example.venuebooking.api.error;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record ErrorResponse(ErrorBody error, List<ValidationDetail> details) {

    public static ErrorResponse of(String code, String message) {
        return new ErrorResponse(new ErrorBody(code, message), null);
    }

    public static ErrorResponse validation(String message, List<ValidationDetail> details) {
        return new ErrorResponse(new ErrorBody("VALIDATION_ERROR", message), details);
    }
}
