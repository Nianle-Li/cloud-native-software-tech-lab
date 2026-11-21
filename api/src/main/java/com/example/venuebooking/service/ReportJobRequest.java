package com.example.venuebooking.service;

import com.example.venuebooking.domain.ReportSource;

import java.time.Clock;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.Map;

public record ReportJobRequest(String jobId, ReportSource source,
                               LocalDate startDate, LocalDate endDate) {

    public static ReportJobRequest fromEnvironment(Map<String, String> environment, Clock clock) {
        String jobId = environment.get("REPORT_JOB_ID");
        if (jobId == null || !ReportQueryService.JOB_ID.matcher(jobId).matches()) {
            throw new IllegalArgumentException("REPORT_JOB_ID 格式无效");
        }

        ReportSource source;
        try {
            source = ReportSource.valueOf(environment.getOrDefault("REPORT_SOURCE", ""));
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException("REPORT_SOURCE 必须为 MANUAL 或 SCHEDULED");
        }

        String start = environment.get("REPORT_START_DATE");
        String end = environment.get("REPORT_END_DATE");
        String mode = environment.get("REPORT_WINDOW_MODE");
        if (source == ReportSource.MANUAL) {
            if (mode != null || start == null || end == null) {
                throw new IllegalArgumentException("MANUAL 报告需要起止日期且不能设置 REPORT_WINDOW_MODE");
            }
            LocalDate startDate = parseDate(start);
            LocalDate endDate = parseDate(end);
            if (startDate.isAfter(endDate)) {
                throw new IllegalArgumentException("REPORT_START_DATE 不能晚于 REPORT_END_DATE");
            }
            return new ReportJobRequest(jobId, source, startDate, endDate);
        }

        if (start != null || end != null || (!"PREVIOUS_DAY".equals(mode) && !"TODAY".equals(mode))) {
            throw new IllegalArgumentException("SCHEDULED 报告只能设置 REPORT_WINDOW_MODE");
        }
        LocalDate date = LocalDate.now(clock);
        if ("PREVIOUS_DAY".equals(mode)) {
            date = date.minusDays(1);
        }
        return new ReportJobRequest(jobId, source, date, date);
    }

    private static LocalDate parseDate(String value) {
        try {
            LocalDate result = LocalDate.parse(value);
            if (!result.toString().equals(value)) {
                throw new IllegalArgumentException("报告日期必须为 YYYY-MM-DD");
            }
            return result;
        } catch (DateTimeParseException exception) {
            throw new IllegalArgumentException("报告日期必须为 YYYY-MM-DD");
        }
    }
}
