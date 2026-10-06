package com.commit.project2.controller;

import com.commit.project2.service.ForecastService;
import com.commit.project2.service.NationService;
import com.commit.project2.service.RegionService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;

@Controller
@RequiredArgsConstructor
public class DashboardController {
    private final RegionService regionService;
    private final NationService nationService;
    private final ForecastService forecastService;

    @GetMapping("/")
    public String home() {
        return "redirect:/region";
    }

    /** 지역 상세 통계 — ?region=se 로 초기 선택 지역 지정 가능 */
    @GetMapping("/region")
    public String region(@RequestParam(required = false) String region, Model model) {
        model.addAttribute("regionId", region);
        return "region";
    }

    /** 전국 통계 */
    @GetMapping("/national")
    public String national() {
        return "national";
    }

    /** 공급 예측 + 시뮬레이션 */
    @GetMapping("/forecast")
    public String forecast(@RequestParam(required = false) String region, Model model) {
        model.addAttribute("regionId", region);
        return "forecast";
    }
}
