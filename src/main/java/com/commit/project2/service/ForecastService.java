package com.commit.project2.service;

import com.commit.project2.dto.ForecastDTO;
import com.commit.project2.dto.RegionDTO;
import com.commit.project2.mapper.RegionMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

@Service
@RequiredArgsConstructor
public class ForecastService {

//  private final RestClient restClient;        // RestClientConfig 에서 만든 객체 (기본 주소 = localhost:8000)
//  private final RegionMapper regionMapper;

//  public ForecastDTO getForecast(Long regionId, int horizon) {
    // 1 → '서울'
    //String regionName = regionMapper.getRegionName(regionId);

    // FastAPI 의 /forecast?region=서울&horizon=6 호출 → 응답 JSON 을 ForecastDTO 로 변환
//    return restClient.get()
//            .uri("/forecast?region={region}&horizon={horizon}", regionName, horizon)
//            .retrieve()
//            .body(ForecastDTO.class);
//  }
}
