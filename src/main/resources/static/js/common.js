/* =====================================================================
 * common.js — 모든 페이지가 같이 쓰는 함수 모음 → window.Dash (D) 로 사용
 * ---------------------------------------------------------------------
 *  C(name)              : CSS 변수 색 읽기           예) C('--ink')
 *  fmt(n, 소수자리)      : 숫자 포맷(천 단위 콤마)    예) fmt(1234.5, 1) → '1,234.5'
 *  getRegion/setRegion  : 선택 지역 읽기/저장 (URL + localStorage)
 *  renderTileMap        : 지역 타일 지도
 *  kpi / callout        : KPI 카드, 설명 박스 HTML 만들기
 *  renderTabs/Pills     : 탭 / 둥근 버튼
 *  hbar                 : 가로 막대 차트
 *  renderTreemap / renderHeatmap : 트리맵 / 상관계수 표
 * ===================================================================== */
/* 공통 유틸 — 포맷터, Chart.js 기본값/플러그인, 지역 타일맵, 트리맵, 히트맵, KPI, 탭 */
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
      if (o.label) { ctx.setLineDash([]); ctx.fillStyle = C('--ink'); ctx.font = `600 11px ${C('--font-sans')}`; ctx.textAlign = 'center'; ctx.fillText(o.label, px, top - 6); }
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
  function hbar(canvas, data, { max, ref, refLabel, onClick } = {}) {
    return new Chart(canvas, {
      type: 'bar',
      data: { labels: data.map(d => d.label), datasets: [{ data: data.map(d => d.value), backgroundColor: data.map(d => d.color), borderRadius: 3, barThickness: 12 }] },
      options: {
        indexAxis: 'y',
        layout: { padding: { top: 18 } },
        scales: {
          x: { max, ticks: { callback: v => v + '%' } },
          y: { grid: { display: false }, ticks: { color: C('--ink'), font: { weight: '500', size: 13 } } }
        },
        plugins: { refLine: { value: ref, label: refLabel }, tooltip: { callbacks: { label: i => fmt(i.raw, 1) + '%' } } },
        onClick: (_e, els) => { if (els.length && onClick) onClick(data[els[0].index]); },
        onHover: (e, els) => { e.native.target.style.cursor = els.length && onClick ? 'pointer' : 'default'; }
      }
    });
  }

  /* ---------- 지역 상태 (URL ?region= → localStorage → 서울) ---------- */
  // 선택 지역 우선순위: URL ?region= → 서버가 넘긴 값 → 브라우저 저장값 → 기본 'se'(서울)
  function getRegion() {
    const p = new URLSearchParams(location.search).get('region');
    const id = p || window.INITIAL_REGION || localStorage.getItem('gasdash.region') || 'se';
    return window.GasData.regions.some(r => r.id === id) ? id : 'se';
  }
  // 선택 지역을 브라우저에 저장 + 주소창 URL 도 ?region=id 로 바꿈 (새로고침 없이)
  function setRegion(id) {
    localStorage.setItem('gasdash.region', id);
    const u = new URL(location.href); u.searchParams.set('region', id); history.replaceState(null, '', u);
  }
  // 컨텍스트 경로를 붙인 URL 만들기   예) url('region?region=se')
  const url = path => (window.CTX || '/') + path;

  /* ---------- 지역 타일맵 ---------- */
  // 5×7 격자를 돌면서 지역이 있는 칸은 버튼, 없는 칸은 빈칸으로
  //   valueOf: 색을 정할 값, selected: 선택 지역 id, onSelect: 클릭 시 실행할 함수
  function renderTileMap(el, { valueOf, selected, onSelect, legendLabel = '연간 공급량' }) {
    const R = window.GasData.regions;
    const vals = R.map(valueOf), mn = Math.min(...vals), mx = Math.max(...vals);
    let html = '<div class="tilemap">';
    for (let row = 0; row < 7; row++) for (let col = 0; col < 5; col++) {
      const r = R.find(x => x.row === row && x.col === col);
      if (!r) { html += '<span class="tile-empty"></span>'; continue; }
      const v = valueOf(r), t = (v - mn) / (mx - mn || 1);
      html += `<button type="button" class="tile${r.id === selected ? ' is-selected' : ''}" data-id="${r.id}" style="background:${seq(t)};color:${seqInk(t)}" aria-pressed="${r.id === selected}"><b>${r.name}</b><span>${fmt(v)}</span></button>`;
    }
    html += '</div>';
    html += `<div class="scale"><span>${legendLabel}</span><span>${fmt(mn)}</span><span class="steps">${SEQ.map(s => `<i style="background:var(${s})"></i>`).join('')}</span><span>${fmt(mx)}</span></div>`;
    el.innerHTML = html;
    // HTML 을 넣은 뒤 각 타일에 클릭 이벤트 연결
    el.querySelectorAll('.tile').forEach(b => { b.onclick = () => onSelect(b.dataset.id); });
  }

  // 지역 이름 + 전국 비중 배지 + MAPE 배지 (8% 초과 빨강, 6.5% 초과 노랑, 나머지 초록)
  function renderRegionInfo(el, r) {
    const total = window.GasData.regions.reduce((s, x) => s + x.supply, 0);
    const tone = r.mape > 8 ? 'red' : r.mape > 6.5 ? 'yellow' : 'green';
    el.innerHTML = `<div class="eyebrow">선택 지역</div>
      <div class="region-name"><span>${r.name}</span>
        <span class="badge">전국 비중 ${fmt((r.supply / total) * 100, 1)}%</span>
        <span class="badge badge--${tone}"><i class="dot"></i>MAPE ${fmt(r.mape, 1)}%</span></div>`;
  }

  /* ---------- KPI / 탭 / 콜아웃 ---------- */
  // KPI 카드 HTML 문자열을 만들어 반환
  //   delta   : 증감률(%)  → 화살표와 함께 표시
  //   goodWhen: 'up'(오르면 좋음) / 'down'(내리면 좋음) / 'neutral'(색 없음)
  //   caption, deltaLabel: 아래 작은 설명,  accent: 라벨 앞 작은 색 네모
  function kpi({ label, value, unit, delta, deltaLabel, goodWhen = 'neutral', caption, accent }) {
    let meta = '';
    if (typeof delta === 'number' && !isNaN(delta)) {
      const up = delta >= 0;
      const cls = goodWhen === 'neutral' ? 'neutral' : (up === (goodWhen === 'up') ? 'good' : 'bad');
      meta += `<span class="delta ${cls}"><i data-lucide="${up ? 'arrow-up-right' : 'arrow-down-right'}"></i>${Math.abs(delta).toFixed(1)}%</span>`;
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
  // 트리맵 그리기: 칸이 작으면 글자를 줄이거나 생략
  function renderTreemap(el, data, { unit = '', onSelect } = {}) {
    const w = el.clientWidth, h = el.clientHeight;
    const sorted = [...data].sort((a, b) => b.value - a.value);
    const mx = sorted[0].value, mn = sorted[sorted.length - 1].value;
    const total = data.reduce((s, d) => s + d.value, 0);
    el.innerHTML = squarify(sorted, 0, 0, w, h).map(r => {
      const t = (r.value - mn) / (mx - mn || 1);
      const big = r.w > 140 && r.h > 70;
      return `<div class="tm-cell" data-id="${r.id}" title="${r.label} ${fmt(r.value)}${unit}" style="left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px">
        <div class="tm-inner" style="background:${seq(t)};color:${seqInk(t)};${r.w > 60 && r.h > 36 ? '' : 'padding:2px'}">
          ${r.w > 44 && r.h > 22 ? `<b style="font-size:${big ? 15 : 12}px">${r.label}</b>` : ''}
          ${r.w > 60 && r.h > 44 ? `<span>${fmt(r.value)}${unit} · ${fmt((r.value / total) * 100, 1)}%</span>` : ''}
        </div></div>`;
    }).join('');
    if (onSelect) el.querySelectorAll('.tm-cell').forEach(c => { c.onclick = () => onSelect(c.dataset.id); });
  }

  /* ---------- 상관계수 히트맵 ---------- */
  // labels: 변수 이름 배열, M: 상관계수 2차원 배열 → 색칠된 표 HTML
  function renderHeatmap(el, labels, M) {
    const n = labels.length;
    let h = `<div class="hm" style="grid-template-columns:72px repeat(${n},minmax(34px,1fr))">`;
    M.forEach((row, r) => {
      h += `<div class="hm-row">${labels[r]}</div>`;
      row.forEach((v, c) => { h += `<div class="hm-cell" title="${labels[r]} × ${labels[c]}: ${v.toFixed(2)}" style="background:${divColor(v)};color:${Math.abs(v) >= 0.55 ? '#fff' : 'var(--ink)'}">${v.toFixed(2)}</div>`; });
    });
    h += '<div></div>' + labels.map(l => `<div class="hm-col">${l}</div>`).join('') + '</div>';
    h += `<div class="hm-scale"><span>−1</span>${DIV.map(d => `<i style="background:var(${d})"></i>`).join('')}<span>+1</span></div>`;
    el.innerHTML = h;
  }

  /* ---------- 상단 지역 검색 ---------- */
  // 페이지 로딩이 끝나면: 아이콘 그리기 + 상단 검색창에서 Enter 시 해당 지역 상세 페이지로 이동
  document.addEventListener('DOMContentLoaded', () => {
    icons();
    const s = document.getElementById('regionSearch');
    if (s) s.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      const q = s.value.trim(); if (!q) return;
      const r = window.GasData.regions.find(x => x.name.includes(q) || q.includes(x.name));
      if (r) location.href = url(`region?region=${r.id}`);
      else { s.value = ''; s.placeholder = '일치하는 지역 없음'; }
    });
  });

  // 다른 파일에서 D.함수이름() 으로 쓸 수 있게 등록
  window.Dash = { C, fmt, seq, seqInk, divColor, debounce, icons, hbar, getRegion, setRegion, url, renderTileMap, renderRegionInfo, kpi, renderTabs, renderPills, callout, renderTreemap, renderHeatmap };
})();
