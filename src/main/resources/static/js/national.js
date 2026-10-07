/* =====================================================================
 * national.js — 전국 통계 페이지
 * 화면: KPI 4개 → 지역별 공급 현황(트리맵) + 공급 비중 도넛 → 기온 민감도 / 예측 정확도 막대 → 상관계수 히트맵
 * 지역 선택 상태가 없어서 render() 없이 위에서 아래로 한 번만 그림
 * (트리맵만 탭 변경·창 크기 변경 때 다시 그림)
 *
 * 사용하는 API
 *   GET /api/national/regions → 시·도별 공급량·인구·민감도·MAPE (전국 페이지 전용, NationalRegionDTO)
 *   ③ GET /api/national       → 전년 대비 증감률, MAPE 변화, 상관계수 표 (응답 모양은 common.js 맨 위 참고)
 * ===================================================================== */
(function () {
  // D = 공통 함수(common.js)
  const D = window.Dash, { C, fmt } = D;
  const $ = id => document.getElementById(id);
  // 지역 클릭 시 해당 지역 상세 페이지로 이동
  // ★ 클릭한 지역의 id 를 페이지 주소의 ?region= 에 넣음 → /region?region=se
  //   지역 상세 페이지는 공용 지역 목록(D.getRegions)의 id 로 지역을 찾으므로,
  //   전국 API 의 코드(se)가 아니라 공용 목록의 id(코드든 숫자든)를 이름으로 찾아서 사용
  let nationalRegions = [];
  const go = id => {
    const name = (nationalRegions.find(r => r.id === id) || {}).name;
    const shared = D.getRegions().find(r => r.name === name);
    location.href = D.url(`region?region=${shared ? shared.id : id}`);
  };

  // 페이지 시작: 데이터 2개를 받아온 뒤 화면 그리기
  //   async/await : 서버 응답을 기다렸다가 다음 줄을 실행 (.then(res => ...) 과 같은 뜻)
  async function init() {
    let regions, national;
    await D.loadRegions().catch(() => {});                   // 공용 지역 목록: 상단 검색창과 지역 이동에 사용 (이 페이지의 차트는 아래 전국 전용 API 사용)
    try {
      regions = (await axios.get(D.url('api/national/regions'))).data;   // 시·도별 지표
      nationalRegions = regions;
    } catch (err) {
      D.showError(err, '지역 목록');
      return;
    }
    try {
      const res = await axios.get(D.url('api/national'));    // API ③ 전국 요약
      national = res.data;
    } catch (err) {
      D.showError(err, '전국 요약');
      return;
    }
    draw(regions, national);
  }

  // 받아온 데이터로 화면 전체 그리기
  //   regions  : [{ id, name, supply, pop, sensitivity, mape, ... }]
  //   national : { supplyYoy, mapeDelta, corrLabels, corr }
  function draw(regions, national) {
    // 공급량 큰 순 정렬 ([...배열] 로 복사 후 정렬 → 원본 순서는 그대로)
    const R = [...regions].sort((a, b) => b.supply - a.supply);
    const total = R.reduce((s, r) => s + r.supply, 0);
    // 기온 민감도 큰 순 + 공급량 가중 평균 (MAPE 와 같은 기준)
    const sens = [...regions].sort((a, b) => b.sensitivity - a.sensitivity);
    const avgSens = sens.reduce((s, r) => s + r.sensitivity * r.supply, 0) / total;
    // 예측 오차(MAPE) 큰 순 / MAPE 8% 넘는 '경고' 지역
    const acc = [...regions].sort((a, b) => b.mape - a.mape);
    const bad = acc.filter(r => r.mape > 8);
    // 전국 MAPE: 공급량이 큰 지역에 더 큰 비중을 두는 가중 평균
    const avgMape = acc.reduce((s, r) => s + r.mape * r.supply, 0) / total;

    // KPI
    // 전년 대비(supplyYoy), 전분기 대비(mapeDelta) 는 서버가 계산해서 보내줌 (예전에는 1.9, -0.8 고정)
    $('kpis').innerHTML = [
      D.kpi({ label: '전국 연간 공급량 (2025)', value: fmt(total), unit: '백만㎥', delta: national.supplyYoy, deltaLabel: '전년 대비' }),
      D.kpi({ label: '전국 가중 기온 민감도', value: fmt(avgSens, 1), unit: '%/°C', caption: '겨울철 1°C 하락 시 증가율', accent: 'var(--season-winter)' }),
      D.kpi({ label: '전국 가중 MAPE', value: fmt(avgMape, 1), unit: '%', delta: national.mapeDelta, deltaLabel: '전분기 대비', goodWhen: 'down' }),
      D.kpi({ label: '정확도 경고 지역', value: bad.length, unit: '곳', caption: 'MAPE 8% 초과', accent: 'var(--red-500)' })
    ].join('');

    // 지역별 공급 현황 (트리맵)
    // 칸 크기는 항상 2025 공급량, 색만 탭으로 바꿈
    //   metric: 'yoy'(전년 대비 증감률) / 'percap'(1인당 공급량)
    let metric = 'yoy';
    // 움직임 줄이기 설정을 켠 사용자는 탭 이동·색 변화·도넛 확대 애니메이션 없이 바로 바뀌게
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const signed = v => (v > 0 ? '+' : v < 0 ? '−' : '') + fmt(Math.abs(v), 1);   // +6.3 / −2.1
    const percapOf = r => (r.supply * 1e6) / (r.pop * 1e4);                        // 백만㎥ / 만 명 → ㎥/인
    const maxAbsYoy = Math.max(...regions.map(r => Math.abs(r.supplyYoy)), 0.1);
    const pcAll = regions.map(percapOf).sort((a, b) => a - b);
    const pcMin = pcAll[0], pcMax = pcAll[pcAll.length - 1];
    const DIV_VARS = ['--div-neg-3', '--div-neg-2', '--div-neg-1', '--div-0', '--div-pos-1', '--div-pos-2', '--div-pos-3'];
    // 1인당 색: 중간 파랑(--seq-4)은 검정·흰 글씨 모두 대비가 모자라서 뺀 4단계
    const SEQ_VARS = ['--seq-1', '--seq-2', '--seq-3', '--seq-5'];
    // 제주·세종이 유난히 낮아서 최소~최대를 균등 분할하면 나머지가 두 색으로만 갈림 → 지역 수 기준 4분위로 나눔
    const pcCuts = [1, 2, 3].map(k => pcAll[Math.floor((pcAll.length * k) / SEQ_VARS.length)]);
    const swatches = vars => vars.map(v => `<i style="background:var(${v})"></i>`).join('');

    // 탭 버튼은 한 번만 만들고 클릭하면 선택 표시만 바꿈 → 흰 배경(슬라이더)이 버튼 사이를 미끄러지듯 이동
    const tabsEl = $('metricTabs');
    D.renderTabs(tabsEl, [{ id: 'yoy', label: '전년 대비' }, { id: 'percap', label: '1인당' }], metric, m => {
      if (m === metric) return;
      metric = m;
      syncTabs();
      renderTree(true);
    });
    const slider = document.createElement('span');
    slider.className = 'tab-slider';
    tabsEl.appendChild(slider);
    function syncTabs() {
      tabsEl.querySelectorAll('.tab').forEach(b => b.classList.toggle('is-active', b.dataset.id === metric));
      const on = tabsEl.querySelector('.tab.is-active');
      slider.style.cssText = `width:${on.offsetWidth}px;height:${on.offsetHeight}px;transform:translate(${on.offsetLeft}px,${on.offsetTop}px)`;
    }
    syncTabs();
    requestAnimationFrame(() => tabsEl.classList.add('is-sliding'));   // 처음 위치를 잡을 때는 움직임 없이

    const lastPaint = {};   // 지난번에 칠한 칸 색 (탭을 바꿀 때 이전 색에서 새 색으로 이어지게)
    function renderTree(animate) {
      $('treemapSub').textContent = '크기 = 2025 공급량(백만㎥) · 색 = ' + (metric === 'yoy' ? '전년 대비 증감률' : '1인당 공급량') + ' · 클릭하면 지역 상세로 이동';

      const data = regions.map(r => {
        const pc = percapOf(r);
        const head = `<b>${r.name}</b>공급량 ${fmt(r.supply, 1)} 백만㎥ (${fmt((r.supply / total) * 100, 1)}%)<br>`;
        if (metric === 'yoy') {
          const t = r.supplyYoy / maxAbsYoy;   // -1 ~ 1 (0 = 변화 없음)
          return { id: r.id, label: r.name, value: r.supply, color: D.divColor(t), ink: Math.abs(t) >= 0.83 ? '#fff' : 'var(--ink)',
            note: `${signed(r.supplyYoy)}%`, tip: `${head}전년 대비 ${signed(r.supplyYoy)}%<br>1인당 ${fmt(pc)}㎥/인·년` };
        }
        const step = pcCuts.filter(c => pc >= c).length;
        // 흰 글씨는 가장 진한 단계에서만
        return { id: r.id, label: r.name, value: r.supply, color: `var(${SEQ_VARS[step]})`, ink: step === SEQ_VARS.length - 1 ? '#fff' : 'var(--ink)',
          note: `${fmt(pc)}㎥`, tip: `${head}1인당 ${fmt(pc)}㎥/인·년<br>전년 대비 ${signed(r.supplyYoy)}%` };
      });
      D.renderTreemap($('treemap'), data, { unit: '', onSelect: go });
      data.forEach(d => {
        const prev = lastPaint[d.id];
        lastPaint[d.id] = d;
        const el = animate && !reduceMotion && prev && $('treemap').querySelector(`.tm-cell[data-id="${d.id}"] .tm-inner`);
        if (!el) return;
        el.style.transition = 'none';
        el.style.background = prev.color;
        el.style.color = prev.ink;
        void el.offsetWidth;   // 이전 색으로 한 번 그려진 뒤 새 색으로 바뀌게 강제
        el.style.transition = 'background-color 320ms var(--ease-out), color 320ms var(--ease-out)';
        el.style.background = d.color;
        el.style.color = d.ink;
      });

      // 색 범례 (어떤 색이 큰 값인지 알려줌)
      $('treemapLegend').innerHTML = metric === 'yoy'
        ? `<span>−${fmt(maxAbsYoy, 1)}%</span>${swatches(DIV_VARS)}<span>+${fmt(maxAbsYoy, 1)}%</span><span class="tm-legend-note">기온 영향 포함 · 빨강 증가 / 파랑 감소</span>`
        : `<span>${fmt(pcMin)}㎥</span>${swatches(SEQ_VARS)}<span>${fmt(pcMax)}㎥</span><span class="tm-legend-note">1인당 연간 공급량 · 지역 수 기준 4단계</span>`;
    }
    renderTree();
    // 창 크기가 바뀌면 트리맵 칸 크기를 다시 계산 (크기 조절이 0.15초 멈췄을 때 한 번만)
    window.addEventListener('resize', D.debounce(() => { renderTree(); syncTabs(); }, 150));

    // 공급 비중 도넛
    // 17개 시·도를 5개 권역으로 합침 (권역은 상세 페이지가 없어서 클릭 이동은 없음)
    const GROUPS = [
      { label: '수도권', ids: ['se', 'gg', 'ic'] },
      { label: '영남', ids: ['bs', 'dg', 'us', 'gb', 'gn'] },
      { label: '충청', ids: ['dj', 'sj', 'cb', 'cn'] },
      { label: '호남', ids: ['gj', 'jb', 'jn'] },
      { label: '강원·제주', ids: ['gw', 'jj'] }   // 제주(0.2%)는 단독 조각이 너무 작아 강원과 묶음
    ];
    // 포함 지역 이름은 공급량이 큰 순서로 (서울·경기·인천)
    const sliceOf = (label, members) => ({ label, members: [...members].sort((a, b) => b.supply - a.supply).map(m => m.name).join('·'), value: members.reduce((s, m) => s + m.supply, 0) });
    const grouped = new Set(GROUPS.flatMap(g => g.ids));
    const slices = GROUPS.map(g => sliceOf(g.label, regions.filter(r => g.ids.includes(r.id))));
    const others = regions.filter(r => !grouped.has(r.id));          // 목록에 없는 지역이 생기면 '기타'로 보여줌
    if (others.length) slices.push(sliceOf('기타', others));
    slices.sort((a, b) => b.value - a.value);                         // 큰 권역부터 → 색도 큰 순서대로
    slices.forEach((s, i) => { s.color = C(`--cat-${i + 1}`); });
    const pctOf = d => fmt((d.value / total) * 100, 1);
    // 호버하지 않은 조각을 흐리게: '#rrggbb' → 투명도 0.3 인 rgba
    const fade = hex => {
      const m = /^#([0-9a-f]{6})$/i.exec(hex);
      if (!m) return hex;
      const n = parseInt(m[1], 16);
      return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},0.3)`;
    };
    // 범례: 한 줄(.dl-row)이 하나의 요소여야 줄 단위로 호버/강조할 수 있음
    const legend = $('donutLegend');
    legend.innerHTML = slices.map((d, i) =>
      `<div class="dl-row" data-i="${i}"><i class="sw" style="background:${d.color}"></i><span class="dl-name">${d.label}<small>${d.members}</small></span><b>${pctOf(d)}%</b></div>`).join('');
    const rows = [...legend.querySelectorAll('.dl-row')];

    // 가운데 글자: 평소에는 전국 합계 (백만㎥ → 억㎥ 로 /100), 호버 중에는 해당 조각의 비중과 공급량
    const center = $('donutCenter');
    const centerDefault = `<span>전국</span><b>${fmt(total / 100, 1)}</b><span>억㎥</span>`;
    center.innerHTML = centerDefault;

    const donut = new Chart($('donut'), {
      type: 'doughnut',
      data: { labels: slices.map(d => d.label), datasets: [{ data: slices.map(d => d.value), backgroundColor: slices.map(d => d.color), borderColor: '#fff', borderWidth: 2, hoverOffset: 8 }] },
      options: {
        cutout: '68%',
        animation: reduceMotion ? false : undefined,
        plugins: { tooltip: { enabled: false } },   // 정보는 가운데 글자로 보여주므로 툴팁은 생략
        // mousemove 만 처리: 마우스 이탈은 아래 mouseleave 에서 직접 처리하므로, 차트가 따로 지우며 생기는 어긋남을 막음
        events: ['mousemove'],
        onHover: (e, els) => setActive(els.length ? els[0].index : -1)
      }
    });

    // 조각, 범례, 가운데 글자를 한 번에 맞춤 (i = -1 이면 호버 해제)
    let active = -1;
    function setActive(i) {
      if (i === active) return;
      active = i;
      donut.data.datasets[0].backgroundColor = slices.map((d, k) => (i < 0 || k === i) ? d.color : fade(d.color));
      donut.setActiveElements(i < 0 ? [] : [{ datasetIndex: 0, index: i }]);
      donut.update();
      center.innerHTML = i < 0 ? centerDefault
        : `<span>${slices[i].label}</span><b>${pctOf(slices[i])}%</b><span>${fmt(slices[i].value)} 백만㎥</span>`;
      legend.classList.toggle('has-active', i >= 0);
      rows.forEach((row, k) => row.classList.toggle('is-active', k === i));
    }
    // Chart.js 의 onHover 는 차트 영역 안에서만 호출되므로, 마우스가 캔버스를 벗어나는 경우는 따로 처리
    $('donut').addEventListener('mouseleave', () => setActive(-1));
    // 범례 줄 위에 마우스를 올려도 같은 조각이 강조됨
    rows.forEach((row, i) => {
      row.onmouseenter = () => setActive(i);
      row.onmouseleave = () => setActive(-1);
    });

    // 기온 민감도
    // 평균보다 높으면 겨울색(파랑)으로 강조, 막대 클릭 시 지역 상세로 이동
    D.hbar($('sensChart'), sens.map(r => ({ id: r.id, label: r.name, value: r.sensitivity, color: r.sensitivity > avgSens ? C('--season-winter') : C('--seq-2') })),
      { ref: avgSens, refLabel: `가중 평균 ${fmt(avgSens, 1)}%`, onClick: d => go(d.id), showValue: true, axisTitle: '공급량 증가율 (%/°C)' });

    // 정확도 낮은 지역
    // 기준선 8%: 넘으면 빨강
    D.hbar($('accChart'), acc.map(r => ({ id: r.id, label: r.name, value: r.mape, color: r.mape > 8 ? C('--red-500') : C('--stone') })),
      { max: 14, ref: 8, refLabel: '기준 8%', onClick: d => go(d.id), showValue: true, axisTitle: 'MAPE (%)' });
    $('badBadge').innerHTML = `<i class="dot"></i>${bad.length}곳 경고`;
    // 경고 지역 이름은 데이터에서 뽑음 (예전에는 '세종·제주·울산' 이 문장에 고정으로 적혀 있었음)
    // MAPE 는 아직 서버의 임시값이라 원인을 단정하는 문구는 넣지 않음
    $('accCallout').innerHTML = bad.length
      ? D.callout('red', '경고 지역', `${bad.map(r => r.name).join('·')} — 임시 MAPE 기준입니다. 실제 예측 오차를 연동하면 달라질 수 있습니다.`)
      : D.callout('green', '경고 지역 없음', '모든 지역의 MAPE 가 8% 이하입니다.');

    // 상관계수 (서버가 보내준 변수 이름 + 2차원 배열)
    // lower: 대각선(자기 자신)과 대칭으로 겹치는 칸을 빼고 아래쪽 삼각형만 표시
    D.renderHeatmap($('heatmap'), national.corrLabels, national.corr, { lower: true });
    $('corrSub').textContent = `전국 월별 데이터${national.corrPeriod ? ', ' + national.corrPeriod : ''} · 계절 변동 포함 · 피어슨 r`;

    // 히트맵 옆 설명 박스: r 값과 문장을 서버가 보낸 상관계수에서 만듦
    const idx = name => national.corrLabels.indexOf(name);
    const r = (a, b) => (idx(a) < 0 || idx(b) < 0) ? null : national.corr[idx(a)][idx(b)];
    const notes = [];
    const rHdd = r('공급량', '난방도일'), rTemp = r('공급량', '평균기온');
    if (rHdd !== null) {
      notes.push(D.callout('blue', `공급량 ↔ 난방도일 r = ${rHdd.toFixed(2)}`,
        rTemp !== null && Math.abs(rHdd) > Math.abs(rTemp)
          ? `기온(r = ${rTemp.toFixed(2)})보다 난방도일(18°C 기준)이 공급량을 더 잘 설명합니다.`
          : '난방도일(18°C 기준)과 기온 모두 공급량과 비슷한 수준으로 연동됩니다.'));
    }
    const rPop = r('인구', '세대수');
    if (rPop !== null) {
      notes.push(D.callout('purple', `인구 ↔ 세대수 r = ${rPop.toFixed(2)}`,
        Math.abs(rPop) >= 0.9
          ? `${rPop < 0 ? '방향은 반대지만 ' : ''}상관이 매우 강해 두 변수는 거의 같은 정보를 담습니다. 분석에 함께 쓰면 정보가 중복됩니다.`
          : '두 변수의 상관이 강하지 않아 각각 별개의 정보로 볼 수 있습니다.'));
    }
    // 월별 공급량은 계절 변동이 커서, 상관이 낮다고 '영향 없음'으로 읽으면 오해이므로 안내
    const rSupPop = r('공급량', '인구');
    if (rSupPop !== null && Math.abs(rSupPop) < 0.3) {
      notes.push(D.callout('blue', `공급량 ↔ 인구 r = ${rSupPop.toFixed(2)}`,
        '월별 공급량은 계절 변동이 커서, 인구의 영향이 이 수치에는 잘 드러나지 않을 수 있습니다.'));
    }
    $('corrNotes').innerHTML = notes.join('');

    // 새로 그린 HTML 안의 아이콘 표시
    D.icons();
  }

  init();
})();
