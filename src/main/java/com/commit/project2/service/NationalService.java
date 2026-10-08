package com.commit.project2.service;

import com.commit.project2.dto.GasDTO;
import com.commit.project2.dto.NationalDTO;
import com.commit.project2.dto.NationalMonthDTO;
import com.commit.project2.dto.NationalRegionDTO;
import com.commit.project2.dto.NationalYearDTO;
import com.commit.project2.dto.NationalYtdDTO;
import com.commit.project2.dto.PyMapeDTO;
import com.commit.project2.dto.PyMapeItemDTO;
import com.commit.project2.mapper.GasMapper;
import com.commit.project2.util.StatUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.time.Year;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.ToDoubleFunction;
import java.util.stream.Collectors;

// 전국 통계 페이지 서비스
//  - getNationalSummary(): 전국(REGION_ID 18) 월별 데이터로 증감률과 상관계수 계산
//  - getRegions(): 17개 시·도별 지표 계산 (공급량, 인구, 기온 민감도 등)
@Service
@RequiredArgsConstructor
public class NationalService {
  private final GasMapper gasMapper;
  private final RestClient restClient;   // FastAPI 호출용 (예측 오차 MAPE 를 받아올 때 사용)

  private static final double HDD_BASE_TEMP = 18.0;  // 난방도일 기준온도
  private static final Set<String> WINTER_MONTHS = Set.of("12", "01", "02");

  // 인덱스 = REGION_ID (0은 비움, 18 전국은 제외)
  private static final String[] REGION_NAMES = {
      "", "서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종",
      "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"
  };

  /* ---------- 예측 오차(MAPE): FastAPI 의 실제 값 ---------- */

  // FastAPI 의 GET /mape 호출 → { items: [{ region, mape }], delta }
  // FastAPI 서버가 꺼져 있어도 전국 페이지의 나머지는 나와야 하므로 실패하면 null 을 돌려줌
  private PyMapeDTO fetchMape() {
    try {
      return restClient.get()
          .uri("/mape")
          .retrieve()
          .body(PyMapeDTO.class);
    } catch (Exception e) {
      return null;
    }
  }

  // 받아온 MAPE 목록에서 지역 이름이 같은 값 찾기 (못 받아왔거나 그 지역이 없으면 null)
  private Double findMape(PyMapeDTO py, String regionName) {
    if (py == null || py.getItems() == null) return null;
    for (PyMapeItemDTO item : py.getItems()) {
      if (item != null && regionName.equals(item.getRegion())) {
        return item.getMape();
      }
    }
    return null;
  }

  /* ---------- 전국 요약 ---------- */

  // 기준 연도: 12개월이 모두 있는 가장 최근 연도 (진행 중인 연도는 제외, DB 에 없으면 작년)
  private String getBaseYear() {
    String year = gasMapper.getLatestFullYear();
    return year != null ? year : String.valueOf(Year.now().getValue() - 1);
  }

  private String getPrevYear(String year) {
    return String.valueOf(Integer.parseInt(year) - 1);
  }

  // GET /api/national 응답 만들기
  public NationalDTO getNationalSummary() {
    List<GasDTO> monthly = usableRows(gasMapper.getNationalMonthly());
    PyMapeDTO py = fetchMape();
    String year = getBaseYear();

    return NationalDTO.builder()
        .year(year)
        .supplyYoy(getSupplyYoy(year))
        .annual(getAnnualTrend())
        .monthly(getMonthlySeries(monthly))
        .ytd(getYtd(monthly))
        .mape(findMape(py, "전국"))                      // FastAPI 가 계산한 전국 MAPE (지역 값의 평균과 다를 수 있음)
        .mapeDelta(py == null ? null : py.getDelta())  // FastAPI 가 계산한 실제 값 (최근 3개월 - 그 앞 3개월)
        .corrLabels(List.of("공급량", "평균기온", "난방도일", "인구", "세대수"))
        .corr(calcCorrMatrix(monthly, false))
        .corrYoy(calcCorrMatrix(monthly, true))
        .corrPeriod(getPeriod(monthly))
        .build();
  }

  // 연도별 추이: 12개월이 모두 있는 연도만, 전년 대비 증감률 포함 (첫 연도는 null)
  private List<NationalYearDTO> getAnnualTrend() {
    List<NationalYearDTO> result = new ArrayList<>();
    Double prev = null;
    for (GasDTO row : gasMapper.getNationalAnnual()) {
      result.add(NationalYearDTO.builder()
          .year(row.getYm())
          .supply(StatUtils.round(row.getSupply() / 1000.0, 1))   // 천㎥ -> 백만㎥
          .avgTemp(row.getAvgTemp())
          .supplyYoy(prev == null ? null : calcYoy(row.getSupply(), prev))
          .build());
      prev = row.getSupply();
    }
    return result;
  }

  // 월별 공급량·평균기온 (월별 곡선 차트용)
  private List<NationalMonthDTO> getMonthlySeries(List<GasDTO> monthly) {
    return monthly.stream()
        .map(g -> NationalMonthDTO.builder()
            .ym(g.getYm())
            .supply(StatUtils.round(g.getSupply() / 1000.0, 1))   // 천㎥ -> 백만㎥
            .avgTemp(g.getAvgTemp())
            .build())
        .toList();
  }

  // 올해 누적: 진행 중인 연도의 1월 ~ 마지막 달 합계를 작년 같은 기간과 비교
  // 마지막 달이 12월이면(연도가 끝남) 연간 지표를 쓰므로 null, 작년에 같은 달이 모두 없어도 null
  private NationalYtdDTO getYtd(List<GasDTO> monthly) {
    if (monthly.isEmpty()) return null;
    YearMonth last = YearMonth.parse(monthly.get(monthly.size() - 1).getYm());
    if (last.getMonthValue() == 12) return null;
    int year = last.getYear(), month = last.getMonthValue();

    double currSupply = 0, prevSupply = 0, currTemp = 0, prevTemp = 0;
    int currCount = 0, prevCount = 0;
    for (GasDTO g : monthly) {
      YearMonth ym = YearMonth.parse(g.getYm());
      if (ym.getMonthValue() > month) continue;   // 마지막 달까지만 비교
      if (ym.getYear() == year) {
        currSupply += g.getSupply(); currTemp += g.getAvgTemp(); currCount++;
      } else if (ym.getYear() == year - 1) {
        prevSupply += g.getSupply(); prevTemp += g.getAvgTemp(); prevCount++;
      }
    }
    if (currCount != month || prevCount != month) return null;

    return NationalYtdDTO.builder()
        .year(String.valueOf(year))
        .month(month)
        .supply(StatUtils.round(currSupply / 1000.0, 1))
        .supplyYoy(calcYoy(currSupply, prevSupply))
        .tempDiff(StatUtils.round(currTemp / currCount - prevTemp / prevCount, 1))
        .build();
  }

  // 계산에 쓸 수 있는 줄만 남김: 연월이 'YYYY-MM' 모양이고 기온·공급량·인구·세대수가 모두 있는 줄
  // DB 에 빈 값이 한 줄만 섞여 있어도 서버 전체가 오류(500)가 나지 않게 하는 방어
  private List<GasDTO> usableRows(List<GasDTO> rows) {
    if (rows == null) return List.of();
    return rows.stream().filter(this::isUsable).toList();
  }

  private boolean isUsable(GasDTO g) {
    return g != null && g.getYm() != null && g.getYm().matches("\\d{4}-\\d{2}")
        && g.getAvgTemp() != null && g.getSupply() != null
        && g.getPopulation() != null && g.getHouseholdCnt() != null;
  }

  // 첫 달 ~ 마지막 달 (월별 데이터가 YM 오름차순이라는 전제)
  private String getPeriod(List<GasDTO> monthly) {
    if (monthly.isEmpty()) return "";
    return monthly.get(0).getYm() + " ~ " + monthly.get(monthly.size() - 1).getYm();
  }

  // 전국 전년 대비 공급량 증감률(%)
  private Double getSupplyYoy(String year) {
    return calcYoy(gasMapper.getNationalAnnualSupply(year), gasMapper.getNationalAnnualSupply(getPrevYear(year)));
  }

  // 증감률(%), 소수점 첫째 자리 (전년 값이 없거나 0 이하면 0)
  // 비교할 값이 없거나 0 이하이면 null (0.0 으로 두면 '변화 없음' 으로 잘못 읽힘)
  private Double calcYoy(Double curr, Double prev) {
    if (prev == null || curr == null || prev <= 0) return null;
    return StatUtils.round((curr - prev) / prev * 100, 1);
  }

  // 전국 월별 데이터로 계산한 변수 간 상관계수 행렬
  // 산업생산은 DB에 없어서 제외
  // yoy = true 이면 각 값에서 작년 같은 달 값을 뺀 "전년 동월 대비 변화"로 계산 (계절 패턴과 완만한 추세가 함께 빠짐, 작년 값이 없는 첫 12개월은 제외)
  private List<List<Double>> calcCorrMatrix(List<GasDTO> monthly, boolean yoy) {
    List<double[]> series = List.of(
        toDoubleArray(monthly, GasDTO::getSupply),
        toDoubleArray(monthly, GasDTO::getAvgTemp),
        toDoubleArray(monthly, this::calcHeatingDegreeDays),
        toDoubleArray(monthly, GasDTO::getPopulation),
        toDoubleArray(monthly, GasDTO::getHouseholdCnt)
    );
    if (yoy) {
      int[] prev = prevYearIndex(monthly);
      series = series.stream().map(row -> diffFromPrevYear(row, prev)).toList();
    }

    List<List<Double>> matrix = new ArrayList<>();
    for (double[] row : series) {
      List<Double> line = new ArrayList<>();
      for (double[] col : series) {
        line.add(safeCorr(row, col));
      }
      matrix.add(line);
    }
    return matrix;
  }

  // 상관계수 (소수 2자리). 값이 2개 미만이거나 한쪽 값이 모두 같아서 계산할 수 없으면 null
  private Double safeCorr(double[] x, double[] y) {
    if (x.length < 2 || x.length != y.length) return null;
    double r = StatUtils.corr(x, y);
    return Double.isFinite(r) ? StatUtils.round(r, 2) : null;
  }

  // 각 달의 "작년 같은 달" 위치 번호 (없으면 -1)
  private int[] prevYearIndex(List<GasDTO> monthly) {
    Map<String, Integer> indexOf = new java.util.HashMap<>();
    for (int i = 0; i < monthly.size(); i++) {
      indexOf.put(monthly.get(i).getYm(), i);
    }
    int[] prev = new int[monthly.size()];
    for (int i = 0; i < prev.length; i++) {
      prev[i] = indexOf.getOrDefault(YearMonth.parse(monthly.get(i).getYm()).minusYears(1).toString(), -1);
    }
    return prev;
  }

  // 작년 같은 달이 있는 달만 남겨서 (올해 값 - 작년 값) 을 만듦
  private double[] diffFromPrevYear(double[] values, int[] prev) {
    return java.util.stream.IntStream.range(0, values.length)
        .filter(i -> prev[i] >= 0)
        .mapToDouble(i -> values[i] - values[prev[i]])
        .toArray();
  }

  // 월 난방도일 = max(0, 기준온도 - 월평균기온) * 해당 월 일수
  private double calcHeatingDegreeDays(GasDTO gas) {
    int days = YearMonth.parse(gas.getYm()).lengthOfMonth();
    return Math.max(0, HDD_BASE_TEMP - gas.getAvgTemp()) * days;
  }

  private double[] toDoubleArray(List<GasDTO> list, ToDoubleFunction<GasDTO> getter) {
    return list.stream().mapToDouble(getter).toArray();
  }

  /* ---------- 시·도별 지표 ---------- */

  // GET /api/national/regions 응답: 17개 시도 목록 (공급량, 인구는 기준 연도 DB 집계)
  public List<NationalRegionDTO> getRegions() {
    String year = getBaseYear();
    String prevYear = getPrevYear(year);

    Map<Long, List<GasDTO>> monthlyByRegion = usableRows(gasMapper.getRegionMonthly()).stream()
        .filter(g -> g.getRegionId() != null)
        .collect(Collectors.groupingBy(GasDTO::getRegionId));

    // toMap 은 값이 null 이면 오류가 나므로 지역 번호·공급량이 있는 줄만 사용
    Map<Long, Double> prevSupply = gasMapper.getRegionAnnualStats(prevYear).stream()
        .filter(g -> g.getRegionId() != null && g.getSupply() != null)
        .collect(Collectors.toMap(GasDTO::getRegionId, GasDTO::getSupply, (first, second) -> first));

    PyMapeDTO py = fetchMape();   // 지역별 예측 오차 (FastAPI)

    List<NationalRegionDTO> result = new ArrayList<>();
    for (GasDTO row : gasMapper.getRegionAnnualStats(year)) {
      if (row.getRegionId() == null || row.getSupply() == null || row.getPopulation() == null) continue;
      int regionId = row.getRegionId().intValue();
      if (regionId < 1 || regionId > 17) continue;

      List<GasDTO> monthly = monthlyByRegion.getOrDefault(row.getRegionId(), List.of());

      result.add(NationalRegionDTO.builder()
          .id(regionId)
          .name(REGION_NAMES[regionId])
          .supply(StatUtils.round(row.getSupply() / 1000.0, 1))      // 천㎥ -> 백만㎥
          .supplyYoy(calcYoy(row.getSupply(), prevSupply.get(row.getRegionId())))
          .pop(StatUtils.round(row.getPopulation() / 10000.0, 1))    // 명 -> 만 명
          .sensitivity(calcSensitivity(monthly))
          .mape(findMape(py, REGION_NAMES[regionId]))   // FastAPI 모델의 실제 오차율(%)
          .trend(calcPopulationTrend(monthly, year, prevYear))
          .lo(getMonthlyAvgTemp(monthly, 1))
          .hi(getMonthlyAvgTemp(monthly, 8))
          .build());
    }
    return result;
  }

  // 겨울(12~2월) 기온 1°C 하락 시 공급량 증가율(%): 공급량을 기온에 단순 회귀한 기울기 / 평균 공급량
  private double calcSensitivity(List<GasDTO> monthly) {
    List<GasDTO> winter = monthly.stream()
        .filter(g -> WINTER_MONTHS.contains(g.getYm().substring(5)))
        .toList();
    if (winter.size() < 2) return 0.0;

    double[] temp = winter.stream().mapToDouble(GasDTO::getAvgTemp).toArray();
    double[] supply = winter.stream().mapToDouble(GasDTO::getSupply).toArray();
    return StatUtils.round(-StatUtils.slope(temp, supply) / StatUtils.mean(supply) * 100, 1);
  }

  // 인구 증감률(%/년): 기준 연도 월평균 인구 vs 전년 월평균 인구
  private double calcPopulationTrend(List<GasDTO> monthly, String year, String prevYear) {
    double prev = getAvgPopulation(monthly, prevYear);
    double curr = getAvgPopulation(monthly, year);
    if (prev == 0) return 0.0;
    return StatUtils.round((curr - prev) / prev * 100, 1);
  }

  private double getAvgPopulation(List<GasDTO> monthly, String year) {
    return monthly.stream()
        .filter(g -> g.getYm().startsWith(year))
        .mapToDouble(GasDTO::getPopulation)
        .average().orElse(0);
  }

  // 전체 연도 중 특정 월(1~12)의 평균기온
  private double getMonthlyAvgTemp(List<GasDTO> monthly, int month) {
    String monthSuffix = String.format("-%02d", month);
    double avg = monthly.stream()
        .filter(g -> g.getYm().endsWith(monthSuffix))
        .mapToDouble(GasDTO::getAvgTemp)
        .average().orElse(0);
    return StatUtils.round(avg, 1);
  }
}
