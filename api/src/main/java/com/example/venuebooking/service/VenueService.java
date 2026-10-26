package com.example.venuebooking.service;

import com.example.venuebooking.api.dto.CreateVenueRequest;
import com.example.venuebooking.api.dto.VenueResponse;
import com.example.venuebooking.api.error.ValidationDetail;
import com.example.venuebooking.api.error.ValidationException;
import com.example.venuebooking.api.error.VenueNotFoundException;
import com.example.venuebooking.domain.Venue;
import com.example.venuebooking.domain.VenueStatus;
import com.example.venuebooking.repository.VenueRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class VenueService {

    private final VenueRepository venueRepository;

    public VenueService(VenueRepository venueRepository) {
        this.venueRepository = venueRepository;
    }

    @Transactional(readOnly = true)
    public List<VenueResponse> list() {
        return venueRepository.findAllByOrderByIdAsc().stream()
                .map(VenueResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public VenueResponse get(Long id) {
        return VenueResponse.from(findVenue(id));
    }

    @Transactional
    public VenueResponse create(CreateVenueRequest request) {
        validateText("name", request.name(), 100);
        validateText("location", request.location(), 200);
        if (request.capacity() == null || request.capacity() <= 0) {
            throw validation("capacity", "必须大于 0");
        }
        if (request.openTime() == null || request.closeTime() == null
                || !request.openTime().isBefore(request.closeTime())) {
            throw validation("open_time", "必须早于 close_time");
        }

        Venue venue = new Venue(
                request.name(),
                request.location(),
                request.capacity(),
                request.openTime(),
                request.closeTime(),
                request.status() == null ? VenueStatus.OPEN : request.status());
        return VenueResponse.from(venueRepository.save(venue));
    }

    public Venue findVenue(Long id) {
        if (id == null || id <= 0) {
            throw validation("id", "必须为正整数");
        }
        return venueRepository.findById(id).orElseThrow(() -> new VenueNotFoundException(id));
    }

    private static void validateText(String field, String value, int maxLength) {
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
