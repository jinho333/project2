package com.commit.project2.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

// /api/national 응답의 연도별 추이 한 줄 (전국 통계 페이지의 연도별 공급량·평균기온 차트용)
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class NationalYearDTO {
  private String year;        // 연도 (예: 2025)
  private Double supply;      // 연간 공급량(백만㎥)
  private Double avgTemp;     // 연평균 기온(°C)
  private Double supplyYoy;   // 전년 대비 공급량 증감률(%), 첫 연도는 null
}
