package com.example.venuebooking.repository;

import com.example.venuebooking.domain.Reservation;
import com.example.venuebooking.domain.ReservationStatus;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Optional;

public interface ReservationRepository extends JpaRepository<Reservation, Long> {

    List<Reservation> findAllByOrderByIdDesc();

    @Query("""
            select r from Reservation r
            where r.venue.id = :venueId
              and r.reservationDate = :reservationDate
              and r.status = :status
              and r.startTime < :requestedEndTime
              and r.endTime > :requestedStartTime
            """)
    List<Reservation> findConflicts(
            @Param("venueId") Long venueId,
            @Param("reservationDate") LocalDate reservationDate,
            @Param("status") ReservationStatus status,
            @Param("requestedStartTime") LocalTime requestedStartTime,
            @Param("requestedEndTime") LocalTime requestedEndTime);

    @Query("select r from Reservation r join fetch r.venue where r.id = :id")
    Optional<Reservation> findByIdWithVenue(@Param("id") Long id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from Reservation r where r.id = :id")
    Optional<Reservation> findByIdForUpdate(@Param("id") Long id);
}
