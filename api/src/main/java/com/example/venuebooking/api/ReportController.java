package com.example.venuebooking.api;

import com.example.venuebooking.api.dto.ReportResponse;
import com.example.venuebooking.service.ReportQueryService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/reports")
public class ReportController {

    private final ReportQueryService reports;

    public ReportController(ReportQueryService reports) {
        this.reports = reports;
    }

    @GetMapping("/{jobId}")
    public ReportResponse get(@PathVariable String jobId) {
        return reports.get(jobId);
    }
}
