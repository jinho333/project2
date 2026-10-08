package com.commit.project2.service;

import com.commit.project2.dto.GasDTO;
import com.commit.project2.dto.NationalDTO;
import com.commit.project2.dto.NationalRegionDTO;
import com.commit.project2.dto.PyMapeDTO;
import com.commit.project2.dto.PyMapeItemDTO;
import com.commit.project2.mapper.GasMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Answers;
import org.springframework.web.client.RestClient;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

// 방어 코드 테스트: DB 값이 비었거나 null 이거나, 예측 서버 응답이 이상할 때도 서비스가 죽지 않고 안전한 값을 돌려주는지 확인
class NationalServiceDefensiveTest {

  private GasMapper gasMapper;
  private RestClient restClient;
  private NationalService service;

  @BeforeEach
  void setUp() {
    gasMapper = mock(GasMapper.class);
    restClient = mock(RestClient.class);   // get() 이 null → 예측 서버가 꺼진 것과 같은 상황
    service = new NationalService(gasMapper, restClient);
    when(gasMapper.getLatestFullYear()).thenReturn("2023");
    when(gasMapper.getNationalAnnual()).thenReturn(List.of());
  }

  private GasDTO gas(String ym, Double temp, Double supply) {
    GasDTO g = new GasDTO();
    g.setYm(ym);
    g.setAvgTemp(temp);
    g.setSupply(supply);
    g.setPopulation(1_000_000L);
    g.setHouseholdCnt(400_000L);
    return g;
  }

  private GasDTO regionRow(Long regionId, Double supply) {
    GasDTO g = new GasDTO();
    g.setRegionId(regionId);
    g.setSupply(supply);
    g.setPopulation(900_000L);
    return g;
  }

  @Test
  @DisplayName("기온·공급량이 null 인 달은 건너뛰고 나머지로 계산한다 (500 오류 없음)")
  void nullValuesInMonthlyRows_areSkipped() {
    List<GasDTO> monthly = new ArrayList<>();
    for (int m = 1; m <= 6; m++) monthly.add(gas(String.format("2024-%02d", m), 5.0 + m, 1000.0 + m * 10));
    monthly.add(gas("2024-07", null, 1000.0));   // 기온 null
    monthly.add(gas("2024-08", 20.0, null));     // 공급량 null
    when(gasMapper.getNationalMonthly()).thenReturn(monthly);

    NationalDTO summary = assertDoesNotThrow(() -> service.getNationalSummary());

    assertEquals(6, summary.getMonthly().size());                   // 쓸 수 있는 6개월만 남음
    assertEquals("2024-01 ~ 2024-06", summary.getCorrPeriod());     // 기간도 쓸 수 있는 달 기준
  }

  @Test
  @DisplayName("데이터가 없으면 상관계수는 0.0 이 아니라 null (값이 없다는 뜻)")
  void emptyData_giveNullCorrelationNotZero() {
    when(gasMapper.getNationalMonthly()).thenReturn(List.of());

    NationalDTO summary = service.getNationalSummary();

    assertEquals(5, summary.getCorr().size());
    for (List<Double> row : summary.getCorr()) for (Double v : row) assertNull(v, "빈 데이터인데 상관계수가 값으로 나옴");
    for (List<Double> row : summary.getCorrYoy()) for (Double v : row) assertNull(v);
    assertTrue(summary.getMonthly().isEmpty());
    assertNull(summary.getYtd());
  }

  @Test
  @DisplayName("값이 모두 같아 계산할 수 없는 상관계수는 null")
  void constantSeries_giveNullCorrelation() {
    List<GasDTO> monthly = new ArrayList<>();
    for (int m = 1; m <= 5; m++) monthly.add(gas(String.format("2024-%02d", m), 5.0, 1000.0));   // 기온·공급량이 모두 같음
    when(gasMapper.getNationalMonthly()).thenReturn(monthly);

    NationalDTO summary = service.getNationalSummary();

    assertNull(summary.getCorr().get(0).get(1), "공급량 ↔ 기온 (값이 모두 같음)");
    for (List<Double> row : summary.getCorr()) for (Double v : row) assertTrue(v == null || Double.isFinite(v));
  }

  @Test
  @DisplayName("작년 공급량이 없으면 전년 대비 증감률은 0.0 이 아니라 null")
  void missingPreviousYear_giveNullYoyNotZero() {
    when(gasMapper.getNationalMonthly()).thenReturn(List.of(gas("2023-01", 5.0, 1000.0)));
    when(gasMapper.getNationalAnnualSupply("2023")).thenReturn(12000.0);
    when(gasMapper.getNationalAnnualSupply("2022")).thenReturn(0.0);   // SQL 의 IFNULL(SUM, 0) 이 데이터 없을 때 주는 값

    assertNull(service.getNationalSummary().getSupplyYoy());
  }

  @Test
  @DisplayName("예측 서버 응답에 지역 이름이 null 인 항목이 섞여 있어도 오류 없이 처리한다")
  void fastApiItemWithNullRegion_doesNotThrow() {
    RestClient deep = mock(RestClient.class, Answers.RETURNS_DEEP_STUBS);
    PyMapeItemDTO broken = new PyMapeItemDTO();
    broken.setMape(5.0);   // region 이 null
    PyMapeItemDTO national = new PyMapeItemDTO();
    national.setRegion("전국");
    national.setMape(8.2);
    PyMapeDTO py = new PyMapeDTO();
    py.setItems(List.of(broken, national));
    py.setDelta(1.0);
    when(deep.get().uri("/mape").retrieve().body(PyMapeDTO.class)).thenReturn(py);
    NationalService withPy = new NationalService(gasMapper, deep);
    when(gasMapper.getNationalMonthly()).thenReturn(List.of(gas("2023-01", 5.0, 1000.0)));

    NationalDTO summary = assertDoesNotThrow(() -> withPy.getNationalSummary());

    assertEquals(8.2, summary.getMape(), 1e-9);      // 이름이 null 인 항목은 무시하고 "전국"을 찾음
    assertEquals(1.0, summary.getMapeDelta(), 1e-9);
  }

  @Test
  @DisplayName("시·도 지표: 작년 공급량이 null 인 지역·지역 번호가 null 인 줄이 있어도 오류 없이 나머지를 돌려준다")
  void regions_ignoreRowsWithNulls() {
    when(gasMapper.getRegionMonthly()).thenReturn(new ArrayList<>());
    when(gasMapper.getRegionAnnualStats("2022")).thenReturn(List.of(regionRow(1L, null), regionRow(2L, 900.0)));   // 서울의 작년 값이 null
    when(gasMapper.getRegionAnnualStats("2023")).thenReturn(List.of(regionRow(1L, 1000.0), regionRow(2L, 1000.0), regionRow(null, 500.0)));   // 번호 null 한 줄

    List<NationalRegionDTO> regions = assertDoesNotThrow(() -> service.getRegions());

    assertEquals(2, regions.size());                                  // 번호가 null 인 줄은 제외
    assertNotNull(regions.get(0).getName());
  }
}
