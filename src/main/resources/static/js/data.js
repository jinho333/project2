/* =====================================================================
 * data.js — 대시보드용 데이터 + 간단한 예측 계산
 * ---------------------------------------------------------------------
 * ⚠️ 지금 데이터는 실제 통계가 아닌 "샘플(가짜) 데이터"
 *    아래 RAW 값에 난수를 섞어 월별 값을 만들어 냄
 *    → 나중에 DB / API 의 실제 값으로 바꿔야 하는 파일
 *
 * 다른 파일에서는 window.GasData (G) 로 사용 (파일 맨 아래 참고)
 *   regions       : 17개 지역 데이터 배열
 *   forecast()    : 예측 페이지용 예측값 계산
 *   yearProfile() : 시뮬레이션용 12개월 공급량 계산
 * ===================================================================== */
// Mock data + simple model for the City Gas dashboard UI kit. Values are illustrative, not real statistics.
(function () {
  // 난수 생성기 (seed 고정 → 새로고침해도 매번 같은 값이 나옴)
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  // noise(a): -a ~ +a 사이 랜덤 값 (값을 조금씩 흔들어서 실제 데이터처럼 보이게)
  const noise = a => (rnd() * 2 - 1) * a;

  // 지역 기본 정보 (한 줄 = 한 지역)
  // [id, 이름, 지도 열, 지도 행, 2025 연간 공급량(백만㎥), 인구(만 명),
  //  기저부하 비율(기온과 상관없이 쓰는 양, 산업용 등), 1월 평균기온, 8월 평균기온,
  //  인구 증감률(%/년), MAPE(예측 오차 %)]
  // id, name, col, row, annual supply 2025 (백만㎥), population (만명), base-load share, Jan mean, Aug mean, pop trend %/yr, MAPE %
  const RAW = [
    ['gg', '경기', 1, 0, 7420, 1370, 0.32, -3.6, 26.4, 0.8, 5.1],
    ['gw', '강원', 2, 0, 690, 152, 0.28, -5.4, 24.6, -0.4, 9.2],
    ['ic', '인천', 0, 1, 2310, 300, 0.40, -2.2, 25.9, 0.5, 5.8],
    ['se', '서울', 1, 1, 4860, 935, 0.22, -2.4, 26.8, -0.6, 4.3],
    ['cb', '충북', 2, 1, 980, 159, 0.38, -3.9, 26.1, 0.1, 6.9],
    ['gb', '경북', 3, 1, 1650, 254, 0.52, -1.8, 26.0, -0.7, 7.1],
    ['cn', '충남', 0, 2, 1480, 213, 0.55, -2.6, 25.8, 0.3, 7.4],
    ['sj', '세종', 1, 2, 240, 39, 0.20, -3.4, 26.2, 3.1, 10.1],
    ['dj', '대전', 2, 2, 760, 144, 0.26, -1.9, 26.5, -0.5, 5.6],
    ['dg', '대구', 3, 2, 1120, 236, 0.30, 0.2, 27.4, -0.6, 5.9],
    ['us', '울산', 4, 2, 1720, 110, 0.78, 1.6, 26.7, -0.8, 8.6],
    ['jb', '전북', 1, 3, 820, 173, 0.34, -0.8, 26.4, -0.9, 6.4],
    ['gn', '경남', 3, 3, 1540, 324, 0.48, 1.2, 26.3, -0.5, 6.7],
    ['bs', '부산', 4, 3, 1380, 328, 0.35, 3.4, 27.0, -0.8, 6.1],
    ['gj', '광주', 0, 4, 610, 141, 0.27, 0.6, 27.1, -0.4, 5.4],
    ['jn', '전남', 1, 4, 910, 180, 0.66, 1.0, 26.2, -0.7, 7.8],
    ['jj', '제주', 0, 6, 60, 67, 0.30, 6.0, 27.5, 0.2, 12.4],
  ];

  // 월 이름. 배열 인덱스 0 = 1월 … 11 = 12월
  const MONTHS = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];
  // 계절 판별: 12·1·2월 겨울, 3~5월 봄, 6~8월 여름, 9~11월 가을
  const season = m => (m === 11 || m <= 1 ? 'winter' : m <= 4 ? 'spring' : m <= 7 ? 'summer' : 'autumn'); // m = 0..11
  const SEASON_KO = { spring: '봄', summer: '여름', autumn: '가을', winter: '겨울' };
  // 1월 기온(lo)~8월 기온(hi) 사이를 코사인 곡선으로 이어서 m월의 평균기온을 추정
  const monthTemp = (lo, hi, m) => (lo + hi) / 2 - ((hi - lo) / 2) * Math.cos((2 * Math.PI * (m - 0.35)) / 12);
  // 난방도일(HDD): 18°C 보다 얼마나 추운지. 18°C 이상이면 0 (난방 필요 없음)
  const hdd = t => Math.max(0, 18 - t);

  // 연간 공급량 → 12개월로 나누기
  //   월 공급량 = 기저부하(매달 똑같이) + 난방부하(추운 달일수록 많이, HDD 비율대로)
  function monthly(r, annual, lo, hi) {
    const T = MONTHS.map((_, m) => monthTemp(lo, hi, m));
    const H = T.map(hdd), sH = H.reduce((a, b) => a + b, 0);
    return T.map((t, m) => ({ m, temp: t, value: annual * (r.base / 12 + (1 - r.base) * (H[m] / sH)) }));
  }

  // 데이터가 있는 연도
  const YEARS = [2021, 2022, 2023, 2024, 2025, 2026];
  // RAW 배열을 객체로 바꾸고, 연도별·분기별·기온구간별 데이터를 만들어 붙임
  const regions = RAW.map(([id, name, col, row, supply, pop, base, lo, hi, trend, mape]) => {
    const r = { id, name, col, row, supply, pop, base, lo, hi, trend, mape };
    // r.years[연도] = 12개월 데이터. 2026년 9월 이후(m >= 8)는 forecast: true (예측값)
    r.years = {};
    YEARS.forEach(y => {
      const dT = noise(0.9);
      const ann = supply * (1 + 0.012 * (y - 2025)) * (1 - dT * 0.03 * (1 - base)) * (1 + noise(0.015));
      r.years[y] = monthly(r, ann, lo + dT, hi + dT * 0.5).map(d => ({ ...d, value: d.value * (1 + noise(0.04)), forecast: y === 2026 && d.m >= 8 }));
    });
    // 기온 민감도: 겨울에 1°C 내려가면 공급량이 몇 % 늘어나는지
    // sensitivity: % increase in winter-month supply per 1°C drop
    const T0 = MONTHS.map((_, m) => monthTemp(lo, hi, m)), H0 = T0.map(hdd), sH0 = H0.reduce((x, y) => x + y, 0);
    const heatPerHdd = ((1 - base) * supply) / sH0;
    const w = [0, 1, 11];
    const winter = w.reduce((s, i) => s + supply * (base / 12) + heatPerHdd * H0[i], 0);
    r.sensitivity = ((heatPerHdd * w.length) / winter) * 100 * 1.6;
    // 분기별 인구 (2021 Q1 ~ 2026 Q2, 22개). 라벨 예: '21.Q1'
    // quarterly population 2021Q1..2026Q2
    r.popQ = [];
    for (let q = 0; q < 22; q++) r.popQ.push({ label: `${String(2021 + Math.floor(q / 4)).slice(2)}.Q${(q % 4) + 1}`, value: pop * (1 + (trend / 100) * ((q - 19) / 4)) * (1 + noise(0.0015)) });
    // 기온 구간별 일평균 공급량: 365일치 기온을 만들어 3°C 간격 12구간으로 나눠 평균
    // daily temps → 12 temperature bins (last full year)
    const bins = Array.from({ length: 12 }, () => ({ sum: 0, n: 0 }));
    const days = [];
    for (let d = 0; d < 365; d++) {
      const t = monthTemp(lo - 2.5, hi, d / 30.4 - 0.5) + noise(5);
      days.push(t);
    }
    const Hd = days.map(hdd), sHd = Hd.reduce((x, y) => x + y, 0);
    days.forEach((t, i) => {
      const v = supply * (base / 365 + (1 - base) * (Hd[i] / sHd)) * (1 + noise(0.06));
      // 기온 → 구간 번호 (0: -6°C 미만, 11: 24°C 이상)
      const bi = t < -6 ? 0 : t >= 24 ? 11 : Math.floor((t + 6) / 3) + 1;
      bins[bi].sum += v; bins[bi].n += 1;
    });
    const BL = ['<−6', '−6', '−3', '0', '3', '6', '9', '12', '15', '18', '21', '≥24'];
    r.tempBins = bins.map((b, i) => ({ label: BL[i], value: b.n ? b.sum / b.n : 0, days: b.n, lo: i === 0 ? -99 : -6 + (i - 1) * 3 }));
    return r;
  });

  // 예측 함수: 최근 실적 12개월 + 앞으로 horizon개월(3 또는 6) 예측
  //   옵션  : range(기온 범위), popPct(인구 변화 %), tempShift(기온 이동)
  //   반환값: { hist: 실적 배열, fut: 예측 배열 [{ label, value, lo(하한), hi(상한) }] }
  // Forecast: last 12 actual months (2025.09–2026.08) + 6 forecast months (2026.09–2027.02)
  function forecast(r, { horizon = 6, tempShift = 0, popPct = 0, range } = {}) {
    const lo = range ? range[0] : r.lo, hi = range ? range[1] : r.hi;
    const hist = [...r.years[2025].slice(8), ...r.years[2026].slice(0, 8)];
    const labels = [...['25.09', '25.10', '25.11', '25.12'], ...Array.from({ length: 8 }, (_, i) => `26.${String(i + 1).padStart(2, '0')}`)];
    const futM = Array.from({ length: horizon }, (_, i) => (8 + i) % 12);
    const futL = futM.map((m, i) => `${i < 4 ? '26' : '27'}.${String(m + 1).padStart(2, '0')}`);
    // 인구 1% 증가 → 공급량 0.85% 증가로 가정
    const annual = r.supply * 1.012 * (1 + popPct / 100 * 0.85);
    const mon = monthly(r, annual, lo + tempShift, hi + tempShift);
    // 신뢰구간: MAPE 만큼 위아래로 넓힘. 먼 미래일수록(i 가 클수록) 범위가 더 넓어짐
    const fut = futM.map((m, i) => { const v = mon[m].value; const e = (r.mape / 100) * (0.8 + i * 0.18); return { label: futL[i], m, temp: mon[m].temp, value: v, lo: v * (1 - e), hi: v * (1 + e) }; });
    return { hist: hist.map((h, i) => ({ ...h, label: labels[i] })), fut };
  }

  // 시뮬레이션용: 입력한 기온 범위·인구 변화로 12개월 공급량 계산
  function yearProfile(r, { range, popPct = 0 } = {}) {
    const lo = range ? range[0] : r.lo, hi = range ? range[1] : r.hi;
    return monthly(r, r.supply * (1 + popPct / 100 * 0.85), lo, hi);
  }

  // 상관계수 표 (전국 통계 페이지 히트맵). ⚠️ 실제 데이터로 계산한 값이 아닌 고정 숫자
  const CORR_LABELS = ['공급량', '평균기온', '난방도일', '인구', '세대수', '산업생산'];
  const CORR = [
    [1, -0.91, 0.94, 0.42, 0.47, 0.28],
    [-0.91, 1, -0.97, -0.05, -0.04, 0.06],
    [0.94, -0.97, 1, 0.06, 0.05, -0.03],
    [0.42, -0.05, 0.06, 1, 0.96, 0.31],
    [0.47, -0.04, 0.05, 0.96, 1, 0.27],
    [0.28, 0.06, -0.03, 0.31, 0.27, 1],
  ];

  // 다른 js 파일에서 쓸 수 있게 window 에 등록
  window.GasData = { regions, YEARS, MONTHS, season, SEASON_KO, forecast, yearProfile, CORR_LABELS, CORR, monthTemp };
})();
