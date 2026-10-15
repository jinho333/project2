package com.commit.project2.dto;

import lombok.Data;

import java.util.List;

@Data
public class ForecastDTO {
  private List<HistDTO> hist;
  private List<FutDTO> fut;
  private Double trend;     // 인구 증감률(%/년) — 연간 증감률(horizon 무관). 참고용
  private Double cumTrend;  // horizon 개월 뒤 예상 인구의 "최근 데이터 대비" 누적 변화율(%) — horizon 에 따라 다름
}
