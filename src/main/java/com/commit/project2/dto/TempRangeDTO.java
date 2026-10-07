package com.commit.project2.dto;

import lombok.Data;

@Data
public class TempRangeDTO {
  private Long id;
  private Double lo;
  private Double hi;
  private Double trend;   // 인구 증감률(%/년): 2024년 평균 인구 대비 2025년 평균 인구
}
