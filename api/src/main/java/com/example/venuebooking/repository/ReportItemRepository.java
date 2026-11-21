package com.example.venuebooking.repository;

import com.example.venuebooking.domain.ReportItem;
import com.example.venuebooking.domain.ReportItemId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface ReportItemRepository extends JpaRepository<ReportItem, ReportItemId> {

    List<ReportItem> findByIdJobIdOrderByIdVenueIdAsc(String jobId);

    @Modifying
    @Query("delete from ReportItem item where item.id.jobId = :jobId")
    void deleteByJobId(@Param("jobId") String jobId);
}
