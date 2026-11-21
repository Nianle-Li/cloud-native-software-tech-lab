package com.example.venuebooking.api.error;

import org.springframework.http.HttpStatus;

public class ReportNotFoundException extends ApiException {

    public ReportNotFoundException() {
        super(HttpStatus.NOT_FOUND, "REPORT_NOT_FOUND", "暂无报告运行记录");
    }
}
