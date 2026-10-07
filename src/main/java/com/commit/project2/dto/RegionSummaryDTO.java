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
 * ⚠️ 공통 계약과의 간극 (분석 리포트 §3-2 참고):
 *   common.js 주석은 ①에서 mape, trend, lo, hi, sensitivity 까지 돌려주길 기대함.
 *   현재는 미제공 → 프론트의 MAPE 배지가 비어 보임. 추후 팀 합의 후 필드 추가 예정.
 */
@Data
public class RegionSummaryDTO {
  /** 지역 ID. common.js 가 r.id 로 읽고, API ② 경로(/api/regions/{id}/stats) 에도 들어감. */
  private Long id;

  /** 지역 이름(짧은 형태). 지도 타일에 표시되고, common.js TILE_POS 키와 일치해야 함. */
  private String name;

  /** 2025년 연간 공급량. 단위: 백만㎥. (지도 색칠 / 전국 비중 계산에 사용) */
  private Double supply;

  /** 2025년 평균 인구. 단위: 만 명. (region.js의 1인당 공급량 계산에 사용) */
  private Double pop;
}
