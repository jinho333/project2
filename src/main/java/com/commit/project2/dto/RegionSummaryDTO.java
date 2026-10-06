package com.commit.project2.dto;

import lombok.Data;

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
}
