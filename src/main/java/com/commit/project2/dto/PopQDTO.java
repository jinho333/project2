package com.commit.project2.dto;

import lombok.Data;

/**
 * PopQDTO — API ② 응답의 popQ 배열 요소 ("한 분기치" 인구)
 * ------------------------------------------------------
 * 프론트가 기대하는 모양 (region.js: p.label, p.value):
 *   { label: '21.Q1', value: 941.2 }
 *
 * popQ 는 2021-Q1 ~ 2026-Q2 (총 22개) 분기 데이터 배열.
 *   한 분기 값 = 해당 분기 3개월의 "평균 인구"
 *   단위는 만 명 (region.js 툴팁 "941 만 명" 과 일치)
 *
 * 왜 "분기별" 로 보여주는지:
 *   - 월별로 그리면 선이 너무 촘촘해서 추세가 안 보임.
 *   - 분기로 묶으면 ~5년 치가 22점 정도라 변화 흐름이 눈에 잘 들어옴.
 *   - region.js 의 x축 ticks 는 4분기마다(= 1년) 라벨 하나만 표시.
 */
@Data
public class PopQDTO {
  /** 분기 라벨. '21.Q1' 처럼 2자리 연도 + 분기 번호. */
  private String label;

  /** 분기 평균 인구. 단위: 만 명. */
  private Double value;
}
