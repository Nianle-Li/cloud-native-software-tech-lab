package com.example.venuebooking.service;

import com.example.venuebooking.domain.ReportItem;
import com.example.venuebooking.domain.ReportRun;
import com.example.venuebooking.domain.ReportSource;
import com.example.venuebooking.domain.ReportStatus;
import com.example.venuebooking.repository.ReportItemRepository;
import com.example.venuebooking.repository.ReportRunRepository;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;

@Service
public class ReportRunTransactions {

    private static final String SAFE_FAILURE = "报告生成失败，请查看 Job 日志";

    private final ReportRunRepository runs;
    private final ReportItemRepository items;
    private final ReportAggregation aggregation;
    private final JdbcTemplate jdbcTemplate;
    private final Clock clock;

    public ReportRunTransactions(ReportRunRepository runs, ReportItemRepository items,
                                 ReportAggregation aggregation, JdbcTemplate jdbcTemplate, Clock clock) {
        this.runs = runs;
        this.items = items;
        this.aggregation = aggregation;
        this.jdbcTemplate = jdbcTemplate;
        this.clock = clock;
    }

    @Transactional
    public boolean begin(ReportJobRequest request) {
        // ON CONFLICT lets two Pods race for a new job_id without a uniqueness exception.
        jdbcTemplate.update(connection -> {
            var statement = connection.prepareStatement("""
                    INSERT INTO report_runs (job_id, source, start_date, end_date, status, started_at)
                    VALUES (?, ?, ?, ?, 'RUNNING', ?)
                    ON CONFLICT (job_id) DO NOTHING
                    """);
            statement.setString(1, request.jobId());
            statement.setString(2, request.source().name());
            statement.setObject(3, request.startDate());
            statement.setObject(4, request.endDate());
            statement.setObject(5, now());
            return statement;
        });

        ReportRun run = locked(request.jobId());
        if (run.getSource() != request.source()) {
            throw new IllegalArgumentException("同一 REPORT_JOB_ID 的来源不能改变");
        }
        if (request.source() == ReportSource.MANUAL &&
                (!run.getStartDate().equals(request.startDate()) || !run.getEndDate().equals(request.endDate()))) {
            throw new IllegalArgumentException("同一 REPORT_JOB_ID 的日期范围不能改变");
        }
        if (run.getStatus() == ReportStatus.SUCCEEDED) {
            return false;
        }
        run.begin(now());
        return true;
    }

    @Transactional
    public void complete(String jobId) {
        ReportRun run = locked(jobId);
        if (run.getStatus() == ReportStatus.SUCCEEDED) {
            return;
        }
        List<ReportAggregation.VenueTotals> totals = aggregation.aggregate(run.getStartDate(), run.getEndDate());
        items.deleteByJobId(jobId);
        items.saveAll(totals.stream()
                .map(total -> new ReportItem(jobId, total.venueId(), total.venueName(),
                        total.reservationCount(), total.reservedMinutes()))
                .toList());
        run.succeed(now());
    }

    @Transactional
    public void failIfIncomplete(String jobId) {
        ReportRun run = locked(jobId);
        if (run.getStatus() != ReportStatus.SUCCEEDED) {
            run.fail(now(), SAFE_FAILURE);
        }
    }

    private ReportRun locked(String jobId) {
        return runs.findByJobIdForUpdate(jobId)
                .orElseThrow(() -> new IllegalStateException("报告运行记录不存在"));
    }

    private OffsetDateTime now() {
        return OffsetDateTime.now(clock).truncatedTo(ChronoUnit.MICROS);
    }
}
