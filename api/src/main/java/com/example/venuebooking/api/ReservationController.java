package com.example.venuebooking.api;

import com.example.venuebooking.api.dto.CreateReservationRequest;
import com.example.venuebooking.api.dto.ReservationResponse;
import com.example.venuebooking.service.ReservationService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Positive;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.util.List;

@Validated
@RestController
@RequestMapping("/api/reservations")
public class ReservationController {

    private final ReservationService reservationService;

    public ReservationController(ReservationService reservationService) {
        this.reservationService = reservationService;
    }

    @GetMapping
    public List<ReservationResponse> list() {
        return reservationService.list();
    }

    @GetMapping("/{id}")
    public ReservationResponse get(@PathVariable @Positive Long id) {
        return reservationService.get(id);
    }

    @PostMapping
    public ResponseEntity<ReservationResponse> create(@Valid @RequestBody CreateReservationRequest request) {
        ReservationResponse response = reservationService.create(request);
        URI location = URI.create("/api/reservations/" + response.id());
        return ResponseEntity.created(location).body(response);
    }

    @PostMapping("/{id}/cancel")
    public ReservationResponse cancel(@PathVariable @Positive Long id) {
        return reservationService.cancel(id);
    }
}
