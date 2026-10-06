package com.commit.project2.dto;

import lombok.Data;

@Data
public class PySummaryItemDTO {
  private String region;   // 지역 이름 ('서울')
  private double total;    // 예측 합계
}
