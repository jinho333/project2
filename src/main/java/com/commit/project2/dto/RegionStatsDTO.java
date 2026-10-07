package com.commit.project2.dto;

import lombok.Data;

import java.util.List;

/**
 * RegionStatsDTO — API ② GET /api/regions/{regionId}/stats?year= 의 응답 전체
 * ------------------------------------------------------------------------
 * 프론트가 기대하는 모양 (common.js 상단 주석 + region.js 소비 코드 기준):
 *   {
 *     "months":     [ { m, temp, value, forecast }, ... 12개 ],
 *     "prevMonths": [ ... 12개 또는 null ],
 *     "tempBins":   [ { label, value, days }, ... 12개 ],
 *     "popQ":       [ { label, value }, ... 2021.Q1 ~ 2026.Q2 (22개) ],
 *     "popCorr":    0.42
 *   }
 *
 * 왜 "통계 묶음" 만 담는지:
 *   - 지역의 id, name 은 API ① 응답에 이미 있고, 프론트가 D.findRegion(regionId) 로 꺼내 씀.
 *   - 중복해서 보내지 않기 위해 여기엔 통계만 넣음.
 *
 * 응답 보장:
 *   - months, tempBins, popQ 는 항상 길이가 정해져 있음 (12 / 12 / 22) → 프론트가 분기 처리 안 해도 됨.
 *   - prevMonths 는 "전년 데이터가 없을 때"(= 2021년 선택 시) 만 null. region.js 가 null 체크함.
 */
@Data
public class RegionStatsDTO {
  /** 선택한 연도의 12개월 데이터. 2026은 1~6월 실적 + 7~12월 forecast=true. */
  private List<MonthDTO> months;

  /** 전년도 12개월 데이터. 2021년 선택 시엔 null 로 응답 (전년 데이터 없음). */
  private List<MonthDTO> prevMonths;

  /** 선택 연도 12개월을 3°C 간격 12구간으로 묶은 결과. (region.js 기온 구간 차트) */
  private List<TempBinDTO> tempBins;

  /** 2021.Q1 ~ 2026.Q2 분기별 평균 인구. 선택 연도와 무관하게 전체 기간을 보여줌. */
  private List<PopQDTO> popQ;

  /** (월별 인구) ↔ (월별 공급량) 피어슨 상관계수.
   *  전체 기간 월별 데이터로 계산. -1 ~ 1 범위. */
  private Double popCorr;
}
