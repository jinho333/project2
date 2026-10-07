package com.commit.project2.service;

import com.commit.project2.dto.*;
import com.commit.project2.mapper.GasMapper;
import com.commit.project2.mapper.RegionMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.time.YearMonth;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class RegionService {

  private final GasMapper gasMapper;        // 현재는 미사용 (다른 파트가 공용 쿼리를 추가하면 쓰게 됨)
  private final RegionMapper regionMapper;  // region 파트 전용 쿼리
  private final RestClient restClient;      // FastAPI 호출용 (지역 목록의 MAPE 를 받아올 때만 사용)

  /* 기온 구간 라벨 — 인덱스 0=가장 추움, 11=가장 따뜻함.
     region.js 의 bins[0]/bins[11] 가정과 반드시 일치해야 함. */
  private static final String[] TEMP_BIN_LABELS = {
      "<-6", "-6~-3", "-3~0", "0~3", "3~6", "6~9",
      "9~12", "12~15", "15~18", "18~21", "21~24", "≥24"
  };


  /*  API ① 지역 목록 + 2025년 연간 공급량, 인구
   *    - 쿼리에서 단위 환산까지 다 하므로 Service 는 그대로 전달*/
  public List<RegionSummaryDTO> getRegionSummaries() {
    List<RegionSummaryDTO> list = regionMapper.getRegionSummaries();   // 기존 쿼리 그대로

    // 번호가 같은 지역에 1월·8월 평균기온, 인구 증감률을 넣어줌
    List<TempRangeDTO> temps = regionMapper.getTempRanges();
    for (RegionSummaryDTO region : list) {
      for (TempRangeDTO temp : temps) {
        if (temp.getId().equals(region.getId())) {
          region.setLo(temp.getLo());
          region.setHi(temp.getHi());
          region.setTrend(temp.getTrend());   // 인구 증감률(%/년)
        }
      }
    }

    // 이름이 같은 지역에 예측 오차율(MAPE)을 넣어줌 — FastAPI 의 GET /mape 에서 받아옴
    // FastAPI 서버가 꺼져 있어도 지역 목록은 나가야 하므로 try-catch 로 감쌈 (실패하면 mape 만 비어서 나감)
    try {
      PyMapeDTO py = restClient.get()
          .uri("/mape")
          .retrieve()
          .body(PyMapeDTO.class);

      for (RegionSummaryDTO region : list) {
        for (PyMapeItemDTO item : py.getItems()) {
          if (item.getRegion().equals(region.getName())) {
            region.setMape(item.getMape());
          }
        }
      }
    } catch (Exception e) {
      // FastAPI 가 꺼져 있거나 /mape 주소가 없는 경우 → MAPE 없이 진행
    }
    return list;
  }

  /* ============================================================
   *  API ② 선택 지역/연도의 통계 묶음 (RegionStatsDTO)
   *    1) months        : 선택 연도 월별 (12개 보장, 2026은 7~12월 forecast)
   *    2) prevMonths    : 전년도 월별 (2021 선택 시 null)
   *    3) tempBins      : 선택 연도를 3°C 12구간으로 묶기
   *    4) popQ          : 전체 기간 분기별 평균 인구 (2021.Q1 ~ 2026.Q2)
   *    5) popCorr       : (인구, 공급량) 피어슨 상관계수 (전체 기간)
   * ============================================================ */
  public RegionStatsDTO getRegionStats(Long regionId, int year) {

    /* ----- 1) 선택 연도 월별 조회 (최대 12건, 2026은 1~6월만) ----- */
    List<MonthDTO> rawMonths = regionMapper.getMonthsByYear(regionId, year);

    /* ----- 2) 전년도 월별 조회
     *   - 보강용(forecast=true) + prevMonths 응답 양쪽에 재사용
     *   - 2021 선택 시 2020 데이터는 DB 에 없으므로 조회 생략 → null */
    List<MonthDTO> prevMonths = (year > 2021)
        ? regionMapper.getMonthsByYear(regionId, year - 1)
        : null;

    /* 보강: rawMonths 가 12건이 안 되면 비는 월을 prevMonths 로 채움(forecast=true).
     *       (주로 2026 년 7~12월. 추후 FastAPI 예측 결과로 교체 가능) */
    List<MonthDTO> months = fillMissingMonths(rawMonths, prevMonths);


    /* ----- 3) 기온 구간 집계 ----- */
    List<TempBinDTO> tempBins = buildTempBins(months, year);


    /* ----- 4) & 5) 전체 월 원본 → 분기 평균 + 상관계수 ----- */
    List<GasDTO> all = regionMapper.getGasAllMonths(regionId);
    List<PopQDTO> popQ = buildPopQ(all);
    double popCorr = pearsonCorrelation(all);


    /* ----- 응답 조립 ----- */
    RegionStatsDTO dto = new RegionStatsDTO();
    dto.setMonths(months);
    dto.setPrevMonths(prevMonths);   // null 그대로 보내는 게 프론트 계약 (2021년 선택 시)
    dto.setTempBins(tempBins);
    dto.setPopQ(popQ);
    dto.setPopCorr(popCorr);
    return dto;
  }

  /* ============================================================
   *  내부 헬퍼 메서드들
   * ============================================================ */

  /**
   * rawMonths 가 12개 미만이면 빠진 월(index 0~11)을 prevMonths 의 같은 월로 채움.
   * 채운 월은 forecast=true 로 플래그 → 프론트가 연한 색으로 그림.
   *
   * 왜 "전년 동월" 로 채우는가?
   *   - 가스 수요는 계절성이 매우 강해서 "같은 월" 반복이 가장 안전한 기본값.
   *   - 추후 FastAPI /forecast 응답으로 교체하면 됨 (이 메서드만 바꾸면 됨).
   *
   * prevMonths 가 null 이거나 그 월이 없으면 보강하지 않음 (= 그 월은 응답에서 빠짐).
   * 다만 현재 데이터 범위상 2026년을 2025년이 채우므로 결손은 없음.
   */
  private List<MonthDTO> fillMissingMonths(List<MonthDTO> rawMonths,
                                           List<MonthDTO> prevMonths) {
    if (rawMonths.size() >= 12) {
      return rawMonths;   // 이미 꽉 차 있으면 그대로
    }
    // 월(0~11) → MonthDTO 로 바꿔 빠른 조회
    Map<Integer, MonthDTO> cur = new HashMap<>();
    for (MonthDTO m : rawMonths) cur.put(m.getM(), m);

    Map<Integer, MonthDTO> prev = new HashMap<>();
    if (prevMonths != null) {
      for (MonthDTO m : prevMonths) prev.put(m.getM(), m);
    }

    List<MonthDTO> filled = new ArrayList<>();
    for (int m = 0; m < 12; m++) {
      if (cur.containsKey(m)) {
        filled.add(cur.get(m));          // 실적 그대로 (forecast=false)
      } else if (prev.containsKey(m)) {
        MonthDTO src = prev.get(m);
        MonthDTO f = new MonthDTO();
        f.setM(m);
        f.setTemp(src.getTemp());
        f.setValue(src.getValue());
        f.setForecast(true);             // 예측 플래그 ON
        filled.add(f);
      }
      // 보강할 데이터조차 없으면 조용히 건너뜀 (현 데이터 범위에선 발생하지 않음)
    }
    return filled;
  }

  /**
   * 선택 연도 월별 데이터를 3°C 간격 12구간으로 집계.
   * 구간 index 결정 → tempBinIndex() 참고.
   * value = (구간에 떨어진 월들의 총 공급량) ÷ (그 월들의 일수 합)
   *   = 그 구간에 속한 "하루 평균 공급량"
   */
  private List<TempBinDTO> buildTempBins(List<MonthDTO> months, int year) {
    double[] supplySum = new double[12];   // 구간별 공급량 합 (백만㎥)
    int[]    daysSum   = new int[12];      // 구간별 날짜 수 합

    for (MonthDTO m : months) {
      int idx = tempBinIndex(m.getTemp());
      // 월 길이는 윤년 반영이 필요 → YearMonth 사용
      int monthLen = YearMonth.of(year, m.getM() + 1).lengthOfMonth();
      supplySum[idx] += m.getValue();
      daysSum[idx]   += monthLen;
    }

    List<TempBinDTO> result = new ArrayList<>(12);
    for (int i = 0; i < 12; i++) {
      TempBinDTO bin = new TempBinDTO();
      bin.setLabel(TEMP_BIN_LABELS[i]);
      bin.setDays(daysSum[i]);
      // 해당 구간에 들어온 일이 없으면 value=0 (0일 나누기 방지)
      bin.setValue(daysSum[i] > 0
          ? round(supplySum[i] / daysSum[i], 2)
          : 0.0);
      result.add(bin);
    }
    return result;
  }

  /**
   * 기온(°C) → 구간 인덱스(0~11).
   *   -∞ ..< -6     → 0 (가장 추움)
   *   [-6, -3)      → 1
   *   [-3,  0)      → 2
   *    ...
   *   [21, 24)      → 10
   *   24 이상       → 11 (가장 따뜻함)
   */
  private int tempBinIndex(double t) {
    if (t < -6) return 0;
    if (t >= 24) return 11;
    // [-6, 24) 구간을 +6 평행이동해서 [0, 30) 로 만든 뒤 3으로 나누면 0~9
    // 거기에 +1 → 1~10 범위에 들어옴
    return (int) ((t + 6) / 3) + 1;
  }

  /**
   * 월별 원본 리스트 → 분기별 평균 인구 리스트.
   *   한 분기 = 연속된 3개월 (YM 기준으로 (월-1)/3 = 분기)
   *   값은 "분기 안 월들의 인구 평균" ÷ 10000 → 만 명 단위로 환산
   */
  private List<PopQDTO> buildPopQ(List<GasDTO> all) {
    // key = "2021-1" 처럼 "연도-분기" 로 묶음 (TreeMap 이면 자동 정렬되지만
    // all 이 이미 YM 순이라 LinkedHashMap/ArrayList 로도 충분. 가독성 위해 2단 구조)
    Map<String, double[]> acc = new java.util.LinkedHashMap<>();  // value = {합, 개수}
    for (GasDTO g : all) {
      String ym = g.getYm();                       // '2021-01'
      int yr = Integer.parseInt(ym.substring(0, 4));
      int mo = Integer.parseInt(ym.substring(5, 7));
      int q  = (mo - 1) / 3 + 1;                   // 1~4
      String key = yr + "-" + q;
      double[] slot = acc.computeIfAbsent(key, k -> new double[2]);
      slot[0] += (g.getPopulation() == null ? 0 : g.getPopulation());
      slot[1] += 1;
    }

    List<PopQDTO> result = new ArrayList<>(acc.size());
    for (Map.Entry<String, double[]> e : acc.entrySet()) {
      String[] parts = e.getKey().split("-");
      int yr = Integer.parseInt(parts[0]);
      int q  = Integer.parseInt(parts[1]);
      double avg = e.getValue()[1] > 0 ? e.getValue()[0] / e.getValue()[1] : 0.0;

      PopQDTO dto = new PopQDTO();
      // '21.Q1' 형식 (연도 뒤 두 자리 + Q + 분기)
      dto.setLabel(String.format("%02d.Q%d", yr % 100, q));
      dto.setValue(round(avg / 10000.0, 1));       // 명 → 만 명
      result.add(dto);
    }
    return result;
  }

  /**
   * (인구, 공급량) 피어슨 상관계수.
   *   r = Σ((x-x̄)(y-ȳ)) / √(Σ(x-x̄)² · Σ(y-ȳ)²)
   *   값은 -1 ~ 1. 양쪽 중 하나라도 분산이 0이면 0 반환 (상수 데이터).
   *   스케일에 무관하므로 원본 단위(명·만㎥) 그대로 넣어도 결과 같음.
   */
  private double pearsonCorrelation(List<GasDTO> all) {
    int n = all.size();
    if (n < 2) return 0.0;

    double sumX = 0, sumY = 0;
    for (GasDTO g : all) {
      sumX += toDouble(g.getPopulation());
      sumY += toDouble(g.getSupply());
    }
    double meanX = sumX / n;
    double meanY = sumY / n;

    double num = 0, denX = 0, denY = 0;
    for (GasDTO g : all) {
      double dx = toDouble(g.getPopulation()) - meanX;
      double dy = toDouble(g.getSupply())     - meanY;
      num  += dx * dy;
      denX += dx * dx;
      denY += dy * dy;
    }
    if (denX == 0 || denY == 0) return 0.0;
    return round(num / Math.sqrt(denX * denY), 2);
  }

  /** null 안전 double 변환 (DB 결측치 보호용). */
  private double toDouble(Number v) {
    return v == null ? 0.0 : v.doubleValue();
  }

  /** 소수점 digits 자리에서 반올림. */
  private double round(double v, int digits) {
    double p = Math.pow(10, digits);
    return Math.round(v * p) / p;
  }
}
