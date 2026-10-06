package com.commit.project2.controller;

import com.commit.project2.dto.RegionSummaryDTO;
import com.commit.project2.service.RegionService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/regions")
public class RegionApiController {
  private final RegionService regionService;

  //① GET /api/regions -> 지역목록 + 2025년 연간 공급량, 인구
  @GetMapping()
  public List<RegionSummaryDTO> getRegionSummaries(){
    return regionService.getRegionSummaries();
  }

}
