package com.commit.project2.dto;

import lombok.Data;

@Data
public class ForecastSummaryDTO {
  private Long id;         // 지역 번호 (REGION_ID)
  private double total;
}
