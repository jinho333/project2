/* =====================================================================
 * common.js — 모든 페이지가 같이 쓰는 함수 모음 → window.Dash (D) 로 사용
 * ---------------------------------------------------------------------
 *  C(name)              : CSS 변수 색 읽기           예) C('--ink')
 *  fmt(n, 소수자리)      : 숫자 포맷(천 단위 콤마)    예) fmt(1234.5, 1) → '1,234.5'
 *  MONTHS / season()    : 월 이름, 계절 판별 (예전 data.js 에서 옮겨옴)
 *  loadRegions()        : ★ 지역 목록을 서버(API)에서 받아옴
 *  getRegion/setRegion  : 선택 지역 id 읽기/저장 (URL + localStorage)
 *  url(path)            : 컨텍스트 경로를 붙인 주소 만들기 (API 호출에도 사용)
 *  showError()          : API 호출 실패 시 화면에 빨간 안내 박스
 *  renderTileMap        : 지역 타일 지도
 *  kpi / callout        : KPI 카드, 설명 박스 HTML 만들기
 *  renderTabs/Pills     : 탭 / 둥근 버튼
 *  hbar                 : 가로 막대 차트
 *  renderTreemap / renderHeatmap : 트리맵 / 상관계수 표
 *
 * ---------------------------------------------------------------------
 * ★ 더미 데이터(data.js)를 없애고 axios 로 서버에서 데이터를 받아오는 구조
 *   JS 는 Spring 서버의 /api/... 주소만 호출함
 *   (예측·시뮬레이션은 Spring 이 내부에서 FastAPI(파이썬 모델)를 호출해서 결과를 돌려주면 됨)
 *
 * ★ Spring 에서 만들어야 할 API 목록 (응답은 JSON, 키 이름을 아래와 똑같이 맞출 것)
 *   단위: 공급량 = 백만㎥, 인구 = 만 명, 기온 = °C, 월(m) = 0~11 (0 = 1월)
 *
 *   ① GET  /api/regions
 *        → 17개 시·도 목록 ('전국' 제외)
 *          [ { id: 'se', name: '서울', supply: 4860, pop: 935, mape: 4.3,
 *              trend: -0.6, lo: -2.4, hi: 26.8, sensitivity: 5.2 }, ... ]
 *          supply=2025 연간 공급량, trend=인구 증감률(%/년), lo/hi=1월/8월 평균기온,
 *          sensitivity=겨울 1°C 하락 시 공급량 증가율(%)
 *        사용: 모든 페이지 (지도, 지역 정보, 검색, 전국 통계 차트)
 *
 *   ② GET  /api/regions/{regionId}/stats?year=2025
 *        → { months:     [ { m: 0, temp: -2.4, value: 812.3, forecast: false }, ... 12개 ],
 *            prevMonths: [ ...전년도 12개... ]  (전년도가 없으면 null),
 *            tempBins:   [ { label: '<−6', value: 3.1, days: 4 }, ... 12개 ],
 *            popQ:       [ { label: '21.Q1', value: 941.2 }, ... ],
 *            popCorr:    0.42 }   (인구 ↔ 공급량 상관계수)
 *        사용: region.js
 *
 *   ③ GET  /api/national
 *        → { supplyYoy: 1.9, mapeDelta: -0.8,
 *            corrLabels: ['공급량','평균기온',...], corr: [[1,-0.91,...], ...],
 *            corrPeriod: '2021-01 ~ 2026-06' }   (상관계수 계산에 쓴 기간)
 *        사용: national.js
 *
 *   ④ GET  /api/forecast/summary?horizon=6
 *        → [ { id: 'se', total: 2310.5 }, ... ]   (지역별 향후 horizon개월 예측 합계)
 *        사용: forecast.js 지도 색칠
 *
 *   ⑤ GET  /api/regions/{regionId}/forecast?horizon=6
 *        → { hist: [ { label: '25.09', m: 8, value: 120.4 }, ... 실적 12개 ],
 *            fut:  [ { label: '26.09', m: 8, temp: 21.3, value: 130.1, lo: 120.2, hi: 140.0 }, ... horizon개 ] }
 *        사용: forecast.js 예측 탭
 *
 *   ⑥ POST /api/regions/{regionId}/simulation
 *        요청 body: { tempLo: -3, tempHi: 27, popPct: 0 }
 *        → { base: [ { m: 0, temp: -2.4, value: 812.3 }, ... 12개 ],   (평년 기준)
 *            sim:  [ { m: 0, temp: -3.0, value: 840.1 }, ... 12개 ] }  (입력 조건)
 *        사용: forecast.js 시뮬레이션 탭
 * ===================================================================== */
(function () {
  // CSS 변수(tokens.css)를 JS 에서 읽기 위한 준비
  const rootStyle = getComputedStyle(document.documentElement);
  const C = name => rootStyle.getPropertyValue(name).trim();
  // 값이 없으면 '–', 있으면 한국식 숫자 포맷으로
  const fmt = (n, d = 0) => (n === null || n === undefined || isNaN(n)) ? '–'
    : Number(n).toLocaleString('ko-KR', { maximumFractionDigits: d, minimumFractionDigits: d });
  // 값 크기(t: 0~1)에 따라 연한→진한 파랑 5단계 색 고르기 (지도·트리맵)
  const SEQ = ['--seq-1', '--seq-2', '--seq-3', '--seq-4', '--seq-5'];
  const seq = t => `var(${SEQ[Math.min(4, Math.max(0, Math.floor(t * 5)))]})`;
  // 배경이 진하면 글자 흰색, 연하면 검정
  const seqInk = t => (t >= 0.6 ? '#fff' : 'var(--ink)');
  // 상관계수(-1~1) → 파랑~흰색~빨강 7단계 색
  const DIV = ['--div-neg-3', '--div-neg-2', '--div-neg-1', '--div-0', '--div-pos-1', '--div-pos-2', '--div-pos-3'];
  const divColor = v => `var(${DIV[Math.round(((Math.max(-1, Math.min(1, v)) + 1) / 2) * 6)]})`;
  // debounce: 연달아 호출될 때(창 크기 조절 등) ms 동안 기다렸다가 마지막 한 번만 실행
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  // 아이콘 그리기: <i data-lucide="이름"> 을 실제 아이콘으로 바꿈. innerHTML 로 새로 그린 뒤 호출해야 함
  const icons = () => window.lucide && window.lucide.createIcons();

  /* ---------- 날짜·계절 도우미 (예전 data.js 에서 옮겨온 것, 데이터가 아니라 계산식이라 화면에 그대로 둠) ---------- */
  // 월 이름. 배열 인덱스 0 = 1월 … 11 = 12월
  const MONTHS = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];
  // 계절 판별: 12·1·2월 겨울, 3~5월 봄, 6~8월 여름, 9~11월 가을
  const season = m => (m === 11 || m <= 1 ? 'winter' : m <= 4 ? 'spring' : m <= 7 ? 'summer' : 'autumn'); // m = 0..11
  const SEASON_KO = { spring: '봄', summer: '여름', autumn: '가을', winter: '겨울' };
  // 1월 기온(lo)~8월 기온(hi) 사이를 코사인 곡선으로 이어서 m월의 평균기온을 추정 (시뮬레이션 기온 미리보기용)
  const monthTemp = (lo, hi, m) => (lo + hi) / 2 - ((hi - lo) / 2) * Math.cos((2 * Math.PI * (m - 0.35)) / 12);
  // 연도 선택 버튼에 보여줄 연도
  const YEARS = [2021, 2022, 2023, 2024, 2025, 2026];

  /* ---------- 지역 타일맵 칸 위치 ---------- */
  // 지도에서 각 지역이 놓일 칸 [열(col), 행(row)]. 데이터가 아니라 "화면 배치"라서 JS 에 둠
  // 키는 지역 이름 → API ① 의 name 과 글자가 똑같아야 함 ('서울특별시' 처럼 오면 지도에 안 나옴)
  const TILE_POS = {
    '경기': [1, 0], '강원': [2, 0],
    '인천': [0, 1], '서울': [1, 1], '충북': [2, 1], '경북': [3, 1],
    '충남': [0, 2], '세종': [1, 2], '대전': [2, 2], '대구': [3, 2], '울산': [4, 2],
    '전북': [1, 3], '경남': [3, 3], '부산': [4, 3],
    '광주': [0, 4], '전남': [1, 4],
    '제주': [0, 6]
  };

  /* ---------- Chart.js ---------- */
  // Chart.js 플러그인: 차트를 다 그린 뒤 캔버스에 선/글자를 추가로 직접 그림
  // 세로 기준선 (hbar 평균/기준값)
  const refLine = {
    id: 'refLine',
    afterDatasetsDraw(chart, _a, o) {
      if (o.value === undefined || o.value === null) return;
      const { ctx, chartArea: { top, bottom }, scales: { x } } = chart;
      const px = x.getPixelForValue(o.value);
      ctx.save();
      ctx.setLineDash([4, 3]); ctx.strokeStyle = C('--ink'); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(px, top); ctx.lineTo(px, bottom); ctx.stroke();
      if (o.label) { ctx.setLineDash([]); ctx.fillStyle = C('--ink'); ctx.font = `600 12px ${C('--font-sans')}`; ctx.textAlign = 'center'; ctx.fillText(o.label, px, top - 6); }
      ctx.restore();
    }
  };
  // 막대 끝 값 표시 (hbar 에서 showValue 를 켠 차트에만 plugins 로 넣어 씀 → 전체 등록은 안 함)
  const valueLabel = {
    id: 'valueLabel',
    afterDatasetsDraw(chart) {
      const { ctx, data: { datasets: [ds] } } = chart;
      ctx.save();
      ctx.fillStyle = C('--ink'); ctx.font = `600 12px ${C('--font-sans')}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.lineJoin = 'round';   // 기준선이 글자를 가로질러도 읽히게 흰 테두리
      chart.getDatasetMeta(0).data.forEach((bar, i) => {
        const text = fmt(ds.data[i], 1) + '%';
        ctx.strokeText(text, bar.x + 6, bar.y);
        ctx.fillText(text, bar.x + 6, bar.y);
      });
      ctx.restore();
    }
  };
  // 실적/예측 경계 음영
  const split = {
    id: 'split',
    beforeDatasetsDraw(chart, _a, o) {
      if (o.index === undefined || o.index === null) return;
      const { ctx, chartArea: { top, bottom, right }, scales: { x } } = chart;
      const px = x.getPixelForValue(o.index);
      ctx.save();
      ctx.fillStyle = 'rgba(252,252,250,0.7)'; ctx.fillRect(px, top, right - px, bottom - top);
      ctx.setLineDash([3, 3]); ctx.strokeStyle = C('--ash');
      ctx.beginPath(); ctx.moveTo(px, top - 4); ctx.lineTo(px, bottom); ctx.stroke();
      ctx.fillStyle = C('--blue-500'); ctx.font = `700 12px ${C('--font-sans')}`; ctx.fillText(o.label || '예측', px + 6, top + 12);
      ctx.restore();
    }
  };

  // 모든 차트 공통 기본 설정 (글꼴, 색, 범례 숨김, 툴팁 모양) - 페이지마다 반복하지 않도록 여기서 한 번만
  if (window.Chart) {
    const D = Chart.defaults;
    D.font.family = C('--font-sans'); D.font.size = 12; D.color = C('--mute');
    D.maintainAspectRatio = false; D.responsive = true;
    D.animation.duration = 300;
    D.plugins.legend.display = false;
    Object.assign(D.plugins.tooltip, {
      backgroundColor: C('--ink'), titleColor: C('--stone'), bodyColor: '#fff',
      padding: 10, cornerRadius: 6, displayColors: false,
      titleFont: { weight: '500' }, bodyFont: { weight: '600' }
    });
    D.scale.grid.color = C('--viz-grid');
    D.scale.border.display = false;
    // 위 플러그인 2개 등록 → 차트 옵션에서 plugins: { refLine: {...}, split: {...} } 로 사용
    Chart.register(refLine, split);
  }

  // 가로 막대 차트 (전국 통계: 기온 민감도, 예측 정확도)
  //   data: [{ id, label, value, color }], ref: 기준선 값, onClick: 막대 클릭 시 실행할 함수
  //   showValue: 막대 끝에 값 표시, axisTitle: 아래쪽 축 제목 (둘 다 안 주면 예전 모양 그대로)
  function hbar(canvas, data, { max, ref, refLabel, onClick, showValue = false, axisTitle } = {}) {
    return new Chart(canvas, {
      type: 'bar',
      data: { labels: data.map(d => d.label), datasets: [{ data: data.map(d => d.value), backgroundColor: data.map(d => d.color), borderRadius: 3, barThickness: 12 }] },
      plugins: showValue ? [valueLabel] : [],
      options: {
        indexAxis: 'y',
        layout: { padding: { top: 18, right: showValue ? 40 : 0 } },
        scales: {
          x: { max, ticks: { callback: v => v + '%' }, ...(axisTitle && { title: { display: true, text: axisTitle, color: C('--mute'), font: { size: 12 } } }) },
          y: { grid: { display: false }, ticks: { color: C('--ink'), font: { weight: '500', size: 13 } } }
        },
        plugins: { refLine: { value: ref, label: refLabel }, tooltip: { callbacks: { label: i => fmt(i.raw, 1) + '%' } } },
        onClick: (_e, els) => { if (els.length && onClick) onClick(data[els[0].index]); },
        onHover: (e, els) => { e.native.target.style.cursor = els.length && onClick ? 'pointer' : 'default'; }
      }
    });
  }

  /* ---------- 서버 주소 / 지역 목록 (API) ---------- */
  // 컨텍스트 경로를 붙인 주소 만들기   예) url('api/regions') → '/api/regions'
  // window.CTX 는 layout.html 에서 Thymeleaf 가 넣어줌. 앞에 '/' 를 붙이지 말고 'api/...' 로 쓸 것
  const url = path => (window.CTX || '/') + path;

  // 받아온 지역 목록을 저장해 두는 곳 (페이지마다 한 번만 받아오면 됨)
  let regions = [];

  // API ① 호출: 지역 목록 받아오기 → 지도 칸 위치(col,row) 붙여서 저장
  //   async 함수 : 안에서 await 를 쓸 수 있는 함수. 호출하면 Promise 를 돌려줌
  //   await       : axios 요청이 끝날 때까지 기다렸다가 결과를 받음 (.then(res => ...) 과 같은 뜻)
  async function loadRegions() {
    const res = await axios.get(url('api/regions'));
    regions = res.data.map(r => {
      const pos = TILE_POS[r.name] || [null, null];
      return { ...r, col: pos[0], row: pos[1] };   // { ...r } : r 의 값을 그대로 복사 + col,row 추가
    });
    return regions;
  }
  const getRegions = () => regions;
  // id 로 지역 1개 찾기
  const findRegion = id => regions.find(r => String(r.id) === String(id));

  /* ---------- 선택 지역 id (★ URL 의 regionId) ---------- */
  // ★ regionId 가 오가는 흐름 (예전에는 data.js 의 'se','gg' 같은 값을 썼음)
  //   1) 페이지 주소   /region?region=se
  //        → DashboardController 가 Model 에 regionId 로 담음
  //        → layout.html 에서 window.INITIAL_REGION = 'se' 로 JS 에 전달
  //   2) JS 에서 읽기  D.getRegion()  → 아래 우선순위대로 id 를 고름
  //   3) API 주소에 넣기  axios.get(D.url(`api/regions/${regionId}/stats`))
  //        → 백틱(`) 문자열 안에 ${regionId} 로 끼워 넣음 → '/api/regions/se/stats'
  //
  // ★ id 값의 종류는 API ① 이 돌려주는 id 와 반드시 같아야 함
  //   - 'se' 같은 코드를 쓰면 : /region?region=se    → /api/regions/se/stats
  //   - DB region_id(숫자)를 쓰면 : /region?region=1 → /api/regions/1/stats
  //   (Spring 에서는 @PathVariable 로 받으면 됨)

  // 선택 지역 우선순위: URL ?region= → 서버가 넘긴 값 → 브라우저 저장값 → 목록의 첫 번째 지역
  // ※ loadRegions() 가 끝난 뒤에 호출해야 함 (목록에 있는 id 인지 확인하기 때문)
  function getRegion() {
    const p = new URLSearchParams(location.search).get('region');
    const id = p || window.INITIAL_REGION || localStorage.getItem('gasdash.region');
    if (findRegion(id)) return findRegion(id).id;
    return regions.length ? regions[0].id : null;
  }
  // 선택 지역을 브라우저에 저장 + 주소창 URL 도 ?region=id 로 바꿈 (새로고침 없이)
  function setRegion(id) {
    localStorage.setItem('gasdash.region', id);
    const u = new URL(location.href); u.searchParams.set('region', id); history.replaceState(null, '', u);
  }

  /* ---------- API 실패 안내 ---------- */
  // 요청이 실패하면 콘솔에 에러를 찍고, 페이지 제목 아래에 빨간 안내 박스를 보여줌
  //   what: 어떤 데이터를 받다가 실패했는지 (예: '지역 목록')
  function showError(err, what) {
    console.error(`[API 실패] ${what}`, err);
    let box = document.getElementById('apiError');
    if (!box) {
      box = document.createElement('div');
      box.id = 'apiError';
      box.className = 'mt-12';
      document.querySelector('.page-head').appendChild(box);
    }
    // err.config.url : 실패한 요청 주소, err.response.status : 서버 응답 코드 (404, 500 등)
    const reqUrl = err && err.config ? err.config.url : '';
    const status = err && err.response ? ` (${err.response.status})` : ' (서버 응답 없음)';
    box.innerHTML = callout('red', `${what} 데이터를 불러오지 못했습니다${status}`, `요청 주소: ${reqUrl} — Spring 서버와 API 주소를 확인하세요.`);
    icons();
  }
  // 다시 성공하면 안내 박스 지우기
  function clearError() {
    const box = document.getElementById('apiError');
    if (box) box.remove();
  }

  /* ---------- 지역 타일맵 ---------- */
  // 5×7 격자를 돌면서 지역이 있는 칸은 버튼, 없는 칸은 빈칸으로
  //   valueOf: 색을 정할 값, selected: 선택 지역 id, onSelect: 클릭 시 실행할 함수
  function renderTileMap(el, { valueOf, selected, onSelect, legendLabel = '연간 공급량' }) {
    const R = regions;
    const vals = R.map(valueOf), mn = Math.min(...vals), mx = Math.max(...vals);
    let html = '<div class="tilemap">';
    for (let row = 0; row < 7; row++) for (let col = 0; col < 5; col++) {
      const r = R.find(x => x.row === row && x.col === col);
      if (!r) { html += '<span class="tile-empty"></span>'; continue; }
      const v = valueOf(r), t = (v - mn) / (mx - mn || 1);
      html += `<button type="button" class="tile${String(r.id) === String(selected) ? ' is-selected' : ''}" data-id="${r.id}" style="background:${seq(t)};color:${seqInk(t)}" aria-pressed="${String(r.id) === String(selected)}"><b>${r.name}</b><span>${fmt(v)}</span></button>`;
    }
    html += '</div>';
    html += `<div class="scale"><span>${legendLabel}</span><span>${fmt(mn)}</span><span class="steps">${SEQ.map(s => `<i style="background:var(${s})"></i>`).join('')}</span><span>${fmt(mx)}</span></div>`;
    el.innerHTML = html;
    // HTML 을 넣은 뒤 각 타일에 클릭 이벤트 연결
    // data-id 는 항상 문자열이라 목록에 있는 원래 id(숫자일 수도 있음)로 바꿔서 넘김
    el.querySelectorAll('.tile').forEach(b => { b.onclick = () => onSelect(findRegion(b.dataset.id).id); });
  }

  // 지역 이름 + 전국 비중 배지 + MAPE 배지 (8% 초과 빨강, 6.5% 초과 노랑, 나머지 초록)
  function renderRegionInfo(el, r) {
    const total = regions.reduce((s, x) => s + x.supply, 0);
    const tone = r.mape > 8 ? 'red' : r.mape > 6.5 ? 'yellow' : 'green';
    el.innerHTML = `<div class="eyebrow">선택 지역</div>
      <div class="region-name"><span>${r.name}</span>
        <span class="badge">전국 비중 ${fmt((r.supply / total) * 100, 1)}%</span>
        <span class="badge badge--${tone}"><i class="dot"></i>MAPE ${fmt(r.mape, 1)}%</span></div>`;
  }

  /* ---------- KPI / 탭 / 콜아웃 ---------- */
  // KPI 카드 HTML 문자열을 만들어 반환
  //   delta   : 증감률(%)  → 화살표와 함께 표시, deltaUnit: 값 뒤 단위 (비율끼리의 차이는 '%p', 기본 '%')
  //   goodWhen: 'up'(오르면 좋음) / 'down'(내리면 좋음) / 'neutral'(색 없음)
  //   caption, deltaLabel: 아래 작은 설명,  accent: 라벨 앞 작은 색 네모
  function kpi({ label, value, unit, delta, deltaUnit = '%', deltaLabel, goodWhen = 'neutral', caption, accent }) {
    let meta = '';
    if (typeof delta === 'number' && !isNaN(delta)) {
      const up = delta >= 0;
      const cls = goodWhen === 'neutral' ? 'neutral' : (up === (goodWhen === 'up') ? 'good' : 'bad');
      meta += `<span class="delta ${cls}"><i data-lucide="${up ? 'arrow-up-right' : 'arrow-down-right'}"></i>${Math.abs(delta).toFixed(1)}${deltaUnit}</span>`;
    }
    if (deltaLabel || caption) meta += `<span>${deltaLabel || caption}</span>`;
    return `<div class="kpi"><div class="kpi-label">${accent ? `<span class="kpi-accent" style="background:${accent}"></span>` : ''}${label}</div>
      <div class="kpi-value"><b>${value}</b>${unit ? `<span>${unit}</span>` : ''}</div>${meta ? `<div class="kpi-meta">${meta}</div>` : ''}</div>`;
  }

  // 탭/둥근 버튼 공통: 버튼 HTML 을 만들고, 클릭하면 onChange(선택 id) 호출
  //   data-id 는 항상 문자열이라 숫자처럼 생긴 값(연도 등)은 숫자로 바꿔서 넘김
  function renderChoice(el, items, value, onChange, cls) {
    el.innerHTML = items.map(it => `<button type="button" class="${cls}${String(it.id) === String(value) ? ' is-active' : ''}" data-id="${it.id}">${it.icon ? `<i data-lucide="${it.icon}"></i>` : ''}${it.label}</button>`).join('');
    el.querySelectorAll('button').forEach(b => {
      b.onclick = () => { const raw = b.dataset.id; onChange(isNaN(+raw) ? raw : +raw); };
    });
    icons();
  }
  const renderTabs = (el, items, value, onChange) => renderChoice(el, items, value, onChange, 'tab');
  const renderPills = (el, items, value, onChange) => renderChoice(el, items, value, onChange, 'pill');

  // 설명 박스: tone(blue/green/red/purple)에 맞는 아이콘 자동 선택
  const ICON = { blue: 'info', green: 'circle-check', red: 'triangle-alert', purple: 'bookmark' };
  const callout = (tone, title, body) => `<div class="callout callout--${tone}"><i data-lucide="${ICON[tone]}"></i><div><b>${title}</b>${body ? `<div>${body}</div>` : ''}</div></div>`;

  /* ---------- 트리맵 (squarified) ---------- */
  // 트리맵 칸 배치 계산 (squarified 알고리즘): 값 비율대로 사각형을 최대한 정사각형에 가깝게 나눔
  // ※ 수학 계산 부분이라 내부까지 이해할 필요 없음. 결과 = 각 칸의 x, y, w(너비), h(높이)
  function squarify(items, x, y, w, h) {
    const out = [], total = items.reduce((s, d) => s + d.value, 0);
    if (!total) return out;
    const scale = (w * h) / total;
    let rest = items.map(d => ({ ...d, area: d.value * scale }));
    const worst = (row, len) => { const s = row.reduce((a, d) => a + d.area, 0), mx = Math.max(...row.map(d => d.area)), mn = Math.min(...row.map(d => d.area)); return Math.max((len * len * mx) / (s * s), (s * s) / (len * len * mn)); };
    while (rest.length) {
      const len = Math.min(w, h);
      let row = [rest[0]], i = 1;
      while (i < rest.length && worst([...row, rest[i]], len) <= worst(row, len)) { row.push(rest[i]); i++; }
      const s = row.reduce((a, d) => a + d.area, 0);
      if (w >= h) { const rw = s / h; let cy = y; row.forEach(d => { const rh = d.area / rw; out.push({ ...d, x, y: cy, w: rw, h: rh }); cy += rh; }); x += rw; w -= rw; }
      else { const rh = s / w; let cx = x; row.forEach(d => { const rw = d.area / rh; out.push({ ...d, x: cx, y, w: rw, h: rh }); cx += rw; }); y += rh; h -= rh; }
      rest = rest.slice(i);
    }
    return out;
  }
  // 트리맵 그리기: 칸 크기 = value. 칸이 작으면 글자를 줄이거나 생략하고, 모든 칸은 마우스를 올리면 툴팁으로 안내
  //   큰 칸: 이름 + '값 · note' / 좁은 칸: 이름 + note 만 / 아주 작은 칸: 글자 없음(툴팁만)
  //   data 항목: { id, label, value } + 선택 항목
  //     color / ink : 칸 배경색 / 글자색 (없으면 value 크기에 따른 파랑 농도)
  //     note        : 값 옆에 붙일 글자 (없으면 전체 대비 %)
  //     tip         : 툴팁에 넣을 HTML (없으면 이름 + 값)
  function renderTreemap(el, data, { unit = '', onSelect } = {}) {
    const w = el.clientWidth, h = el.clientHeight;
    const sorted = [...data].sort((a, b) => b.value - a.value);
    const mx = sorted[0].value, mn = sorted[sorted.length - 1].value;
    const total = data.reduce((s, d) => s + d.value, 0);
    const rects = squarify(sorted, 0, 0, w, h);
    el.innerHTML = rects.map((r, i) => {
      const t = (r.value - mn) / (mx - mn || 1);
      const big = r.w > 140 && r.h > 70;
      const note = r.note !== undefined ? r.note : `${fmt((r.value / total) * 100, 1)}%`;
      return `<div class="tm-cell" data-id="${r.id}" data-i="${i}" aria-label="${r.label} ${fmt(r.value)}${unit}" style="left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px">
        <div class="tm-inner" style="background:${r.color || seq(t)};color:${r.ink || seqInk(t)};${r.w > 60 && r.h > 36 ? '' : 'padding:2px'}">
          ${r.w > 44 && r.h > 22 ? `<b style="font-size:${big ? 15 : 12}px">${r.label}</b>` : ''}
          ${r.w > 72 && r.h > 44 ? `<span>${r.w > 96 ? `${fmt(r.value)}${unit} · ${note}` : note}</span>` : ''}
        </div></div>`;
    }).join('');

    // 툴팁: 글자가 안 들어가는 작은 칸도 같은 정보를 볼 수 있게 함
    const tip = document.createElement('div');
    tip.className = 'tm-tip';
    el.appendChild(tip);
    el.querySelectorAll('.tm-cell').forEach(c => {
      const r = rects[c.dataset.i];
      c.onmouseenter = () => { tip.innerHTML = r.tip || `<b>${r.label}</b>${fmt(r.value)}${unit}`; tip.style.display = 'block'; };
      c.onmousemove = e => {
        const b = el.getBoundingClientRect();
        let x = e.clientX - b.left + 14, y = e.clientY - b.top + 14;
        if (x + tip.offsetWidth > b.width) x = e.clientX - b.left - tip.offsetWidth - 14;   // 오른쪽 끝이면 왼쪽에 표시
        if (y + tip.offsetHeight > b.height) y = e.clientY - b.top - tip.offsetHeight - 14; // 아래쪽 끝이면 위쪽에 표시
        tip.style.left = Math.max(0, x) + 'px';
        tip.style.top = Math.max(0, y) + 'px';
      };
      c.onmouseleave = () => { tip.style.display = 'none'; };
    });
    if (onSelect) el.querySelectorAll('.tm-cell').forEach(c => { c.onclick = () => onSelect(c.dataset.id); });
  }

  /* ---------- 상관계수 히트맵 ---------- */
  // 상관계수 크기를 말로 풀어줌 (예: 0.98 → '매우 강한 양의 상관')
  const corrStrength = v => {
    const a = Math.abs(v);
    const level = a >= 0.8 ? '매우 강한' : a >= 0.6 ? '강한' : a >= 0.4 ? '보통' : a >= 0.2 ? '약한' : null;
    return level ? `${level} ${v > 0 ? '양' : '음'}의 상관` : '거의 상관 없음';
  };
  // labels: 변수 이름 배열, M: 상관계수 2차원 배열 → 색칠된 표 HTML (열 이름은 맨 위)
  //   lower: true 면 아래쪽 삼각형만 그림 (대각선=자기 자신 1.00 과 대칭으로 겹치는 칸은 정보가 없어서 생략)
  //   글자색: 가장 진한 두 단계(|r| ≥ 0.83)만 흰색, 나머지는 검정 (연한 배경에서 흰 글씨는 대비 부족)
  //   칸에 마우스를 올리면 해당 행·열 이름이 굵어지고, 아래 한 줄 안내에 강도가 표시됨
  function renderHeatmap(el, labels, M, { lower = false } = {}) {
    const all = labels.map((_, i) => i);
    const rowIdx = lower ? all.slice(1) : all;       // lower 면 첫 변수는 행에서, 마지막 변수는 열에서 뺌
    const colIdx = lower ? all.slice(0, -1) : all;
    const HINT = '칸에 마우스를 올리면 상관의 강도를 설명합니다';

    let h = `<div class="hm" style="grid-template-columns:72px repeat(${colIdx.length},minmax(34px,1fr))">`;
    h += '<div></div>' + colIdx.map(c => `<div class="hm-col" data-c="${c}">${labels[c]}</div>`).join('');
    rowIdx.forEach(r => {
      h += `<div class="hm-row" data-r="${r}">${labels[r]}</div>`;
      colIdx.forEach(c => {
        if (lower && c >= r) { h += '<div></div>'; return; }   // 위쪽 삼각형과 대각선은 빈칸
        const v = M[r][c];
        h += `<div class="hm-cell" data-r="${r}" data-c="${c}" aria-label="${labels[r]} 와 ${labels[c]}: ${v.toFixed(2)}" style="background:${divColor(v)};color:${Math.abs(v) >= 0.83 ? '#fff' : 'var(--ink)'}">${v.toFixed(2)}</div>`;
      });
    });
    h += '</div>';
    h += `<div class="hm-scale"><span>−1</span>${DIV.map(d => `<i style="background:var(${d})"></i>`).join('')}<span>+1</span><span class="hm-scale-note">진할수록 강한 상관 · 빨강 = 같이 증가, 파랑 = 반대로 움직임</span></div>`;
    h += `<div class="hm-readout">${HINT}</div>`;
    el.innerHTML = h;

    const readout = el.querySelector('.hm-readout');
    const mark = (r, c, on) => {
      const rowLabel = el.querySelector(`.hm-row[data-r="${r}"]`), colLabel = el.querySelector(`.hm-col[data-c="${c}"]`);
      if (rowLabel) rowLabel.classList.toggle('is-active', on);
      if (colLabel) colLabel.classList.toggle('is-active', on);
    };
    el.querySelectorAll('.hm-cell').forEach(cell => {
      const r = +cell.dataset.r, c = +cell.dataset.c, v = M[r][c];
      cell.onmouseenter = () => { mark(r, c, true); readout.innerHTML = `<b>${labels[r]} ↔ ${labels[c]}</b> r = ${v.toFixed(2)} · ${corrStrength(v)}`; };
      cell.onmouseleave = () => { mark(r, c, false); readout.textContent = HINT; };
    });
  }

  /* ---------- 상단 지역 검색 ---------- */
  // 페이지 로딩이 끝나면: 아이콘 그리기 + 상단 검색창에서 Enter 시 해당 지역 상세 페이지로 이동
  // (지역 목록은 각 페이지가 loadRegions() 로 받아온 것을 사용)
  document.addEventListener('DOMContentLoaded', () => {
    icons();
    const s = document.getElementById('regionSearch');
    if (s) s.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      const q = s.value.trim(); if (!q) return;
      const r = regions.find(x => x.name.includes(q) || q.includes(x.name));
      // ★ 검색한 지역의 id 를 페이지 주소의 ?region= 에 넣어서 이동
      if (r) location.href = url(`region?region=${r.id}`);
      else { s.value = ''; s.placeholder = '일치하는 지역 없음'; }
    });
  });

  // 다른 파일에서 D.함수이름() 으로 쓸 수 있게 등록
  window.Dash = {
    C, fmt, seq, seqInk, divColor, debounce, icons, hbar,
    MONTHS, season, SEASON_KO, monthTemp, YEARS,
    url, loadRegions, getRegions, findRegion, getRegion, setRegion, showError, clearError,
    renderTileMap, renderRegionInfo, kpi, renderTabs, renderPills, callout, renderTreemap, renderHeatmap
  };
})();
