package com.commit.project2.mapper;

import com.commit.project2.dto.RegionDTO;
import org.apache.ibatis.annotations.Mapper;

import java.util.List;

@Mapper
public interface RegionMapper {

  //지역 조회 추상 메서드
  List<RegionDTO> getRegions();
}
