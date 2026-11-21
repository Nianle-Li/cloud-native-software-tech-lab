package com.example.venuebooking.service;

import org.springframework.stereotype.Service;

@Service
public class ReportGenerationService {

    private final ReportRunTransactions transactions;

    public ReportGenerationService(ReportRunTransactions transactions) {
        this.transactions = transactions;
    }

    public void generate(ReportJobRequest request) {
        if (!transactions.begin(request)) {
            return;
        }
        try {
            transactions.complete(request.jobId());
        } catch (RuntimeException failure) {
            try {
                transactions.failIfIncomplete(request.jobId());
            } catch (RuntimeException markingFailure) {
                failure.addSuppressed(markingFailure);
            }
            throw failure;
        }
    }
}
