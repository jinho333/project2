package com.commit.project2.dto;

import lombok.Data;

@Data
public class GasDTO {
  private Long gasId;
  private Long regionId;
  private String ym;
  private Double avgTemp;
  private Double maxTemp;
  private Double minTemp;
  private Long householdCnt;
  private Long population;
  private Double supply;
}
