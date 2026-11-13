package com.example.venuebooking.repository;

import com.example.venuebooking.domain.ReportRun;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface ReportRunRepository extends JpaRepository<ReportRun, String> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select run from ReportRun run where run.jobId = :jobId")
    Optional<ReportRun> findByJobIdForUpdate(@Param("jobId") String jobId);
}
