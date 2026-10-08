package com.commit.project2.dto;

import lombok.Data;

/**
 * RegionSummaryDTO — API ① GET /api/regions 의 응답 1건을 담는 DTO
 * ----------------------------------------------------------------
 * 응답 모양 (프론트 common.js 상단 주석의 '계약서'):
 *   [ { id, name, supply, pop }, ...17개 ]
 *
 * 왜 RegionDTO 와 분리했는지:
 *   - 프론트 코드(common.js/forecast.js/national.js/region.js)는 r.id, r.name, r.supply, r.pop
 *     처럼 짧은 키를 기대함. RegionDTO에 GasDTO를 끼워 넣으면 r.supply → r.gasDTO.supply 로
 *     JS 를 전부 고쳐야 하고, id/name 도 regionId/regionName 으로 나가서 어긋남.
 *   - 그래서 "응답 전용" DTO 로 따로 둬서 프론트 코드와 맞춤.
 *
 * 단위 규약 (common.js 와 반드시 일치해야 함):
 *   - supply : 백만㎥   (DB가 만㎥ 단위라 쿼리에서 /1000 함)
 *   - pop    : 만 명    (DB가 명 단위라 쿼리에서 /10000 함)
 *
 * 공통 계약(common.js) 과의 매핑 현황:
 *   ✅ supply / pop   — region-mapper.xml getRegionSummaries 쿼리에서 세팅
 *   ✅ lo / hi        — RegionService 가 getTempRanges 쿼리 결과를 주입 (다년 평년값)
 *   ✅ trend          — 같은 getTempRanges 에서 "기준연도 평균인구 / 전년도 평균인구 − 1" (%) 로 계산
 *   ✅ mape           — RegionService 가 FastAPI GET /mape 응답을 지역명으로 매칭해 주입
 *                       (FastAPI 가 꺼져 있으면 try-catch 로 null 유지)
 *   ✅ sensitivity    — RegionService 가 FastAPI /mape 응답에서 받아 주입
 *                       (FastAPI 가 꺼져 있으면 mape 와 함께 null 유지)
 */
@Data
public class RegionSummaryDTO {
  //Region 응답용 DTO 생성 -> common.js/forecast.js/national.js/region.js의 r.id, r.name, r.supply, r.pop의 형태를 유지하기 위해서
  //Region DTO에 GasDTO 추가시 r.supply → r.gasDTO.supply 형식으로 JS를 수정해야 하고,
  //id/name도 regionId/regionName으로 나가기 때문에 응답용 DTO 생성이 유리하다고 판단.
  // api/regions에서 사용할 DTO
  private Long id;  //r.id
  private String name; //r.name
  private Double supply; //r.supply (연간 공급량, 백만㎥)
  private Double pop; //r.pop (인구, 만 명)
  private Double lo;   //r.lo (1월 평균기온) → 시뮬레이션 슬라이더 처음 위치
  private Double hi;   //r.hi (8월 평균기온)
  private Double trend; //r.trend (인구 증감률, %/년) → 예측 페이지 '예측 입력' 카드
  private Double mape;  //r.mape (예측 오차율, %) → 지역 이름 옆 MAPE 배지. FastAPI 모델이 계산한 값
  private Double sensitivity; //r.sensitivity (겨울 1°C 하락 시 공급량 증가율, %)
                              // → FastAPI /mape 응답에 포함된 값. 서버 꺼져 있으면 null
}
