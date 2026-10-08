package com.commit.project2.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

// GET /api/national/regions 응답 (전국 통계 페이지의 트리맵, 도넛, 막대 차트용 시·도별 지표)
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class NationalRegionDTO {
  private Integer id;         // 지역 번호 (DB REGION_ID, 공용 /api/regions 의 id 와 같음), 지역 상세 페이지 주소의 ?region= 값
  private String name;        // 지역 이름
  private Double supply;      // 기준 연도 공급량(백만㎥)
  private Double supplyYoy;   // 전년 대비 공급량 증감률(%)
  private Double pop;         // 인구(만 명)
  private Double sensitivity; // 겨울 1°C 하락 시 공급 증가율(%)
  private Double mape;        // 예측 오차 MAPE(%), FastAPI 의 실제 값 (서버가 꺼져 있으면 null)
  private Double trend;       // 인구 증감률(%/년)
  private Double lo;          // 1월 평균기온(°C)
  private Double hi;          // 8월 평균기온(°C)
}
