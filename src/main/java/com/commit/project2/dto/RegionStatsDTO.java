package com.commit.project2.dto;

import lombok.Data;

import java.util.List;

@Data
public class RegionStatsDTO {
  //API 2 GET /api/regions/{regionId}/stats 응답 전체
  //지역 정보(id, name)는 API 1에서 받으므로 여기엔 통계 묶음만 담음
  private List<MonthDTO> months; //선택한 연도 12개월
  private List<MonthDTO> prevMonths; //전년도 12개월 (없으면 null 데이터 전달)
}
