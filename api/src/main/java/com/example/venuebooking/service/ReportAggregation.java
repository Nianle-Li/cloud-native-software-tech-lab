package com.example.venuebooking.service;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.List;

@Component
public class ReportAggregation {

    private final JdbcTemplate jdbcTemplate;

    public ReportAggregation(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    // A single PostgreSQL statement gives all venue rows one READ COMMITTED snapshot.
    public List<VenueTotals> aggregate(LocalDate startDate, LocalDate endDate) {
        return jdbcTemplate.query("""
                SELECT v.id, v.name, count(r.id) AS reservation_count,
                       coalesce(sum(extract(epoch from (r.end_time - r.start_time)) / 60), 0)::bigint
                           AS reserved_minutes
                FROM venues v
                LEFT JOIN reservations r ON r.venue_id = v.id
                    AND r.status = 'ACTIVE'
                    AND r.reservation_date BETWEEN ? AND ?
                GROUP BY v.id, v.name
                ORDER BY v.id
                """, (row, index) -> new VenueTotals(row.getLong("id"), row.getString("name"),
                row.getLong("reservation_count"), row.getLong("reserved_minutes")), startDate, endDate);
    }

    public record VenueTotals(long venueId, String venueName, long reservationCount, long reservedMinutes) {
    }
}
