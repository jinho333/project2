package com.commit.project2.dto;

import lombok.Data;

/**
 * RegionDTO — DB의 REGION 테이블 한 줄을 그대로 담는 "원본 모양" DTO
 * ----------------------------------------------------------------
 * 쓰임:
 *   - RegionMapper.getRegions() 결과 매핑 (region-mapper.xml의 <resultMap id="region">)
 *   - ForecastService 등 서버 내부에서 "지역 ID ↔ 지역 이름" 변환이 필요할 때 사용
 *
 * 왜 응답용(RegionSummaryDTO)과 분리했는지:
 *   - 프론트(common.js/region.js)는 r.id, r.name, r.supply, r.pop 처럼 짧은 키를 기대함.
 *   - 반면 DB 컬럼명(REGION_ID / REGION_NAME)과 그대로 매핑하면 프로퍼티명이
 *     regionId / regionName 이 되어 JS 키 이름과 어긋남.
 *   - 그래서 내부 처리용(RegionDTO)과 외부 응답용(RegionSummaryDTO)을 나눔.
 *
 * @Data (Lombok): getter/setter/toString/equals/hashCode 자동 생성.
 */
@Data
public class RegionDTO {
  /** DB REGION 테이블의 REGION_ID. 숫자 PK. (예: 1=서울, 2=부산 ...) */
  private Long regionId;

  /** 지역 이름. common.js의 TILE_POS 키와 글자가 완전히 같아야 지도에 표시됨
   *  (예: '서울' O, '서울특별시' X). */
  private String regionName;
}
