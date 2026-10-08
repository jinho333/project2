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

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

// 기온 민감도는 FastAPI 예측 모델의 값을 그대로 쓴다 (지역 상세 페이지와 같은 값). 서버가 꺼져 있으면 null
class NationalServiceSensitivityTest {

  private GasMapper gasMapper;

  @BeforeEach
  void setUp() {
    gasMapper = mock(GasMapper.class);
    when(gasMapper.getLatestFullYear()).thenReturn("2023");
    when(gasMapper.getNationalAnnual()).thenReturn(List.of());
    when(gasMapper.getNationalMonthly()).thenReturn(List.of());
    when(gasMapper.getRegionMonthly()).thenReturn(new ArrayList<>());
    when(gasMapper.getRegionAnnualStats("2022")).thenReturn(List.of(regionRow(1L), regionRow(2L)));
    when(gasMapper.getRegionAnnualStats("2023")).thenReturn(List.of(regionRow(1L), regionRow(2L)));
  }

  private GasDTO regionRow(Long regionId) {
    GasDTO g = new GasDTO();
    g.setRegionId(regionId);
    g.setSupply(1000.0);
    g.setPopulation(900_000L);
    return g;
  }

  private PyMapeItemDTO item(String region, Double mape, Double sensitivity) {
    PyMapeItemDTO i = new PyMapeItemDTO();
    i.setRegion(region);
    i.setMape(mape);
    i.setSensitivity(sensitivity);
    return i;
  }

  private NationalService serviceWith(PyMapeDTO py) {
    RestClient deep = mock(RestClient.class, Answers.RETURNS_DEEP_STUBS);
    when(deep.get().uri("/mape").retrieve().body(PyMapeDTO.class)).thenReturn(py);
    return new NationalService(gasMapper, deep);
  }

  @Test
  @DisplayName("시·도 민감도와 전국 민감도는 FastAPI 응답의 값을 그대로 쓴다")
  void sensitivity_comesFromFastApi() {
    PyMapeDTO py = new PyMapeDTO();
    py.setItems(List.of(item("서울", 8.5, 10.8), item("부산", 8.8, 14.3), item("전국", 8.2, 11.4)));
    NationalService service = serviceWith(py);

    List<NationalRegionDTO> regions = service.getRegions();
    NationalDTO summary = service.getNationalSummary();

    assertEquals(2, regions.size());
    assertEquals(10.8, regions.get(0).getSensitivity(), 1e-9);   // 서울
    assertEquals(14.3, regions.get(1).getSensitivity(), 1e-9);   // 부산
    assertEquals(11.4, summary.getSensitivity(), 1e-9);          // 전국
  }

  @Test
  @DisplayName("예측 서버가 꺼져 있으면 민감도는 null (0.0 으로 보이지 않게)")
  void sensitivity_isNullWhenFastApiIsDown() {
    NationalService service = new NationalService(gasMapper, mock(RestClient.class));   // get() 이 null → 서버 꺼짐과 같은 상황

    List<NationalRegionDTO> regions = service.getRegions();

    assertEquals(2, regions.size());
    for (NationalRegionDTO r : regions) assertNull(r.getSensitivity());
    assertNull(service.getNationalSummary().getSensitivity());
  }

  @Test
  @DisplayName("예측 서버 응답에 없는 지역의 민감도는 null, 있는 지역은 그대로")
  void sensitivity_isNullForRegionMissingInResponse() {
    PyMapeDTO py = new PyMapeDTO();
    py.setItems(List.of(item("서울", 8.5, 10.8)));   // 부산 없음
    NationalService service = serviceWith(py);

    List<NationalRegionDTO> regions = service.getRegions();

    assertEquals(10.8, regions.get(0).getSensitivity(), 1e-9);
    assertNull(regions.get(1).getSensitivity());
  }
}
