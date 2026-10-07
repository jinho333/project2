package com.commit.project2.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

// GET /api/national 응답 (전국 통계 페이지의 KPI, 상관계수 히트맵용)
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class NationalDTO {
  private Double supplyYoy;   // 전년 대비 공급량 증감률(%)
  private Double mapeDelta;   // 전분기 대비 MAPE 변화(%p), 아직 임시값
  private List<String> corrLabels;  // 상관계수 표의 변수 이름 (행·열 순서 동일)
  private List<List<Double>> corr;  // 상관계수 행렬, corr[i][j] = corrLabels[i] 와 corrLabels[j] 의 r
  private String corrPeriod;  // 상관계수 계산 기간 (예: 2021-01 ~ 2026-06)
}
