package com.commit.project2.dto;

import lombok.Data;

/**
 * MonthDTO — API ② 응답의 months / prevMonths 배열에 들어가는 "한 달치" 묶음
 * -----------------------------------------------------------------------
 * 프론트가 기대하는 모양 (region.js: d.m, d.temp, d.value, d.forecast):
 *   { m: 0, temp: -2.4, value: 812.3, forecast: false }
 *
 * 왜 GasDTO(DB 한 줄)와 분리했는지:
 *   - 키 이름이 다름 (DB는 ym/avgTemp/supply, 프론트는 m/temp/value).
 *   - 월 표기가 다름 (DB의 YM='2025-01' → 프론트는 m=0).
 *   - 단위 환산 (supply ÷ 1000 = value).
 *   - "실적"과 "예측"을 forecast 플래그로 같은 그릇에 담아 화면이 색만 다르게 그리게 함.
 *
 * 2026년 특수 처리 (DB에 2026-01 ~ 2026-06 만 있음):
 *   - 1~6월은 DB 실적 그대로 (forecast=false)
 *   - 7~12월은 RegionService 에서 "전년 동월(2025년 같은 달) 값"을 복제해 채움 (forecast=true)
 *   - 결과적으로 months 배열은 항상 12개로 응답 → 프론트가 월별 차트를 안정적으로 그릴 수 있음
 *   - 예측 월은 region.js 에서 '-soft' 접미사가 붙은 CSS 변수로 연하게 색칠됨
 */
@Data
public class MonthDTO {
  /** 월 (0 = 1월, 11 = 12월). 프론트의 배열 인덱스와 바로 일치시키려고 0부터 셈. */
  private Integer m;

  /** 그 달의 평균 기온. 단위: °C. (region.js 툴팁 "평균 -2.4°C" 에 사용) */
  private Double temp;

  /** 그 달의 공급량. 단위: 백만㎥. (y축 값 / KPI "연간 공급량" 합계에 사용) */
  private Double value;

  /** 예측값이면 true, DB 실적값이면 false (기본값).
   *  → 2026년 7~12월만 true, 나머지는 전부 false 로 응답. */
  private boolean forecast;
}
