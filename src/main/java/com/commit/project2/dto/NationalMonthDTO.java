package com.commit.project2.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

// /api/national 응답의 월별 한 줄 (전국 통계 페이지의 월별 공급량 곡선용, 진행 중인 연도 포함)
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class NationalMonthDTO {
  private String ym;        // 연월 (예: 2026-03)
  private Double supply;    // 월 공급량(백만㎥)
  private Double avgTemp;   // 월평균 기온(°C)
}
