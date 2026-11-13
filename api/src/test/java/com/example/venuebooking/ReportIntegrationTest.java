package com.example.venuebooking;

import com.example.venuebooking.domain.ReportSource;
import com.example.venuebooking.service.ReportAggregation;
import com.example.venuebooking.service.ReportGenerationService;
import com.example.venuebooking.service.ReportJobRequest;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationVersion;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.sql.DriverManager;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.hamcrest.Matchers.is;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class ReportIntegrationTest {

    static {
        System.setProperty("api.version", "1.44");
    }

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16.15-bookworm")
            .withDatabaseName("venue_report_test")
            .withUsername("venue_report_test")
            .withPassword("venue_report_test_password");

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) {
        registry.add("SPRING_DATASOURCE_URL", POSTGRES::getJdbcUrl);
        registry.add("SPRING_DATASOURCE_USERNAME", POSTGRES::getUsername);
        registry.add("SPRING_DATASOURCE_PASSWORD", POSTGRES::getPassword);
    }

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper mapper;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private ReportGenerationService reports;
    @MockitoSpyBean private ReportAggregation aggregation;

    @Test
    void v4UpgradesExistingV3DataWithoutChangingBookings() throws Exception {
        String schema = "upgrade_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
        jdbc.execute("create schema " + schema);
        String url = POSTGRES.getJdbcUrl() + "&currentSchema=" + schema;
        Flyway.configure().dataSource(url, POSTGRES.getUsername(), POSTGRES.getPassword())
                .locations("classpath:db/migration")
                .target(MigrationVersion.fromVersion("3"))
                .load().migrate();
        try (var connection = DriverManager.getConnection(url, POSTGRES.getUsername(), POSTGRES.getPassword());
             var statement = connection.createStatement()) {
            statement.executeUpdate("""
                    insert into reservations (venue_id, booked_by, reservation_date, start_time, end_time,
                                              attendee_count, purpose, status)
                    values (1, '迁移测试', '2026-11-01', '10:00', '11:00', 1, '保留预约', 'ACTIVE')
                    """);
        }
        Flyway.configure().dataSource(url, POSTGRES.getUsername(), POSTGRES.getPassword())
                .locations("classpath:db/migration")
                .load().migrate();
        try (var connection = DriverManager.getConnection(url, POSTGRES.getUsername(), POSTGRES.getPassword());
             var statement = connection.createStatement()) {
            try (var result = statement.executeQuery("select count(*) from reservations")) {
                assertTrue(result.next());
                assertEquals(1, result.getInt(1));
            }
            try (var result = statement.executeQuery("select count(*) from report_runs")) {
                assertTrue(result.next());
                assertEquals(0, result.getInt(1));
            }
        }
    }

    @Test
    void migrationAndReportSnapshotIncludeZeroVenuesAndOnlyActiveBookings() throws Exception {
        assertEquals("4", jdbc.queryForObject(
                "select max(version) from flyway_schema_history where success", String.class));
        long venue = venue("统计场地");
        LocalDate date = LocalDate.of(2026, 11, 1);
        reservation(venue, date, "10:00", "11:30", "ACTIVE");
        reservation(venue, date.plusDays(1), "13:00", "13:45", "ACTIVE");
        reservation(venue, date, "16:00", "17:00", "CANCELLED");
        reservation(venue, date.minusDays(1), "10:00", "11:00", "ACTIVE");

        String first = id();
        reports.generate(manual(first, date, date.plusDays(1)));
        JsonNode snapshot = response(first);
        assertEquals("SUCCEEDED", snapshot.get("status").asText());
        assertEquals("MANUAL", snapshot.get("source").asText());
        assertEquals(date.toString(), snapshot.get("start_date").asText());
        assertEquals(date.plusDays(1).toString(), snapshot.get("end_date").asText());
        assertTrue(snapshot.get("error_summary").isNull());
        assertEquals("+08:00", OffsetDateTime.parse(snapshot.get("started_at").asText()).getOffset().toString());
        assertEquals("+08:00", OffsetDateTime.parse(snapshot.get("finished_at").asText()).getOffset().toString());
        assertEquals("+08:00", OffsetDateTime.parse(snapshot.get("generated_at").asText()).getOffset().toString());
        assertEquals(4, snapshot.get("items").size());
        JsonNode item = item(snapshot, venue);
        assertEquals("统计场地", item.get("venue_name").asText());
        assertEquals(2, item.get("reservation_count").asLong());
        assertEquals(135, item.get("reserved_minutes").asLong());
        for (JsonNode candidate : snapshot.get("items")) {
            if (candidate.get("venue_id").asLong() != venue) {
                assertEquals(0, candidate.get("reservation_count").asLong());
                assertEquals(0, candidate.get("reserved_minutes").asLong());
            }
        }
        for (int i = 1; i < snapshot.get("items").size(); i++) {
            assertTrue(snapshot.get("items").get(i - 1).get("venue_id").asLong()
                    < snapshot.get("items").get(i).get("venue_id").asLong());
        }

        reservation(venue, date, "18:00", "19:00", "ACTIVE");
        jdbc.update("update venues set name = '场地改名后' where id = ?", venue);
        reports.generate(manual(first, date, date.plusDays(1)));
        assertEquals(snapshot, response(first));
        assertEquals(4, jdbc.queryForObject(
                "select count(*) from report_items where job_id = ?", Integer.class, first));

        String second = id();
        reports.generate(manual(second, date, date.plusDays(1)));
        assertEquals("场地改名后", item(response(second), venue).get("venue_name").asText());
        assertEquals(3, item(response(second), venue).get("reservation_count").asLong());
        assertEquals(195, item(response(second), venue).get("reserved_minutes").asLong());
        assertNotEquals(snapshot, response(second));
    }

    @Test
    void runningFailureAndRetryExposeCorrectState() throws Exception {
        LocalDate date = LocalDate.of(2026, 10, 1);
        String running = id();
        jdbc.update("insert into report_runs (job_id, source, start_date, end_date, status, started_at) "
                + "values (?, 'MANUAL', ?, ?, 'RUNNING', now())", running, date, date);
        JsonNode inProgress = response(running);
        assertEquals("RUNNING", inProgress.get("status").asText());
        assertTrue(inProgress.get("finished_at").isNull());
        assertTrue(inProgress.get("generated_at").isNull());
        assertTrue(inProgress.get("error_summary").isNull());
        assertEquals(0, inProgress.get("items").size());

        String failed = id();
        doThrow(new IllegalStateException("sensitive database detail"))
                .when(aggregation).aggregate(any(), any());
        assertThrows(IllegalStateException.class,
                () -> reports.generate(manual(failed, date, date)));
        JsonNode failure = response(failed);
        assertEquals("FAILED", failure.get("status").asText());
        assertEquals("报告生成失败，请查看 Job 日志", failure.get("error_summary").asText());
        assertTrue(failure.get("generated_at").isNull());
        assertTrue(failure.get("finished_at").isTextual());
        assertEquals(0, failure.get("items").size());
        org.mockito.Mockito.reset(aggregation);

        reports.generate(manual(failed, date, date));
        assertEquals("SUCCEEDED", response(failed).get("status").asText());
        assertTrue(response(failed).get("error_summary").isNull());

        String staleScheduled = id();
        jdbc.update("insert into report_runs (job_id, source, start_date, end_date, status, started_at) "
                + "values (?, 'SCHEDULED', ?, ?, 'RUNNING', now())", staleScheduled, date, date);
        reports.generate(new ReportJobRequest(staleScheduled, ReportSource.SCHEDULED,
                date.plusDays(1), date.plusDays(1)));
        JsonNode resumed = response(staleScheduled);
        assertEquals("SUCCEEDED", resumed.get("status").asText());
        assertEquals(date.toString(), resumed.get("start_date").asText());
        assertEquals(date.toString(), resumed.get("end_date").asText());
    }

    @Test
    void conflictingParametersCannotOverwriteSuccessfulOrRunningReport() throws Exception {
        LocalDate date = LocalDate.of(2026, 9, 1);
        String job = id();
        reports.generate(manual(job, date, date));
        JsonNode original = response(job);
        assertThrows(IllegalArgumentException.class,
                () -> reports.generate(manual(job, date, date.plusDays(1))));
        assertThrows(IllegalArgumentException.class,
                () -> reports.generate(new ReportJobRequest(job, ReportSource.SCHEDULED,
                        date, date)));
        assertEquals(original, response(job));
    }

    @Test
    void sameJobIdConcurrentExecutionWritesOneSetOfItems() throws Exception {
        String job = id();
        LocalDate date = LocalDate.of(2026, 8, 1);
        ReportJobRequest request = manual(job, date, date);
        CountDownLatch start = new CountDownLatch(1);
        var workers = Executors.newFixedThreadPool(2);
        try {
            var first = workers.submit(() -> { start.await(); reports.generate(request); return true; });
            var second = workers.submit(() -> { start.await(); reports.generate(request); return true; });
            start.countDown();
            assertTrue(first.get(30, TimeUnit.SECONDS));
            assertTrue(second.get(30, TimeUnit.SECONDS));
        } finally {
            workers.shutdownNow();
        }
        assertEquals("SUCCEEDED", response(job).get("status").asText());
        assertEquals(1, jdbc.queryForObject(
                "select count(*) from report_runs where job_id = ?", Integer.class, job));
        assertEquals(jdbc.queryForObject("select count(*) from venues", Integer.class),
                jdbc.queryForObject("select count(*) from report_items where job_id = ?", Integer.class, job));
    }

    @Test
    void reportErrorsAndInstanceFollowPublicApiContract() throws Exception {
        mockMvc.perform(get("/api/reports/{jobId}", "INVALID_ID"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code", is("VALIDATION_ERROR")))
                .andExpect(jsonPath("$.details[0].field", is("job_id")));
        mockMvc.perform(get("/api/reports/{jobId}", id()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code", is("REPORT_NOT_FOUND")));
        mockMvc.perform(get("/api/instance"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.instance_id").isNotEmpty());
    }

    private long venue(String name) {
        return jdbc.queryForObject("""
                insert into venues (name, location, capacity, open_time, close_time, status)
                values (?, '测试楼', 20, '08:00', '22:00', 'OPEN') returning id
                """, Long.class, name);
    }

    private void reservation(long venue, LocalDate date, String start, String end, String status) {
        jdbc.update("""
                insert into reservations (venue_id, booked_by, reservation_date, start_time, end_time,
                                          attendee_count, purpose, status, cancelled_at)
                values (?, '测试人员', ?, ?::time, ?::time, 1, '报告测试', ?,
                        case when ? = 'CANCELLED' then now() else null end)
                """, venue, date, start, end, status, status);
    }

    private static ReportJobRequest manual(String job, LocalDate start, LocalDate end) {
        return new ReportJobRequest(job, ReportSource.MANUAL, start, end);
    }

    private static String id() {
        return "report-test-" + UUID.randomUUID().toString().substring(0, 12);
    }

    private JsonNode response(String job) throws Exception {
        return mapper.readTree(mockMvc.perform(get("/api/reports/{jobId}", job))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
    }

    private static JsonNode item(JsonNode report, long venue) {
        for (JsonNode candidate : report.get("items")) {
            if (candidate.get("venue_id").asLong() == venue) return candidate;
        }
        throw new AssertionError("报告缺少场地 " + venue);
    }
}
