package com.example.venuebooking;

import com.example.venuebooking.domain.ReportSource;
import com.example.venuebooking.service.ReportJobRequest;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class ReportJobRequestTest {

    private final Clock clock = Clock.fixed(Instant.parse("2026-11-06T16:30:00Z"),
            ZoneId.of("Asia/Shanghai"));

    @Test
    void scheduledWindowUsesShanghaiCalendarAndManualDatesAreInclusive() {
        ReportJobRequest previous = ReportJobRequest.fromEnvironment(Map.of(
                "REPORT_JOB_ID", "daily-1", "REPORT_SOURCE", "SCHEDULED",
                "REPORT_WINDOW_MODE", "PREVIOUS_DAY"), clock);
        assertEquals(ReportSource.SCHEDULED, previous.source());
        assertEquals(LocalDate.of(2026, 11, 6), previous.startDate());
        assertEquals(previous.startDate(), previous.endDate());

        ReportJobRequest today = ReportJobRequest.fromEnvironment(Map.of(
                "REPORT_JOB_ID", "daily-2", "REPORT_SOURCE", "SCHEDULED",
                "REPORT_WINDOW_MODE", "TODAY"), clock);
        assertEquals(LocalDate.of(2026, 11, 7), today.startDate());

        ReportJobRequest manual = ReportJobRequest.fromEnvironment(Map.of(
                "REPORT_JOB_ID", "manual-1", "REPORT_SOURCE", "MANUAL",
                "REPORT_START_DATE", "2026-11-01", "REPORT_END_DATE", "2026-11-06"), clock);
        assertEquals(LocalDate.of(2026, 11, 1), manual.startDate());
        assertEquals(LocalDate.of(2026, 11, 6), manual.endDate());
    }

    @Test
    void invalidJobSettingsAreRejected() {
        assertThrows(IllegalArgumentException.class, () -> ReportJobRequest.fromEnvironment(Map.of(
                "REPORT_JOB_ID", "UPPER", "REPORT_SOURCE", "MANUAL",
                "REPORT_START_DATE", "2026-11-01", "REPORT_END_DATE", "2026-11-02"), clock));
        assertThrows(IllegalArgumentException.class, () -> ReportJobRequest.fromEnvironment(Map.of(
                "REPORT_JOB_ID", "manual-1", "REPORT_SOURCE", "MANUAL",
                "REPORT_START_DATE", "2026-11-02", "REPORT_END_DATE", "2026-11-01"), clock));
        assertThrows(IllegalArgumentException.class, () -> ReportJobRequest.fromEnvironment(Map.of(
                "REPORT_JOB_ID", "manual-1", "REPORT_SOURCE", "MANUAL",
                "REPORT_START_DATE", "2026-11-1", "REPORT_END_DATE", "2026-11-02"), clock));
        assertThrows(IllegalArgumentException.class, () -> ReportJobRequest.fromEnvironment(Map.of(
                "REPORT_JOB_ID", "scheduled-1", "REPORT_SOURCE", "SCHEDULED",
                "REPORT_WINDOW_MODE", "YESTERDAY"), clock));
        assertThrows(IllegalArgumentException.class, () -> ReportJobRequest.fromEnvironment(Map.of(
                "REPORT_JOB_ID", "scheduled-1", "REPORT_SOURCE", "SCHEDULED",
                "REPORT_WINDOW_MODE", "TODAY", "REPORT_START_DATE", "2026-11-01"), clock));
    }
}
