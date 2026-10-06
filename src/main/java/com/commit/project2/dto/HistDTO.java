package com.commit.project2.dto;

import lombok.Data;

@Data
public class HistDTO {
  private String label;   // '25.07'
  private int m;          // 0 = 1월
  private double value;   // 실적 공급량
}
