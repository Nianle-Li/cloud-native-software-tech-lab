package com.example.venuebooking.api.error;

import org.springframework.http.HttpStatus;

public class CancellationClosedException extends ApiException {

    public CancellationClosedException() {
        super(HttpStatus.CONFLICT, "CANCELLATION_CLOSED", "预约已开始，不能取消");
    }
}
