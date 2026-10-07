package com.commit.project2.dto;

import lombok.Data;

import java.util.List;

// FastAPI GET /mape 응답 전체: { items: [ { region, mape }, ... ], delta: -1.2 }
@Data
public class PyMapeDTO {
  private List<PyMapeItemDTO> items;   // 지역별 예측 오차율(%)
  private Double delta;                // 전국 MAPE 의 전분기 대비 변화(%p)
}
