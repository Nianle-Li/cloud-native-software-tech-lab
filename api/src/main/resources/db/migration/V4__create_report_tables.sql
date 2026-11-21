CREATE TABLE report_runs (
    job_id VARCHAR(63) PRIMARY KEY,
    source VARCHAR(10) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status VARCHAR(10) NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    finished_at TIMESTAMP WITH TIME ZONE,
    generated_at TIMESTAMP WITH TIME ZONE,
    error_summary VARCHAR(500),
    CONSTRAINT ck_report_runs_job_id CHECK (job_id ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'),
    CONSTRAINT ck_report_runs_source CHECK (source IN ('MANUAL', 'SCHEDULED')),
    CONSTRAINT ck_report_runs_date_range CHECK (start_date <= end_date),
    CONSTRAINT ck_report_runs_status CHECK (status IN ('RUNNING', 'SUCCEEDED', 'FAILED')),
    CONSTRAINT ck_report_runs_lifecycle CHECK (
        (status = 'RUNNING' AND finished_at IS NULL AND generated_at IS NULL AND error_summary IS NULL)
        OR (status = 'SUCCEEDED' AND finished_at IS NOT NULL AND generated_at IS NOT NULL AND error_summary IS NULL)
        OR (status = 'FAILED' AND finished_at IS NOT NULL AND generated_at IS NULL
            AND error_summary IS NOT NULL AND btrim(error_summary) <> '')
    )
);

CREATE TABLE report_items (
    job_id VARCHAR(63) NOT NULL,
    venue_id BIGINT NOT NULL,
    venue_name VARCHAR(100) NOT NULL,
    reservation_count BIGINT NOT NULL,
    reserved_minutes BIGINT NOT NULL,
    CONSTRAINT pk_report_items PRIMARY KEY (job_id, venue_id),
    CONSTRAINT fk_report_items_run FOREIGN KEY (job_id) REFERENCES report_runs (job_id),
    CONSTRAINT fk_report_items_venue FOREIGN KEY (venue_id) REFERENCES venues (id),
    CONSTRAINT ck_report_items_count CHECK (reservation_count >= 0),
    CONSTRAINT ck_report_items_minutes CHECK (reserved_minutes >= 0)
);
