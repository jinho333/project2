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
  private String year;        // 기준 연도 (12개월이 모두 있는 가장 최근 연도, 화면의 '2025' 같은 표시에 사용)
  private Double supplyYoy;   // 전년 대비 공급량 증감률(%)
  private List<NationalYearDTO> annual;  // 연도별 공급량·평균기온 (12개월이 모두 있는 연도만, 오래된 순)
  private Double mapeDelta;   // 전분기 대비 MAPE 변화(%p), FastAPI 가 계산 (서버가 꺼져 있으면 null)
  private List<String> corrLabels;  // 상관계수 표의 변수 이름 (행·열 순서 동일)
  private List<List<Double>> corr;  // 상관계수 행렬, corr[i][j] = corrLabels[i] 와 corrLabels[j] 의 r
  private List<List<Double>> corrYoy;  // 전년 동월 대비 변화로 계산한 상관계수 행렬 (작년 같은 달과의 차이끼리 계산, corrLabels 와 같은 순서)
  private String corrPeriod;  // 상관계수 계산 기간 (예: 2021-01 ~ 2026-06)
}
