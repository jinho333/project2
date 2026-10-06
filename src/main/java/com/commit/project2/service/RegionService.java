package com.commit.project2.service;

import com.commit.project2.dto.RegionSummaryDTO;
import com.commit.project2.mapper.GasMapper;
import com.commit.project2.mapper.RegionMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
public class RegionService {
  private final GasMapper gasMapper;
  private final RegionMapper regionMapper;

  // -API 1. 지역목록 + 2025년 연간 공급량, 인구 조회 기능
  public List<RegionSummaryDTO> getRegionSummaries(){
    return regionMapper.getRegionSummaries();
  }

}
