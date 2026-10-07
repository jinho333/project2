package com.commit.project2.controller;

import com.commit.project2.dto.ForecastDTO;
import com.commit.project2.dto.ForecastSummaryDTO;
import com.commit.project2.dto.SimulationDTO;
import com.commit.project2.dto.SimulationReqDTO;
import com.commit.project2.service.ForecastService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

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

  // 화면(forecast.js)이 호출하는 주소: /api/forecast/summary?horizon=6
  @GetMapping("/api/forecast/summary")
  public List<ForecastSummaryDTO> summary(@RequestParam("horizon") int horizon) {
    return forecastService.getSummary(horizon);
  }

  // 화면(forecast.js)이 호출하는 주소: POST /api/regions/1/simulation
  @PostMapping("/api/regions/{regionId}/simulation")
  public SimulationDTO simulation(@PathVariable("regionId") Long regionId,
                                  @RequestBody SimulationReqDTO reqDTO) {
    return forecastService.getSimulation(regionId, reqDTO);
  }
}
