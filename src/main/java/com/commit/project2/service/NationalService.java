package com.commit.project2.service;

import com.commit.project2.dto.GasDTO;
import com.commit.project2.dto.NationalDTO;
import com.commit.project2.dto.NationalRegionDTO;
import com.commit.project2.dto.NationalYearDTO;
import com.commit.project2.mapper.GasMapper;
import com.commit.project2.util.StatUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

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

  private static final double HDD_BASE_TEMP = 18.0;  // 난방도일 기준온도
  private static final Set<String> WINTER_MONTHS = Set.of("12", "01", "02");

  // 인덱스 = REGION_ID (0은 비움, 18 전국은 제외)
  private static final String[] REGION_CODES = {
      "", "se", "bs", "dg", "ic", "gj", "dj", "us", "sj",
      "gg", "gw", "cb", "cn", "jb", "jn", "gb", "gn", "jj"
  };
  private static final String[] REGION_NAMES = {
      "", "서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종",
      "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"
  };

  // TODO 예측 모델 연동 전까지 임시값
  private static final double[] MOCK_MAPE = {0, 4.3, 6.1, 5.9, 5.8, 5.4, 5.6, 8.6,10.1, 5.1, 9.2, 6.9, 7.4, 6.4, 7.8, 7.1, 6.7,12.4};

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
    List<GasDTO> monthly = gasMapper.getNationalMonthly();
    String year = getBaseYear();

    return NationalDTO.builder()
        .year(year)
        .supplyYoy(getSupplyYoy(year))
        .annual(getAnnualTrend())
        .mapeDelta(-0.8)  // TODO 예측 모델 연동 전까지 임시값
        .corrLabels(List.of("공급량", "평균기온", "난방도일", "인구", "세대수"))
        .corr(getCorrMatrix(monthly))
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

  // 첫 달 ~ 마지막 달 (월별 데이터가 YM 오름차순이라는 전제)
  private String getPeriod(List<GasDTO> monthly) {
    if (monthly.isEmpty()) return "";
    return monthly.get(0).getYm() + " ~ " + monthly.get(monthly.size() - 1).getYm();
  }

  // 전국 전년 대비 공급량 증감률(%)
  private double getSupplyYoy(String year) {
    return calcYoy(gasMapper.getNationalAnnualSupply(year), gasMapper.getNationalAnnualSupply(getPrevYear(year)));
  }

  // 증감률(%), 소수점 첫째 자리 (전년 값이 없거나 0 이하면 0)
  private double calcYoy(Double curr, Double prev) {
    if (prev == null || curr == null || prev <= 0) return 0.0;
    return StatUtils.round((curr - prev) / prev * 100, 1);
  }

  // 전국 월별 데이터로 계산한 변수 간 상관계수 행렬
  // 산업생산은 DB에 없어서 제외
  private List<List<Double>> getCorrMatrix(List<GasDTO> monthly) {
    List<double[]> series = List.of(
        toArray(monthly, GasDTO::getSupply),
        toArray(monthly, GasDTO::getAvgTemp),
        toArray(monthly, this::getHeatingDegreeDays),
        toArray(monthly, GasDTO::getPopulation),
        toArray(monthly, GasDTO::getHouseholdCnt)
    );

    List<List<Double>> matrix = new ArrayList<>();
    for (double[] row : series) {
      List<Double> line = new ArrayList<>();
      for (double[] col : series) {
        line.add(StatUtils.round(StatUtils.corr(row, col), 2));
      }
      matrix.add(line);
    }
    return matrix;
  }

  // 월 난방도일 = max(0, 기준온도 - 월평균기온) * 해당 월 일수
  private double getHeatingDegreeDays(GasDTO gas) {
    int days = YearMonth.parse(gas.getYm()).lengthOfMonth();
    return Math.max(0, HDD_BASE_TEMP - gas.getAvgTemp()) * days;
  }

  private double[] toArray(List<GasDTO> list, ToDoubleFunction<GasDTO> getter) {
    return list.stream().mapToDouble(getter).toArray();
  }

  /* ---------- 시·도별 지표 ---------- */

  // GET /api/national/regions 응답: 17개 시도 목록 (공급량, 인구는 기준 연도 DB 집계)
  public List<NationalRegionDTO> getRegions() {
    String year = getBaseYear();
    String prevYear = getPrevYear(year);

    Map<Long, List<GasDTO>> monthlyByRegion = gasMapper.getRegionMonthly().stream()
        .collect(Collectors.groupingBy(GasDTO::getRegionId));

    Map<Long, Double> prevSupply = gasMapper.getRegionAnnualStats(prevYear).stream()
        .collect(Collectors.toMap(GasDTO::getRegionId, GasDTO::getSupply));

    List<NationalRegionDTO> result = new ArrayList<>();
    for (GasDTO row : gasMapper.getRegionAnnualStats(year)) {
      int regionId = row.getRegionId().intValue();
      if (regionId < 1 || regionId > 17) continue;

      List<GasDTO> monthly = monthlyByRegion.getOrDefault(row.getRegionId(), List.of());

      result.add(NationalRegionDTO.builder()
          .id(REGION_CODES[regionId])
          .name(REGION_NAMES[regionId])
          .supply(StatUtils.round(row.getSupply() / 1000.0, 1))      // 천㎥ -> 백만㎥
          .supplyYoy(calcYoy(row.getSupply(), prevSupply.get(row.getRegionId())))
          .pop(StatUtils.round(row.getPopulation() / 10000.0, 1))    // 명 -> 만 명
          .sensitivity(getSensitivity(monthly))
          .mape(MOCK_MAPE[regionId])
          .trend(getPopulationTrend(monthly, year, prevYear))
          .lo(getAvgTemp(monthly, "-01"))
          .hi(getAvgTemp(monthly, "-08"))
          .build());
    }
    return result;
  }

  // 겨울(12~2월) 기온 1°C 하락 시 공급량 증가율(%): 공급량을 기온에 단순 회귀한 기울기 / 평균 공급량
  private double getSensitivity(List<GasDTO> monthly) {
    List<GasDTO> winter = monthly.stream()
        .filter(g -> WINTER_MONTHS.contains(g.getYm().substring(5)))
        .toList();
    if (winter.size() < 2) return 0.0;

    double[] temp = winter.stream().mapToDouble(GasDTO::getAvgTemp).toArray();
    double[] supply = winter.stream().mapToDouble(GasDTO::getSupply).toArray();
    return StatUtils.round(-StatUtils.slope(temp, supply) / StatUtils.mean(supply) * 100, 1);
  }

  // 인구 증감률(%/년): 기준 연도 월평균 인구 vs 전년 월평균 인구
  private double getPopulationTrend(List<GasDTO> monthly, String year, String prevYear) {
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

  // 전체 연도 중 특정 월(예: "-01")의 평균기온
  private double getAvgTemp(List<GasDTO> monthly, String monthSuffix) {
    double avg = monthly.stream()
        .filter(g -> g.getYm().endsWith(monthSuffix))
        .mapToDouble(GasDTO::getAvgTemp)
        .average().orElse(0);
    return StatUtils.round(avg, 1);
  }
}
