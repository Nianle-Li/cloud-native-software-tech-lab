package com.example.venuebooking.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;

import java.io.Serializable;
import java.util.Objects;

@Embeddable
public class ReportItemId implements Serializable {

    @Column(name = "job_id", nullable = false, length = 63)
    private String jobId;

    @Column(name = "venue_id", nullable = false)
    private Long venueId;

    protected ReportItemId() {
    }

    public ReportItemId(String jobId, Long venueId) {
        this.jobId = jobId;
        this.venueId = venueId;
    }

    public String getJobId() { return jobId; }
    public Long getVenueId() { return venueId; }

    @Override
    public boolean equals(Object other) {
        if (this == other) return true;
        if (!(other instanceof ReportItemId that)) return false;
        return Objects.equals(jobId, that.jobId) && Objects.equals(venueId, that.venueId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(jobId, venueId);
    }
}
