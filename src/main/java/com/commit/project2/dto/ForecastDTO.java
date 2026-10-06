package com.commit.project2.dto;

import lombok.Data;

import java.util.List;

@Data
public class ForecastDTO {
  private List<HistDTO> hist;
  private List<FutDTO> fut;
}
