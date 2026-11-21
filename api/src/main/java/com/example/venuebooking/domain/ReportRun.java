package com.example.venuebooking.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDate;
import java.time.OffsetDateTime;

@Entity
@Table(name = "report_runs")
public class ReportRun {

    @Id
    @Column(name = "job_id", length = 63)
    private String jobId;

    @Enumerated(EnumType.STRING)
    @Column(name = "source", nullable = false, length = 10)
    private ReportSource source;

    @Column(name = "start_date", nullable = false)
    private LocalDate startDate;

    @Column(name = "end_date", nullable = false)
    private LocalDate endDate;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 10)
    private ReportStatus status;

    @Column(name = "started_at", nullable = false)
    private OffsetDateTime startedAt;

    @Column(name = "finished_at")
    private OffsetDateTime finishedAt;

    @Column(name = "generated_at")
    private OffsetDateTime generatedAt;

    @Column(name = "error_summary", length = 500)
    private String errorSummary;

    protected ReportRun() {
    }

    public String getJobId() { return jobId; }
    public ReportSource getSource() { return source; }
    public LocalDate getStartDate() { return startDate; }
    public LocalDate getEndDate() { return endDate; }
    public ReportStatus getStatus() { return status; }
    public OffsetDateTime getStartedAt() { return startedAt; }
    public OffsetDateTime getFinishedAt() { return finishedAt; }
    public OffsetDateTime getGeneratedAt() { return generatedAt; }
    public String getErrorSummary() { return errorSummary; }

    public void begin(OffsetDateTime time) {
        status = ReportStatus.RUNNING;
        startedAt = time;
        finishedAt = null;
        generatedAt = null;
        errorSummary = null;
    }

    public void succeed(OffsetDateTime time) {
        status = ReportStatus.SUCCEEDED;
        finishedAt = time;
        generatedAt = time;
        errorSummary = null;
    }

    public void fail(OffsetDateTime time, String summary) {
        status = ReportStatus.FAILED;
        finishedAt = time;
        generatedAt = null;
        errorSummary = summary;
    }
}
