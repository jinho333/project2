package com.commit.project2.dto;

import lombok.Data;

@Data
public class FutDTO {
  private String label;
  private int m;
  private double temp;    // 예상 기온
  private double value;   // 예측 공급량
  private double lo;      // 하한
  private double hi;      // 상한
}
