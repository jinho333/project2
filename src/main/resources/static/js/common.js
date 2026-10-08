/* =====================================================================
 * common.js — 모든 페이지가 같이 쓰는 함수 모음
 * ---------------------------------------------------------------------
 * 다른 js 파일(region.js, national.js, forecast.js)에서는
 *   const D = window.Dash;   로 꺼낸 뒤   D.fmt(1234)  처럼 사용함
 *
 * [들어 있는 함수 한눈에 보기]
 *   C(name)              CSS 변수(색) 읽기               예) C('--ink')
 *   fmt(n, 소수자리)      숫자를 화면용 글자로             예) fmt(1234.5, 1) → '1,234.5'
 *   MONTHS / season()    월 이름, 계절 판별
 *   url(path)            서버 주소 만들기                 예) url('api/regions') → '/api/regions'
 *   loadRegions()        ★ 지역 목록을 서버에서 받아옴 (모든 페이지가 맨 처음 호출)
 *   loadYears()          연도 목록 + 기준 연도를 서버에서 받아옴 (지역 상세 페이지의 연도 버튼)
 *   getRegion/setRegion  선택한 지역 번호 읽기 / 저장
 *   showError()          서버 요청 실패 시 빨간 안내 박스
 *   renderTileMap        지역 타일 지도 그리기
 *   kpi / callout        KPI 카드, 설명 박스 HTML 만들기
 *   renderTabs/Pills     탭 / 둥근 버튼 그리기
 *   hbar                 가로 막대 차트
 *   renderTreemap        트리맵(면적으로 크기 비교)
 *   renderHeatmap        상관계수 표
 *
 * ---------------------------------------------------------------------
 * [이 파일에서 자주 나오는 문법] ← 본문에서는 다시 설명하지 않음
 *   name => 값              화살표 함수.  function (name) { return 값; }  과 같음
 *   (a, b) => { ... }       화살표 함수.  function (a, b) { ... }  과 같음
 *   조건 ? A : B            조건이 참이면 A, 아니면 B  (if-else 를 한 줄로 쓴 것)
 *   A && B                  A 가 있을(참일) 때만 B 를 실행
 *   A || B                  A 가 없으면(거짓이면) B 를 사용  → 기본값 줄 때 씀
 *   `글자 ${변수} 글자`      백틱 문자열. 문자열 안에 변수 값을 끼워 넣음
 *   { ...r, col: 1 }        r 의 내용을 그대로 복사하고 col 을 추가
 *   [...배열]               배열 복사
 *   +글자                   글자를 숫자로 바꿈  예) +'3' → 3
 *   const { a, b } = obj    obj.a, obj.b 를 꺼내서 a, b 라는 변수로 만듦
 *   배열.map(x => ...)       배열의 각 항목을 바꿔서 새 배열을 만듦
 *   배열.find(x => 조건)     조건에 맞는 첫 항목 1개 (없으면 undefined)
 *   배열.reduce((s, x) => s + x.값, 0)   전부 더하기 (s 는 지금까지의 합, 0 부터 시작)
 *   async / await           서버 응답을 기다렸다가 다음 줄을 실행
 *
 * ---------------------------------------------------------------------
 * [서버 API 목록] JS 는 Spring 서버의 /api/... 주소만 호출함
 *   (예측·시뮬레이션·MAPE 는 Spring 이 내부에서 FastAPI(파이썬 모델)를 호출해서 결과를 돌려줌)
 *   단위: 공급량 = 백만㎥, 인구 = 만 명, 기온 = °C, 월(m) = 0~11 (0 = 1월)
 *
 *   ① GET  /api/regions                              사용: 모든 페이지 (지도, 지역 정보, 검색)
 *        → 17개 시·도 목록 ('전국' 제외)
 *          [ { id: 1, name: '서울', supply: 2399.5, pop: 932.2,
 *              lo: -1.8, hi: 27.3, trend: -0.4, mape: 8.5 }, ... ]
 *          id     = DB 의 REGION_ID (숫자)
 *          supply = 기준 연도의 연간 공급량,  pop = 기준 연도의 평균 인구
 *                   (기준 연도 = 12개월이 모두 있는 가장 최근 연도. 지금은 2025)
 *          lo/hi  = 1월/8월 평균기온 (시뮬레이션 슬라이더의 처음 위치)
 *          trend  = 인구 증감률(%/년),  mape = 예측 오차율(%, FastAPI 가 꺼져 있으면 null)
 *
 *      GET  /api/regions/years                         사용: region.js (연도 버튼)
 *        → { years: [2021, 2022, 2023, 2024, 2025, 2026], baseYear: 2025 }
 *          years    = 데이터가 있는 연도 전체
 *          baseYear = 기준 연도 (처음 선택되는 연도. 이보다 큰 연도는 아직 진행 중인 해)
 *
 *   ② GET  /api/regions/{regionId}/stats?year=2025    사용: region.js
 *        → { months:     [ { m: 0, temp: -0.4, value: 468.7, forecast: false }, ... 12개 ],
 *            prevMonths: [ ...전년도 12개... ]  (전년도가 없으면 null),
 *            tempBins:   [ { label: '<-6', value: 3.1, days: 31 }, ... 12개 ],
 *            popQ:       [ { label: '21.Q1', value: 941.2 }, ... ],
 *            popCorr:    0.09 }   (인구 ↔ 공급량 상관계수)
 *
 *   ③ GET  /api/national                              사용: national.js
 *        → { supplyYoy: 6.3, mapeDelta: 6.6,
 *            corrLabels: ['공급량','평균기온',...], corr: [[1,-0.96,...], ...],
 *            corrPeriod: '2021-01 ~ 2026-06' }   (상관계수 계산에 쓴 기간)
 *      GET  /api/national/regions                      사용: national.js (전국 페이지 전용 지역 지표)
 *        → [ { id: 1, name: '서울', supply, supplyYoy, pop, sensitivity, mape, trend, lo, hi }, ... ]
 *          ※ id 는 ①과 같은 지역 번호(DB REGION_ID)
 *
 *   ④ GET  /api/forecast/summary?horizon=6            사용: forecast.js 지도 색칠
 *        → [ { id: 1, total: 478.2 }, ... ]   (지역별 향후 horizon개월 예측 합계)
 *
 *   ⑤ GET  /api/regions/{regionId}/forecast?horizon=6 사용: forecast.js 예측 탭
 *        → { hist: [ { label: '25.07', m: 6, value: 43.9 }, ... 실적 12개 ],
 *            fut:  [ { label: '26.07', m: 6, temp: 27.5, value: 44.9, lo: 41.1, hi: 48.7 }, ... horizon개 ] }
 *
 *   ⑥ POST /api/regions/{regionId}/simulation         사용: forecast.js 시뮬레이션 탭
 *        요청 body: { tempLo: -2, tempHi: 27, popPct: 0 }
 *        → { base: [ { m: 0, temp: -1.8, value: 475.4 }, ... 12개 ],   (평년 기준)
 *            sim:  [ { m: 0, temp: -1.8, value: 475.4 }, ... 12개 ] }  (입력 조건)
 * ===================================================================== */

// (function () { ... })();  →  함수를 만들자마자 바로 실행하는 문법
//   이 안에서 만든 변수(C, fmt, regions ...)는 밖에서 안 보임 → 다른 js 파일의 변수 이름과 겹치지 않음
//   밖에서 쓸 것만 맨 아래에서 window.Dash 에 담아 내보냄
(function () {

  /* =====================================================================
   * 1. 기본 도우미 (색, 숫자 포맷)
   * ===================================================================== */

  // C(name) : tokens.css 에 정의한 CSS 변수 값을 읽어옴
  //   예) C('--ink') → '#23251d'      C('--font-sans') → 글꼴 이름
  //   쓰는 곳: Chart.js 에 색을 넘길 때 (차트는 var(--ink) 같은 CSS 문법을 못 읽어서 실제 값이 필요)
  const rootStyle = getComputedStyle(document.documentElement);   // <html> 에 적용된 스타일 전체
  const C = name => rootStyle.getPropertyValue(name).trim();      // trim() : 앞뒤 공백 제거

  // fmt(n, d) : 숫자를 화면에 보여줄 글자로 바꿈
  //   n = 바꿀 숫자,  d = 소수점 아래 자릿수 (안 넣으면 0)
  //   예) fmt(1234.56)    → '1,235'
  //       fmt(1234.56, 1) → '1,234.6'
  //       fmt(null)       → '–'    (값이 없을 때. 화면에 undefined 나 NaN 이 보이지 않게 함)
  //   읽는 법: n 이 비어 있거나 숫자가 아니면 '–', 아니면 한국식(천 단위 콤마)으로 포맷
  const fmt = (n, d = 0) => (n === null || n === undefined || isNaN(n)) ? '–'
    : Number(n).toLocaleString('ko-KR', { maximumFractionDigits: d, minimumFractionDigits: d });

  // seq(t) : 값의 크기에 따라 연한 파랑 ~ 진한 파랑 5단계 중 하나를 골라줌 (지도 타일, 트리맵 칸 색)
  //   t = 0~1 사이 숫자 (0 = 가장 작은 값, 1 = 가장 큰 값)
  //   예) seq(0) → 'var(--seq-1)' (가장 연함)     seq(0.5) → 'var(--seq-3)'     seq(1) → 'var(--seq-5)' (가장 진함)
  //   계산: t × 5 를 내림해서 0~4 번째 색을 고름. Math.min(4, ...), Math.max(0, ...) 는 범위를 벗어나지 않게 막는 용도
  const SEQ = ['--seq-1', '--seq-2', '--seq-3', '--seq-4', '--seq-5'];
  const seq = t => `var(${SEQ[Math.min(4, Math.max(0, Math.floor(t * 5)))]})`;

  // seqInk(t) : 위 배경색 위에 올릴 글자색. 배경이 진하면(t ≥ 0.6) 흰색, 연하면 검정
  const seqInk = t => (t >= 0.6 ? '#fff' : 'var(--ink)');

  // divColor(v) : 상관계수(-1 ~ 1)를 색으로 바꿈 (상관계수 표의 칸 색)
  //   -1 에 가까우면 진한 파랑, 0 은 흰색, +1 에 가까우면 진한 빨강 (7단계)
  //   예) divColor(-1) → 'var(--div-neg-3)'     divColor(0) → 'var(--div-0)'     divColor(1) → 'var(--div-pos-3)'
  //   계산: -1~1 을 0~6 번째로 바꿈 → (v + 1) / 2 × 6 을 반올림
  const DIV = ['--div-neg-3', '--div-neg-2', '--div-neg-1', '--div-0', '--div-pos-1', '--div-pos-2', '--div-pos-3'];
  const divColor = v => `var(${DIV[Math.round(((Math.max(-1, Math.min(1, v)) + 1) / 2) * 6)]})`;

  // debounce(fn, ms) : fn 이 짧은 시간에 여러 번 불려도 "마지막 한 번만" 실행하게 만든 새 함수를 돌려줌
  //   쓰는 곳: 창 크기를 조절하는 동안 계속 다시 그리지 않고, 멈춘 뒤 ms 밀리초가 지나면 한 번만 그림
  //   예) window.addEventListener('resize', D.debounce(renderTree, 150));
  //   원리: 불릴 때마다 이전 예약(setTimeout)을 취소하고 새로 예약함 → 마지막 예약만 실행됨
  //   (...a 는 넘겨받은 값들을 그대로 fn 에 전달하기 위한 것)
  const debounce = (fn, ms) => {
    let t;
    return (...a) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...a), ms);
    };
  };

  // icons() : HTML 안의 <i data-lucide="이름"> 을 실제 아이콘 그림으로 바꿈 (lucide 라이브러리)
  //   ※ innerHTML 로 화면을 새로 그리면 아이콘이 안 보이므로, 그린 뒤에 꼭 호출해야 함
  //   window.lucide && ... : lucide 라이브러리가 불러와졌을 때만 실행
  const icons = () => window.lucide && window.lucide.createIcons();


  /* =====================================================================
   * 2. 날짜·계절 도우미 (서버 데이터가 아니라 계산식이라 JS 에 둠)
   * ===================================================================== */

  // 월 이름. 배열 번호 0 = 1월 … 11 = 12월   예) MONTHS[0] → '1월'
  const MONTHS = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];

  // season(m) : 월 번호를 받아 계절 이름을 돌려줌
  //   ※ m 은 0부터 시작 (0 = 1월, 11 = 12월)
  //   예) season(0) → 'winter'     season(4) → 'spring'     season(7) → 'summer'     season(10) → 'autumn'
  //   풀어 쓰면 아래와 같음 (조건 ? A : B 가 세 번 이어진 모양)
  //     if (m === 11 || m <= 1) return 'winter';   // 12월, 1월, 2월
  //     else if (m <= 4)        return 'spring';   // 3~5월
  //     else if (m <= 7)        return 'summer';   // 6~8월
  //     else                    return 'autumn';   // 9~11월
  //   쓰는 곳: 월별 막대 색(C(`--season-${season(m)}`)), 계절 배지
  const season = m => (m === 11 || m <= 1 ? 'winter' : m <= 4 ? 'spring' : m <= 7 ? 'summer' : 'autumn');

  // 계절 영어 이름 → 한글   예) SEASON_KO['winter'] → '겨울'
  const SEASON_KO = { spring: '봄', summer: '여름', autumn: '가을', winter: '겨울' };

  // monthTemp(lo, hi, m) : 1월 기온(lo)과 8월 기온(hi) 두 값만으로 m월의 기온을 추정
  //   가장 추운 1월과 가장 더운 8월 사이를 물결(코사인) 모양 곡선으로 이은 것
  //   예) monthTemp(-2, 27, 0) → 약 -1.8 (1월)     monthTemp(-2, 27, 7) → 약 26.2 (8월)
  //   쓰는 곳: 시뮬레이션 탭의 12개월 기온 미리보기 막대
  //   ※ 파이썬 main.py 의 month_temp 와 똑같은 식. 한쪽만 바꾸면 화면과 계산 결과가 달라지니 같이 바꿀 것
  const monthTemp = (lo, hi, m) => (lo + hi) / 2 - ((hi - lo) / 2) * Math.cos((2 * Math.PI * (m - 0.35)) / 12);

  // ※ 연도 목록은 예전에 여기에 YEARS = [2021, ..., 2026] 으로 적혀 있었음
  //   지금은 서버에서 받아옴 → 아래 5번의 loadYears() 참고


  /* =====================================================================
   * 3. 지역 타일맵에서 각 지역이 놓일 칸
   * ===================================================================== */

  // 지도 격자(가로 5칸 × 세로 7칸)에서 각 지역의 위치 [열(col), 행(row)]. 둘 다 0부터 시작
  //   예) '서울': [1, 1] → 왼쪽에서 2번째, 위에서 2번째 칸
  //   데이터가 아니라 "화면 배치"라서 DB 가 아닌 JS 에 둠
  //   ※ 키(지역 이름)는 API ① 이 돌려주는 name 과 글자가 똑같아야 함
  //     ('서울특별시' 처럼 다르게 오면 위치를 못 찾아서 지도에 안 나옴)
  const TILE_POS = {
    '경기': [1, 0], '강원': [2, 0],
    '인천': [0, 1], '서울': [1, 1], '충북': [2, 1], '경북': [3, 1],
    '충남': [0, 2], '세종': [1, 2], '대전': [2, 2], '대구': [3, 2], '울산': [4, 2],
    '전북': [1, 3], '경남': [3, 3], '부산': [4, 3],
    '광주': [0, 4], '전남': [1, 4],
    '제주': [0, 6]
  };


  /* =====================================================================
   * 4. Chart.js 공통 설정
   * ===================================================================== */

  // ▼ 여기부터 split 끝까지 3개는 "Chart.js 플러그인" — 차트 위에 선이나 글자를 직접 덧그리는 코드
  //   ctx.xxx 는 캔버스에 그림을 그리는 명령이라 내용을 다 몰라도 됨. 알아야 할 것은 "무엇을 그리는지"와 "어떻게 켜는지"
  //   공통 구조:  id = 플러그인 이름,  afterDatasetsDraw = 막대/선을 그린 "뒤"에 실행,  beforeDatasetsDraw = 그리기 "전"에 실행
  //   ctx.save() ~ ctx.restore() : 색·선 모양 설정을 바꿨다가 끝나면 원래대로 되돌림

  // [플러그인 1] refLine : 가로 막대 차트에 세로 점선(기준선)과 그 위의 글자를 그림
  //   켜는 법: 차트 옵션에  plugins: { refLine: { value: 8, label: '기준 8%' } }
  //   쓰는 곳: 전국 페이지의 '기준 8%' 선, '가중 평균' 선
  const refLine = {
    id: 'refLine',
    afterDatasetsDraw(chart, _a, o) {              // o = 위에서 넘긴 { value, label }
      if (o.value === undefined || o.value === null) return;   // 값이 없으면 안 그림
      const { ctx, chartArea: { top, bottom }, scales: { x } } = chart;
      const px = x.getPixelForValue(o.value);      // 값(예: 8)이 화면에서 가로 몇 픽셀 위치인지
      ctx.save();
      // 점선으로 세로선 긋기
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = C('--ink');
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(px, top);
      ctx.lineTo(px, bottom);
      ctx.stroke();
      // 선 위에 글자 쓰기
      if (o.label) {
        ctx.setLineDash([]);
        ctx.fillStyle = C('--ink');
        ctx.font = `600 12px ${C('--font-sans')}`;
        ctx.textAlign = 'center';
        ctx.fillText(o.label, px, top - 6);
      }
      ctx.restore();
    }
  };

  // [플러그인 2] valueLabel : 가로 막대의 오른쪽 끝에 값을 글자로 표시  예) '7.4%'
  //   켜는 법: hbar(..., { showValue: true })   ← hbar 가 알아서 이 플러그인을 넣어줌
  //   (모든 차트에 등록하지 않고, showValue 를 켠 차트에만 넣음)
  const valueLabel = {
    id: 'valueLabel',
    afterDatasetsDraw(chart) {
      const { ctx, data: { datasets: [ds] } } = chart;   // ds = 첫 번째 데이터 묶음
      ctx.save();
      ctx.fillStyle = C('--ink');
      ctx.font = `600 12px ${C('--font-sans')}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      // 글자 둘레에 흰 테두리 → 기준선이 글자를 가로질러도 읽힘
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      // 막대 하나마다: 막대 끝(bar.x)에서 6픽셀 오른쪽에 값 쓰기
      chart.getDatasetMeta(0).data.forEach((bar, i) => {
        const text = fmt(ds.data[i], 1) + '%';
        ctx.strokeText(text, bar.x + 6, bar.y);
        ctx.fillText(text, bar.x + 6, bar.y);
      });
      ctx.restore();
    }
  };

  // [플러그인 3] split : 선 차트에서 "여기부터 예측" 경계를 표시 (세로 점선 + 오른쪽을 뿌옇게 + '예측' 글자)
  //   켜는 법: 차트 옵션에  plugins: { split: { index: 11, label: '예측' } }   (index = 경계가 되는 x축 번호)
  //   쓰는 곳: 예측 페이지의 실적/예측 선 차트
  const split = {
    id: 'split',
    beforeDatasetsDraw(chart, _a, o) {             // 선보다 "먼저" 그려서 선이 음영 위에 보이게 함
      if (o.index === undefined || o.index === null) return;
      const { ctx, chartArea: { top, bottom, right }, scales: { x } } = chart;
      const px = x.getPixelForValue(o.index);      // 경계의 가로 위치(픽셀)
      ctx.save();
      // 경계 오른쪽(예측 구간)을 반투명 흰색으로 덮기
      ctx.fillStyle = 'rgba(252,252,250,0.7)';
      ctx.fillRect(px, top, right - px, bottom - top);
      // 경계에 세로 점선
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = C('--ash');
      ctx.beginPath();
      ctx.moveTo(px, top - 4);
      ctx.lineTo(px, bottom);
      ctx.stroke();
      // '예측' 글자
      ctx.fillStyle = C('--blue-500');
      ctx.font = `700 12px ${C('--font-sans')}`;
      ctx.fillText(o.label || '예측', px + 6, top + 12);
      ctx.restore();
    }
  };

  // 모든 차트에 공통으로 적용할 기본값 — 페이지마다 반복해서 쓰지 않도록 여기서 한 번만 설정
  //   if (window.Chart) : Chart.js 가 불러와진 페이지에서만 실행
  if (window.Chart) {
    const D = Chart.defaults;                      // Chart.js 의 기본 설정 모음 (아래 window.Dash 의 D 와는 다른 것)
    // 글꼴, 글자 크기, 글자색
    D.font.family = C('--font-sans');
    D.font.size = 12;
    D.color = C('--mute');
    // 차트 크기를 감싸는 <div> 에 맞춤 (가로세로 비율 고정 안 함)
    D.maintainAspectRatio = false;
    D.responsive = true;
    D.animation.duration = 300;                    // 그려질 때 애니메이션 0.3초
    D.plugins.legend.display = false;              // Chart.js 기본 범례는 숨김 (범례는 HTML 로 직접 만듦)
    // 마우스를 올렸을 때 나오는 말풍선(툴팁) 모양
    Object.assign(D.plugins.tooltip, {
      backgroundColor: C('--ink'), titleColor: C('--stone'), bodyColor: '#fff',
      padding: 10, cornerRadius: 6, displayColors: false,
      titleFont: { weight: '500' }, bodyFont: { weight: '600' }
    });
    D.scale.grid.color = C('--viz-grid');          // 격자선 색
    D.scale.border.display = false;                // 축 테두리 선 숨김
    // 위에서 만든 플러그인 중 2개를 모든 차트에 등록
    //   → 옵션에 plugins: { refLine: {...} } 나 { split: {...} } 를 써야만 실제로 그려짐
    Chart.register(refLine, split);
  }

  // hbar(canvas, data, 옵션) : 가로 막대 차트를 그림 (전국 페이지의 기온 민감도, 예측 정확도)
  //   canvas : 차트를 그릴 <canvas> 요소
  //   data   : [{ id, label, value, color }, ...]   label = 막대 이름, value = 길이, color = 색
  //   옵션 (필요한 것만 넣으면 됨)
  //     max       : 가로축 최대값
  //     ref       : 기준선을 그릴 값,   refLabel : 기준선 위 글자
  //     onClick   : 막대를 클릭했을 때 실행할 함수 (클릭한 막대의 data 항목을 넘겨줌)
  //     showValue : true 면 막대 끝에 값 표시
  //     axisTitle : 가로축 아래 제목
  //     barThickness : 막대 두께(px), 기본 12
  //     onHoverItem  : 막대에 마우스를 올리거나 벗어날 때 실행할 함수 (올린 막대의 data 항목, 막대 밖이면 null)
  //   data 항목에 detail 글자를 넣으면 툴팁 둘째 줄에 보여줌
  //   예) D.hbar($('accChart'), 목록, { max: 20, ref: 8, refLabel: '기준 8%', showValue: true });
  function hbar(canvas, data, { max, ref, refLabel, onClick, showValue = false, axisTitle, barThickness = 12, onHoverItem } = {}) {
    return new Chart(canvas, {
      type: 'bar',
      // 막대 이름 / 값 / 색을 data 배열에서 각각 뽑아냄
      data: { labels: data.map(d => d.label), datasets: [{ data: data.map(d => d.value), backgroundColor: data.map(d => d.color), borderRadius: 3, barThickness }] },
      plugins: showValue ? [valueLabel] : [],      // showValue 일 때만 값 표시 플러그인을 넣음
      options: {
        indexAxis: 'y',                            // 'y' = 막대를 가로로 눕힘
        layout: { padding: { top: 18, right: showValue ? 40 : 0 } },   // 값 글자가 잘리지 않게 오른쪽 여백
        scales: {
          // 가로축: 눈금 뒤에 % 를 붙임. axisTitle 이 있을 때만 축 제목을 추가 ( ...(조건 && {추가할 것}) )
          x: { max, ticks: { callback: v => v + '%' }, ...(axisTitle && { title: { display: true, text: axisTitle, color: C('--mute'), font: { size: 12 } } }) },
          // 세로축: 지역 이름. 격자선은 숨김
          y: { grid: { display: false }, ticks: { color: C('--ink'), font: { weight: '500', size: 13 } } }
        },
        // 기준선 + 툴팁 내용('7.4%' 형태)
        plugins: { refLine: { value: ref, label: refLabel }, tooltip: { callbacks: { label: i => fmt(i.raw, 1) + '%', afterLabel: i => data[i.dataIndex].detail || '' } } },
        // 막대 클릭: els = 클릭된 막대 목록. 있으면 그 막대의 data 항목으로 onClick 실행
        onClick: (_e, els) => { if (els.length && onClick) onClick(data[els[0].index]); },
        // 마우스가 막대 위에 있으면 손가락 모양 커서
        onHover: (e, els) => {
          e.native.target.style.cursor = els.length && onClick ? 'pointer' : 'default';
          if (onHoverItem) onHoverItem(els.length ? data[els[0].index] : null);
        }
      }
    });
  }


  /* =====================================================================
   * 5. 서버 주소 / 지역 목록
   * ===================================================================== */

  // url(path) : 서버 주소 앞부분(컨텍스트 경로)을 붙여서 완성된 주소를 만듦
  //   예) url('api/regions')        → '/api/regions'
  //       url('region?region=3')    → '/region?region=3'
  //   ※ 앞에 '/' 를 붙이지 말고 'api/...' 로 쓸 것 ('/api/...' 로 쓰면 '//api/...' 가 됨)
  //   window.CTX 는 layout.html 에서 Thymeleaf 가 넣어줌. 없으면 '/' 사용
  const url = path => (window.CTX || '/') + path;

  // 서버에서 받아온 지역 목록을 담아두는 곳. loadRegions() 가 채움
  //   한 번 받아두면 지도, 지역 정보, 검색이 모두 이걸 같이 씀
  let regions = [];

  // loadRegions() : 서버(API ①)에서 지역 목록을 받아와 regions 에 저장
  //   ★ 모든 페이지가 맨 처음에  await D.loadRegions();  로 호출해야 함 (지도·검색이 이 목록을 씀)
  //   받아온 각 지역에 지도 칸 위치(col, row)를 붙여서 저장함
  //     받은 것    { id: 1, name: '서울', supply: 2399.5, ... }
  //     저장한 것  { id: 1, name: '서울', supply: 2399.5, ..., col: 1, row: 1 }
  //   서버가 꺼져 있으면 에러가 나므로, 부르는 쪽에서 try-catch 로 감싸야 함
  async function loadRegions() {
    const res = await axios.get(url('api/regions'));
    regions = res.data.map(r => {
      const pos = TILE_POS[r.name] || [null, null];   // 이름으로 칸 위치 찾기. 없는 이름이면 [null, null]
      return { ...r, col: pos[0], row: pos[1] };
    });
    return regions;
  }

  // loadYears() : 서버에서 연도 목록과 기준 연도를 받아옴 (지역 상세 페이지의 연도 버튼용)
  //   돌려주는 값: { years: [2021, 2022, ..., 2026], baseYear: 2025 }
  //     years    = 데이터가 있는 연도 전체
  //     baseYear = 12개월이 모두 있는 가장 최근 연도 (처음 선택할 연도)
  //   쓰는 법: const info = await D.loadYears();   →  info.years, info.baseYear
  //   연도를 JS 에 직접 적지 않으므로, DB 에 새 연도 데이터가 들어오면 버튼이 자동으로 늘어남
  async function loadYears() {
    const res = await axios.get(url('api/regions/years'));
    return res.data;
  }

  // getRegions() : 저장해 둔 지역 목록 전체를 돌려줌  예) 예측 페이지의 지역 드롭다운 만들 때
  const getRegions = () => regions;

  // findRegion(id) : 지역 번호로 지역 1개를 찾음  (없으면 undefined)
  //   예) findRegion(3) → { id: 3, name: '대구', ... }      findRegion('3') 도 같은 결과
  //   String(...) 으로 둘 다 글자로 바꿔 비교하는 이유:
  //     주소창(?region=3)이나 HTML(data-id="3")에서 온 값은 글자 '3' 이고, 서버가 준 id 는 숫자 3 이라서
  const findRegion = id => regions.find(r => String(r.id) === String(id));


  /* =====================================================================
   * 6. 선택한 지역 번호 (★ 주소의 regionId)
   * ===================================================================== */
  // ★ 지역 번호가 오가는 흐름
  //   1) 페이지 주소   /region?region=3
  //        → DashboardController 가 Model 에 regionId 로 담음
  //        → layout.html 이 window.INITIAL_REGION = '3' 으로 JS 에 넘겨줌
  //   2) JS 에서 읽기   const regionId = D.getRegion();
  //   3) API 주소에 넣기   axios.get(D.url(`api/regions/${regionId}/stats`))   → '/api/regions/3/stats'
  //        → Spring 에서는 @PathVariable 로 받음
  //   ※ 번호는 DB 의 REGION_ID 이고, API ① 이 돌려주는 id 와 같은 값

  // getRegion() : 지금 선택된 지역 번호를 돌려줌
  //   아래 순서로 찾아서 먼저 나오는 값을 씀 ( A || B || C : 앞의 것이 없으면 다음 것)
  //     ① 주소창의 ?region=3
  //     ② 서버가 넘겨준 값 (window.INITIAL_REGION)
  //     ③ 예전에 골라서 브라우저에 저장해 둔 값 (localStorage)
  //   찾은 번호가 지역 목록에 없으면(잘못된 번호) 목록의 첫 번째 지역을 씀
  //   ※ loadRegions() 가 끝난 뒤에 호출해야 함 (목록에 있는 번호인지 확인하기 때문)
  function getRegion() {
    const p = new URLSearchParams(location.search).get('region');   // 주소창의 ?region= 값
    const id = p || window.INITIAL_REGION || localStorage.getItem('gasdash.region');
    if (findRegion(id)) return findRegion(id).id;   // 목록에 있으면 그 지역의 id (서버가 준 원래 모양 그대로)
    return regions.length ? regions[0].id : null;   // 없으면 첫 번째 지역 (목록이 비었으면 null)
  }

  // setRegion(id) : 선택한 지역을 기억해 둠 (지역을 클릭할 때마다 호출)
  //   ① 브라우저 저장소(localStorage)에 저장 → 다른 페이지로 가도 같은 지역이 선택됨
  //   ② 지금 주소를 가져와서
  //   ③ 주소 뒤의 ?region= 값을 바꾸고
  //   ④ 새로고침 없이 주소창만 바꿈   예) /region?region=1 → /region?region=3
  function setRegion(id) {
    localStorage.setItem('gasdash.region', id);     // ①
    const u = new URL(location.href);               // ②
    u.searchParams.set('region', id);               // ③
    history.replaceState(null, '', u);              // ④
  }


  /* =====================================================================
   * 7. 서버 요청 실패 안내
   * ===================================================================== */

  // showError(err, what) : 서버 요청이 실패했을 때 페이지 제목 아래에 빨간 안내 박스를 보여줌
  //   err  : catch (err) 로 받은 에러
  //   what : 무엇을 받다가 실패했는지  예) '지역 목록', '서울 예측'
  //   쓰는 법
  //     try {
  //       const res = await axios.get(...);
  //     } catch (err) {
  //       D.showError(err, '지역 목록');
  //       return;
  //     }
  //   화면에 나오는 모습: "지역 목록 데이터를 불러오지 못했습니다 (404)  요청 주소: /api/regions — ..."
  function showError(err, what) {
    console.error(`[API 실패] ${what}`, err);       // 개발자 도구(F12) 콘솔에도 남김

    // 안내 박스(#apiError)가 아직 없으면 새로 만들어서 페이지 제목(.page-head) 아래에 붙임
    let box = document.getElementById('apiError');
    if (!box) {
      box = document.createElement('div');
      box.id = 'apiError';
      box.className = 'mt-12';
      document.querySelector('.page-head').appendChild(box);
    }

    // 에러에서 정보 꺼내기
    //   err.config.url       : 실패한 요청 주소
    //   err.response.status  : 서버 응답 코드 (400 = 보낸 값 문제, 404 = 주소 없음, 500 = 서버 코드 오류)
    //   err.response 가 없으면 서버가 꺼져 있는 것
    const reqUrl = err && err.config ? err.config.url : '';
    const status = err && err.response ? ` (${err.response.status})` : ' (서버 응답 없음)';
    box.innerHTML = callout('red', `${what} 데이터를 불러오지 못했습니다${status}`, `요청 주소: ${reqUrl} — Spring 서버와 API 주소를 확인하세요.`);
    icons();
  }

  // clearError() : 위 안내 박스를 지움 (다시 요청해서 성공했을 때 호출)
  function clearError() {
    const box = document.getElementById('apiError');
    if (box) box.remove();
  }


  /* =====================================================================
   * 8. 지역 타일맵 / 지역 정보
   * ===================================================================== */

  // renderTileMap(el, 옵션) : 지역 타일 지도를 그림 (지역마다 네모 한 칸, 값이 클수록 진한 색)
  //   el : 지도를 넣을 요소
  //   옵션
  //     valueOf     : 지역 1개를 받아 "색을 정할 값"을 돌려주는 함수   예) x => x.supply
  //     selected    : 지금 선택된 지역 번호 (검은 테두리로 강조)
  //     onSelect    : 타일을 클릭했을 때 실행할 함수 (클릭한 지역 번호를 넘겨줌)
  //     legendLabel : 아래 색 범례의 제목 (안 넣으면 '연간 공급량')
  //   예) D.renderTileMap($('map'), {
  //         valueOf: x => x.supply,
  //         selected: regionId,
  //         onSelect: id => { regionId = id; render(); }
  //       });
  function renderTileMap(el, { valueOf, selected, onSelect, legendLabel = '연간 공급량' }) {
    const R = regions;
    // 모든 지역의 값 → 그중 최솟값(mn), 최댓값(mx)  (색의 진하기를 정하는 기준)
    const vals = R.map(valueOf), mn = Math.min(...vals), mx = Math.max(...vals);

    let html = '<div class="tilemap">';
    // 격자를 왼쪽 위부터 한 칸씩 돌면서 (세로 7줄 × 가로 5칸)
    for (let row = 0; row < 7; row++) for (let col = 0; col < 5; col++) {
      const r = R.find(x => x.row === row && x.col === col);   // 이 칸에 놓일 지역 찾기
      // 지역이 없는 칸은 빈칸으로 두고 다음 칸으로
      if (!r) {
        html += '<span class="tile-empty"></span>';
        continue;
      }
      // v = 이 지역의 값,  t = 0~1 로 바꾼 값 ((값 - 최소) / (최대 - 최소))
      //   (mx - mn || 1) : 모든 값이 같아서 0 이 되면 1 로 나눔 (0 으로 나누기 방지)
      const v = valueOf(r), t = (v - mn) / (mx - mn || 1);
      // 타일 버튼 1개: 선택된 지역이면 is-selected 클래스, data-id 에 지역 번호, 배경·글자색은 t 로 결정
      html += `<button type="button" class="tile${String(r.id) === String(selected) ? ' is-selected' : ''}" data-id="${r.id}" style="background:${seq(t)};color:${seqInk(t)}" aria-pressed="${String(r.id) === String(selected)}"><b>${r.name}</b><span>${fmt(v)}</span></button>`;
    }
    html += '</div>';
    // 아래 색 범례: 제목, 최솟값, 색 5칸, 최댓값
    html += `<div class="scale"><span>${legendLabel}</span><span>${fmt(mn)}</span><span class="steps">${SEQ.map(s => `<i style="background:var(${s})"></i>`).join('')}</span><span>${fmt(mx)}</span></div>`;
    el.innerHTML = html;

    // HTML 을 넣은 뒤, 타일마다 클릭 이벤트 연결
    //   b.dataset.id : 버튼의 data-id 값 (항상 글자) → findRegion 으로 찾아 서버가 준 원래 id(숫자)를 넘김
    el.querySelectorAll('.tile').forEach(b => { b.onclick = () => onSelect(findRegion(b.dataset.id).id); });
  }

  // renderRegionInfo(el, r) : 선택한 지역의 이름과 배지 2개를 그림
  //   r : 지역 1개  예) D.findRegion(regionId)
  //   그려지는 것: [서울] [전국 비중 23.0%] [● MAPE 8.5%]
  //   MAPE 배지 색: 8% 초과 = 빨강, 6.5% 초과 = 노랑, 나머지 = 초록
  //     (MAPE = 예측이 실제 값에서 평균 몇 % 벗어났는지. 낮을수록 정확)
  function renderRegionInfo(el, r) {
    const total = regions.reduce((s, x) => s + x.supply, 0);   // 전체 지역 공급량 합계
    const tone = r.mape > 8 ? 'red' : r.mape > 6.5 ? 'yellow' : 'green';
    el.innerHTML = `<div class="eyebrow">선택 지역</div>
      <div class="region-name"><span>${r.name}</span>
        <span class="badge">전국 비중 ${fmt((r.supply / total) * 100, 1)}%</span>
        <span class="badge badge--${tone}"><i class="dot"></i>MAPE ${fmt(r.mape, 1)}%</span></div>`;
  }


  /* =====================================================================
   * 9. KPI 카드 / 탭 / 설명 박스
   * ===================================================================== */

  // kpi({...}) : KPI 카드 1개의 HTML 글자를 만들어 돌려줌 (화면에 넣는 것은 부르는 쪽에서)
  //   넣는 값 (필요한 것만)
  //     label      : 카드 제목                     예) '연간 공급량'
  //     value      : 큰 숫자 (이미 fmt 한 글자)     예) fmt(2399.5)
  //     unit       : 숫자 뒤 단위                   예) '백만㎥'
  //     delta      : 증감률 숫자 → 화살표와 함께 표시  예) 6.3 → '↗ 6.3%'
  //     deltaUnit  : 증감률 뒤 단위 (기본 '%', 비율끼리의 차이는 '%p')
  //     deltaLabel : 증감률 옆 설명                 예) '전년 대비'
  //     goodWhen   : 증감률 색 정하기  'up' = 오르면 초록 / 'down' = 내리면 초록 / 'neutral' = 색 없음(기본)
  //     caption    : 아래 작은 설명 (deltaLabel 이 없을 때 표시)
  //     accent     : 제목 앞 작은 색 네모의 색
  //   예) $('kpis').innerHTML = [
  //         D.kpi({ label: '연간 공급량', value: fmt(total), unit: '백만㎥', delta: 6.3, deltaLabel: '전년 대비' }),
  //         D.kpi({ label: '피크 월', value: '1월', caption: '469 백만㎥' })
  //       ].join('');
  function kpi({ label, value, unit, delta, deltaUnit = '%', deltaLabel, goodWhen = 'neutral', caption, accent }) {
    let meta = '';   // 카드 아래 줄(증감률 + 설명)에 들어갈 HTML

    // delta 가 숫자일 때만 증감률을 표시 (null 이나 undefined 면 건너뜀)
    if (typeof delta === 'number' && !isNaN(delta)) {
      const up = delta >= 0;   // 올랐는지
      // 색 정하기: neutral 이면 회색. 아니면 "오른 방향"과 "좋은 방향"이 같으면 good(초록), 다르면 bad(빨강)
      const cls = goodWhen === 'neutral' ? 'neutral' : (up === (goodWhen === 'up') ? 'good' : 'bad');
      // 화살표 아이콘 + 절댓값(소수 1자리) + 단위
      meta += `<span class="delta ${cls}"><i data-lucide="${up ? 'arrow-up-right' : 'arrow-down-right'}"></i>${Math.abs(delta).toFixed(1)}${deltaUnit}</span>`;
    }
    if (deltaLabel || caption) meta += `<span>${deltaLabel || caption}</span>`;

    // 카드 전체: 제목(색 네모는 accent 가 있을 때만) / 큰 숫자 + 단위 / 아래 줄(meta 가 있을 때만)
    return `<div class="kpi"><div class="kpi-label">${accent ? `<span class="kpi-accent" style="background:${accent}"></span>` : ''}${label}</div>
      <div class="kpi-value"><b>${value}</b>${unit ? `<span>${unit}</span>` : ''}</div>${meta ? `<div class="kpi-meta">${meta}</div>` : ''}</div>`;
  }

  // renderChoice(el, items, value, onChange, cls) : 여러 개 중 하나를 고르는 버튼 묶음을 그림
  //   아래 renderTabs, renderPills 가 내부에서 쓰는 공통 함수 (직접 부를 일은 없음)
  //     items    : [{ id, label, icon? }, ...]   id = 버튼을 구분하는 값, label = 버튼 글자
  //     value    : 지금 선택된 id (그 버튼에 is-active 클래스가 붙음)
  //     onChange : 버튼을 클릭했을 때 실행할 함수 (클릭한 버튼의 id 를 넘겨줌)
  //     cls      : 버튼 모양 클래스 ('tab' 또는 'pill')
  function renderChoice(el, items, value, onChange, cls) {
    // 항목마다 버튼 1개씩 만들어 이어 붙임
    el.innerHTML = items.map(it => `<button type="button" class="${cls}${String(it.id) === String(value) ? ' is-active' : ''}" data-id="${it.id}">${it.icon ? `<i data-lucide="${it.icon}"></i>` : ''}${it.label}</button>`).join('');
    // 버튼마다 클릭 이벤트 연결
    el.querySelectorAll('button').forEach(b => {
      b.onclick = () => {
        const raw = b.dataset.id;                   // data-id 값 (항상 글자)
        // 숫자처럼 생긴 글자('2025', '6')는 숫자로 바꿔서, 아니면('forecast') 글자 그대로 넘김
        onChange(isNaN(+raw) ? raw : +raw);
      };
    });
    icons();
  }

  // renderTabs : 네모난 탭 버튼    예) 예측 / 시뮬레이션,  3개월 / 6개월
  // renderPills : 둥근 버튼        예) 연도 선택 2021 ~ 2026
  //   예) D.renderTabs($('horizonTabs'), [{ id: 3, label: '3개월' }, { id: 6, label: '6개월' }], horizon,
  //         h => { horizon = h; render(); });
  const renderTabs = (el, items, value, onChange) => renderChoice(el, items, value, onChange, 'tab');
  const renderPills = (el, items, value, onChange) => renderChoice(el, items, value, onChange, 'pill');

  // callout(tone, title, body) : 아이콘이 붙은 설명 박스의 HTML 글자를 만들어 돌려줌
  //   tone  : 색 ('blue' = 안내, 'green' = 좋음, 'red' = 경고, 'purple' = 참고) → 아이콘도 자동으로 정해짐
  //   title : 굵은 제목,   body : 아래 설명 (없어도 됨)
  //   예) $('tempCallout').innerHTML = D.callout('blue', '제목', '설명 문장');
  const ICON = { blue: 'info', green: 'circle-check', red: 'triangle-alert', purple: 'bookmark' };
  const callout = (tone, title, body) => `<div class="callout callout--${tone}"><i data-lucide="${ICON[tone]}"></i><div><b>${title}</b>${body ? `<div>${body}</div>` : ''}</div></div>`;


  /* =====================================================================
   * 10. 트리맵 (면적으로 크기를 비교하는 그림 — 전국 페이지의 마켓맵)
   * ===================================================================== */

  // ▼ squarify 는 "큰 사각형을 값 비율대로 작은 사각형들로 나누는 수학 계산"이라 내용을 몰라도 됨
  //   알아야 할 것은 넣는 값과 나오는 값뿐
  //     넣는 값   items = [{ id, label, value }, ...] (값이 큰 순으로 정렬된 것),  x, y = 시작 위치,  w, h = 전체 가로·세로
  //     나오는 값 각 항목에 x, y(위치), w(너비), h(높이)가 붙은 배열
  //   고칠 일이 생기면 이 함수는 그대로 두고, 결과를 쓰는 아래 renderTreemap 을 고칠 것
  //   (원리: 사각형이 길쭉해지지 않고 정사각형에 가깝게 되도록 한 줄씩 채워 나감 — squarified 방식)
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
  // ▲ squarify 끝

  // renderTreemap(el, data, 옵션) : 트리맵을 그림 (값이 클수록 칸이 넓음)
  //   el   : 트리맵을 넣을 요소 (CSS 로 가로·세로 크기가 정해져 있어야 함)
  //   data : [{ id, label, value }, ...]  + 아래 항목은 필요할 때만
  //            color / ink : 칸 배경색 / 글자색 (없으면 값 크기에 따른 파랑 농도)
  //            note        : 값 옆에 붙일 글자 (없으면 전체 대비 %)
  //            tip         : 마우스를 올렸을 때 말풍선에 넣을 HTML (없으면 이름 + 값)
  //   옵션
  //     unit     : 값 뒤에 붙일 단위  예) '㎥'
  //     onSelect : 칸을 클릭했을 때 실행할 함수 (클릭한 칸의 id 를 글자로 넘겨줌)
  //   칸 크기에 따라 글자가 달라짐
  //     큰 칸 = 이름 + '값 · note'   /   좁은 칸 = 이름 + note   /   아주 작은 칸 = 글자 없음(말풍선으로만 확인)
  function renderTreemap(el, data, { unit = '', onSelect } = {}) {
    const w = el.clientWidth, h = el.clientHeight;                  // 트리맵 영역의 가로·세로(픽셀)
    const sorted = [...data].sort((a, b) => b.value - a.value);     // 값이 큰 순으로 정렬 (복사본을 정렬 → 원본 순서는 그대로)
    const mx = sorted[0].value, mn = sorted[sorted.length - 1].value;   // 최댓값, 최솟값
    const total = data.reduce((s, d) => s + d.value, 0);            // 합계 (비율 계산용)
    const rects = squarify(sorted, 0, 0, w, h);                     // 각 칸의 위치와 크기 계산

    // 칸마다 <div> 1개씩 만들어 이어 붙임
    el.innerHTML = rects.map((r, i) => {
      const t = (r.value - mn) / (mx - mn || 1);                    // 0~1 로 바꾼 값 (색의 진하기)
      const big = r.w > 140 && r.h > 70;                            // 큰 칸이면 이름을 크게
      const note = r.note !== undefined ? r.note : `${fmt((r.value / total) * 100, 1)}%`;
      // left/top/width/height 로 칸의 위치와 크기를 지정. 칸이 충분히 클 때만 이름·값 글자를 넣음
      return `<div class="tm-cell" data-id="${r.id}" data-i="${i}" aria-label="${r.label} ${fmt(r.value)}${unit}"${onSelect ? ' tabindex="0" role="button"' : ''} style="left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px">
        <div class="tm-inner" style="background:${r.color || seq(t)};color:${r.ink || seqInk(t)};${r.w > 60 && r.h > 36 ? '' : 'padding:2px'}">
          ${r.w > 44 && r.h > 22 ? `<b style="font-size:${big ? 15 : 12}px">${r.label}</b>` : ''}
          ${r.w > 72 && r.h > 44 ? `<span>${r.w > 96 ? `${fmt(r.value)}${unit} · ${note}` : note}</span>` : ''}
        </div></div>`;
    }).join('');

    // 말풍선(툴팁): 글자가 안 들어가는 작은 칸도 같은 정보를 볼 수 있게 함
    const tip = document.createElement('div');
    tip.className = 'tm-tip';
    el.appendChild(tip);
    el.querySelectorAll('.tm-cell').forEach(c => {
      const r = rects[c.dataset.i];                                 // 이 칸의 데이터 (data-i 에 적어둔 순번으로 찾음)
      // 마우스가 칸에 들어오면: 내용을 넣고 말풍선 보이기
      c.onmouseenter = () => {
        tip.innerHTML = r.tip || `<b>${r.label}</b>${fmt(r.value)}${unit}`;
        tip.style.display = 'block';
      };
      // 마우스가 움직이면: 말풍선이 마우스를 따라다님 (마우스 오른쪽 아래 14픽셀 위치)
      c.onmousemove = e => {
        const b = el.getBoundingClientRect();                       // 트리맵 영역의 화면상 위치
        let x = e.clientX - b.left + 14, y = e.clientY - b.top + 14;
        if (x + tip.offsetWidth > b.width) x = e.clientX - b.left - tip.offsetWidth - 14;   // 오른쪽 끝이면 왼쪽에 표시
        if (y + tip.offsetHeight > b.height) y = e.clientY - b.top - tip.offsetHeight - 14; // 아래쪽 끝이면 위쪽에 표시
        tip.style.left = Math.max(0, x) + 'px';
        tip.style.top = Math.max(0, y) + 'px';
      };
      // 마우스가 칸에서 나가면: 말풍선 숨기기
      c.onmouseleave = () => { tip.style.display = 'none'; };
    });

    // onSelect 를 넘겨받았으면 칸마다 클릭 이벤트 연결
    if (onSelect) {
      el.querySelectorAll('.tm-cell').forEach(c => {
        c.onclick = () => onSelect(c.dataset.id);
        // 키보드: Tab 으로 칸 사이를 옮기고 Enter 나 Space 로 선택
        c.onkeydown = e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect(c.dataset.id);
          }
        };
      });
    }
  }


  /* =====================================================================
   * 11. 상관계수 표 (히트맵 — 전국 페이지)
   * ===================================================================== */

  // corrStrength(v) : 상관계수 숫자를 말로 풀어줌
  //   예) corrStrength(0.98) → '매우 강한 양의 상관'     corrStrength(-0.5) → '보통 음의 상관'     corrStrength(0.1) → '거의 상관 없음'
  //   기준(절댓값): 0.8 이상 매우 강한 / 0.6 이상 강한 / 0.4 이상 보통 / 0.2 이상 약한 / 그 아래는 거의 없음
  //   양(+) = 같이 늘고 같이 줄어듦,  음(-) = 한쪽이 늘면 다른 쪽은 줄어듦
  const corrStrength = v => {
    const a = Math.abs(v);
    const level = a >= 0.8 ? '매우 강한' : a >= 0.6 ? '강한' : a >= 0.4 ? '보통' : a >= 0.2 ? '약한' : null;
    return level ? `${level} ${v > 0 ? '양' : '음'}의 상관` : '거의 상관 없음';
  };

  // renderHeatmap(el, labels, M, 옵션) : 상관계수를 색칠된 표로 그림
  //   labels : 변수 이름 배열              예) ['공급량', '평균기온', '난방도일', '인구', '세대수']
  //   M      : 상관계수 2차원 배열          M[r][c] = labels[r] 과 labels[c] 의 상관계수
  //   옵션 lower : true 면 아래쪽 삼각형만 그림
  //     (대각선은 자기 자신이라 항상 1.00 이고, 위쪽 삼각형은 아래쪽과 같은 값이라 생략)
  //   칸 색은 divColor, 글자색은 아주 진한 칸(절댓값 0.83 이상)만 흰색
  //   칸에 마우스를 올리면 그 행·열 이름이 굵어지고, 표 아래 한 줄에 '매우 강한 양의 상관' 같은 설명이 나옴
  function renderHeatmap(el, labels, M, { lower = false } = {}) {
    const all = labels.map((_, i) => i);             // [0, 1, 2, ...]  변수 번호 목록 (_ 는 안 쓰는 값이라는 표시)
    // lower 면 행에서는 첫 변수를, 열에서는 마지막 변수를 뺌 (그 줄은 전부 빈칸이 되기 때문)
    const rowIdx = lower ? all.slice(1) : all;       // slice(1)     : 첫 번째를 뺀 나머지
    const colIdx = lower ? all.slice(0, -1) : all;   // slice(0, -1) : 마지막을 뺀 나머지
    const HINT = '칸에 마우스를 올리면 상관의 강도를 설명합니다';

    // 표 만들기 (CSS grid: 첫 칸은 행 이름 72px, 나머지는 열 개수만큼 같은 너비)
    let h = `<div class="hm" style="grid-template-columns:72px repeat(${colIdx.length},minmax(34px,1fr))">`;
    // 맨 윗줄: 빈칸 + 열 이름들
    h += '<div></div>' + colIdx.map(c => `<div class="hm-col" data-c="${c}">${labels[c]}</div>`).join('');
    // 행마다: 행 이름 + 칸들
    rowIdx.forEach(r => {
      h += `<div class="hm-row" data-r="${r}">${labels[r]}</div>`;
      colIdx.forEach(c => {
        // lower 일 때 위쪽 삼각형과 대각선(c >= r)은 빈칸으로 두고 다음 칸으로
        if (lower && c >= r) {
          h += '<div></div>';
          return;
        }
        const v = M[r][c];
        // 칸 1개: 배경색은 값에 따라, 글자는 소수 2자리
        h += `<div class="hm-cell" data-r="${r}" data-c="${c}" aria-label="${labels[r]} 와 ${labels[c]}: ${v.toFixed(2)}" style="background:${divColor(v)};color:${Math.abs(v) >= 0.83 ? '#fff' : 'var(--ink)'}">${v.toFixed(2)}</div>`;
      });
    });
    h += '</div>';
    // 표 아래 색 범례: −1 [색 7칸] +1
    h += `<div class="hm-scale"><span>−1</span>${DIV.map(d => `<i style="background:var(${d})"></i>`).join('')}<span>+1</span><span class="hm-scale-note">진할수록 강한 상관 · 빨강 = 같이 증가, 파랑 = 반대로 움직임</span></div>`;
    // 설명이 나올 한 줄 (처음에는 안내 문구)
    h += `<div class="hm-readout">${HINT}</div>`;
    el.innerHTML = h;

    const readout = el.querySelector('.hm-readout');
    // mark(r, c, on) : r행·c열의 이름을 굵게(on = true) 또는 원래대로(on = false)
    const mark = (r, c, on) => {
      const rowLabel = el.querySelector(`.hm-row[data-r="${r}"]`), colLabel = el.querySelector(`.hm-col[data-c="${c}"]`);
      if (rowLabel) rowLabel.classList.toggle('is-active', on);
      if (colLabel) colLabel.classList.toggle('is-active', on);
    };
    // 칸마다 마우스 이벤트 연결
    el.querySelectorAll('.hm-cell').forEach(cell => {
      const r = +cell.dataset.r, c = +cell.dataset.c, v = M[r][c];   // 이 칸의 행 번호, 열 번호, 값
      // 마우스가 들어오면: 이름 굵게 + 아래 줄에 설명
      cell.onmouseenter = () => {
        mark(r, c, true);
        readout.innerHTML = `<b>${labels[r]} ↔ ${labels[c]}</b> r = ${v.toFixed(2)} · ${corrStrength(v)}`;
      };
      // 마우스가 나가면: 원래대로
      cell.onmouseleave = () => {
        mark(r, c, false);
        readout.textContent = HINT;
      };
    });
  }


  /* =====================================================================
   * 12. 상단 검색창 (모든 페이지 공통)
   * ===================================================================== */

  // 페이지가 다 열리면(DOMContentLoaded) 실행
  //   ① 아이콘 그리기
  //   ② 상단 검색창(#regionSearch)에서 Enter 를 누르면 그 지역의 상세 페이지로 이동
  //      예) '대구' 입력 후 Enter → /region?region=3
  //   (지역 목록은 각 페이지가 loadRegions() 로 받아둔 regions 를 사용)
  document.addEventListener('DOMContentLoaded', () => {
    icons();
    const s = document.getElementById('regionSearch');
    if (s) s.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;                // Enter 가 아니면 아무것도 안 함
      const q = s.value.trim();                     // 입력한 글자 (앞뒤 공백 제거)
      if (!q) return;                               // 비어 있으면 끝
      // 이름에 검색어가 들어 있거나('서' → '서울'), 검색어에 이름이 들어 있는('서울시' → '서울') 첫 지역
      const r = regions.find(x => x.name.includes(q) || q.includes(x.name));
      // ★ 찾았으면 그 지역 번호를 주소의 ?region= 에 넣어서 이동
      if (r) location.href = url(`region?region=${r.id}`);
      // 못 찾았으면 입력을 지우고 안내 문구 표시
      else {
        s.value = '';
        s.placeholder = '일치하는 지역 없음';
      }
    });
  });


  /* =====================================================================
   * 13. 밖으로 내보내기
   * ===================================================================== */

  // 여기에 적은 것만 다른 파일에서  D.이름  으로 쓸 수 있음
  //   ※ 이 파일에 함수를 새로 만들었으면 여기에도 이름을 추가해야 다른 파일에서 보임
  //   { C, fmt } 는 { C: C, fmt: fmt } 를 줄여 쓴 것
  window.Dash = {
    C, fmt, seq, seqInk, divColor, debounce, icons, hbar,
    MONTHS, season, SEASON_KO, monthTemp,
    url, loadRegions, loadYears, getRegions, findRegion, getRegion, setRegion, showError, clearError,
    renderTileMap, renderRegionInfo, kpi, renderTabs, renderPills, callout, renderTreemap, renderHeatmap
  };
})();
