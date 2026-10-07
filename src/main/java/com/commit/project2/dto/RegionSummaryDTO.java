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
}
