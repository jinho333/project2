package com.commit.project2.controller;

import com.commit.project2.dto.NationalDTO;
import com.commit.project2.dto.RegionSummaryDTO;
import com.commit.project2.service.NationalService;
import com.commit.project2.service.RegionService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/national")
public class NationalApiController {
  private final NationalService nationalService;
  private final RegionService regionService;   // /regions 는 region 쪽 공급원을 재사용

  // GET /api/national -> 전국 요약 (기준 연도, 전년 대비 증감률, 연도별 추이, 상관계수 표)
  @GetMapping
  public NationalDTO getNationalSummary() {
    return nationalService.getNationalSummary();
  }

  // GET /api/national/regions -> /api/regions 와 동일한 지역 지표 (얇은 래퍼)
  //  - NationalRegionDTO·NationalService.getRegions 를 폐기하고 RegionService 로 통합 (2026-10-08)
  //  - URL 은 한동안 유지해 national.js 가 깨지지 않게 함 → 팀원 2 가 /api/regions 로 전환하면 이 메서드도 삭제 예정
  @GetMapping("/regions")
  public List<RegionSummaryDTO> getRegions() {
    return regionService.getRegionSummaries();
  }
}
