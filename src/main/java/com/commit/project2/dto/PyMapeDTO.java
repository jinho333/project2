package com.commit.project2.dto;

import lombok.Data;

import java.util.List;

// FastAPI GET /mape 응답 전체: { items: [ { region, mape }, ... ] }
@Data
public class PyMapeDTO {
  private List<PyMapeItemDTO> items;
}
