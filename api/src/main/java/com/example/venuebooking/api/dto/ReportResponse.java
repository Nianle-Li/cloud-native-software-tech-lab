package com.example.venuebooking.api.dto;

import com.example.venuebooking.domain.ReportRun;
import com.example.venuebooking.domain.ReportSource;
import com.example.venuebooking.domain.ReportStatus;
import com.fasterxml.jackson.annotation.JsonFormat;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;

public record ReportResponse(
        String jobId,
        ReportSource source,
        @JsonFormat(pattern = "yyyy-MM-dd") LocalDate startDate,
        @JsonFormat(pattern = "yyyy-MM-dd") LocalDate endDate,
        ReportStatus status,
        OffsetDateTime startedAt,
        OffsetDateTime finishedAt,
        OffsetDateTime generatedAt,
        String errorSummary,
        List<ReportItemResponse> items
) {
    private static final ZoneOffset BEIJING_OFFSET = ZoneOffset.ofHours(8);

    public static ReportResponse from(ReportRun run, List<ReportItemResponse> items) {
        return new ReportResponse(run.getJobId(), run.getSource(), run.getStartDate(),
                run.getEndDate(), run.getStatus(), beijing(run.getStartedAt()),
                beijing(run.getFinishedAt()), beijing(run.getGeneratedAt()),
                run.getErrorSummary(), items);
    }

    private static OffsetDateTime beijing(OffsetDateTime value) {
        return value == null ? null : value.withOffsetSameInstant(BEIJING_OFFSET);
    }
}
