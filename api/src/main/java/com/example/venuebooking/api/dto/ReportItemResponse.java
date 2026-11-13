package com.example.venuebooking.api.dto;

import com.example.venuebooking.domain.ReportItem;

public record ReportItemResponse(Long venueId, String venueName,
                                 Long reservationCount, Long reservedMinutes) {

    public static ReportItemResponse from(ReportItem item) {
        return new ReportItemResponse(item.getId().getVenueId(), item.getVenueName(),
                item.getReservationCount(), item.getReservedMinutes());
    }
}
