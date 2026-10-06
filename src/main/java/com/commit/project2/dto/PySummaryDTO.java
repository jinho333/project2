package com.commit.project2.dto;

import lombok.Data;

import java.util.List;

@Data
public class PySummaryDTO {
  private List<PySummaryItemDTO> items;
}
