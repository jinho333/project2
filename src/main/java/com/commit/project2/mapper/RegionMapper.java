package com.commit.project2.mapper;

import com.commit.project2.dto.RegionDTO;
import com.commit.project2.dto.RegionSummaryDTO;
import org.apache.ibatis.annotations.Mapper;

import java.util.List;

@Mapper
public interface RegionMapper {

  //지역 조회 추상 메서드
  List<RegionDTO> getRegions();

  //특정 지역 조회 추상 메서드
  String getRegionName(Long regionId);

  // -API 1. 지역목록 + 2025년 연간 공급량, 인구 조회 추상 메서드
  List<RegionSummaryDTO> getRegionSummaries();
}
