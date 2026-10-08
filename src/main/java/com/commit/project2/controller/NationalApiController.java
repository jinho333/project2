package com.commit.project2.controller;

import com.commit.project2.dto.NationalDTO;
import com.commit.project2.service.NationalService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

// 전국 통계 페이지(national.js)가 부르는 API. 계산은 NationalService 가 하고, 여기서는 주소와 서비스만 이어줌
// 화면 주소(/national)는 DashboardController 가 맡음
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/national")
public class NationalApiController {
  private final NationalService nationalService;

  // GET /api/national -> 전국 요약 (기준 연도, 전년 대비 증감률, 연도별 추이, 상관계수 표)
  @GetMapping
  public NationalDTO getNationalSummary() {
    return nationalService.getNationalSummary();
  }
  // 시·도별 지표는 공용 GET /api/regions (RegionApiController) 를 씀
}
