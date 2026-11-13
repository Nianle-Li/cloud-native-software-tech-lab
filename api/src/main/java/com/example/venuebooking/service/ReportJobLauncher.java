package com.example.venuebooking.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.ExitCodeGenerator;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.time.Clock;

@Component
@ConditionalOnProperty(name = "report.run", havingValue = "true")
public class ReportJobLauncher implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(ReportJobLauncher.class);

    private final ReportGenerationService reports;
    private final Clock clock;

    public ReportJobLauncher(ReportGenerationService reports, Clock clock) {
        this.reports = reports;
        this.clock = clock;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            ReportJobRequest request = ReportJobRequest.fromEnvironment(System.getenv(), clock);
            reports.generate(request);
            log.info("Report job {} completed", request.jobId());
        } catch (RuntimeException exception) {
            log.error("Report job failed; check configuration and database availability");
            throw new ReportJobFailed();
        }
    }

    private static final class ReportJobFailed extends RuntimeException implements ExitCodeGenerator {
        private ReportJobFailed() {
            super("Report job failed");
        }

        @Override
        public int getExitCode() {
            return 1;
        }
    }
}
