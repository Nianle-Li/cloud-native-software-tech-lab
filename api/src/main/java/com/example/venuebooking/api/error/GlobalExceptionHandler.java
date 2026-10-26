package com.example.venuebooking.api.error;

import jakarta.validation.ConstraintViolationException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import java.util.Comparator;
import java.util.List;
import java.util.Locale;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<ErrorResponse> handleApiException(ApiException exception) {
        if (exception instanceof ValidationException validationException) {
            return ResponseEntity.status(exception.getStatus())
                    .body(ErrorResponse.validation(exception.getMessage(), validationException.getDetails()));
        }
        return ResponseEntity.status(exception.getStatus())
                .body(ErrorResponse.of(exception.getCode(), exception.getMessage()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleMethodArgumentNotValid(MethodArgumentNotValidException exception) {
        List<ValidationDetail> details = exception.getBindingResult().getFieldErrors().stream()
                .map(error -> new ValidationDetail(toSnakeCase(error.getField()),
                        error.getDefaultMessage() == null ? "字段无效" : error.getDefaultMessage()))
                .sorted(Comparator.comparing(ValidationDetail::field))
                .toList();
        return ResponseEntity.badRequest().body(ErrorResponse.validation("请求字段无效", details));
    }

    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<ErrorResponse> handleConstraintViolation(ConstraintViolationException exception) {
        List<ValidationDetail> details = exception.getConstraintViolations().stream()
                .map(violation -> new ValidationDetail(toSnakeCase(violation.getPropertyPath().toString()),
                        violation.getMessage()))
                .sorted(Comparator.comparing(ValidationDetail::field))
                .toList();
        return ResponseEntity.badRequest().body(ErrorResponse.validation("请求参数无效", details));
    }

    @ExceptionHandler({HttpMessageNotReadableException.class, MethodArgumentTypeMismatchException.class})
    public ResponseEntity<ErrorResponse> handleMalformedRequest(Exception exception) {
        return ResponseEntity.badRequest().body(ErrorResponse.of("VALIDATION_ERROR", "请求格式或字段值无效"));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleUnexpected(Exception exception) {
        log.error("Unexpected API error", exception);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(ErrorResponse.of("INTERNAL_ERROR", "服务器内部错误"));
    }

    private static String toSnakeCase(String value) {
        return value.replaceAll("([a-z0-9])([A-Z])", "$1_$2").toLowerCase(Locale.ROOT);
    }
}
