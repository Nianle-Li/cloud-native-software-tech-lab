package com.example.venuebooking;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.stream.StreamSupport;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class BookingApiIntegrationTest {

    private static final ZoneId BUSINESS_ZONE = ZoneId.of("Asia/Shanghai");

    static {
        System.setProperty("api.version", "1.40");
    }

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16.15-bookworm")
            .withDatabaseName("venue_booking_test")
            .withUsername("venue_booking_test")
            .withPassword("venue_booking_test_password");

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) {
        registry.add("SPRING_DATASOURCE_URL", POSTGRES::getJdbcUrl);
        registry.add("SPRING_DATASOURCE_USERNAME", POSTGRES::getUsername);
        registry.add("SPRING_DATASOURCE_PASSWORD", POSTGRES::getPassword);
    }

    @BeforeEach
    void verifyContainer() {
        assertTrue(POSTGRES.isRunning());
    }

    @Test
    void venueEndpointsValidateAndReturnLocation() throws Exception {
        mockMvc.perform(get("/api/venues"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].status", hasItem("OPEN")))
                .andExpect(jsonPath("$[*].id").isArray());

        String body = """
                {
                  "name": "测试场地",
                  "location": "测试楼",
                  "capacity": 10,
                  "open_time": "08:00",
                  "close_time": "22:00"
                }
                """;
        mockMvc.perform(post("/api/venues")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated())
                .andExpect(header().string("Location", containsString("/api/venues/")))
                .andExpect(jsonPath("$.status", is("OPEN")))
                .andExpect(jsonPath("$.open_time", is("08:00")))
                .andExpect(jsonPath("$.close_time", is("22:00")));

        mockMvc.perform(post("/api/venues")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body.replace("\"capacity\": 10", "\"capacity\": 0")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code", is("VALIDATION_ERROR")))
                .andExpect(jsonPath("$.details[*].field", hasItem("capacity")));
    }

    @Test
    void reservationCanBeCancelledRepeatedlyAndRebooked() throws Exception {
        long venueId = createVenue(10, "09:00", "18:00");
        String date = futureDate();
        String request = reservationJson(venueId, date, "10:00", "11:00", 2, "活动");

        String created = mockMvc.perform(post("/api/reservations")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(request))
                .andExpect(status().isCreated())
                .andExpect(header().string("Location", containsString("/api/reservations/")))
                .andExpect(jsonPath("$.status", is("ACTIVE")))
                .andExpect(jsonPath("$.cancelled_at").value((Object) null))
                .andReturn().getResponse().getContentAsString();
        long reservationId = objectMapper.readTree(created).get("id").asLong();

        String cancelled = mockMvc.perform(post("/api/reservations/{id}/cancel", reservationId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status", is("CANCELLED")))
                .andExpect(jsonPath("$.cancelled_at").isNotEmpty())
                .andReturn().getResponse().getContentAsString();
        String cancelledAt = objectMapper.readTree(cancelled).get("cancelled_at").asText();

        mockMvc.perform(post("/api/reservations/{id}/cancel", reservationId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status", is("CANCELLED")))
                .andExpect(jsonPath("$.cancelled_at", is(cancelledAt)));

        mockMvc.perform(post("/api/reservations")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(request))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status", is("ACTIVE")));

        mockMvc.perform(get("/api/reservations/{id}", reservationId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status", is("CANCELLED")));
    }

    @Test
    void reservationValidationConflictAndAdjacentIntervalsAreEnforced() throws Exception {
        long venueId = createVenue(3, "09:00", "18:00");
        String date = futureDate();
        String valid = reservationJson(venueId, date, "10:00", "11:00", 3, "活动");

        mockMvc.perform(post("/api/reservations")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(reservationJson(venueId, "2020-01-01", "10:00", "11:00", 1, "活动")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code", is("VALIDATION_ERROR")));

        mockMvc.perform(post("/api/reservations")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(reservationJson(venueId, date, "08:00", "09:00", 1, "活动")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code", is("VALIDATION_ERROR")));

        mockMvc.perform(post("/api/reservations")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(reservationJson(venueId, date, "10:30", "11:30", 1, "活动")))
                .andExpect(status().isCreated());

        mockMvc.perform(post("/api/reservations")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(valid))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code", is("TIME_CONFLICT")));

        mockMvc.perform(post("/api/reservations")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(reservationJson(venueId, date, "11:30", "12:00", 1, "相邻活动")))
                .andExpect(status().isCreated());

        mockMvc.perform(post("/api/reservations")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(reservationJson(999999999L, date, "13:00", "14:00", 1, "活动")))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code", is("VENUE_NOT_FOUND")));
    }

    @Test
    void closedVenueAndMalformedRequestsReturnContractErrors() throws Exception {
        String venues = mockMvc.perform(get("/api/venues"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        JsonNode closedVenue = StreamSupport.stream(objectMapper.readTree(venues).spliterator(), false)
                .filter(node -> "CLOSED".equals(node.get("status").asText()))
                .findFirst()
                .orElseThrow();

        mockMvc.perform(post("/api/reservations")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(reservationJson(closedVenue.get("id").asLong(), futureDate(), "10:00", "11:00", 1, "活动")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code", is("VENUE_CLOSED")));

        mockMvc.perform(post("/api/reservations")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"venue_id\":1"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code", is("VALIDATION_ERROR")));

        mockMvc.perform(get("/api/venues/not-a-number"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code", is("VALIDATION_ERROR")));
    }

    @Test
    void concurrentIdenticalBookingsProduceOneSuccessAndOneConflict() throws Exception {
        long venueId = createVenue(20, "09:00", "18:00");
        String request = reservationJson(venueId, futureDate(), "14:00", "15:00", 2, "并发活动");
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService executor = Executors.newFixedThreadPool(2);
        List<Future<Integer>> futures = new ArrayList<>();
        for (int i = 0; i < 2; i++) {
            futures.add(executor.submit(() -> {
                ready.countDown();
                start.await();
                return mockMvc.perform(post("/api/reservations")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(request))
                        .andReturn().getResponse().getStatus();
            }));
        }
        ready.await();
        start.countDown();
        List<Integer> statuses = new ArrayList<>();
        for (Future<Integer> future : futures) {
            statuses.add(future.get());
        }
        executor.shutdownNow();

        Collections.sort(statuses);
        assertEquals(List.of(201, 409), statuses);

        String reservations = mockMvc.perform(get("/api/reservations"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        long activeMatches = 0;
        for (JsonNode reservation : objectMapper.readTree(reservations)) {
            if (reservation.get("venue_id").asLong() == venueId
                    && "ACTIVE".equals(reservation.get("status").asText())) {
                activeMatches++;
            }
        }
        assertEquals(1, activeMatches);
    }

    @Test
    void healthEndpointReportsDatabaseHealth() throws Exception {
        mockMvc.perform(get("/actuator/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status", is("UP")))
                .andExpect(jsonPath("$.components.db.status", is("UP")));
    }

    private long createVenue(int capacity, String openTime, String closeTime) throws Exception {
        String body = "{\"name\":\"测试场地-" + System.nanoTime()
                + "\",\"location\":\"测试楼\",\"capacity\":" + capacity
                + ",\"open_time\":\"" + openTime + "\",\"close_time\":\"" + closeTime + "\"}";
        String response = mockMvc.perform(post("/api/venues")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(response).get("id").asLong();
    }

    private static String futureDate() {
        return LocalDate.now(BUSINESS_ZONE).plusDays(30).toString();
    }

    private static String reservationJson(long venueId, String date, String start, String end,
                                          int attendees, String purpose) {
        return String.format(
                "{\"venue_id\":%d,\"booked_by\":\"测试小组\",\"reservation_date\":\"%s\","
                        + "\"start_time\":\"%s\",\"end_time\":\"%s\",\"attendee_count\":%d,"
                        + "\"purpose\":\"%s\"}",
                venueId, date, start, end, attendees, purpose);
    }
}
