package com.commit.project2.service;

import com.commit.project2.dto.*;
import com.commit.project2.mapper.RegionMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.util.ArrayList;
import java.util.List;

@Service
@RequiredArgsConstructor
public class ForecastService {

  private final RestClient restClient;        // RestClientConfig 에서 만든 객체 (기본 주소 = localhost:8000)
  private final RegionMapper regionMapper;

  public ForecastDTO getForecast(Long regionId, int horizon) {
     //1 → '서울'
    String regionName = regionMapper.getRegionName(regionId);

     //FastAPI 의 /forecast?region=서울&horizon=6 호출 → 응답 JSON 을 ForecastDTO 로 변환
    return restClient.get()
            .uri("/forecast?region={region}&horizon={horizon}", regionName, horizon)
            .retrieve()
            .body(ForecastDTO.class);
  }

  public List<ForecastSummaryDTO> getSummary(int horizon) {
    // 1) FastAPI 에서 지역 이름별 합계 받기
    PySummaryDTO py = restClient.get()
            .uri("/forecast/summary?horizon={horizon}", horizon)
            .retrieve()
            .body(PySummaryDTO.class);

    // 2) DB 의 지역 목록 (번호 + 이름)
    List<RegionDTO> regions = regionMapper.getRegions();

    // 3) 이름이 같은 것끼리 짝지어서 { id, total } 로 만들기
    List<ForecastSummaryDTO> result = new ArrayList<>();
    for (RegionDTO region : regions) {
      // '전국'은 지도에 없으므로 제외
      if (region.getRegionName().equals("전국")) {
        continue;
      }
      for (PySummaryItemDTO item : py.getItems()) {
        if (item.getRegion().equals(region.getRegionName())) {
          ForecastSummaryDTO dto = new ForecastSummaryDTO();
          dto.setId(region.getRegionId());
          dto.setTotal(item.getTotal());
          result.add(dto);
        }
      }
    }
    return result;
  }
}
