package com.commit.project2.mapper;

import com.commit.project2.dto.GasDTO;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface GasMapper {
  //지역 페이지에 필요한 추상 메서드

  //전국 페이지에 필요한 추상 메서드
  // 전국(18) 연간 공급량 합계
  Double getNationalAnnualSupply(@Param("year") String year);

  // 전국(18) 전체 월별 데이터
  List<GasDTO> getNationalMonthly();

  // 12개월이 모두 있는 가장 최근 연도 (없으면 null)
  String getLatestFullYear();

  // 시·도 지표 API(/api/national/regions): 전국 페이지가 사용
  // 시도별(1~17) 연간 공급량 합계, 인구 평균
  List<GasDTO> getRegionAnnualStats(@Param("year") String year);

  // 시도별(1~17) 전체 월별 데이터
  List<GasDTO> getRegionMonthly();

  //예측 페이지에 필요한 추상 메서드

}
