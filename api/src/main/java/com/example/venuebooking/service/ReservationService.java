package com.example.venuebooking.service;

import com.example.venuebooking.api.dto.CreateReservationRequest;
import com.example.venuebooking.api.dto.ReservationResponse;
import com.example.venuebooking.api.error.ReservationNotFoundException;
import com.example.venuebooking.api.error.TimeConflictException;
import com.example.venuebooking.api.error.ValidationDetail;
import com.example.venuebooking.api.error.ValidationException;
import com.example.venuebooking.api.error.VenueClosedException;
import com.example.venuebooking.config.TimeConfiguration;
import com.example.venuebooking.domain.Reservation;
import com.example.venuebooking.domain.ReservationStatus;
import com.example.venuebooking.domain.Venue;
import com.example.venuebooking.domain.VenueStatus;
import com.example.venuebooking.repository.ReservationRepository;
import com.example.venuebooking.repository.VenueRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;

@Service
public class ReservationService {

    private final ReservationRepository reservationRepository;
    private final VenueRepository venueRepository;
    private final Clock businessClock;

    public ReservationService(ReservationRepository reservationRepository,
                              VenueRepository venueRepository,
                              Clock businessClock) {
        this.reservationRepository = reservationRepository;
        this.venueRepository = venueRepository;
        this.businessClock = businessClock;
    }

    @Transactional(readOnly = true)
    public List<ReservationResponse> list() {
        return reservationRepository.findAllByOrderByIdDesc().stream()
                .map(ReservationResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public ReservationResponse get(Long id) {
        return ReservationResponse.from(findReservation(id));
    }

    @Transactional
    public ReservationResponse create(CreateReservationRequest request) {
        validateRequestText("booked_by", request.bookedBy(), 100);
        validateRequestText("purpose", request.purpose(), 500);
        if (request.venueId() == null || request.venueId() <= 0) {
            throw validation("venue_id", "必须为正整数");
        }
        if (request.attendeeCount() == null || request.attendeeCount() <= 0) {
            throw validation("attendee_count", "必须大于 0");
        }
        if (request.reservationDate() == null) {
            throw validation("reservation_date", "不能为空");
        }
        if (request.startTime() == null || request.endTime() == null
                || !request.startTime().isBefore(request.endTime())) {
            throw validation("start_time", "必须早于 end_time");
        }

        Venue venue = venueRepository.findByIdForUpdate(request.venueId())
                .orElseThrow(() -> new com.example.venuebooking.api.error.VenueNotFoundException(request.venueId()));
        validateReservationWindow(request, venue);

        if (!reservationRepository.findConflicts(
                venue.getId(),
                request.reservationDate(),
                ReservationStatus.ACTIVE,
                request.startTime(),
                request.endTime()).isEmpty()) {
            throw new TimeConflictException();
        }

        Reservation reservation = new Reservation(
                venue,
                request.bookedBy(),
                request.reservationDate(),
                request.startTime(),
                request.endTime(),
                request.attendeeCount(),
                request.purpose(),
                ReservationStatus.ACTIVE,
                databaseTimestamp(),
                null);
        return ReservationResponse.from(reservationRepository.save(reservation));
    }

    @Transactional
    public ReservationResponse cancel(Long id) {
        Reservation reservationReference = reservationRepository.findByIdWithVenue(id)
                .orElseThrow(() -> new ReservationNotFoundException(id));
        venueRepository.findByIdForUpdate(reservationReference.getVenue().getId())
                .orElseThrow(() -> new com.example.venuebooking.api.error.VenueNotFoundException(
                        reservationReference.getVenue().getId()));
        Reservation reservation = reservationRepository.findByIdForUpdate(id)
                .orElseThrow(() -> new ReservationNotFoundException(id));
        if (reservation.getStatus() == ReservationStatus.CANCELLED) {
            return ReservationResponse.from(reservation);
        }
        reservation.cancel(databaseTimestamp());
        return ReservationResponse.from(reservationRepository.save(reservation));
    }

    private OffsetDateTime databaseTimestamp() {
        return OffsetDateTime.now(businessClock).truncatedTo(ChronoUnit.MICROS);
    }

    private Reservation findReservation(Long id) {
        if (id == null || id <= 0) {
            throw validation("id", "必须为正整数");
        }
        return reservationRepository.findByIdWithVenue(id)
                .orElseThrow(() -> new ReservationNotFoundException(id));
    }

    private void validateReservationWindow(CreateReservationRequest request, Venue venue) {
        if (venue.getStatus() != VenueStatus.OPEN) {
            throw new VenueClosedException();
        }
        if (request.attendeeCount() > venue.getCapacity()) {
            throw validation("attendee_count", "不能超过场地容量");
        }
        if (request.startTime().isBefore(venue.getOpenTime())) {
            throw validation("start_time", "不能早于场地开放时间");
        }
        if (request.endTime().isAfter(venue.getCloseTime())) {
            throw validation("end_time", "不能晚于场地关闭时间");
        }

        LocalDate today = LocalDate.now(businessClock);
        if (request.reservationDate().isBefore(today)) {
            throw validation("reservation_date", "不能早于当前日期");
        }
        if (request.reservationDate().isEqual(today)
                && !request.startTime().isAfter(LocalTime.now(businessClock))) {
            throw validation("start_time", "当天预约的开始时间必须晚于当前时间");
        }
    }

    private static void validateRequestText(String field, String value, int maxLength) {
        if (value == null || value.isBlank()) {
            throw validation(field, "不能为空白");
        }
        if (value.length() > maxLength) {
            throw validation(field, "长度不能超过 " + maxLength);
        }
    }

    private static ValidationException validation(String field, String reason) {
        return new ValidationException("请求字段无效", List.of(new ValidationDetail(field, reason)));
    }
}
