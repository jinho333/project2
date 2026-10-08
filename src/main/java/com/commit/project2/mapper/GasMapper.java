package com.commit.project2.mapper;

import com.commit.project2.dto.GasDTO;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface GasMapper {
  //지역 페이지에 필요한 추상 메서드
  // 한 지역의 전체 기간 월별 (region 파트 /stats 의 분기 집계·상관계수 계산용)
  List<GasDTO> getMonthlyByRegion(@Param("regionId") Long regionId);

  //전국 페이지에 필요한 추상 메서드
  // 전국(18) 연간 공급량 합계
  Double getNationalAnnualSupply(@Param("year") String year);

  // 전국(18) 전체 월별 데이터
  List<GasDTO> getNationalMonthly();

  // 전국(18) 연도별 공급량 합계, 평균기온 (12개월이 모두 있는 연도만, ym 에 연도가 담김)
  List<GasDTO> getNationalAnnual();

  // 12개월이 모두 있는 가장 최근 연도 (없으면 null)
  String getLatestFullYear();

  // 시·도 지표 API(/api/national/regions): 전국 페이지가 사용
  // 시도별(1~17) 연간 공급량 합계, 인구 평균
  List<GasDTO> getRegionAnnualStats(@Param("year") String year);

  // 시도별(1~17) 전체 월별 데이터
  List<GasDTO> getRegionMonthly();

  //예측 페이지에 필요한 추상 메서드

}
