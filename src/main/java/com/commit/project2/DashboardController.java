package com.commit.project2;

import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;

@Controller
public class DashboardController {

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
