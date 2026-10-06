package com.commit.project2.dto;

import lombok.Data;

@Data
public class MonthDTO {
  //months, prevMonths의 배열에 사용됨(region.js의 d.m, d.temp, d.value, d.forecast)
  //GasDTO(DB 한 줄)와 키 이름,월 표기(0~11)·단위가 달라 응답용으로 따로 생성
  //실적(forecast=false)과 예측(forecast=true)을 같은 그릇에 담아 화면에서 구분
  //-> 2026은 현재 m가 6행/ 이전 연도는 m이 12행 / forecast 가 true 면 뒤에 '-soft' 를 붙여서 연한 색으로 표현
  //-> DB엔 2026년이 6개월(1~6월)뿐이라, Service에서 7~12월을 예측값(forecast=true)으로 채워 항상 12개로 응답
  private Integer m; //월(1월 = 0 ~ 12월 = 11)
  private Double temp; //월 평균 기온
  private Double value; //공급량(백만)
  private boolean forecast; //예측값이면 true, DB 실적은 기본값 false
}
