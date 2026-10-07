package com.commit.project2.dto;

import lombok.Data;

@Data
public class SimulationReqDTO {
  private double tempLo;   // 1월 기온
  private double tempHi;   // 8월 기온
  private double popPct;   // 인구 변화율(%)
}
