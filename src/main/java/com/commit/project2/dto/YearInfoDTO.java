package com.commit.project2.dto;

import lombok.Data;

import java.util.List;

// GET /api/regions/years 응답 — 연도 버튼에 쓸 연도 목록과 기준 연도
@Data
public class YearInfoDTO {
  private List<Integer> years;   // 데이터가 있는 연도 전체  예) [2021, 2022, ..., 2026]
  private Integer baseYear;      // 12개월이 모두 있는 가장 최근 연도  예) 2025
}
