package com.commit.project2.controller;

import com.commit.project2.dto.RegionStatsDTO;
import com.commit.project2.dto.RegionSummaryDTO;
import com.commit.project2.dto.YearInfoDTO;
import com.commit.project2.service.RegionService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * RegionApiController — region 파트의 REST API 엔드포인트 모음
 * ==============================================================
 * 프론트에서 호출하는 경로:
 *   ① GET /api/regions                       → 지역 목록
 *   ② GET /api/regions/{regionId}/stats      → 선택 지역·연도 통계 묶음
 *      GET /api/regions/years                 → 연도 목록 + 기준 연도
 *
 * @RestController      : 모든 메서드 반환값을 JSON 으로 바로 응답
 * @RequiredArgsConstructor : final 필드 생성자 자동 생성 (스프링이 regionService 주입)
 * @RequestMapping      : 이 컨트롤러 안의 모든 경로 앞에 "/api/regions" 접두어가 붙음
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/regions")
public class RegionApiController {

  private final RegionService regionService;


  /* ============================================================
   *  API ①  GET /api/regions
   *    - 기준 연도(12개월이 모두 있는 가장 최근 연도) 기준 17개 시·도 요약 (id, name, supply, pop)
   *    - 모든 페이지(지도·검색)의 "데이터 뼈대" → 가장 먼저 호출됨
   * ============================================================ */
  @GetMapping
  public List<RegionSummaryDTO> getRegionSummaries() {
    return regionService.getRegionSummaries();
  }


  /* ============================================================
   *  GET /api/regions/years
   *    - 연도 버튼에 쓸 연도 목록(years)과 처음 선택할 기준 연도(baseYear)
   *    - 응답 예: { "years": [2021, 2022, 2023, 2024, 2025, 2026], "baseYear": 2025 }
   *    - 연도를 JS 에 직접 적지 않으려고 만든 API (데이터가 늘면 자동으로 따라감)
   * ============================================================ */
  @GetMapping("/years")
  public YearInfoDTO getYearInfo() {
    return regionService.getYearInfo();
  }


  /* ============================================================
   *  API ②  GET /api/regions/{regionId}/stats?year=
   *    - 지역 상세 페이지(region.js) 가 지역·연도 변경 때마다 호출
   *    - 응답 구조는 RegionStatsDTO 참고
   *
   *  @PathVariable  : URL 의 {regionId} 자리의 값을 꺼내 매개변수로 주입
   *                   → 예) /api/regions/1/stats  이면 regionId=1
   *  @RequestParam  : 쿼리스트링 ?year=2025 값을 매개변수로 주입
   *                   required = false : ?year= 를 안 보내도 에러가 나지 않고 null 이 들어옴
   *                   → null 이면 기준 연도를 사용 (예전에는 defaultValue="2025" 로 고정이었음)
   *                   null 을 담아야 해서 int 가 아니라 Integer 로 받음
   *
   *  반환은 그대로 JSON 으로 직렬화되어 응답 → RegionStatsDTO 의 필드명이 곧 JSON 키 이름
   *  (프론트 common.js 상단 주석의 '계약서' 와 일치시킬 것)
   * ============================================================ */
  @GetMapping("/{regionId}/stats")
  public RegionStatsDTO getRegionStats(@PathVariable("regionId") Long regionId,
                                       @RequestParam(value = "year", required = false) Integer year) {
    regionService.checkRegion(regionId);   // 없는 지역 번호면 여기서 404 (아래 코드는 실행되지 않음)
    if (year == null) {
      year = regionService.getYearInfo().getBaseYear();   // 연도를 안 보냈으면 기준 연도
    }
    return regionService.getRegionStats(regionId, year);
  }
}
