package com.commit.project2.mapper;

import com.commit.project2.dto.*;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * RegionMapper — region 파트에서 사용하는 DB 질의 인터페이스
 * ----------------------------------------------------------
 * 실제 SQL 은 resources/mapper/region-mapper.xml 에 있음.
 * 메서드 이름 == xml 의 <select id="..."> 와 1:1 로 매칭됨.
 *
 * @Mapper (MyBatis): 이 인터페이스를 스프링 빈으로 자동 등록해 주고,
 *                    xml 의 SQL 과 연결해 "실행 가능한 메서드" 로 만들어 줌.
 *                    (구현 클래스를 직접 작성하지 않아도 됨)
 *
 * @Param ("이름"): xml 안에서 #{이름} 으로 꺼내 쓸 수 있는 이름을 지정.
 *                 매개변수가 1개면 생략해도 되지만, 2개 이상이면 꼭 필요.
 */
@Mapper
public interface RegionMapper {

  /* ============================================================
   * [공용] 지역 테이블 조회
   * ============================================================ */

  /** REGION 테이블 전체 조회 (전국 포함, 17 + 1 건).
   *  주 용도: ForecastService 가 FastAPI 응답의 지역 이름을 DB id 로 매칭할 때 사용. */
  List<RegionDTO> getRegions();

  /** regionId → regionName 변환.
   *  주 용도: ForecastService 가 FastAPI 호출 URL에 지역 이름을 넣을 때 사용. */
  String getRegionName(Long regionId);

  /** 지역별 1월·8월 평균기온 + 인구 증감률(year 평균 인구 ÷ prevYear 평균 인구 - 1).
   *  API ① 응답 보강용으로 RegionService 가 호출.
   *  @param year     기준 연도 (예: "2025")
   *  @param prevYear 그 전년도 (예: "2024") */
  List<TempRangeDTO> getTempRanges(@Param("year") String year,
                                   @Param("prevYear") String prevYear);


  /* ============================================================
   * [API ①] GET /api/regions
   * ============================================================ */

  /** 기준 연도(year)의 "지역 목록 + 연간 공급량 + 평균 인구".
   *  @param year 기준 연도 (예: "2025"). RegionService 가 getLatestFullYear() 로 구해서 넘김
   *  응답은 List<RegionSummaryDTO> 로 바로 매핑됨.
   *  SQL 쪽에서 단위 환산을 끝내므로 Service 는 그대로 전달만 함. */
  List<RegionSummaryDTO> getRegionSummaries(@Param("year") String year);


  /* ============================================================
   * GET /api/regions/years
   * ============================================================ */

  /** 데이터가 있는 연도 목록 (오름차순). 예) [2021, 2022, ..., 2026] */
  List<Integer> getYears();


  /* ============================================================
   * [API ②] GET /api/regions/{regionId}/stats?year=
   *          (여기서는 '데이터 조회'만 담당, 가공은 RegionService)
   * ============================================================ */

  /** 특정 지역·연도의 월별 실적을 MonthDTO 로 바로 매핑해서 돌려줌.
   *  - 2021~2025 년은 보통 12건, 2026 년은 1~6월만 있어 6건이 돌아옴 → Service 가 7~12월 보강.
   *  - forecast 필드는 쿼리에서 설정하지 않아 Java 기본값 false 로 들어감.
   *  @param regionId REGION.REGION_ID
   *  @param year     4자리 연도 (2021~2026) */
  List<MonthDTO> getMonthsByYear(@Param("regionId") Long regionId,
                                 @Param("year") int year);

  /** 특정 지역의 "전체 기간 월별 원본" (ym/avgTemp/population/supply) 반환.
   *  Service 쪽에서 분기 평균(popQ) 과 피어슨 상관계수(popCorr) 를 계산하는 데 사용. */
  List<GasDTO> getGasAllMonths(Long regionId);
}
