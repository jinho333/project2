package com.commit.project2.dto;

import lombok.Data;

/**
 * TempBinDTO — API ② 응답의 tempBins 배열 요소 ("기온 구간 1칸")
 * ------------------------------------------------------------
 * 프론트가 기대하는 모양 (region.js: b.label, b.value, b.days):
 *   { label: '<−6', value: 3.1, days: 4 }
 *
 * tempBins 는 선택 연도 12개월 데이터를 "3°C 간격 12구간" 으로 묶은 결과.
 *   인덱스 0  = 가장 추운 구간 (-6°C 이하)
 *   인덱스 11 = 가장 따뜻한 구간 (24°C 이상)
 *   region.js 의 binColor 는 9 이상(=18°C 이상) 을 회색으로 처리해 "난방 수요 없음" 표시.
 *
 * 왜 월별 데이터로 구간을 만드는지 (분석 리포트 §3-3 참고):
 *   DB가 월별 집계라 "일별" 데이터가 없음. 그래서 월 평균 기온이 속한 구간에
 *   그 달의 일수(days) 와 "일평균 공급량(월 공급량 / 그 달의 일수)" 을 넣음.
 *   추후 일별 데이터가 생기면 Service 쪽만 바꾸면 되고, DTO 모양은 유지.
 */
@Data
public class TempBinDTO {
  /** 구간 라벨. 예: '<−6', '-6~-3', ..., '≥24'. x축에 그대로 표시됨. */
  private String label;

  /** 그 구간에 해당하는 날의 "일평균 공급량". 단위: 백만㎥.
   *  구간에 속한 월 여러 개면 "총 공급량 ÷ 총 일수" 로 계산. */
  private Double value;

  /** 그 구간에 속한 일 수. (툴팁에 "4일" 처럼 표시됨) */
  private Integer days;
}
