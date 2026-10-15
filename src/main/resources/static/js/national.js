/* =====================================================================
 * national.js — 전국 통계 페이지 (/national)
 *
 * 화면 구성 (위 → 아래)
 *   KPI 5개 → 지역별 공급 현황(트리맵) + 광역경제권별 공급 비중(도넛) → 연도별 추이
 *   → 기온 민감도 + 예측 오차(막대) → 상관계수(히트맵) → 데이터 안내
 * 코드 구성: ① 상수  ② 계산·표시 도구  ③ 섹션별 그리기(화면 순서와 같음)  ④ 시작
 *
 * 용어 (처음 보면 헷갈리는 것)
 *   MAPE      예측 오차율. 예측이 실제와 평균 몇 % 다른지 (낮을수록 정확). FastAPI 값
 *   기온 민감도  기온이 1°C 내려갈 때 공급량이 몇 % 늘어나는지 (%/°C). FastAPI 값
 *   상관계수 r  -1 ~ +1. +1 에 가까우면 같이 늘고 줄고, -1 에 가까우면 반대로 움직임, 0 이면 관계가 안 보임
 *   전년 동월 대비  '작년 같은 달' 과의 차이. 겨울에 많고 여름에 적은 계절 패턴을 빼고 보려고 씀
 *   난방도일    기준온도(18°C)보다 추운 정도 × 일수. 추울수록 커지는 난방 수요 지표
 *   FastAPI 값은 예측 서버가 꺼져 있으면 null 로 옴 → 화면은 '–' 와 안내 문구로 대신함
 *
 * 사용하는 API (응답 모양은 common.js 맨 위 API 목록 참고)
 *   GET /api/regions            시·도별 지표 (공용 지역 목록, RegionSummaryDTO). D.loadRegions() 가 받아옴
 *   GET /api/national           전국 요약: 기준 연도, 증감률, 연도별 추이, 상관계수 (NationalDTO)
 * ===================================================================== */
(() => {
  const D = window.Dash, { C, fmt } = D;
  const $ = id => document.getElementById(id);

  /* ---------- ① 상수 ---------- */

  // MAPE 경고 기준(%): 예측 정확도를 해석하는 일반 관례(Lewis, 1982)에서 MAPE 10% 이하를 '매우 정확'으로 봄.
  //   가스 공급 업무에서 허용하는 오차를 알게 되면 그 값으로 바꿀 것 (이 상수 하나만 바꾸면 KPI·기준선·경고 설명이 함께 바뀜)
  //   8% 로 두었을 때는 17개 시·도 중 12곳이 걸려(평균 8.4% 근처) 경고로서 구분이 안 됨 → 10% 로 올림
  const MAPE_LIMIT = 10;
  const METRIC_TABS = [{ id: 'yoy', label: '전년 대비 증감률' }, { id: 'percap', label: '1인당 공급량' }];
  const TREND_VIEWS = [{ id: 'year', label: '연도별' }, { id: 'month', label: '월별' }];   // 연도별 추이 카드의 보기 스위치

  // 트리맵 색: 진할수록 큰 값. 글자색은 칸 색에 맞춰 어두운 글씨와 흰 글씨를 나눠 씀
  //  - 색 구분이 어려운 사용자에게도 인접한 단계가 구분되도록 밝기 차이가 분명한 단계로 고름
  //  - 전년 대비·1인당 모두 사이트 파랑 4단계(SEQ_COLORS): 이 페이지에서 파랑 = 양(진할수록 큼). 빨강은 예측 오차 카드의 경고색이라 '증가' 에 쓰지 않음
  //    전년 대비는 실제 범위(최소~최대)를 4단계로 나눔 → 가장 연한 칸도 증가일 수 있음. 감소가 섞이면 방향은 칸 안 숫자의 +/− 로 읽음
  //  - (이전: 전년 대비는 빨강 한 계열이었으나 경고색과 겹쳐 파랑으로 바꿈, 2026-10-14)
  //  - 1인당: 중간 파랑(--seq-4)은 검정·흰 글씨 모두 대비가 모자라 뺀 4단계
  //  - 값은 칸 안의 숫자로도 보이므로 색만으로 구분하지 않음
  // 막대 색: 지역은 이름이 있는 독립 항목이라 값으로 색을 나누지 않음(길이가 이미 값을 보여줌). 기준선이 있는 차트만 기준에 따라 두 그룹으로 나눔
  //   기온 민감도: 전국 값보다 높음 = 진한 파랑(--seq-5), 낮음 = 밝은 파랑 (흰 배경 대비 3:1 이상, 색 구분이 어려운 사용자도 밝기 차이로 구분할 수 있음)
  //   예측 오차: 기준(MAPE_LIMIT) 이상 = 경고 빨강(--red-500), 미만 = 회색(--ash). 막대마다 값 글자가 있어 회색 대비 2.8:1 은 허용 범위
  const SENS_LOW_COLOR = '#5b97d8';
  const SEQ_COLORS = ['--seq-1', '--seq-2', '--seq-3', '--seq-5'].map(v => `var(${v})`);
  const YOY_COLORS = SEQ_COLORS;   // 전년 대비도 같은 파랑 (위 트리맵 색 설명 참고)

  // 도넛 조각 색 (큰 권역부터 차례로). 색 구분이 어려운 사용자도 고려해 시뮬레이션으로 고름
  //  - 고리에서 이웃한 조각끼리 색 차이 ΔE 29 이상, 모든 색 쌍 ΔE 15.5 이상 (여러 색각 유형 시뮬레이션 모두)
  //  - 비슷해 보이기 쉬운 색 조합은 쓰지 않고, 밝기와 색상을 함께 다르게 했음. 공용 --cat 색은 다른 페이지가 쓰므로 건드리지 않음
  const DONUT_COLORS = ['#0072b2', '#6b6e66', '#3d9bd6', '#1d3f7a', '#6e9b1a', '#c76a9c', '#9c2a22'];

  // 도넛 권역: 정부 5+2 광역경제권 (5대 = 수도권·충청권·호남권·대경권·동남권, 2대 특별경제권 = 강원권·제주권)
  const GROUPS = [
    { label: '수도권', ids: [1, 9, 4] },   // 서울·경기·인천 (지역 번호는 DB REGION_ID)
    { label: '동남권', ids: [2, 7, 16] },
    { label: '충청권', ids: [6, 8, 11, 12] },
    { label: '대경권', ids: [3, 15] },
    { label: '호남권', ids: [5, 13, 14] },
    { label: '강원권', ids: [10] },
    { label: '제주권', ids: [17] }
  ];

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;   // 켜져 있으면 애니메이션 없이 바로 바뀜
  if (reduceMotion && window.Chart) Chart.defaults.animation = false;   // 모든 차트(막대, 추이, 월별 곡선 포함)에 한 번에 적용

  /* ---------- ② 계산·표시 도구 ---------- */

  const signed = v => (v > 0 ? '+' : v < 0 ? '−' : '') + fmt(Math.abs(v), 1);   // +6.3 / −2.1
  const corrText = v => (v === null || v === undefined || Number.isNaN(v)) ? '–' : (v < 0 ? '−' : '') + Math.abs(v).toFixed(2);   // 상관계수 (범례와 같은 마이너스 기호, 값이 없으면 '–')
  const pctText = v => Number.isFinite(v) ? `${signed(v)}%` : '–';   // 증감률 문구 (값이 없으면 '–')
  const esc = text => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));   // HTML 에 끼워 넣는 서버 글자의 특수문자를 무력화
  const percapOf = r => (r.supply * 1e6) / (r.pop * 1e4);                         // 백만㎥ / 만 명 → ㎥/인
  const sortedDesc = (rows, key) => [...rows].sort((a, b) => b[key] - a[key]);   // 원본은 그대로 두고 큰 순 정렬

  // 스위치형 탭: 버튼은 한 번만 만들고 선택 표시만 바꿈 → 선택 배경(슬라이더)이 버튼 사이를 미끄러지듯 이동
  // 반환값 sync() = 선택 배경 위치를 다시 맞춤 (숨겨져 있다가 보이게 될 때, 창 크기가 바뀔 때 호출)
  const slideTabs = (el, items, value, onChange) => {
    let current = value;
    const slider = document.createElement('span');
    slider.className = 'tab-slider';
    const sync = () => {
      el.querySelectorAll('.tab').forEach(b => b.classList.toggle('is-active', b.dataset.id === String(current)));
      const on = el.querySelector('.tab.is-active');
      if (!on || !on.offsetWidth) return;   // 숨겨진 상태에서는 크기를 알 수 없음
      slider.style.cssText = `width:${on.offsetWidth}px;height:${on.offsetHeight}px;transform:translate(${on.offsetLeft}px,${on.offsetTop}px)`;
    };
    D.renderTabs(el, items, value, id => {
      if (String(id) === String(current)) return;
      current = id;
      sync();
      onChange(id);
    });
    el.appendChild(slider);
    sync();
    if (document.fonts) document.fonts.ready.then(sync);          // 웹폰트가 늦게 적용되면 탭 폭이 바뀌므로 다시 맞춤
    requestAnimationFrame(() => el.classList.add('is-sliding'));   // 처음 위치를 잡을 때는 움직임 없이
    return sync;
  };
  const weightedAvg = (rows, key, total) => rows.reduce((sum, r) => sum + r[key] * r.supply, 0) / total;   // 공급량 가중 평균
  const swatches = colors => colors.map(c => `<i style="background:${c}"></i>`).join('');
  const inkOf = (step, steps, whiteFrom = steps - 1) => (step >= whiteFrom ? '#fff' : 'var(--ink)');   // 글자색: whiteFrom 단계부터 흰색 (기본은 가장 진한 단계만)

  // '2021-01 ~ 2026-06' → '2021년 1월 ~ 2026년 6월'
  const toKoreanPeriod = period => (period || '').split(' ~ ')
    .map(ym => ym.replace(/^(\d{4})-(\d{2})$/, (_, y, m) => `${y}년 ${+m}월`)).join(' ~ ');

  // 색 → 투명도 alpha (호버하지 않은 도넛 조각은 0.3, 지역 연동으로 흐려지는 막대는 더 연하게 0.55). '#rrggbb' 외의 색(color-mix 등)도 처리
  const fade = (color, alpha = 0.3) => {
    const m = /^#([0-9a-f]{6})$/i.exec(color);
    if (!m) return `color-mix(in srgb, ${color} ${alpha * 100}%, transparent)`;
    const n = parseInt(m[1], 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${alpha})`;
  };

  // 지역 클릭 → 지역 상세 페이지 (/region?region=id)
  // 상세 페이지는 공용 지역 목록(D.getRegions)의 id 로 지역을 찾으므로, 전국 API 의 id 도 같은 지역 번호(DB REGION_ID)를 씀
  // 등장 애니메이션은 페이지를 열었을 때 화면 안에 있는 차트만: 아래쪽 차트는 스크롤해서 볼 때쯤 이미 끝나 있어 의미가 없음.
  //   조작(토글, 마우스 연동)에 반응하는 애니메이션은 위치와 상관없이 유지. 동작 줄이기 설정이면 모두 끔
  const animateIn = el => !reduceMotion && el.getBoundingClientRect().top < window.innerHeight && el.getBoundingClientRect().bottom > 0;
  const quietIfBelow = (el, make) => {   // 화면 밖이면 만드는 동안만 기본 애니메이션을 끔 (공용 D.hbar 는 옵션을 받지 않아서 기본값을 잠깐 바꿈)
    if (animateIn(el)) return make();
    const prev = Chart.defaults.animation;
    Chart.defaults.animation = false;
    try { return make(); } finally { Chart.defaults.animation = prev; }
  };
  const goToRegion = id => { location.href = D.url(`region?region=${id}`); };

  // 여러 섹션이 같이 쓰는 값을 한 번만 계산해서 섹션 그리기 함수들(drawKpis, drawTreemap ...)에 똑같이 넘겨줌
  //   total 전국 공급량 합계 / bySensitivity·byMape 값이 큰 순 목록 / hasSens·hasMape FastAPI 값을 받았는지
  //   overLimit MAPE 경고 기준을 넘은 지역 / avgSens·avgMape 전국 대표값
  const summarize = (regions, national) => {
    const year = national.year;   // 기준 연도 (서버가 정함: 12개월이 모두 있는 가장 최근 연도)
    const total = sortedDesc(regions, 'supply').reduce((sum, r) => sum + r.supply, 0);
    const bySensitivity = sortedDesc(regions.filter(r => Number.isFinite(r.sensitivity)), 'sensitivity');   // 예측 서버(FastAPI)가 꺼져 있으면 민감도가 비어서(null) 옴
    const byMape = sortedDesc(regions, 'mape');
    return {
      regions, national, year, total, bySensitivity, byMape,
      prevYear: String(Number(year) - 1),
      hasMape: regions.some(r => r.mape !== null && r.mape !== undefined),   // 예측 서버(FastAPI)가 꺼져 있으면 MAPE 가 비어서(null) 옴
      overLimit: byMape.filter(r => r.mape >= MAPE_LIMIT),   // 경고 지역
      hasSens: bySensitivity.length > 0,
      avgSens: Number.isFinite(national.sensitivity) ? national.sensitivity : (bySensitivity.length ? weightedAvg(bySensitivity, 'sensitivity', total) : null),   // 서버(FastAPI)의 전국 값 우선
      avgMape: national.mape ?? weightedAvg(byMape, 'mape', total),   // 서버(FastAPI)의 전국 값 우선, 없으면 지역 값의 공급량 가중 평균
      period: toKoreanPeriod(national.corrPeriod)
    };
  };

  // 두 카드(연도별 추이·요인 상관)가 함께 쓰는 계산: 앞에 두어야 읽는 순서와 쓰이는 순서가 같음
  // 최소제곱 기울기 (x 가 1 늘 때 y 의 변화). 점이 2개 미만이거나 x 가 모두 같으면 null
  const slopeOf = pts => {
    const n = pts.length;
    if (n < 2) return null;
    const mx = pts.reduce((s, p) => s + p[0], 0) / n, my = pts.reduce((s, p) => s + p[1], 0) / n;
    const sxx = pts.reduce((s, p) => s + (p[0] - mx) ** 2, 0);
    return sxx > 0 ? pts.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0) / sxx : null;
  };

  // 같은 달끼리 비교한 쌍: 작년 같은 달이 있는 달만 [{ ym, month, dTemp: 기온 차이(°C), pct: 공급량 증감(%) }]
  const sameMonthPairs = monthly => {
    const byYm = new Map((monthly || []).map(m => [m.ym, m]));
    return (monthly || []).flatMap(m => {
      const [y, mo] = m.ym.split('-');
      const p = byYm.get(`${Number(y) - 1}-${mo}`);
      const ok = p && p.supply > 0 && typeof m.avgTemp === 'number' && typeof p.avgTemp === 'number';
      return ok ? [{ ym: m.ym, year: Number(y), month: Number(mo), dTemp: m.avgTemp - p.avgTemp, pct: (m.supply / p.supply - 1) * 100 }] : [];
    });
  };
  // 같은 달끼리 비교한 쌍이 이만큼은 있어야 기울기를 말함(겨울만은 더 적게 요구)
  const MIN_PAIRS = 12, MIN_WINTER_PAIRS = 8;
  // 최소~최대 문구 (같으면 하나만)
  const range = (xs, f) => { const a = Math.min(...xs), b = Math.max(...xs); return f(a) === f(b) ? `${f(a)}` : `${f(a)}~${f(b)}`; };

  /* ---------- ③ 섹션별 그리기 (화면 순서와 같음) ---------- */

  // 가장 최근 달을 작년 같은 달과 비교 (서버가 보낸 national.monthly 사용: [{ ym: '2026-06', supply, avgTemp }], 오래된 순)
  //   작년 같은 달이 없으면 증감률은 null (카드는 보여주되 증감 표시만 뺌)
  const latestMonthOf = monthly => {
    if (!monthly || !monthly.length) return null;
    const last = monthly[monthly.length - 1];
    const [y, m] = last.ym.split('-');
    const prev = monthly.find(x => x.ym === `${Number(y) - 1}-${m}`);
    return {
      year: y, month: Number(m), supply: last.supply,
      yoy: prev && prev.supply > 0 ? ((last.supply - prev.supply) / prev.supply) * 100 : null
    };
  };

  // 최근 12개월 합계와 직전 12개월 합계 (서버의 월별 줄 national.monthly, 오래된 순). 24개월이 연속으로 없으면 null → 이 카드만 빠짐
  //   연간(기준 연도) 대신 쓰는 이유: 기준 연도는 반년 묵은 값이라 월·누적과 방향이 엇갈려 보이고, 연도별 추이 카드가 이미 보여줌
  const rolling12Of = monthly => {
    if (!monthly || monthly.length < 24) return null;
    const rows = monthly.slice(-24), pos = m => Number(m.ym.slice(0, 4)) * 12 + Number(m.ym.slice(5));
    if (!rows.every((m, k) => Number.isFinite(m.supply) && (k === 0 || pos(m) === pos(rows[k - 1]) + 1))) return null;
    const sum = list => list.reduce((acc, m) => acc + m.supply, 0);
    const cur = sum(rows.slice(12)), prev = sum(rows.slice(0, 12));
    const ymText = ym => `${ym.slice(0, 4)}.${Number(ym.slice(5))}`;
    return { supply: cur, yoy: prev > 0 ? (cur / prev - 1) * 100 : null, from: ymText(rows[12].ym), to: ymText(rows[23].ym) };
  };

  // KPI 5개 (왼쪽 → 오른쪽): 최근 12개월 / 올해 누적 / 이번 달 / 기온 민감도 / 예측 오차율
  //   긴 기간 → 짧은 기간 순: 가장 믿을 만한 값을 첫 자리에, 감소폭이 −2 → −4 → −9% 로 커지는 이야기가 되게 하고, 아래 추이 카드(연도별 → 월별)와 같은 흐름
  //   전년 대비, 전분기 대비는 서버가 계산해서 보내줌. 올해 누적은 진행 중인 연도가 없으면 빠짐(그때는 4개)
  //   카드를 누르면 해당 카드로 이동: [카드 종류, HTML] → 종류별 도착 카드 id 는 KPI_TARGETS
  const KPI_TARGETS = { trend: 'trendCard', sens: 'sensCard', acc: 'accCard' };
  const KPI_TARGET_NAMES = { trend: '연도별 추이', sens: '지역별 기온 민감도', acc: '지역별 예측 오차' };   // 마우스를 올렸을 때 목적지 안내(카드 제목은 보기에 따라 바뀌어 고정 글자를 씀)
  // 증감 방향 글자: 화살표 아이콘과 색만으로는 화면 읽기 도구가 방향을 알 수 없어서 숨은 글자(.dl-hidden)로 덧붙임
  const dirText = d => Number.isFinite(d) ? `<span class="dl-hidden">${d >= 0 ? '증가' : '감소'} </span>` : '';
  const drawKpis = ({ national, avgSens, avgMape, hasMape, hasSens }) => {
    const ytd = national.ytd;   // 진행 중인 연도가 있을 때만 (올해 누적)
    const latest = latestMonthOf(national.monthly);   // 월별 데이터가 없으면 null → 이 카드만 빠짐
    const r12 = rolling12Of(national.monthly);
    const cards = [
      ['trend', r12 && D.kpi({ label: '최근 12개월 공급량', value: fmt(r12.supply), unit: '백만㎥', delta: r12.yoy, deltaLabel: `${dirText(r12.yoy)}직전 12개월 대비 · ${r12.from}~${r12.to}` })],
      ['trend', ytd && D.kpi({ label: `${ytd.year}년 누적 (1~${ytd.month}월)`, value: fmt(ytd.supply), unit: '백만㎥', delta: ytd.supplyYoy, deltaLabel: `${dirText(ytd.supplyYoy)}작년 1~${ytd.month}월 대비${Number.isFinite(ytd.tempDiff) && ytd.tempDiff !== 0 ? ` · 평균기온 ${fmt(Math.abs(ytd.tempDiff), 1)}°C ${ytd.tempDiff > 0 ? '높음' : '낮음'}` : ''}` })],
      // 이번 달 카드에는 기온 차이를 붙이지 않음: 여름처럼 난방이 적은 달은 기온이 낮아도 공급이 줄어 '기온 때문' 으로 오해할 수 있음
      ['trend', latest && D.kpi({ label: `${latest.year}년 ${latest.month}월 가정용 공급량`, value: fmt(latest.supply), unit: '백만㎥', delta: latest.yoy, deltaLabel: `${dirText(latest.yoy)}작년 같은 달 대비` })],
      // 제목 앞 색 네모(accent)는 두지 않음: 5장 중 이 카드만 있어 이유 없이 눈에 띄고, 지역 페이지의 '겨울 비중' 카드 방식을 옮겨 온 것이라 이 페이지에는 맞지 않음
      // 민감도: 큰 숫자는 '%' 만(단위 %/°C 는 난해), 뜻은 보조 문구가 설명. 실제 기록으로 구한 값(요인 카드, 약 4%)과 계산 방식이 달라 '예측 모델 추정' 이라고 밝힘
      ['sens', D.kpi({ label: '전국 기온 민감도', value: hasSens ? fmt(avgSens, 1) : '–', unit: '%', caption: '기온이 1°C 낮아지면 한 달 평균 공급량이 이만큼 늘어남 (예측 모델 추정)' })],
      // MAPE 는 비율이라 전분기와의 차이는 %p. (기준을 넘은 지역 수는 보여주지 않음: 예측 오차 카드의 범례와 빨간 막대가 이미 보여줌)
      ['acc', D.kpi({ label: '예측 오차율 (MAPE)', value: hasMape ? fmt(avgMape, 1) : '–', unit: '%', delta: national.mapeDelta, deltaUnit: '%p', deltaLabel: `${dirText(national.mapeDelta)}전분기 대비`, goodWhen: 'down' })]
    ].filter(([, html]) => html);
    $('kpis').innerHTML = cards.map(([, html]) => html).join('');
    [...$('kpis').children].forEach((el, k) => {   // 카드를 누르거나 Enter 를 누르면 해당 카드로 부드럽게 이동 (동작 줄이기 설정이면 바로)
      const target = $(KPI_TARGETS[cards[k][0]]);
      if (!target) return;
      // 도착한 카드를 잠깐 강조: 스크롤이 끝난 뒤(scrollend)에 켜서 '여기로 왔다' 를 알림. 이미 그 자리라 스크롤이 없으면 scrollend 가 안 오므로 1.5초 뒤에 켬
      let timer = null;
      const arrive = () => {
        clearTimeout(timer);
        window.removeEventListener('scrollend', arrive);
        target.classList.add('is-arrived');
        setTimeout(() => target.classList.remove('is-arrived'), 1500);
      };
      const go = () => {
        target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
        clearTimeout(timer);
        if (!reduceMotion && 'onscrollend' in window) {
          window.addEventListener('scrollend', arrive, { once: true });
          timer = setTimeout(arrive, 1500);
        } else {
          arrive();
        }
      };
      el.dataset.to = KPI_TARGETS[cards[k][0]];
      el.title = `${KPI_TARGET_NAMES[cards[k][0]]} 카드로 이동`;
      el.tabIndex = 0;
      el.setAttribute('role', 'link');
      el.onclick = go;
      el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } };
    });
  };

  // 지역별 공급 현황 (트리맵): 면적은 항상 기준 연도 공급량, 색만 토글(전년 대비 증감률 / 1인당 공급량)로 바뀜
  const drawTreemap = ({ regions, national, year, total }) => {
    const yoys = regions.map(r => r.supplyYoy).filter(Number.isFinite);   // 증감률이 없는(null) 지역은 색 범위 계산에서 제외
    const yoyMin = yoys.length ? Math.min(...yoys) : 0, yoyMax = yoys.length ? Math.max(...yoys) : 0;
    const perCapitaSorted = regions.map(percapOf).sort((a, b) => a - b);
    const perCapitaMin = perCapitaSorted[0], perCapitaMax = perCapitaSorted[perCapitaSorted.length - 1];
    // 제주·세종이 유난히 낮아서 최소~최대를 균등 분할하면 나머지가 두 색으로만 갈림 → 지역 수 기준 4분위로 나눔
    const perCapitaCuts = [1, 2, 3].map(k => perCapitaSorted[Math.floor((perCapitaSorted.length * k) / SEQ_COLORS.length)]);

    let metric = 'yoy';
    const lastPaint = {};   // 지난번에 칠한 칸 (토글할 때 이전 색에서 새 색으로 이어지게)

    // 칸 하나의 색·글자색·문구 (면적 값은 공통)
    const tileOf = r => {
      const perCapita = percapOf(r);
      const head = `<b>${esc(r.name)}</b>공급량 ${fmt(r.supply, 1)} 백만㎥ (${fmt((r.supply / total) * 100, 1)}%)<br>`;
      const yoyText = pctText(r.supplyYoy), perCapitaText = `${fmt(perCapita)}㎥/인·년`;
      const base = { id: r.id, label: esc(r.name), value: r.supply };
      if (metric === 'yoy') {
        // 증감률을 (최소 ~ 최대) 범위 안의 위치(0~1)로 바꾼 뒤 색 단계(0~3)로 나눔. 최대 = 최소이면 0으로 나누지 않게 1로 대신함
        const step = Number.isFinite(r.supplyYoy) ? Math.min(YOY_COLORS.length - 1, Math.floor(((r.supplyYoy - yoyMin) / (yoyMax - yoyMin || 1)) * YOY_COLORS.length)) : 0;
        return { ...base, color: YOY_COLORS[step], ink: inkOf(step, YOY_COLORS.length), note: yoyText, tip: `${head}전년 대비 ${yoyText}<br>1인당 ${perCapitaText}` };
      }
      const step = perCapitaCuts.filter(c => perCapita >= c).length;
      return { ...base, color: SEQ_COLORS[step], ink: inkOf(step, SEQ_COLORS.length), note: `${fmt(perCapita)}㎥`, tip: `${head}1인당 ${perCapitaText}<br>전년 대비 ${yoyText}` };
    };

    // 토글로 바꿨을 때: 새로 그린 칸을 이전 색에서 새 색으로 0.3초 동안 전환
    const fadeFromPrevious = data => data.forEach(d => {
      const prev = lastPaint[d.id];
      lastPaint[d.id] = d;
      const el = prev && $('treemap').querySelector(`.tm-cell[data-id="${d.id}"] .tm-inner`);
      if (!el) return;
      el.style.transition = 'none';
      el.style.background = prev.color;
      el.style.color = prev.ink;
      void el.offsetWidth;   // 이전 색으로 한 번 그려진 뒤 새 색으로 바뀌게 강제
      el.style.transition = 'background-color 320ms var(--ease-out), color 320ms var(--ease-out)';
      el.style.background = d.color;
      el.style.color = d.ink;
    });

    // 색 범례: 어떤 색이 큰 값인지 알려줌
    const legendOf = () => metric === 'yoy'
      ? `<span>${signed(yoyMin)}%</span>${swatches(YOY_COLORS)}<span>${signed(yoyMax)}%</span><span class="tm-legend-note">전국 평균 ${pctText(national.supplyYoy)} · 진할수록 많이 증가</span>`
      : `<span>${fmt(perCapitaMin)}㎥</span>${swatches(SEQ_COLORS)}<span>${fmt(perCapitaMax)}㎥</span><span class="tm-legend-note">1인당 연간 공급량 · 진할수록 많음</span>`;

    // 칸이 너무 작아 이름이 안 들어간 지역(제주·세종 등)은 트리맵 아래에 한 줄로 알려줌 (화면 폭이 바뀌면 대상도 바뀜)
    const listSmallTiles = data => {
      const noteById = Object.fromEntries(data.map(d => [d.id, d]));
      const small = [...$('treemap').querySelectorAll('.tm-cell')]
        .filter(cell => !cell.querySelector('.tm-inner b'))   // 이름 글자가 그려지지 않은 칸
        .map(cell => noteById[cell.dataset.id])
        .filter(Boolean)
        .map(d => `${d.label} ${d.note}`);
      $('treemapSmall').innerHTML = small.length ? `작은 지역: ${small.join(', ')}` : '';   // 이름(label)은 tileOf 에서 이미 esc() 한 값이라 그대로 넣어도 안전
    };

    const render = animate => {
      const data = regions.map(tileOf);
      D.renderTreemap($('treemap'), data, { unit: ' 백만㎥', onSelect: goToRegion, showValue: false });   // unit 은 화면 읽기 도구용 칸 이름(예: 서울 2,400 백만㎥)에만 쓰임. 칸에는 이름 + 증감률(또는 1인당)만: 공급량은 면적이 보여주고 정확한 값은 마우스를 올리면 나옴
      if (animate && !reduceMotion) fadeFromPrevious(data);
      else data.forEach(d => { lastPaint[d.id] = d; });
      $('treemapLegend').innerHTML = legendOf();
      // 부제: 지금 선택된 색 기준 이름을 그대로 넣음 (토글을 누르면 함께 바뀜. '색 기준' 라벨을 없앤 대신)
      $('treemapSub').textContent = `칸 크기는 ${year}년 공급량, 색은 ${METRIC_TABS.find(t => t.id === metric).label} · 칸을 누르면 지역 상세로 이동`;
      listSmallTiles(data);
    };

    // 토글: 색 기준 스위치
    const syncTabs = slideTabs($('metricTabs'), METRIC_TABS, metric, m => {
      metric = m;
      render(true);
    });

    render();
    // 창 크기가 바뀌면 칸 크기를 다시 계산 (크기 조절이 0.15초 멈췄을 때 한 번만)
    window.addEventListener('resize', D.debounce(() => { render(); syncTabs(); }, 150));
  };

  // 17개 시·도를 권역 조각으로 합침 (큰 권역부터 → 색도 그 순서대로)
  const buildSlices = regions => {
    const sliceOf = (label, members) => ({
      label,
      members: sortedDesc(members, 'supply').map(m => m.name).join('·'),   // 포함 지역은 공급량 큰 순
      value: members.reduce((sum, m) => sum + m.supply, 0),
      pop: members.reduce((sum, m) => sum + (Number.isFinite(m.pop) ? m.pop : NaN), 0)   // 인구 합 (한 지역이라도 없으면 NaN → 범례에서 인구 비중을 뺌)
    });
    const slices = GROUPS.map(g => sliceOf(g.label, regions.filter(r => g.ids.includes(r.id))));
    const grouped = new Set(GROUPS.flatMap(g => g.ids));
    const others = regions.filter(r => !grouped.has(r.id));   // 목록에 없는 지역이 생기면 '기타'로 보여줌
    if (others.length) slices.push(sliceOf('기타', others));
    slices.sort((a, b) => b.value - a.value);
    slices.forEach((s, i) => { s.color = DONUT_COLORS[i % DONUT_COLORS.length]; });
    return slices;
  };

  // 광역경제권별 공급 비중 (도넛): 조각, 범례, 가운데 글자가 호버에 함께 반응. 권역은 상세 페이지가 없어 클릭 이동은 없음
  const drawDonut = ({ regions, year, total }) => {
    const slices = buildSlices(regions);
    const pctOf = d => fmt((d.value / total) * 100, 1);
    // 인구 비중: 공급 비중이 인구 비중과 비슷하면 '사람이 많아서 많이 쓰는 것', 크게 다르면 그 권역만의 특징 → 범례에서 바로 비교되게 함
    const popTotal = slices.reduce((sum, d) => sum + d.pop, 0);
    //   '인구' 글자를 보이게 붙이면 값 칸이 넓어져 권역 이름이 더 줄바꿈됨 → 숫자만 보이고 '인구' 는 화면 읽기 도구용 숨은 글자로, 뜻은 부제가 알려줌
    const popOf = d => Number.isFinite(d.pop) && popTotal > 0 ? `<small><span class="dl-hidden">인구 </span>${fmt((d.pop / popTotal) * 100, 1)}%</small>` : '';

    // 범례: 한 줄(.dl-row)이 하나의 요소여야 줄 단위로 호버·강조할 수 있음
    const legend = $('donutLegend');
    legend.innerHTML = slices.map((d, i) =>
      `<div class="dl-row" data-i="${i}"><i class="sw" style="background:${d.color}"></i><span class="dl-name">${esc(d.label)}<small>${esc(d.members)}</small></span><b>${pctOf(d)}%${popOf(d)}</b></div>`).join('');
    const rows = [...legend.querySelectorAll('.dl-row')];

    // 가운데 글자: 평소에는 전국 합계(백만㎥, KPI 와 같은 단위), 호버하면 해당 조각의 비중과 공급량
    $('donutSub').textContent = `${year}년 · 17개 시·도를 7개 권역으로 묶음 · 굵은 %는 공급 비중, 작은 %는 인구 비중`;
    const center = $('donutCenter');
    const centerDefault = `<span>전국</span><b>${fmt(total)}</b><span>백만㎥</span>`;
    center.innerHTML = centerDefault;

    const donut = new Chart($('donut'), {
      type: 'doughnut',
      data: { labels: slices.map(d => d.label), datasets: [{ data: slices.map(d => d.value), backgroundColor: slices.map(d => d.color), borderColor: '#fff', borderWidth: 2, hoverOffset: 8 }] },
      options: {
        cutout: '68%',
        layout: { padding: 10 },                      // 호버로 조각이 튀어나올 자리를 미리 비워 둠 (안 비우면 가장자리가 잘림)
        animation: animateIn($('donut')) ? undefined : false,
        plugins: { tooltip: { enabled: false } },   // 정보는 가운데 글자로 보여주므로 툴팁은 생략
        events: ['mousemove'],                        // 마우스 이탈은 아래 mouseleave 에서 직접 처리 (차트가 따로 지우며 생기는 어긋남을 막음)
        onHover: (e, els) => setActive(els.length ? els[0].index : -1)
      }
    });

    // 조각·범례·가운데 글자를 한 번에 맞춤 (i = -1 이면 호버 해제)
    let active = -1;
    const setActive = i => {
      if (i === active) return;
      active = i;
      donut.data.datasets[0].backgroundColor = slices.map((d, k) => (i < 0 || k === i) ? d.color : fade(d.color));
      donut.setActiveElements(i < 0 ? [] : [{ datasetIndex: 0, index: i }]);
      donut.update();
      center.innerHTML = i < 0 ? centerDefault
        : `<span>${slices[i].label}</span><b>${pctOf(slices[i])}%</b><span>${fmt(slices[i].value)} 백만㎥</span>`;
      legend.classList.toggle('has-active', i >= 0);
      rows.forEach((row, k) => row.classList.toggle('is-active', k === i));
    };
    $('donut').addEventListener('mouseleave', () => setActive(-1));   // Chart.js 의 onHover 는 차트 영역 안에서만 호출됨
    rows.forEach((row, i) => {                                       // 범례 줄에 올려도 같은 조각이 강조됨
      row.onmouseenter = () => setActive(i);
      row.onmouseleave = () => setActive(-1);
    });
  };

  // 연도별 추이: 위 칸 = 평균기온 선(실제 눈금), 아래 칸 = 연간 공급량 막대(기준 연도는 진하게). 한 차트 안에서 세로로 두 칸(stack)으로 나눔
  //   서버가 12개월이 모두 있는 연도만 보내줌
  // 오른쪽 인사이트(값에서 만든 문장, 근거가 부족한 줄은 뺌). 계산 도구(sameMonthPairs·slopeOf·MIN_PAIRS·range)는 위 ② 에 있음
  const MIN_YEAR_DIFF = 0.5;   // 전년과 기온 차이가 이보다 작은 해는 '기온으로 설명되는 변화' 비교에서 뺌 (차이가 작으면 설명 정도를 말하기 어려움)
  const MIN_REST = 3;          // 기온으로 설명되지 않는 몫이 이보다 작으면(%p) '설명 안 되는 해' 로 따로 말하지 않음

  // 연도별 보기: ① 기온으로 설명되는 해 / 안 되는 해 (상관 영역의 '같은 달끼리 비교' 기울기를 연도에 적용) ② 5개 해라는 한계
  const trendYearInsightsOf = (annual, monthly) => {
    const lines = [];
    const pairs = sameMonthPairs(monthly);
    const slope = pairs.length >= MIN_PAIRS ? slopeOf(pairs.map(p => [p.dTemp, p.pct])) : null;
    if (slope !== null && slope < 0) {
      const rows = annual.slice(1).map((a, i) => {
        const dT = a.avgTemp - annual[i].avgTemp, exp = slope * dT;   // exp = 기온 차이로 설명되는 공급 변화(%)
        return { year: a.year, dT, exp, act: a.supplyYoy, rest: a.supplyYoy - exp };
      }).filter(r => Number.isFinite(r.act) && Math.abs(r.dT) >= MIN_YEAR_DIFF);
      const best = rows.reduce((p, r) => (!p || Math.abs(r.rest) < Math.abs(p.rest)) ? r : p, null);
      const worst = rows.reduce((p, r) => (!p || Math.abs(r.rest) > Math.abs(p.rest)) ? r : p, null);
      const tempText = (r, join) => `평균기온이 전년보다 ${fmt(Math.abs(r.dT), 1)}°C ${r.dT > 0 ? '높' : '낮'}${join}`;   // join: '았고' / '아'
      if (best) {
        const nearlyAll = Math.abs(best.rest) <= Math.max(1, Math.abs(best.act) * 0.25);
        // 굵은 제목은 그 해의 실제 값 방향에서 만듦(기온 방향과 공급 방향이 설명 관계와 같을 때만 '기온이 ~한 해에는 공급이 ~했습니다'). 다르면 단정하지 않음
        const lead = Math.sign(best.exp) === Math.sign(best.act)
          ? `기온이 ${best.dT > 0 ? '높은' : '낮은'} 해에는 공급이 ${best.act >= 0 ? '늘었습니다' : '줄었습니다'}.`
          : `${best.year}년은 기온과 공급이 예상과 다른 방향으로 움직였습니다.`;
        lines.push(`<b>${lead}</b> ${best.year}년은 ${tempText(best, '았고')} 공급은 ${fmt(Math.abs(best.act), 1)}% ${best.act >= 0 ? '늘었습니다' : '줄었습니다'}. 같은 달끼리 비교한 관계(기온이 1°C 낮으면 공급 약 ${Math.round(-slope)}% 증가)로 보면 기온으로 설명되는 변화는 약 ${fmt(Math.abs(best.exp), 1)}%로, ${nearlyAll ? '거의 전부입니다.' : '일부입니다.'}`);
        if (worst && worst !== best && Math.abs(worst.rest) >= MIN_REST) {
          lines.push(`<b>기온만으로는 설명되지 않는 해도 있습니다.</b> ${worst.year}년은 ${tempText(worst, '아')} 기온만으로는 약 ${fmt(Math.abs(worst.exp), 1)}% ${worst.exp < 0 ? '줄' : '늘'} 것으로 보이지만 실제로는 ${fmt(Math.abs(worst.act), 1)}% ${worst.act < 0 ? '줄었습니다' : '늘었습니다'}. 나머지는 기온 외 요인으로, 이 자료로는 구분할 수 없습니다.`);
        }
      }
    }
    const temps = annual.map(a => a.avgTemp).filter(Number.isFinite);
    if (temps.length) lines.push(`<b>${annual.length}개 해만 본 것이라 참고용입니다.</b> 연평균기온이 ${fmt(Math.min(...temps), 1)}~${fmt(Math.max(...temps), 1)}°C로 해마다 차이가 작아, 공급량 변화에는 기온 외 요인이 섞일 수 있습니다.`);
    return lines;
  };

  const drawTrend = ({ national, year }) => {
    const annual = national.annual || [];
    if (!annual.length) {
      $('trendCard').style.display = 'none';
      return;
    }
    // 이 카드만 읽어도 뜻을 알 수 있게: 막대·선·막대 아래 %가 각각 무엇인지, 어떤 해만 넣었는지 (연도 범위는 서버가 보낸 값)
    $('trendSub').textContent = `해마다 한 해 총 공급량(막대)과 연평균기온(선)을 나란히 비교합니다 · 막대 아래 %는 전년 대비, 1~12월이 모두 있는 ${annual[0].year}~${annual[annual.length - 1].year}년만 포함`;

    const supplies = annual.map(a => a.supply), temps = annual.map(a => a.avgTemp);
    // 공급량 축: 가장 큰 막대보다 약 15% 위까지 (막대 위 값 글자가 위 칸의 기온 띠에 닿지 않을 만큼만 여유를 둠. 너무 크면 띠와 막대 사이가 휑해 보임)
    //   눈금 간격은 가장 큰 막대를 3칸 안에 담는 1000 단위(예: 11,221 → 4,000 간격 → 0, 4,000, 8,000, 12,000)
    const supplyTop = Math.max(...supplies);
    const supplyMax = Math.ceil(supplyTop * 1.15 / 1000) * 1000, supplyStep = Math.ceil(supplyTop / 3 / 1000) * 1000;
    // 기온 축: 실제 변동폭 앞뒤로 0.5°C 여유, 0.5 단위로 맞춤 (기온은 0 에서 시작할 필요가 없어 좁게 잡아야 해마다 차이가 보임)
    const tempMin = Math.floor((Math.min(...temps) - 0.5) * 2) / 2, tempMax = Math.ceil((Math.max(...temps) + 0.5) * 2) / 2;
    const monthly = national.monthly || [];
    // 한 해의 겨울(12~2월) 평균기온: 그 해의 1·2·12월 월평균기온의 평균. 연평균기온만으로는 보이지 않는 겨울 추위를 툴팁에서 보여줌
    //   (난방도일은 설명이 따로 필요한 용어라 쓰지 않음.) 세 달 중 하나라도 없으면 null → 툴팁에서 뺌
    const winterTempOf = y => {
      const vals = ['01', '02', '12'].map(mo => (monthly.find(m => m.ym === `${y}-${mo}`) || {}).avgTemp);
      return vals.every(Number.isFinite) ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
    };
    // 막대 위에 값 표시 (Chart.js 에 값 표시 기능이 없어서 직접 그림)
    const barValues = {
      id: 'barValues',
      afterDatasetsDraw(chart) {
        const { ctx } = chart;
        ctx.save();
        ctx.fillStyle = C('--ink'); ctx.font = `600 12px ${C('--font-sans')}`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        chart.getDatasetMeta(0).data.forEach((bar, i) => ctx.fillText(fmt(annual[i].supply), bar.x, bar.y - 4));
        ctx.restore();
      }
    };
    // 기온 선의 점마다 값 표시 (막대 값과 같은 방식)
    const tempValues = {
      id: 'tempValues',
      afterDatasetsDraw(chart) {
        const { ctx } = chart;
        ctx.save();
        ctx.fillStyle = C('--yellow-700'); ctx.font = `600 12px ${C('--font-sans')}`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        chart.getDatasetMeta(1).data.forEach((pt, i) => ctx.fillText(`${fmt(annual[i].avgTemp, 1)}°C`, pt.x, pt.y - 8));
        ctx.restore();
      }
    };
    // 기온 칸 꾸미기: 연한 배경 띠 + 아래 경계선 + 칸 이름(왼쪽 위). 두 차트가 붙어 보이지 않고 '막대 위의 보조 띠' 로 읽히게 함
    //   beforeDraw = 눈금선·막대보다 먼저 그려서 배경이 모든 것 아래에 깔림
    const tempStrip = {
      id: 'tempStrip',
      beforeDraw(chart) {
        const { ctx, chartArea: a, scales: { y1 } } = chart;
        ctx.save();
        ctx.fillStyle = C('--surface-soft');
        ctx.fillRect(a.left, y1.top, a.right - a.left, y1.bottom - y1.top);
        ctx.strokeStyle = C('--hairline'); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(a.left, y1.bottom + 0.5); ctx.lineTo(a.right, y1.bottom + 0.5); ctx.stroke();
        ctx.fillStyle = C('--mute'); ctx.font = `600 12px ${C('--font-sans')}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText('연평균기온 (°C)', a.left + 8, y1.top + 6);
        ctx.restore();
      }
    };
    const axisTitle = text => ({ display: true, text, color: C('--mute'), font: { size: 12 } });
    const tooltipLabel = i => {
      const a = annual[i.dataIndex];
      if (i.dataset.type === 'line') {
        const winter = winterTempOf(a.year);
        return winter !== null ? [`연평균기온 ${fmt(a.avgTemp, 1)}°C`, `겨울(12~2월) 평균기온 ${fmt(winter, 1)}°C`] : `연평균기온 ${fmt(a.avgTemp, 1)}°C`;
      }
      return `공급량 ${fmt(a.supply, 1)} 백만㎥` + (a.supplyYoy !== null && a.supplyYoy !== undefined ? ` (전년 대비 ${signed(a.supplyYoy)}%)` : '');
    };

    new Chart($('trendChart'), {
      data: {
        labels: annual.map(a => [`${a.year}년`, a.supplyYoy === null || a.supplyYoy === undefined ? '' : `전년 ${signed(a.supplyYoy)}%`]),   // 두 줄: 연도 / 전년 대비
        datasets: [
          { type: 'bar', label: '연간 공급량', data: supplies, yAxisID: 'y', borderRadius: 3, barPercentage: 0.55, categoryPercentage: 0.8,   // 막대 폭을 칸 폭의 비율로 정함(고정 px 이면 넓은 화면에서 막대가 가늘어짐)
           
            backgroundColor: annual.map(a => a.year === year ? C('--seq-5') : C('--seq-3')) },
          { type: 'line', label: '연평균기온', data: temps, yAxisID: 'y1', borderColor: C('--yellow-700'), backgroundColor: C('--yellow-700'), borderWidth: 2, pointRadius: 4, tension: 0 }
        ]
      },
      plugins: [tempStrip, barValues, tempValues],
      options: {
        animation: animateIn($('trendChart')) ? undefined : false,
        layout: { padding: { top: 8 } },
        interaction: { mode: 'index', intersect: false },   // 한 해에 올리면 공급량과 기온을 함께 보여줌
        scales: {
          x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: false } },   // 두 줄 라벨이 기울지 않게
          // stack: 같은 이름이면 세로로 나눠 놓음(stackWeight = 높이 비율). 나중에 쓴 쪽(y1 기온)이 위 칸, 먼저 쓴 쪽(y 공급량)이 아래 칸
          //   → 연도·전년 대비 글자가 공급량 막대 바로 아래에 붙음
          y: { stack: 'trend', stackWeight: 2.2, min: 0, max: supplyMax,
            // 눈금은 0, 간격, 간격×2 … 를 직접 지정: stepSize 는 축 최대(13,000)로 나누어떨어지지 않으면 Chart.js 가 간격을 다시 균등하게 나눠 버림(4,333 …).
            //   축 맨 끝(13,000 같은 어중간한 값)에는 눈금을 만들지 않아 두 칸이 맞닿는 경계에 글자가 걸리지 않음
            afterBuildTicks: scale => { scale.ticks = Array.from({ length: Math.floor(supplyMax / supplyStep) + 1 }, (_, i) => ({ value: i * supplyStep })); },
            ticks: { callback: v => fmt(v) }, title: axisTitle('공급량 (백만㎥)') },
          // 기온 칸의 맨 위·맨 아래 눈금은 글자를 비움: 두 칸이 맞닿는 곳에서 공급량 눈금과 겹쳐 읽기 어려워서
          y1: { stack: 'trend', stackWeight: 1, min: tempMin, max: tempMax, ticks: { stepSize: 1, callback: v => (v > tempMin && v < tempMax ? `${v}°C` : '') } }
        },
        plugins: { tooltip: { callbacks: { title: items => `${annual[items[0].dataIndex].year}년`, label: tooltipLabel } } }
      }
    });
    // 오른쪽 인사이트: 보기(연도별/월별)마다 내용이 다름. 줄이 없으면 오른쪽을 숨기고 차트를 전체 폭으로
    // 월별 보기는 차트를 전체 폭으로 씀(오른쪽 칸 없음 → month 는 빈 배열)
    const insightsOf = { year: trendYearInsightsOf(annual, monthly), month: [] };
    const showInsights = view => {
      const lines = insightsOf[view];
      $('trendInsights').innerHTML = lines.map(text => `<p>${text}</p>`).join('');
      $('trendAside').hidden = !lines.length;
      $('trendLayout').classList.toggle('trend-layout--solo', !lines.length);
    };
    showInsights('year');
    const yearSub = $('trendSub').textContent;

    // 보기 스위치: 연도별(기본) / 월별. 월별 차트는 처음 열 때 그림 (숨겨진 상태에서는 크기를 알 수 없음)
    $('trendSwitch').hidden = !monthly.length;
    if (!monthly.length) return;
    let monthChart = null;
    slideTabs($('trendTabs'), TREND_VIEWS, 'year', view => {
      const isMonth = view === 'month';
      $('trendYearView').hidden = isMonth;
      $('trendMonthView').hidden = !isMonth;
      $('trendTitle').textContent = isMonth ? '월별 공급량 비교' : '연도별 공급량과 평균기온';   // 월별은 선 + 증감 막대 + 비교 대상이라 '곡선' 이 아니라 '비교'
      $('trendSub').textContent = isMonth ? `기준 해의 월별 공급량을 평년·작년 등과 비교합니다 · 위 선은 공급량, 아래 막대는 비교 대상 대비 증감(%)${national.ytd ? ` · ${national.ytd.year}년은 ${national.ytd.month}월까지` : ''}` : yearSub;
      showInsights(isMonth ? 'month' : 'year');
      if (isMonth && !monthChart) monthChart = drawMonthChart(monthly, annual, year, national.ytd);
    });
  };


  // 월별 비교: 기준 해 하나를 고르고 무엇과 비교할지 정함. 위 칸 = 월별 공급량 선, 아래 칸 = 비교 대상 대비 증감(%) 막대
  //   비교 대상: 평년(기준 해를 뺀 완결 연도의 평균과 최소~최대 띠) / 작년 / 모든 해(나머지 해를 연한 선으로) / 직접 고르기(연도 하나)
  //   평년 띠 밖으로 나간 달은 점을 강조색으로 칠해 '평소와 다른 달' 이 글 없이 보이게 함. 12~2월은 연한 배경을 깔아 공급이 겨울에 몰린다는 점을 차트 안에서 보이게 함
  const CMP_MODES = [['avg', '평년'], ['yoy', '작년'], ['all', '모든 해'], ['pick', '직접 고르기']];
  const drawMonthChart = (monthly, annual, year, ytd) => {
    // 서버의 월별 줄 [{ ym: '2025-03', supply }] 을 연도별 12칸 배열로 바꿈: { '2025': [1월, 2월, ... 12월] } (없는 달은 null → 선이 끊김)
    const byYear = {};
    monthly.forEach(m => {
      const [y, mo] = m.ym.split('-');
      (byYear[y] = byYear[y] || Array(12).fill(null))[Number(mo) - 1] = m.supply;
    });
    const years = Object.keys(byYear).sort();
    const fullYears = annual.map(a => String(a.year));   // 12개월이 모두 있는 해 = 평년 계산에 쓰는 해
    const months = Array.from({ length: 12 }, (_, i) => i);
    const nameOf = y => `${y}년` + (ytd && y === ytd.year ? `(1~${ytd.month}월)` : '');
    const prevOf = y => String(Number(y) - 1);
    // 연속한 연도는 '2021~2025', 떨어져 있으면 '2021~2023·2025' 로 줄여 씀
    const yearsText = ys => {
      const n = ys.map(Number).sort((a, b) => a - b), parts = [];
      for (let i = 0; i < n.length;) {
        let j = i;
        while (j + 1 < n.length && n[j + 1] === n[j] + 1) j++;
        parts.push(j > i ? `${n[i]}~${n[j]}` : `${n[i]}`);
        i = j + 1;
      }
      return parts.join('·');
    };
    // 12~2월 몫(연 공급 대비 %): 12개월이 모두 있는 해마다 그 해의 1·2·12월 합 ÷ 연 합계 → 최소~최대
    const winterText = fullYears.length
      ? range(fullYears.map(y => { const v = byYear[y]; return (v[0] + v[1] + v[11]) / v.reduce((s, x) => s + x, 0) * 100; }), Math.round) : null;

    const LINE = C('--seq-5'), POS = C('--seq-5'), NEG = C('--seq-3'), OUT = C('--yellow-700'), COMPARE = C('--ash'), BAND = fade(C('--seq-3'), 0.2);
    let sel = ytd ? ytd.year : String(year), cmp = 'avg', pick = null, hl = null, timer = null;
    const ensurePick = () => { if (!pick || pick === sel || !byYear[pick]) pick = years.filter(y => y !== sel).pop() || null; };
    const peers = () => fullYears.filter(y => y !== sel);   // 평년에 쓰는 해 (기준 해가 완결 연도면 자기 자신은 뺌)
    const peerVals = i => peers().map(y => byYear[y][i]).filter(Number.isFinite);
    const avgAt = i => { const v = peerVals(i); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
    const refYear = () => cmp === 'yoy' ? prevOf(sel) : pick;
    const refAt = i => (cmp === 'avg' || cmp === 'all') ? avgAt(i) : ((byYear[refYear()] || [])[i] ?? null);
    const cmpName = () => (cmp === 'avg' || cmp === 'all') ? '평년' : `${refYear()}년`;

    // 12~2월 연한 배경(1·2월은 왼쪽, 12월은 오른쪽 끝), 아래 칸 이름과 칸 사이 선, 막대 위 값
    const winterShade = {
      id: 'winterShade',
      beforeDraw(chart) {
        const { ctx, chartArea: a, scales: { x } } = chart;
        const half = (x.getPixelForValue(1) - x.getPixelForValue(0)) / 2;
        ctx.save();
        ctx.fillStyle = C('--surface-soft');
        [0, 1, 11].forEach(i => ctx.fillRect(x.getPixelForValue(i) - half, a.top, half * 2, a.bottom - a.top));
        ctx.restore();
      }
    };
    const stripLabel = {
      id: 'stripLabel',
      afterDraw(chart) {
        const { ctx, chartArea: a, scales: { y2 } } = chart;
        ctx.save();
        ctx.strokeStyle = C('--hairline'); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(a.left, y2.top - 0.5); ctx.lineTo(a.right, y2.top - 0.5); ctx.stroke();
        ctx.fillStyle = C('--mute'); ctx.font = `600 12px ${C('--font-sans')}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText(`${cmpName()} 대비 증감 (%)`, a.left + 8, y2.top + 6);
        ctx.restore();
      }
    };
    const barValues = {
      id: 'monthBarValues',
      afterDatasetsDraw(chart) {
        const { ctx } = chart;
        ctx.save();
        ctx.fillStyle = C('--ink'); ctx.font = `600 11px ${C('--font-sans')}`; ctx.textAlign = 'center';
        chart.getDatasetMeta(0).data.forEach((bar, i) => {
          const d = chart.data.datasets[0].data[i];
          if (!Number.isFinite(d)) return;
          ctx.textBaseline = d >= 0 ? 'bottom' : 'top';
          ctx.fillText(`${d > 0 ? '+' : d < 0 ? '−' : ''}${Math.abs(d).toFixed(0)}`, bar.x, d >= 0 ? bar.y - 3 : bar.y + 3);
        });
        ctx.restore();
      }
    };

    const chart = new Chart($('trendMonthChart'), {
      data: { labels: months.map(i => `${i + 1}월`), datasets: [] },
      plugins: [winterShade, stripLabel, barValues],
      options: {
        animation: reduceMotion ? false : undefined,
        layout: { padding: { top: 8 } },
        interaction: { mode: 'index', intersect: false },   // 한 달에 올리면 그 달의 값들을 함께 보여줌
        scales: {
          // 데이터 없이 차트를 먼저 만들면 축 종류를 못 정해 숫자(0, 1, …)로 나오므로 category 로 명시
          x: { type: 'category', grid: { display: false }, ticks: { maxRotation: 0, autoSkip: false } },
          // stack: 같은 이름이면 세로로 나눠 놓음. 나중에 쓴 쪽(y 공급량)이 위 칸, 먼저 쓴 쪽(y2 증감)이 아래 칸
          y2: { stack: 'month', stackWeight: 1,
            grid: { color: ctx => ctx.tick.value === 0 ? C('--ash') : C('--hairline-soft') },
            // 맨 위 눈금은 글자를 비움: 두 칸이 맞닿는 곳에서 위 칸의 '0' 눈금과 겹쳐서
            ticks: { callback: (v, i, ticks) => v === 0 ? '0%' : i === ticks.length - 1 ? '' : `${v > 0 ? '+' : '−'}${Math.abs(v)}%` } },
          y: { stack: 'month', stackWeight: 2.4, min: 0, ticks: { callback: v => fmt(v) },
            title: { display: true, text: '공급량 (백만㎥)', color: C('--mute'), font: { size: 12 } } }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            filter: i => !i.dataset.noTip,
            itemSort: (a, b) => ((a.dataset.isDiff ? 1 : 0) - (b.dataset.isDiff ? 1 : 0)) || (b.parsed.y - a.parsed.y),
            callbacks: {
              title: items => `${items[0].dataIndex + 1}월`,
              label: i => i.dataset.isDiff
                ? `${cmpName()} 대비 ${Number.isFinite(i.parsed.y) ? signed(i.parsed.y) + '%' : '–'}`
                : `${i.dataset.label}  ${fmt(i.parsed.y, 1)} 백만㎥`
            }
          }
        }
      }
    });

    const controls = $('trendMonthControls'), legend = $('trendMonthLegend');
    const chipBtn = (attr, value, pressed, text) => `<button type="button" class="trend-chip trend-chip--quick" data-${attr}="${value}" aria-pressed="${pressed}">${text}</button>`;

    // 보기 상태(기준 해, 비교 대상, 강조)가 바뀔 때 차트(데이터·축)를 다시 만듦. 조작·범례는 따로 (범례에 올려 강조할 때 범례 자체를 다시 그리면 마우스 올림이 끊겨서)
    let outCount = 0, othersList = [];   // 차트를 만들 때 정해지고 범례가 씀
    const updateChart = animate => {
      ensurePick();
      const focus = byYear[sel];
      const ref = months.map(refAt);
      const lo = months.map(i => { const v = peerVals(i); return v.length ? Math.min(...v) : null; });
      const hi = months.map(i => { const v = peerVals(i); return v.length ? Math.max(...v) : null; });
      const devs = months.map(i => Number.isFinite(focus[i]) && Number.isFinite(ref[i]) && ref[i] !== 0 ? (focus[i] / ref[i] - 1) * 100 : null);
      const out = months.map(i => cmp === 'avg' && Number.isFinite(focus[i]) && Number.isFinite(lo[i]) && (focus[i] < lo[i] || focus[i] > hi[i]));
      const others = years.filter(y => y !== sel);

      const ds = [];
      ds.push({ type: 'bar', label: `${cmpName()} 대비`, isDiff: true, data: devs, yAxisID: 'y2', order: 5,
        backgroundColor: devs.map(d => d >= 0 ? POS : NEG), borderRadius: 2, barPercentage: 0.6, categoryPercentage: 0.8 });
      let plotted = focus.filter(Number.isFinite);
      if (cmp === 'avg') {
        // 평년 띠: 최대 선을 아래 최소 선까지 채움 (fill: '+1' = 바로 다음 데이터 묶음까지)
        ds.push({ type: 'line', label: '평년 범위(위)', noTip: true, data: hi, yAxisID: 'y', order: 4, fill: '+1', backgroundColor: BAND, borderWidth: 0, pointRadius: 0, pointHitRadius: 0 });
        ds.push({ type: 'line', label: '평년 범위(아래)', noTip: true, data: lo, yAxisID: 'y', order: 4, fill: false, borderWidth: 0, pointRadius: 0, pointHitRadius: 0 });
        ds.push({ type: 'line', label: '평년 평균', data: months.map(avgAt), yAxisID: 'y', order: 2, borderColor: COMPARE, borderWidth: 1.5, borderDash: [4, 3], pointRadius: 0, tension: 0.25 });
        plotted = plotted.concat(hi.filter(Number.isFinite));
      } else if (cmp === 'all') {
        others.forEach(y => {
          const on = hl === y, dim = hl !== null && !on;
          ds.push({ type: 'line', label: nameOf(y), data: byYear[y], yAxisID: 'y', order: 3, borderColor: on ? C('--ink') : fade(COMPARE, dim ? 0.25 : 0.7),
            borderWidth: on ? 2.5 : 1.5, pointRadius: 0, tension: 0.25 });
          plotted = plotted.concat(byYear[y].filter(Number.isFinite));
        });
        ds.push({ type: 'line', label: '평년 평균', data: months.map(avgAt), yAxisID: 'y', order: 2, borderColor: COMPARE, borderWidth: 1.2, borderDash: [4, 3], pointRadius: 0, tension: 0.25 });
      } else {
        const r = byYear[refYear()];
        if (r) { ds.push({ type: 'line', label: nameOf(refYear()), data: r, yAxisID: 'y', order: 1, borderColor: COMPARE, borderWidth: 2, pointRadius: 0, tension: 0.25 }); plotted = plotted.concat(r.filter(Number.isFinite)); }
      }
      ds.push({ type: 'line', label: nameOf(sel), data: focus, yAxisID: 'y', order: 0, borderColor: LINE, backgroundColor: LINE, borderWidth: 3, tension: 0.25,
        pointRadius: out.map(o => o ? 5.5 : 4), pointHoverRadius: 6, pointBackgroundColor: out.map(o => o ? OUT : LINE), pointBorderColor: C('--surface-card'), pointBorderWidth: 2 });
      chart.data.datasets = ds;

      const top = Math.max(500, Math.ceil(Math.max(...plotted) / 500) * 500);   // 위 칸 끝: 가장 큰 값을 500 단위로 올림 (눈금이 500 간격)
      const m = Math.max(10, Math.ceil(Math.max(0, ...devs.filter(Number.isFinite).map(Math.abs)) / 10) * 10);   // 아래 칸 ±끝: 가장 큰 증감을 10 단위로 올림
      chart.options.scales.y.max = top;
      chart.options.scales.y.ticks.stepSize = 500;
      chart.options.scales.y2.min = -m; chart.options.scales.y2.max = m; chart.options.scales.y2.ticks.stepSize = m;
      outCount = out.filter(Boolean).length; othersList = others;
      chart.update(animate ? undefined : 'none');
    };

    const updateUi = () => {
      // 조작: 기준 해(하나만) / 비교 대상(4가지) / 직접 고르기를 누르면 연도 선택이 한 줄 더 나타남
      let html = `<div class="trend-group"><span class="trend-group-label">기준 해</span><div class="trend-chips">${years.map(y => chipBtn('base', y, y === sel, y + (ytd && y === ytd.year ? `(1~${ytd.month}월)` : ''))).join('')}</div></div>`
        + `<div class="trend-group"><span class="trend-group-label">비교 대상</span><div class="trend-quick">${CMP_MODES.map(([k, t]) => chipBtn('cmp', k, k === cmp, t)).join('')}</div></div>`;
      if (cmp === 'pick') html += `<div class="trend-group"><span class="trend-group-label"></span><div class="trend-chips">${othersList.map(y => chipBtn('pick', y, y === pick, nameOf(y))).join('')}</div></div>`;
      controls.innerHTML = html;

      // 범례: 선 색 설명 + 모드별 보충(범위 밖 달 수 / 연도 이름 올려 강조) + 12~2월 배경 설명
      const key = (swatch, text, extra = '') => `<span class="trend-key-item"${extra}>${swatch}${text}</span>`;
      const line = color => `<i class="is-line" style="background:${color}"></i>`;
      let keys = key(line(LINE), nameOf(sel) + ' (기준)');
      if (cmp === 'avg') keys += key(`<i style="background:${BAND}"></i>`, `${yearsText(peers())} 범위`) + key(line(COMPARE), '평년 평균') + key(`<i class="is-dot" style="background:${OUT}"></i>`, `범위 밖 ${outCount}개월`);
      else if (cmp === 'all') keys += othersList.map(y => key(line(COMPARE), nameOf(y), ` data-hl="${y}"`)).join('') + '<span class="trend-key-hint">연도 이름에 올리면 그 선이 강조됩니다</span>';
      else keys += key(line(COMPARE), cmpName() + (byYear[refYear()] ? '' : ' (자료 없음)'));
      if (winterText) keys += key(`<i style="background:${C('--surface-soft')};border:1px solid var(--hairline)"></i>`, `12~2월 (연 공급의 ${winterText}%)`);
      legend.innerHTML = `<div class="trend-key">${keys}</div>`;
    };
    const update = (animate = true) => { updateChart(animate); updateUi(); };

    controls.onclick = e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.base) { sel = b.dataset.base; hl = null; }
      else if (b.dataset.cmp) { cmp = b.dataset.cmp; hl = null; }
      else if (b.dataset.pick) pick = b.dataset.pick;
      update();
    };
    // 모든 해: 범례의 연도 이름에 올리면 그 선만 강조 (지역 연동과 같은 방식: 빠르게 지나갈 때 번쩍이지 않게 짧은 지연)
    const setHl = y => { clearTimeout(timer); timer = setTimeout(() => { if (hl !== y) { hl = y; updateChart(false); } }, y === null ? 80 : 40); };
    legend.onmouseover = e => { const t = e.target.closest('[data-hl]'); if (t) setHl(t.dataset.hl); };
    legend.onmouseout = e => { if (e.target.closest('[data-hl]')) setHl(null); };
    update(false);
    return chart;
  };

  // 막대로 보여줄 요인: 서버가 보낸 변수 이름(corrLabels)에서 공급량 자신과 CORR_HIDDEN 을 뺀 것 → 서버에 변수가 늘면 행이 자동으로 늘어남
  //   난방도일은 평균기온에서 계산한 값이라 두 행이 거의 같은 정보여서 막대에서 뺌 (전체 상관표에는 남음)
  // 표에서도 뺄 파생 변수와 이유: 다른 변수에서 계산한 값이라 같은 정보를 반복해서 보여줌 (서버 응답에는 그대로 있음)
  const CORR_DERIVED = { '난방도일': '평균기온에서 계산한 값' };
  const CORR_HIDDEN = ['공급량', ...Object.keys(CORR_DERIVED)];   // 막대에서 뺄 이름 (공급량은 비교 기준이라 막대에서만 뺌)
  const CORR_HINTS = {};   // 이름 옆에 작게 붙일 보충 설명이 필요한 변수만 {이름: '설명'}

  // 설명 비율(%): 같은 달끼리 비교한 상관 r 의 제곱. 작년 대비 공급량 변화 중 이 요인으로 설명되는 몫 (상관이지 원인은 아님)
  const explainedPct = r => Math.round(r * r * 100);
  const WEAK_PCT = 10;   // 설명 비율이 이보다 작으면 '월 단위로는 거의 설명하지 못함'

  // 요인마다 두 줄: 전체(해마다 반복되는 월별 흐름 포함)와 같은 달끼리 비교(작년 같은 달과의 차이). 가운데가 0, 오른쪽이 +, 왼쪽이 −
  const drawCorrBars = ({ corrLabels, corr, corrYoy }) => {
    const valueOf = (matrix, name) => {
      const j = corrLabels.indexOf(name);
      return !matrix || j < 0 ? null : matrix[0][j];   // 첫 변수(공급량)와의 상관
    };
    const bar = (tag, v, color) => {
      if (v === null || v === undefined) return '';
      const w = Math.abs(v) * 50;   // 한쪽 길이 = 50%, r = ±1 이면 끝까지
      const side = v < 0 ? `right:50%;width:${w}%` : `left:50%;width:${w}%`;
      return `<div class="corr-bar"><span>${tag}</span><div class="corr-track"><span class="corr-fill" style="${side};background:${color}"></span></div><b>${corrText(v)}</b></div>`;
    };
    // 행 오른쪽: 설명 비율(%) 숫자와 0~100% 막대. 무엇의 몇 %인지는 열 제목(head)에서 한 번 설명. 같은 달끼리 비교 값이 없으면 비워 둠
    const reading = v => {
      if (v === null || v === undefined) return '';
      const pct = explainedPct(v);
      return `<b>${pct}%</b>${pct < WEAK_PCT ? ' · 거의 설명하지 못함' : ''}<span class="corr-meter"><i style="width:${pct}%"></i></span>`;
    };
    const readHead = '<div class="corr-read-head"><b>설명 비율</b>작년 같은 달보다 공급이 늘거나 준 폭 중, 이 요인으로 설명되는 몫</div>';
    const raw = C('--stone'), yoyColor = C('--seq-4');
    const rows = corrLabels.filter(name => !CORR_HIDDEN.includes(name)).map(name =>
      `<div class="corr-row"><div class="corr-name">${esc(name)}${CORR_HINTS[name] ? `<small>${esc(CORR_HINTS[name])}</small>` : ''}</div>` +
      `<div>${bar('전체', valueOf(corr, name), raw)}${bar('같은 달', valueOf(corrYoy, name), yoyColor)}</div>` +
      `<div class="corr-read">${reading(valueOf(corrYoy, name))}</div></div>`).join('');
    $('corrBars').innerHTML =
      `<div class="corr-row corr-row--head"><div class="corr-legend"><i style="background:${raw}"></i>전체(해마다 반복되는 월별 흐름 포함)<i style="background:${yoyColor}"></i>같은 달끼리 비교(작년 같은 달과의 차이)</div>${readHead}</div>` + rows +
      '<div class="corr-row corr-row--axis"><span></span><div class="corr-axis"><span></span><span><span>−1</span><span>0</span><span>+1</span></span><span></span></div><span></span></div>';
  };

  // 막대 아래 인사이트 박스(최대 4줄): 숫자를 고정 문장 틀에 넣어 만들며, 근거가 부족한 줄은 빼고 단정하지 않음
  //   ① 달력 효과  ② 관측 민감도(예측 모델 값과 다름을 표시)  ③ 가장 큰 기온 차이 달  ④ 월 단위 설명력이 작은 요인과 자료 한계
  const corrInsightsOf = ({ corrLabels, corr, corrYoy, monthly }) => {
    const corrWith = (matrix, name) => {
      const j = corrLabels.indexOf(name);
      return !matrix || j < 0 ? null : matrix[0][j];
    };
    const lines = [];

    const t = corrWith(corr, '평균기온'), tYoy = corrWith(corrYoy, '평균기온');
    if (t !== null && tYoy !== null) {
      const dir = t < 0 ? '반대로' : '같은 방향으로';
      const lead = `<b>계절 흐름 때문에 강해 보입니다.</b> 기온과 공급량은 ${dir} 움직이며 상관이 ${corrText(t)}입니다. 하지만 대부분은 겨울에 춥고 겨울에 가스를 많이 쓰는, 해마다 반복되는 흐름 때문입니다.`;
      lines.push(Math.abs(tYoy) >= 0.5
        ? `${lead} 같은 달끼리(예: 올해 2월과 작년 2월) 비교해도 상관은 ${corrText(tYoy)}입니다. 이 값이 여전히 강해서, <b>평소보다 ${tYoy < 0 ? '추운' : '따뜻한'} 달에는 실제로 공급이 더 늘었습니다.</b>`
        : `${lead} 같은 달끼리 비교하면 상관은 ${corrText(tYoy)}입니다. 계절 흐름을 빼면 관계가 약해집니다.`);
    }

    const pairs = sameMonthPairs(monthly);
    const slope = pairs.length >= MIN_PAIRS ? slopeOf(pairs.map(p => [p.dTemp, p.pct])) : null;
    if (slope !== null && slope < 0) {
      const winter = pairs.filter(p => p.month === 12 || p.month <= 2);
      const winterSlope = winter.length >= MIN_WINTER_PAIRS ? slopeOf(winter.map(p => [p.dTemp, p.pct])) : null;
      const pct = Math.round(-slope);
      const tail = winterSlope !== null && winterSlope < 0 ? ` 많았고, 겨울(12~2월)만 보면 약 ${Math.round(-winterSlope)}%입니다` : ' 많았습니다';
      lines.push(`<b>기온이 1°C 낮으면 공급은 약 ${pct}% 늘었습니다(실제 기록).</b> 작년 같은 달과 비교해 1°C 더 추웠던 달은 공급이 평균 약 ${pct}%${tail}(${pairs.length}개월 기준). 예측 모델이 추정한 기온 민감도와는 계산 방식이 달라 숫자가 다릅니다.`);
    }

    if (pairs.length >= MIN_PAIRS) {
      const big = pairs.reduce((a, b) => Math.abs(b.dTemp) > Math.abs(a.dTemp) ? b : a);
      lines.push(`<b>가장 큰 기온 차이를 보인 달:</b> ${big.year}년 ${big.month}월은 작년 ${big.month}월보다 평균기온이 ${Math.abs(big.dTemp).toFixed(1)}°C ${big.dTemp < 0 ? '낮았고' : '높았고'}, 공급량은 ${Math.abs(big.pct).toFixed(1)}% ${big.pct >= 0 ? '늘었' : '줄었'}습니다.`);
    }

    const weak = corrLabels.filter(name => !CORR_HIDDEN.includes(name) && corrWith(corrYoy, name) !== null && explainedPct(corrWith(corrYoy, name)) < WEAK_PCT);
    if (weak.length) {
      lines.push(`<b>${weak.map(esc).join('·')}처럼 월 단위로는 거의 설명하지 못하는 요인이 있습니다</b>(설명 비율: ${weak.map(name => `${esc(name)} ${explainedPct(corrWith(corrYoy, name))}%`).join(', ')}). 다만 영향이 없다는 뜻은 아닙니다. ${Math.floor((monthly || []).length / 12)}년 남짓한 자료로는 장기 영향까지 판단하기 어렵습니다.`);
    }
    return lines.map(text => `<p>${text}</p>`).join('');
  };

  // 전체에서는 매우 강하지만 같은 달끼리 비교하면 크게 약해지는 변수 쌍 중 가장 크게 약해지는 것 (장기 추세를 따라 함께 움직인 값일 수 있음)
  //   표에서 뺀 변수는 제외. i > j 인 쌍만 보므로 표(아래쪽 삼각형)의 행 = i, 열 = j
  const corrTopDrop = ({ corrLabels, corr, corrYoy }) => {
    let top = null;
    if (!corr || !corrYoy) return top;
    const shown = corrLabels.map((_, i) => i).filter(i => !(corrLabels[i] in CORR_DERIVED));
    shown.forEach(i => shown.forEach(j => {
      if (j >= i) return;
      const raw = corr[i][j], yoy = corrYoy[i][j];
      if (raw === null || yoy === null || Math.abs(raw) < 0.9) return;
      const drop = Math.abs(raw) - Math.abs(yoy);
      if (drop >= 0.3 && (!top || drop > top.drop)) top = { i, j, raw, yoy, drop };
    }));
    return top;
  };

  // 읽는 법 패널의 설명 (값에서 만듦): 점선 칸 설명. 표에서 뺀 변수(CORR_DERIVED)는 화면에 적지 않음(독자가 모르는 용어를 꺼내게 되므로)
  const corrTableNoteOf = national => {
    const { corrLabels } = national, top = corrTopDrop(national), lines = [];
    if (top) lines.push(`점선 칸: ${esc(corrLabels[top.i])} ↔ ${esc(corrLabels[top.j])} — 전체 ${corrText(top.raw)}, 같은 달끼리 비교 ${corrText(top.yoy)}. 강해 보이는 값이 같은 달끼리 비교하면 약해지는 것은 두 변수가 장기 추세를 따라 함께 움직였기 때문일 수 있습니다.`);
    return lines.map(text => `<p>${text}</p>`).join('');
  };

  // 상관계수: [요인 비교] 요인별 막대 + 인사이트 / [상관표] 전체와 같은 달끼리 비교 두 표(왼쪽) + 읽는 법 패널(오른쪽)
  //   히트맵 lower = 대각선과 대칭으로 겹치는 칸을 빼고 아래쪽 삼각형만 표시
  const CORR_VIEWS = [{ id: 'factors', label: '요인 비교' }, { id: 'table', label: '상관표' }];
  // 카드 부제: 보기(탭)마다 설명이 다름. 요인 비교 문구는 national.html 의 처음 글자와 같아야 함(JS 가 켜지기 전에 보이는 글자)
  //   위치(왼쪽·오른쪽) 말은 쓰지 않음: 화면 폭에 따라 두 표가 위아래로 쌓이기도 해서 표 이름(전체 / 같은 달끼리 비교)으로 가리킴
  const CORR_SUBS = {
    factors: '요인 값이 큰 달에 공급량이 많은지(+)·적은지(−), 그 경향이 얼마나 뚜렷한지를 −1~+1로 나타냅니다. 원인을 뜻하지는 않습니다.',
    table: '공급량과 요인, 요인끼리의 관계를 −1~+1로 나타냅니다. 전체는 해마다 반복되는 월별 흐름을 포함하고, 같은 달끼리 비교는 작년 같은 달과의 차이로 계산합니다. 원인을 뜻하지는 않습니다.'
  };
  const drawCorrelation = ({ national }) => {
    let view = 'factors';
    const keep = national.corrLabels.map((_, i) => i).filter(i => !(national.corrLabels[i] in CORR_DERIVED));
    const labels = keep.map(i => national.corrLabels[i]);
    const subMatrix = matrix => matrix && keep.map(i => keep.map(j => matrix[i][j]));   // 뺀 변수의 행·열을 제거
    // 표 두 개: 범례는 패널 한 곳에만 두기 위해 두 번째 표의 범례를 #corrScale 로 옮김. 같은 달끼리 비교 값이 없으면 표 하나만
    D.renderHeatmap($('heatmapRaw'), labels, subMatrix(national.corr), { lower: true, scale: false, hint: false });
    $('heatmapYoyBox').hidden = !national.corrYoy;
    if (national.corrYoy) {
      D.renderHeatmap($('heatmapYoy'), labels, subMatrix(national.corrYoy), { lower: true, hint: false });
      $('corrScale').appendChild($('heatmapYoy').querySelector('.hm-scale'));
    }
    // 점선 표시: 설명이 가리키는 칸을 두 표에서 같은 위치에 표시
    const top = corrTopDrop(national);
    if (top) ['heatmapRaw', 'heatmapYoy'].forEach(id => {
      const cell = $(id).querySelector(`.hm-cell[data-r="${keep.indexOf(top.i)}"][data-c="${keep.indexOf(top.j)}"]`);
      if (cell) cell.classList.add('hm-flag');
    });
    const render = () => {
      $('corrBars').hidden = view !== 'factors';
      $('corrInsights').hidden = view !== 'factors';
      $('corrTable').hidden = view !== 'table';
      $('corrSub').textContent = CORR_SUBS[view];
    };
    slideTabs($('corrTabs'), CORR_VIEWS, view, v => { view = v; render(); });
    drawCorrBars(national);
    $('corrInsights').innerHTML = corrInsightsOf(national);
    $('corrTableNote').innerHTML = corrTableNoteOf(national);
    render();
  };

  // 지역 연동: 트리맵 칸이나 막대에 올리면 같은 지역이 모든 차트에서 함께 강조되고 나머지는 흐려짐 (id = 지역 번호, 벗어나면 null)
  //   bars = [{ chart, items }]  items = 그 차트의 막대 목록 [{ id, color }]
  const LINK_FADE = 0.55;   // 연동되지 않은 막대의 투명도 (클수록 덜 흐림)
  const linkRegions = bars => {
    const treemap = $('treemap');
    let active = null, timer = null;
    bars.forEach(({ chart }) => { if (!reduceMotion) chart.options.animation = { duration: 110 }; });   // 연동 때 색 전환을 빠르게
    const apply = id => {
      if (id === active) return;
      active = id;
      treemap.classList.toggle('has-link', id !== null);
      treemap.querySelectorAll('.tm-cell').forEach(c => c.classList.toggle('is-linked', id !== null && Number(c.dataset.id) === id));
      bars.forEach(({ chart, items }) => {
        chart.data.datasets[0].backgroundColor = items.map(d => (id === null || d.id === id) ? d.color : fade(d.color, LINK_FADE));
        chart.update();   // 색이 짧게(0.11초) 부드럽게 바뀜 (모션 줄이기가 켜져 있으면 바로 바뀜)
      });
    };
    // 올릴 때는 바로 반응하고, 벗어날 때만 잠깐 기다림 (지역 사이를 지나가며 생기는 순간적인 '해제'가 번쩍임이 되지 않게)
    const setActive = id => {
      clearTimeout(timer);
      if (id !== null) apply(id);
      else timer = setTimeout(() => apply(null), 80);
    };
    // 트리맵은 색 기준을 바꾸면 칸이 새로 그려지므로 칸마다 붙이지 않고 바깥 상자에서 한 번만 받음
    treemap.onmouseover = e => { const cell = e.target.closest('.tm-cell'); if (cell) setActive(Number(cell.dataset.id)); };
    treemap.onmouseleave = () => setActive(null);
    // focusin/focusout 은 on... 속성이 없어서 addEventListener 로 붙임 (키보드로 칸에 이동해도 같은 연동)
    treemap.addEventListener('focusin', e => { const cell = e.target.closest('.tm-cell'); if (cell) setActive(Number(cell.dataset.id)); });
    treemap.addEventListener('focusout', () => setActive(null));
    bars.forEach(({ chart }) => { chart.canvas.onmouseleave = () => setActive(null); });   // 차트의 onHover 는 차트 안에서만 불려서 벗어남은 따로 처리
    return setActive;
  };

  // 막대 카드 아래 인사이트: 값에서 만든 문장 몇 줄 (말머리 굵게, 요인 비교 카드의 인사이트와 같은 모양)
  const insightBox = lines => `<div class="corr-insights">${lines.map(text => `<p>${text}</p>`).join('')}</div>`;

  // 기온 민감도 인사이트: 많이 늘어나는 곳 / 전국 평균보다 높은 곳 수 / 추정값이라는 한계 (bySensitivity 는 큰 값부터)
  const sensInsightsOf = (bySensitivity, avgSens) => {
    const top = bySensitivity.slice(0, 3), last = bySensitivity[bySensitivity.length - 1];
    const above = bySensitivity.filter(r => r.sensitivity > avgSens).length;
    return [
      `<b>추위에 공급이 가장 크게 느는 곳은 ${top.map(r => esc(r.name)).join('·')}입니다.</b> 기온이 1°C 낮아지면 한 달 평균 공급량이 각각 약 ${top.map(r => fmt(r.sensitivity, 1)).join('%, ')}% 늘어납니다. 가장 덜 느는 곳은 ${esc(last.name)}(${fmt(last.sensitivity, 1)}%)입니다.`,
      `<b>전국 평균(${fmt(avgSens, 1)}%)보다 민감한 지역은 ${bySensitivity.length}곳 중 ${above}곳입니다.</b> 같은 한파라도 이런 지역에서 공급량이 더 크게 오르므로, 기온 변화에 따른 공급 계획에서 먼저 살펴볼 곳입니다.`,
      `<b>예측 모델이 추정한 값입니다.</b> 이번 달과 지난달 기온이 모두 1°C 낮을 때 늘어나는 공급량을 연평균 월 공급량으로 나눈 것이며, 겨울 달만 기준으로 하면 더 작게 나옵니다. 실제 기록으로 구한 값과는 계산 방식이 달라 숫자가 다릅니다.`
    ];
  };

  // 예측 오차 인사이트: 평균 오차의 뜻 / 가장 정확한 곳과 가장 큰 곳 / 실제 예측에서는 더 커질 수 있다는 한계 (byMape 는 큰 값부터)
  const mapeInsightsOf = (byMape, overLimit, avgMape) => {
    const valid = byMape.filter(r => Number.isFinite(r.mape));
    const worst = valid[0], best = valid[valid.length - 1];
    const lines = [`<b>전국 평균 오차율은 ${fmt(avgMape, 1)}%입니다.</b> 실제 공급량이 100이라면 예측이 평균 ${fmt(avgMape, 1)}만큼 어긋났다는 뜻입니다.`];
    if (worst && best) {
      lines.push(`<b>가장 정확한 지역은 ${esc(best.name)}(${fmt(best.mape, 1)}%), 오차가 가장 큰 지역은 ${esc(worst.name)}(${fmt(worst.mape, 1)}%)입니다.</b> ${overLimit.length ? `기준(${MAPE_LIMIT}%) 이상인 ${overLimit.length}곳은 예측값을 볼 때 여유를 두고 보는 것이 좋습니다.` : `모든 지역이 ${MAPE_LIMIT}% 미만이라 지역별 예측을 믿고 쓸 만한 수준입니다.`}`);
    }
    // 울산 설명(2026-10-15): 팀이 통계월보에서 5월과 같았던 울산 2026년 6월 값을 11,397 → 9,441(천㎥)로 교체함(project2_python PR #15 '데이터 수정').
    //   교체한 뒤에도 울산이 기준 이상인 까닭은 4·5월: 오차(예측-실제)가 +33%·+21% 이고, 두 달 모두 공급이 최근 5년 같은 달 범위(4월 20.6~26.3, 5월 13.1~16.0 백만㎥)보다 낮음. 이 두 달을 빼면 MAPE 약 6.7%.
    //   33·21·6.7 은 지금 자료·모델 기준의 고정 값: 울산이 기준 아래로 내려오면 이 줄은 저절로 사라지고, 값이 달라지면 이 줄을 고칠 것.
    //   (예측 서버를 다시 학습하기 전에는 서버 값이 6월 교체 전 값이라 울산 10.9%, 다시 학습하면 10.1% 로 계산됨 — 2026-10-15 재현 계산)
    if (worst && worst.name === '울산' && worst.mape >= MAPE_LIMIT) {
      lines.push(`<b>울산의 오차(${fmt(worst.mape, 1)}%)는 2026년 4·5월에 몰려 있습니다.</b> 두 달 모두 공급량이 최근 5년의 같은 달 범위보다 낮아 예측이 크게 빗나갔고, 이 두 달을 빼면 약 6.7%입니다. 통계월보에서 5월과 같았던 6월 값은 다른 값으로 교체했습니다.`);
    }
    // 기준 10%의 출처: Lewis, C. D. (1982). Industrial and business forecasting methods: A practical guide to exponential smoothing and curve fitting. London: Butterworth Scientific. (p. 40)
    //   MAPE 해석: 10% 미만 매우 정확 / 10~20% 양호 / 20~50% 보통 / 50% 이상 부정확
    lines.push(`<b>기준 ${MAPE_LIMIT}%는 예측 분야의 대표적인 분류(Lewis, 1982)를 따랐습니다.</b> 오차율 ${MAPE_LIMIT}% 미만은 '매우 정확', 10~20%는 '양호', 20~50%는 '보통', 50% 이상은 '부정확'으로 봅니다. 그중 가장 높은 등급인 '매우 정확'의 경계를 경고 기준으로 삼았습니다.`);
    lines.push(`<b>실제 예측에서는 오차가 더 클 수 있습니다.</b> 이 값은 실제 기온을 넣고 최근 12개월 공급량을 다시 맞혀 본 결과입니다. 앞날의 예측은 미래 기온을 몰라 평년 기온을 쓰므로 더 어긋날 수 있습니다.`);
    return lines;
  };

  // 기온 민감도 + 예측 오차 (가로 막대): 막대를 클릭하면 지역 상세로 이동
  const drawBars = ({ bySensitivity, byMape, overLimit, avgSens, avgMape, hasMape, hasSens }) => {
    // 민감도: 전국 값(기준선)보다 높으면 진한 파랑, 낮으면 밝은 파랑. 값은 FastAPI 예측 모델 기반
    let setLinked = () => {};   // 두 차트를 다 만든 뒤 아래에서 연결
    let sensChart = null, sensItems = [];
    if (hasSens) {
      const sensHigh = C('--seq-5');
      sensItems = bySensitivity.map(r => ({ id: r.id, label: r.name, value: r.sensitivity, color: r.sensitivity > avgSens ? sensHigh : SENS_LOW_COLOR, detail: `공급량 ${fmt(r.supply)} 백만㎥` }));
      sensChart = quietIfBelow($('sensChart'), () => D.hbar($('sensChart'), sensItems,
        { ref: avgSens, refLabel: `전국 ${fmt(avgSens, 1)}%`, onClick: d => goToRegion(d.id), onHoverItem: d => setLinked(d ? d.id : null), showValue: true, axisTitle: '평균 월 공급량 대비 증가분 (%/°C)', barThickness: 16 }));
      $('sensLegend').innerHTML = `<i style="background:${sensHigh}"></i>전국보다 높음<i style="background:${SENS_LOW_COLOR}"></i>전국보다 낮음`;
      $('sensNote').innerHTML = insightBox(sensInsightsOf(bySensitivity, avgSens));
    } else {
      $('sensLegend').innerHTML = '';
      $('sensNote').innerHTML = D.callout('purple', '기온 민감도를 불러오지 못했습니다', '파이썬 예측 서버(FastAPI)가 켜져 있는지 확인하세요.');
    }

    // 예측 오차: 기준(MAPE_LIMIT) 이상이면 빨강, 나머지는 회색. 가로축 최대값은 가장 큰 MAPE 를 10 단위로 올림 (실제 값이 14% 를 넘어도 막대가 잘리지 않게, 최소 14)
    const mapeAxisMax = Math.max(14, Math.ceil(Math.max(...byMape.map(r => r.mape || 0)) / 10) * 10);
    // 예측 오차를 못 받아오면 기준을 알 수 없어 한 색(--stone)으로 둠
    const mapeOver = C('--red-500'), mapeOk = C('--ash');
    const accItems = byMape.map(r => ({ id: r.id, label: r.name, value: r.mape, color: hasMape ? (r.mape >= MAPE_LIMIT ? mapeOver : mapeOk) : C('--stone'), detail: `공급량 ${fmt(r.supply)} 백만㎥` }));
    const accChart = quietIfBelow($('accChart'), () => D.hbar($('accChart'), accItems,
      { max: mapeAxisMax, ref: MAPE_LIMIT, refLabel: `기준 ${MAPE_LIMIT}%`, onClick: d => goToRegion(d.id), onHoverItem: d => setLinked(d ? d.id : null), showValue: true, axisTitle: '평균 오차율 (%)', barThickness: 16 }));
    setLinked = linkRegions([sensChart && { chart: sensChart, items: sensItems }, { chart: accChart, items: accItems }].filter(Boolean));
    $('accLegend').innerHTML = hasMape ? `<i style="background:${mapeOver}"></i>${MAPE_LIMIT}% 이상 (오차 큰 지역)<i style="background:${mapeOk}"></i>${MAPE_LIMIT}% 미만` : '';
    // 설명 박스는 어떻게 구한 값인지와 한계만 알림 (민감도 카드의 '계산 방식' 박스와 같은 톤).
    //   오차 큰 지역은 범례와 빨간 막대가 이미 보여줘서(개수 배지와 KPI 보조 문구는 없앰) 박스에서는 반복하지 않음. 원인은 지역마다 다를 수 있어 단정하지 않음
    $('accCallout').innerHTML = hasMape
      ? insightBox(mapeInsightsOf(byMape, overLimit, avgMape))
      : D.callout('purple', '예측 오차를 불러오지 못했습니다', '파이썬 예측 서버(FastAPI)가 켜져 있는지 확인하세요.');
  };

  // 페이지 맨 아래 데이터 안내: 기간, 기준 연도, 예측 오차 기준
  const drawDataNote = ({ national, year, period, hasMape }) => {
    // 마지막 달이 12월이 아니면 그 해는 진행 중이라 연간 비교에서 뺐다고 알림
    const [endYear, endMonth] = (national.corrPeriod || '').split(' ~ ').pop().split('-').map(Number);
    // 지역 현황·권역 비중만 기준 연도(12개월이 모두 있는 가장 최근 연도)를 씀. KPI 는 최근 12개월·올해 누적·이번 달이라 기준 연도와 무관
    const partial = endMonth && endMonth < 12 ? ` ${endYear}년은 ${endMonth}월까지라 연간 비교에서는 빼고, 최근 12개월·올해 누적(KPI)과 월별 비교에만 씁니다.` : '';
    const mapeNote = hasMape ? `예측 오차(MAPE)는 최근 12개월을 예측 모델로 다시 맞혀 본 값이며, ${MAPE_LIMIT}% 이상은 경고로 표시합니다.` : '예측 오차(MAPE)는 예측 서버가 꺼져 있어 불러오지 못했습니다.';
    // 한 문단 대신 줄(li)로: 기간·기준 / 범위 / 예측 오차 / 출처를 따로 읽을 수 있게
    $('dataNote').innerHTML = [
      `데이터 기간 ${esc(period || '-')} · 지역 현황과 권역 비중은 12개월이 모두 있는 가장 최근 연도(${year}년) 기준입니다.${partial}`,
      '공급량은 도시가스 가정용(취사·난방)이며 산업용 등은 포함하지 않습니다.',
      mapeNote,
      '출처: 한국도시가스협회 도시가스사업통계월보(공급량·가구수), 기상청(월 평균기온)'
    ].map(text => `<li>${text}</li>`).join('');
  };

  // 한 섹션을 그리다 오류가 나도 나머지는 그리도록 격리 (오류는 콘솔에 남기고, 그 섹션은 비어 있는 채로 둠)
  const safely = (name, fn) => {
    try {
      fn();
    } catch (err) {
      console.error(`[전국 통계] ${name} 를 그리는 중 오류`, err);
    }
  };

  // 받아온 데이터로 화면 전체를 한 번 그림
  const draw = (regions, national) => {
    // 지역 데이터가 없으면 그릴 수 없으므로 안내만 보여줌 (빈 목록으로 최솟값·최댓값을 구하면 오류가 나기 때문)
    if (!Array.isArray(regions) || !regions.length || !national) {
      $('kpis').innerHTML = D.callout('purple', '표시할 데이터가 없습니다', '지역별 공급 데이터를 불러오지 못했거나 비어 있습니다. 잠시 후 다시 시도해 주세요.');
      return;
    }
    const summary = summarize(regions, national);
    safely('KPI', () => drawKpis(summary));
    safely('트리맵', () => drawTreemap(summary));
    safely('도넛', () => drawDonut(summary));
    safely('연도별 추이', () => drawTrend(summary));
    safely('상관계수', () => drawCorrelation(summary));
    safely('민감도·예측 오차', () => drawBars(summary));
    safely('데이터 안내', () => drawDataNote(summary));
    D.icons();   // 새로 그린 HTML 안의 아이콘 표시
  };

  /* ---------- ④ 시작: 데이터를 받아온 뒤 그리기 ---------- */

  // 실패하면 어느 API 인지 알려주고 멈춤 (D.showError). 둘 다 받아야 그리지만 서로 기다릴 필요는 없어서 동시에 요청함
  //   (지역 목록은 파이썬 예측 서버를 거쳐 느릴 수 있음 → 차례로 받으면 두 시간이 더해짐)
  const init = async () => {
    // 차트 선명도: common.css 의 body{zoom:1.15} 때문에 캔버스가 실제보다 작게 그려진 뒤 늘어나 흐려짐(예: 739px 로 그려 850px 로 보임)
    //   → 이 페이지 차트만 해상도를 확대 배율만큼 올림 (공용 Chart.defaults 를 바꾸지만 이 스크립트는 전국 페이지에서만 불림)
    const pageZoom = parseFloat(getComputedStyle(document.body).zoom) || 1;
    Chart.defaults.devicePixelRatio = (window.devicePixelRatio || 1) * pageZoom;

    // 데이터를 받아오는 동안 KPI 자리에 빈 카드를 보여줌 (실패하면 지움)
    $('kpis').innerHTML = '<div class="kpi kpi-skeleton" aria-hidden="true"></div>'.repeat(5);
    $('kpis').setAttribute('aria-busy', 'true');
    // 공용 지역 목록 (GET /api/regions): 이 페이지의 트리맵·도넛·막대와 상단 검색창, 지역 이동이 같이 씀 / 전국 요약 (GET /api/national)
    const [regionsRes, nationalRes] = await Promise.allSettled([D.loadRegions(), axios.get(D.url('api/national'))]);
    const failed = regionsRes.status === 'rejected' ? [regionsRes.reason, '지역 목록'] : nationalRes.status === 'rejected' ? [nationalRes.reason, '전국 요약'] : null;
    if (failed) {
      $('kpis').innerHTML = '';
      D.showError(...failed);
      return;
    }
    draw(regionsRes.value, nationalRes.value.data);
    $('kpis').removeAttribute('aria-busy');
  };

  init();
})();
