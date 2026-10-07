package com.commit.project2.util;

import java.util.Arrays;

// 통계 계산용 static 메서드 모음 (전국·지역 서비스에서 공용으로 사용)
// 인스턴스를 만들 필요가 없어서 생성자는 막아 둠
public class StatUtils {
  private StatUtils() {
  }

  // 소수점 digits 자리 반올림
  public static double round(double value, int digits) {
    double scale = Math.pow(10, digits);
    return Math.round(value * scale) / scale;
  }

  // 피어슨 상관계수
  public static double corr(double[] x, double[] y) {
    double mx = mean(x), my = mean(y);
    double sxy = 0, sxx = 0, syy = 0;
    for (int i = 0; i < x.length; i++) {
      sxy += (x[i] - mx) * (y[i] - my);
      sxx += (x[i] - mx) * (x[i] - mx);
      syy += (y[i] - my) * (y[i] - my);
    }
    return sxy / Math.sqrt(sxx * syy);
  }

  // 단순 선형회귀 기울기 (y = a * x + b 의 a)
  public static double slope(double[] x, double[] y) {
    double mx = mean(x), my = mean(y);
    double sxy = 0, sxx = 0;
    for (int i = 0; i < x.length; i++) {
      sxy += (x[i] - mx) * (y[i] - my);
      sxx += (x[i] - mx) * (x[i] - mx);
    }
    return sxy / sxx;
  }

  // 평균 (값이 없으면 0)
  public static double mean(double[] values) {
    return Arrays.stream(values).average().orElse(0);
  }
}
