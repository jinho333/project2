package com.commit.project2.controller;

import com.commit.project2.dto.ForecastDTO;
import com.commit.project2.service.ForecastService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class ForecastApiController {
  private final ForecastService forecastService;

  // 화면(forecast.js)이 호출하는 주소: /api/regions/1/forecast?horizon=6
  @GetMapping("/api/regions/{regionId}/forecast")
  public ForecastDTO forecast(@PathVariable("regionId") Long regionId,
                              @RequestParam("horizon") int horizon) {
    return forecastService.getForecast(regionId, horizon);
  }
}
