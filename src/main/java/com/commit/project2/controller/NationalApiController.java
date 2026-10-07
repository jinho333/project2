package com.commit.project2.controller;

import com.commit.project2.dto.NationalDTO;
import com.commit.project2.dto.NationalRegionDTO;
import com.commit.project2.service.NationalService;
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

  // ③ GET /api/national -> 전국 요약 (전년 대비 증감률, 상관계수 표)
  @GetMapping
  public NationalDTO getNationalSummary() {
    return nationalService.getNationalSummary();
  }

  // GET /api/national/regions -> 전국 통계 페이지용 17개 시·도 지표
  // (공용 /api/regions 는 지역 페이지 담당 코드라서 따로 둠)
  @GetMapping("/regions")
  public List<NationalRegionDTO> getRegions() {
    return nationalService.getRegions();
  }
}
