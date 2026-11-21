package com.example.venuebooking.domain;

import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

@Entity
@Table(name = "report_items")
public class ReportItem {

    @EmbeddedId
    private ReportItemId id;

    @Column(name = "venue_name", nullable = false, length = 100)
    private String venueName;

    @Column(name = "reservation_count", nullable = false)
    private Long reservationCount;

    @Column(name = "reserved_minutes", nullable = false)
    private Long reservedMinutes;

    protected ReportItem() {
    }

    public ReportItem(String jobId, Long venueId, String venueName,
                      Long reservationCount, Long reservedMinutes) {
        id = new ReportItemId(jobId, venueId);
        this.venueName = venueName;
        this.reservationCount = reservationCount;
        this.reservedMinutes = reservedMinutes;
    }

    public ReportItemId getId() { return id; }
    public String getVenueName() { return venueName; }
    public Long getReservationCount() { return reservationCount; }
    public Long getReservedMinutes() { return reservedMinutes; }
}
