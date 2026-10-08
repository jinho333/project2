package com.commit.project2.service;

import com.commit.project2.dto.GasDTO;
import com.commit.project2.dto.NationalDTO;
import com.commit.project2.dto.NationalYtdDTO;
import com.commit.project2.mapper.GasMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

// NationalService 단위 테스트: 스프링·DB 없이 매퍼를 가짜로 바꿔서 계산 로직만 확인 (예측 서버 FastAPI 는 꺼진 상태로 가정)
class NationalServiceTest {

  private GasMapper gasMapper;
  private NationalService service;

  @BeforeEach
  void setUp() {
    gasMapper = mock(GasMapper.class);
    // RestClient 는 가짜라 get() 이 null → fetchMape() 가 예외를 삼키고 null 을 돌려줌 (서버 꺼짐과 같은 상황)
    service = new NationalService(gasMapper, mock(RestClient.class));
    when(gasMapper.getLatestFullYear()).thenReturn("2023");
    when(gasMapper.getNationalAnnual()).thenReturn(List.of());
  }

  // 월별 한 줄 (공급량은 천㎥ 단위)
  private GasDTO gas(String ym, double temp, double supply, long pop, long household) {
    GasDTO g = new GasDTO();
    g.setYm(ym);
    g.setAvgTemp(temp);
    g.setSupply(supply);
    g.setPopulation(pop);
    g.setHouseholdCnt(household);
    return g;
  }

  private String ym(int year, int month) {
    return String.format("%d-%02d", year, month);
  }

  @Test
  @DisplayName("올해 누적: 마지막 달까지 합계를 작년 같은 기간과 비교한다")
  void ytd_comparesSamePeriodOfPreviousYear() {
    List<GasDTO> monthly = new ArrayList<>();
    for (int m = 1; m <= 12; m++) monthly.add(gas(ym(2023, m), 5.0, 1000.0, 1_000_000, 400_000));   // 2023: 매달 1.0 백만㎥, 5°C
    for (int m = 1; m <= 6; m++) monthly.add(gas(ym(2024, m), 6.0, 1100.0, 1_000_000, 400_000));    // 2024: 1~6월 매달 1.1 백만㎥, 6°C
    when(gasMapper.getNationalMonthly()).thenReturn(monthly);

    NationalYtdDTO ytd = service.getNationalSummary().getYtd();

    assertNotNull(ytd);
    assertEquals("2024", ytd.getYear());
    assertEquals(6, ytd.getMonth());
    assertEquals(6.6, ytd.getSupply(), 1e-9);        // 6 × 1.1
    assertEquals(10.0, ytd.getSupplyYoy(), 1e-9);    // 6.6 / 6.0 - 1
    assertEquals(1.0, ytd.getTempDiff(), 1e-9);      // 6°C - 5°C
  }

  @Test
  @DisplayName("올해 누적: 마지막 달이 12월이면(연도가 끝남) 없음")
  void ytd_isNullWhenLastMonthIsDecember() {
    List<GasDTO> monthly = new ArrayList<>();
    for (int y = 2023; y <= 2024; y++) for (int m = 1; m <= 12; m++) monthly.add(gas(ym(y, m), 5.0, 1000.0, 1_000_000, 400_000));
    when(gasMapper.getNationalMonthly()).thenReturn(monthly);

    assertNull(service.getNationalSummary().getYtd());
  }

  @Test
  @DisplayName("올해 누적: 작년 같은 달이 모두 없으면 없음")
  void ytd_isNullWhenPreviousYearIsIncomplete() {
    List<GasDTO> monthly = new ArrayList<>();
    for (int m = 4; m <= 12; m++) monthly.add(gas(ym(2023, m), 5.0, 1000.0, 1_000_000, 400_000));   // 2023 은 4월부터 (1~3월 없음)
    for (int m = 1; m <= 6; m++) monthly.add(gas(ym(2024, m), 6.0, 1100.0, 1_000_000, 400_000));
    when(gasMapper.getNationalMonthly()).thenReturn(monthly);

    assertNull(service.getNationalSummary().getYtd());
  }

  @Test
  @DisplayName("월별 시리즈: 공급량을 천㎥에서 백만㎥로 바꾸고 순서를 유지한다")
  void monthlySeries_convertsUnitAndKeepsOrder() {
    when(gasMapper.getNationalMonthly()).thenReturn(List.of(
        gas("2023-11", 8.0, 2500.0, 1_000_000, 400_000),
        gas("2023-12", 1.5, 3200.0, 1_000_000, 400_000)));

    NationalDTO summary = service.getNationalSummary();

    assertEquals(2, summary.getMonthly().size());
    assertEquals("2023-11", summary.getMonthly().get(0).getYm());
    assertEquals(2.5, summary.getMonthly().get(0).getSupply(), 1e-9);
    assertEquals(3.2, summary.getMonthly().get(1).getSupply(), 1e-9);
    assertEquals(1.5, summary.getMonthly().get(1).getAvgTemp(), 1e-9);
  }

  @Test
  @DisplayName("전년 동월 대비 상관: 작년 대비 변화가 정확히 반비례하면 -1.0")
  void corrYoy_isMinusOneWhenYearOverYearChangesAreLinear() {
    double[] temp1 = {0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22};
    double[] dTemp = {1, -2, 3, 0, 2, -1, 4, -3, 1, 2, -2, 0};   // 작년 대비 기온 변화
    List<GasDTO> monthly = new ArrayList<>();
    for (int i = 0; i < 12; i++) monthly.add(gas(ym(2023, i + 1), temp1[i], 1000.0 + i * 10, 1_000_000 + i * 1000L, 400_000 + i * 300L));
    for (int i = 0; i < 12; i++) {
      double supplyLastYear = 1000.0 + i * 10;
      // 올해 공급량 = 작년 - 20 × 기온 변화 → 변화량끼리 완전한 음의 직선 관계
      monthly.add(gas(ym(2024, i + 1), temp1[i] + dTemp[i], supplyLastYear - 20 * dTemp[i],
          1_000_000 + i * 1000L + i * 10L + 500, 400_000 + i * 300L + i * 7L + 200));
    }
    when(gasMapper.getNationalMonthly()).thenReturn(monthly);

    NationalDTO summary = service.getNationalSummary();

    assertEquals(5, summary.getCorrYoy().size());
    assertEquals(5, summary.getCorrYoy().get(0).size());
    assertEquals(1.0, summary.getCorrYoy().get(0).get(0), 1e-9);           // 자기 자신
    assertEquals(-1.0, summary.getCorrYoy().get(0).get(1), 1e-9);          // 공급량 ↔ 평균기온 (전년 동월 대비)
    assertEquals(summary.getCorrYoy().get(0).get(1), summary.getCorrYoy().get(1).get(0), 1e-9);   // 대칭
  }

  @Test
  @DisplayName("원본 상관은 전체 월을 쓰고, 전년 동월 대비 상관은 작년 값이 있는 달만 쓴다")
  void corr_usesAllMonths_whileYoyUsesOnlyMonthsWithPreviousYear() {
    List<GasDTO> monthly = new ArrayList<>();
    for (int i = 0; i < 18; i++) {   // 2023-01 ~ 2024-06 (18개월)
      int year = i < 12 ? 2023 : 2024, month = i % 12 + 1;
      monthly.add(gas(ym(year, month), 20.0 - i, 500.0 + i * 25 + (i % 3) * 7, 1_000_000 + i * 900L, 400_000 + i * 250L + (i % 4) * 30));
    }
    when(gasMapper.getNationalMonthly()).thenReturn(monthly);

    NationalDTO summary = service.getNationalSummary();

    assertEquals("2023-01 ~ 2024-06", summary.getCorrPeriod());
    assertNotNull(summary.getCorr());
    assertNotNull(summary.getCorrYoy());
    // 값이 있는 칸은 -1 ~ 1 사이의 유한한 숫자 (인구·세대수처럼 변화량이 늘 같은 변수는 계산할 수 없어 null)
    for (List<Double> row : summary.getCorrYoy()) {
      for (Double v : row) {
        assertTrue(v == null || (Double.isFinite(v) && v >= -1.0 && v <= 1.0), "상관계수가 범위를 벗어남: " + v);
      }
    }
    assertNotNull(summary.getCorr().get(0).get(1), "원본 상관은 전체 월로 계산되므로 값이 있어야 함");
    // 이 테스트 데이터는 기온·인구가 매달 일정하게 변해서 작년 대비 변화량이 늘 같음 → 전년 동월 대비 상관은 계산할 수 없음 (이전에는 0.0 으로 잘못 보였음)
    assertNull(summary.getCorrYoy().get(0).get(1));
    assertNull(summary.getCorrYoy().get(0).get(3));
  }

  @Test
  @DisplayName("전년 대비 공급량 증감률은 기준 연도와 그 전 해의 연간 합계로 계산한다")
  void supplyYoy_comparesBaseYearWithPreviousYear() {
    when(gasMapper.getNationalMonthly()).thenReturn(List.of(gas("2023-01", 5.0, 1000.0, 1_000_000, 400_000)));
    when(gasMapper.getNationalAnnualSupply("2023")).thenReturn(12000.0);
    when(gasMapper.getNationalAnnualSupply("2022")).thenReturn(10000.0);

    assertEquals(20.0, service.getNationalSummary().getSupplyYoy(), 1e-9);
  }

  @Test
  @DisplayName("예측 서버가 꺼져 있으면 MAPE 는 null (예외 없이)")
  void mape_isNullWhenFastApiIsDown() {
    when(gasMapper.getNationalMonthly()).thenReturn(List.of(gas("2023-01", 5.0, 1000.0, 1_000_000, 400_000)));

    NationalDTO summary = service.getNationalSummary();

    assertNull(summary.getMape());
    assertNull(summary.getMapeDelta());
  }
}
