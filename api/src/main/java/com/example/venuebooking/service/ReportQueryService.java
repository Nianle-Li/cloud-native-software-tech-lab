package com.example.venuebooking.service;

import com.example.venuebooking.api.dto.ReportItemResponse;
import com.example.venuebooking.api.dto.ReportResponse;
import com.example.venuebooking.api.error.ReportNotFoundException;
import com.example.venuebooking.api.error.ValidationDetail;
import com.example.venuebooking.api.error.ValidationException;
import com.example.venuebooking.domain.ReportRun;
import com.example.venuebooking.domain.ReportStatus;
import com.example.venuebooking.repository.ReportItemRepository;
import com.example.venuebooking.repository.ReportRunRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.regex.Pattern;

@Service
public class ReportQueryService {

    public static final Pattern JOB_ID = Pattern.compile("^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$");

    private final ReportRunRepository runs;
    private final ReportItemRepository items;

    public ReportQueryService(ReportRunRepository runs, ReportItemRepository items) {
        this.runs = runs;
        this.items = items;
    }

    @Transactional(readOnly = true)
    public ReportResponse get(String jobId) {
        if (jobId == null || !JOB_ID.matcher(jobId).matches()) {
            throw new ValidationException("请求字段无效", List.of(
                    new ValidationDetail("job_id", "必须是 1 至 63 位的小写字母、数字或连字符")));
        }
        ReportRun run = runs.findById(jobId).orElseThrow(ReportNotFoundException::new);
        List<ReportItemResponse> result = run.getStatus() == ReportStatus.SUCCEEDED
                ? items.findByIdJobIdOrderByIdVenueIdAsc(jobId).stream().map(ReportItemResponse::from).toList()
                : List.of();
        return ReportResponse.from(run, result);
    }
}
