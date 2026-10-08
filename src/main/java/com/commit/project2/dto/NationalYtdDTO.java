package com.commit.project2.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

// /api/national 응답의 올해 누적 (진행 중인 연도의 1월 ~ 마지막 달 합계를 작년 같은 기간과 비교)
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class NationalYtdDTO {
  private String year;        // 진행 중인 연도 (예: 2026)
  private Integer month;      // 데이터가 있는 마지막 달 (예: 6 → 1~6월)
  private Double supply;      // 누적 공급량(백만㎥)
  private Double supplyYoy;   // 작년 같은 기간 대비 증감률(%)
  private Double tempDiff;    // 같은 기간 평균기온 차이(°C, 올해 - 작년)
}
