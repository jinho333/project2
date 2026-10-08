package com.commit.project2.dto;

import lombok.Data;

// FastAPI GET /mape 응답의 지역 1건
@Data
public class PyMapeItemDTO {
  private String region;        // 지역 이름 ('서울')
  private Double mape;          // 예측 오차율(%)
  private Double sensitivity;   // 겨울 1°C 하락 시 공급량 증가율(%) — sim_model 계수 기반
}
