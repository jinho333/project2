package com.commit.project2.dto;

import lombok.Data;

import java.util.List;

@Data
public class SimulationDTO {
  private List<SimMonthDTO> base;   // 평년 기준
  private List<SimMonthDTO> sim;    // 입력 조건
}
