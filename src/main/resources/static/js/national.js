/* =====================================================================
 * national.js — 전국 통계 페이지 (/national)
 *
 * 화면 구성 (위 → 아래)
 *   KPI 4개 → 지역별 공급 현황(트리맵) + 권역별 공급 비중(도넛) → 연도별 추이
 *   → 기온 민감도 + 예측 오차(막대) → 상관계수(히트맵) → 데이터 안내
 * 코드 구성: ① 상수  ② 계산·표시 도구  ③ 섹션별 그리기(화면 순서와 같음)  ④ 시작
 *
 * 사용하는 API (응답 모양은 common.js 맨 위 API 목록 참고)
 *   GET /api/national/regions   시·도별 지표 (NationalRegionDTO 목록)
 *   GET /api/national           전국 요약: 기준 연도, 증감률, 연도별 추이, 상관계수 (NationalDTO)
 * ===================================================================== */
(() => {
  const D = window.Dash, { C, fmt } = D;
  const $ = id => document.getElementById(id);

  /* ---------- ① 상수 ---------- */

  const MAPE_LIMIT = 8;   // MAPE 경고 기준(%), 근거 없는 임시 기준
  const TEMP_BADGE = '<span class="badge badge--temp">임시</span>';   // MAPE 가 임시값이라 관련 표시에 붙임 (예측 모델 연동 후 제거)
  const METRIC_TABS = [{ id: 'yoy', label: '전년 대비 증감률' }, { id: 'percap', label: '1인당 공급량' }];

  // 트리맵 색: 진할수록 큰 값, 흰 글씨는 가장 진한 단계에만 씀
  //  - 전년 대비: 모든 지역이 늘어서 0 기준 빨강-파랑으로 나누면 거의 한 색이 됨 → 빨강 한 계열을 실제 범위에 맞춰 4단계로
  //  - 1인당: 중간 파랑(--seq-4)은 검정·흰 글씨 모두 대비가 모자라 뺀 4단계
  const YOY_COLORS = ['var(--div-pos-1)', 'color-mix(in srgb, var(--div-pos-1), var(--div-pos-2))', 'var(--div-pos-2)', 'var(--div-pos-3)'];
  const SEQ_COLORS = ['--seq-1', '--seq-2', '--seq-3', '--seq-5'].map(v => `var(${v})`);

  // 도넛 권역 (제주는 0.2% 라 단독 조각이 너무 작아 강원과 묶음)
  const GROUPS = [
    { label: '수도권', ids: ['se', 'gg', 'ic'] },
    { label: '영남', ids: ['bs', 'dg', 'us', 'gb', 'gn'] },
    { label: '충청', ids: ['dj', 'sj', 'cb', 'cn'] },
    { label: '호남', ids: ['gj', 'jb', 'jn'] },
    { label: '강원·제주', ids: ['gw', 'jj'] }
  ];

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;   // 켜져 있으면 애니메이션 없이 바로 바뀜

  /* ---------- ② 계산·표시 도구 ---------- */

  const signed = v => (v > 0 ? '+' : v < 0 ? '−' : '') + fmt(Math.abs(v), 1);   // +6.3 / −2.1
  const corrText = v => (v < 0 ? '−' : '') + Math.abs(v).toFixed(2);             // 상관계수 (범례와 같은 마이너스 기호)
  const percapOf = r => (r.supply * 1e6) / (r.pop * 1e4);                         // 백만㎥ / 만 명 → ㎥/인
  const sortedDesc = (rows, key) => [...rows].sort((a, b) => b[key] - a[key]);   // 원본은 그대로 두고 큰 순 정렬
  const weightedAvg = (rows, key, total) => rows.reduce((sum, r) => sum + r[key] * r.supply, 0) / total;   // 공급량 가중 평균
  const swatches = colors => colors.map(c => `<i style="background:${c}"></i>`).join('');
  const inkOf = (step, steps) => (step === steps - 1 ? '#fff' : 'var(--ink)');   // 글자색: 가장 진한 단계만 흰색

  // '2021-01 ~ 2026-06' → '2021년 1월 ~ 2026년 6월'
  const toKoreanPeriod = period => (period || '').split(' ~ ')
    .map(ym => ym.replace(/^(\d{4})-(\d{2})$/, (_, y, m) => `${y}년 ${+m}월`)).join(' ~ ');

  // '#rrggbb' → 투명도 0.3 인 rgba (호버하지 않은 도넛 조각을 흐리게)
  const fade = hex => {
    const m = /^#([0-9a-f]{6})$/i.exec(hex);
    if (!m) return hex;
    const n = parseInt(m[1], 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},0.3)`;
  };

  // 지역 클릭 → 지역 상세 페이지 (/region?region=id)
  // 상세 페이지는 공용 지역 목록(D.getRegions)의 id 로 지역을 찾으므로,
  // 전국 API 의 코드(se)가 아니라 공용 목록의 id(코드든 숫자든)를 이름으로 찾아서 씀
  let nationalRegions = [];
  const go = id => {
    const name = (nationalRegions.find(r => r.id === id) || {}).name;
    const shared = D.getRegions().find(r => r.name === name);
    location.href = D.url(`region?region=${shared ? shared.id : id}`);
  };

  // 여러 섹션이 같이 쓰는 값을 한 번만 계산
  const summarize = (regions, national) => {
    const year = national.year;   // 기준 연도 (서버가 정함: 12개월이 모두 있는 가장 최근 연도)
    const total = sortedDesc(regions, 'supply').reduce((sum, r) => sum + r.supply, 0);
    const sens = sortedDesc(regions, 'sensitivity');
    const acc = sortedDesc(regions, 'mape');
    return {
      regions, national, year, total, sens, acc,
      prevYear: String(Number(year) - 1),
      bad: acc.filter(r => r.mape > MAPE_LIMIT),   // 경고 지역
      avgSens: weightedAvg(sens, 'sensitivity', total),
      avgMape: weightedAvg(acc, 'mape', total),
      period: toKoreanPeriod(national.corrPeriod)
    };
  };

  /* ---------- ③ 섹션별 그리기 (화면 순서와 같음) ---------- */

  // KPI 4개: 전년 대비, 전분기 대비는 서버가 계산해서 보내줌
  const drawKpis = ({ national, year, prevYear, total, avgSens, avgMape, bad }) => {
    $('kpis').innerHTML = [
      D.kpi({ label: `전국 연간 공급량 (${year})`, value: fmt(total), unit: '백만㎥', delta: national.supplyYoy, deltaLabel: `${prevYear}년 대비` }),
      D.kpi({ label: '전국 기온 민감도 (공급량 가중)', value: fmt(avgSens, 1), unit: '%/°C', caption: '겨울철 1°C 하락 시 증가율', accent: 'var(--season-winter)' }),
      // MAPE 는 비율이라 전분기와의 차이는 %p
      D.kpi({ label: `예측 오차율 (MAPE) ${TEMP_BADGE}`, value: fmt(avgMape, 1), unit: '%', delta: national.mapeDelta, deltaUnit: '%p', deltaLabel: '전분기 대비', goodWhen: 'down' }),
      D.kpi({ label: `오차 경고 지역 ${TEMP_BADGE}`, value: bad.length, unit: '곳', caption: `MAPE ${MAPE_LIMIT}% 초과 (임시 기준)`, accent: 'var(--red-500)' })
    ].join('');
  };

  // 지역별 공급 현황 (트리맵): 면적은 항상 기준 연도 공급량, 색만 토글(전년 대비 증감률 / 1인당 공급량)로 바뀜
  const drawTreemap = ({ regions, national, year, total }) => {
    const yoys = regions.map(r => r.supplyYoy);
    const yoyMin = Math.min(...yoys), yoyMax = Math.max(...yoys);
    const pcAll = regions.map(percapOf).sort((a, b) => a - b);
    const pcMin = pcAll[0], pcMax = pcAll[pcAll.length - 1];
    // 제주·세종이 유난히 낮아서 최소~최대를 균등 분할하면 나머지가 두 색으로만 갈림 → 지역 수 기준 4분위로 나눔
    const pcCuts = [1, 2, 3].map(k => pcAll[Math.floor((pcAll.length * k) / SEQ_COLORS.length)]);

    let metric = 'yoy';
    const lastPaint = {};   // 지난번에 칠한 칸 (토글할 때 이전 색에서 새 색으로 이어지게)

    // 칸 하나의 색·글자색·문구 (면적 값은 공통)
    const tileOf = r => {
      const pc = percapOf(r);
      const head = `<b>${r.name}</b>공급량 ${fmt(r.supply, 1)} 백만㎥ (${fmt((r.supply / total) * 100, 1)}%)<br>`;
      const yoyText = `${signed(r.supplyYoy)}%`, pcText = `${fmt(pc)}㎥/인·년`;
      const base = { id: r.id, label: r.name, value: r.supply };
      if (metric === 'yoy') {
        const step = Math.min(YOY_COLORS.length - 1, Math.floor(((r.supplyYoy - yoyMin) / (yoyMax - yoyMin || 1)) * YOY_COLORS.length));
        return { ...base, color: YOY_COLORS[step], ink: inkOf(step, YOY_COLORS.length), note: yoyText, tip: `${head}전년 대비 ${yoyText}<br>1인당 ${pcText}` };
      }
      const step = pcCuts.filter(c => pc >= c).length;
      return { ...base, color: SEQ_COLORS[step], ink: inkOf(step, SEQ_COLORS.length), note: `${fmt(pc)}㎥`, tip: `${head}1인당 ${pcText}<br>전년 대비 ${yoyText}` };
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
      ? `<span>${signed(yoyMin)}%</span>${swatches(YOY_COLORS)}<span>${signed(yoyMax)}%</span><span class="tm-legend-note">전국 평균 ${signed(national.supplyYoy)}% · 진할수록 많이 증가 · 기온 영향 포함</span>`
      : `<span>${fmt(pcMin)}㎥</span>${swatches(SEQ_COLORS)}<span>${fmt(pcMax)}㎥</span><span class="tm-legend-note">1인당 연간 공급량 · 지역을 4등분해 색칠, 진할수록 많음</span>`;

    const render = animate => {
      const data = regions.map(tileOf);
      D.renderTreemap($('treemap'), data, { unit: '', onSelect: go });
      if (animate && !reduceMotion) fadeFromPrevious(data);
      else data.forEach(d => { lastPaint[d.id] = d; });
      $('treemapLegend').innerHTML = legendOf();
    };

    // 토글: 버튼은 한 번만 만들고 선택 표시만 바꿈 → 선택 배경(슬라이더)이 버튼 사이를 미끄러지듯 이동
    const tabsEl = $('metricTabs');
    const slider = document.createElement('span');
    const syncTabs = () => {
      tabsEl.querySelectorAll('.tab').forEach(b => b.classList.toggle('is-active', b.dataset.id === metric));
      const on = tabsEl.querySelector('.tab.is-active');
      slider.style.cssText = `width:${on.offsetWidth}px;height:${on.offsetHeight}px;transform:translate(${on.offsetLeft}px,${on.offsetTop}px)`;
    };
    D.renderTabs(tabsEl, METRIC_TABS, metric, m => {
      if (m === metric) return;
      metric = m;
      syncTabs();
      render(true);
    });
    slider.className = 'tab-slider';
    tabsEl.appendChild(slider);
    syncTabs();
    if (document.fonts) document.fonts.ready.then(syncTabs);          // 웹폰트가 늦게 적용되면 탭 폭이 바뀌므로 다시 맞춤
    requestAnimationFrame(() => tabsEl.classList.add('is-sliding'));   // 처음 위치를 잡을 때는 움직임 없이

    $('treemapSub').textContent = `면적 = ${year} 공급량(백만㎥) · 클릭하면 상세 보기`;   // 색 기준은 토글과 범례가 알려줌 (토글 옆에 한 줄로 들어가게 짧게)
    render();
    // 창 크기가 바뀌면 칸 크기를 다시 계산 (크기 조절이 0.15초 멈췄을 때 한 번만)
    window.addEventListener('resize', D.debounce(() => { render(); syncTabs(); }, 150));
  };

  // 17개 시·도를 권역 조각으로 합침 (큰 권역부터 → 색도 그 순서대로)
  const buildSlices = regions => {
    const sliceOf = (label, members) => ({
      label,
      members: sortedDesc(members, 'supply').map(m => m.name).join('·'),   // 포함 지역은 공급량 큰 순
      value: members.reduce((sum, m) => sum + m.supply, 0)
    });
    const slices = GROUPS.map(g => sliceOf(g.label, regions.filter(r => g.ids.includes(r.id))));
    const grouped = new Set(GROUPS.flatMap(g => g.ids));
    const others = regions.filter(r => !grouped.has(r.id));   // 목록에 없는 지역이 생기면 '기타'로 보여줌
    if (others.length) slices.push(sliceOf('기타', others));
    slices.sort((a, b) => b.value - a.value);
    slices.forEach((s, i) => { s.color = C(`--cat-${i + 1}`); });
    return slices;
  };

  // 권역별 공급 비중 (도넛): 조각, 범례, 가운데 글자가 호버에 함께 반응. 권역은 상세 페이지가 없어 클릭 이동은 없음
  const drawDonut = ({ regions, year, total }) => {
    const slices = buildSlices(regions);
    const pctOf = d => fmt((d.value / total) * 100, 1);

    // 범례: 한 줄(.dl-row)이 하나의 요소여야 줄 단위로 호버·강조할 수 있음
    const legend = $('donutLegend');
    legend.innerHTML = slices.map((d, i) =>
      `<div class="dl-row" data-i="${i}"><i class="sw" style="background:${d.color}"></i><span class="dl-name">${d.label}<small>${d.members}</small></span><b>${pctOf(d)}%</b></div>`).join('');
    const rows = [...legend.querySelectorAll('.dl-row')];

    // 가운데 글자: 평소에는 전국 합계(백만㎥ → 억㎥), 호버하면 해당 조각의 비중과 공급량
    $('donutSub').textContent = `${year}년 · 17개 시·도를 5개 권역으로 합산`;
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

  // 연도별 추이 오른쪽 설명 박스: 숫자와 문장을 데이터에서 만듦
  const trendNotesOf = annual => {
    const pick = (better, key) => annual.reduce((a, b) => (better(b[key], a[key]) ? b : a));
    const hi = pick((x, y) => x > y, 'supply');
    const lo = pick((x, y) => x < y, 'supply');
    const warm = pick((x, y) => x > y, 'avgTemp');
    const notes = [];
    if (warm.year === lo.year) {
      notes.push(D.callout('blue', `${warm.year}년: 가장 따뜻하고 공급량은 가장 적음`,
        `평균기온 ${fmt(warm.avgTemp, 1)}°C로 가장 높았고 공급량은 ${fmt(lo.supply)}백만㎥로 가장 적었습니다. 기온이 높은 해에 난방 수요가 줄어드는 것과 같은 방향입니다.`));
    }
    notes.push(D.callout('purple', '공급량 범위', `가장 많은 해 ${hi.year}년 ${fmt(hi.supply)}백만㎥, 가장 적은 해 ${lo.year}년 ${fmt(lo.supply)}백만㎥`));
    notes.push(D.callout('blue', '참고', `${annual.length}개 연도만 비교한 것이라 경향을 보는 참고용입니다.`));
    return notes.join('');
  };

  // 연도별 추이: 막대 = 연간 공급량(기준 연도는 진하게), 선 = 평균기온. 서버가 12개월이 모두 있는 연도만 보내줌
  const drawTrend = ({ national, year }) => {
    const annual = national.annual || [];
    if (!annual.length) {
      $('trendCard').style.display = 'none';
      return;
    }
    $('trendSub').textContent = `${annual[0].year}~${annual[annual.length - 1].year}년 · 막대 = 연간 공급량(백만㎥) · 선 = 평균기온(°C)`;

    const supplies = annual.map(a => a.supply), temps = annual.map(a => a.avgTemp);
    // 막대는 위쪽 65% 아래, 기온 선은 그 위쪽에 놓이도록 두 축의 범위를 잡음 (서로 겹쳐 글자가 가려지지 않게)
    const supplyMax = Math.ceil(Math.max(...supplies) / 0.65 / 2000) * 2000;
    const tempMin = Math.floor(Math.min(...temps)) - 9, tempMax = Math.ceil(Math.max(...temps)) + 1;
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
    const axisTitle = text => ({ display: true, text, color: C('--mute'), font: { size: 12 } });
    const tooltipLabel = i => {
      const a = annual[i.dataIndex];
      if (i.dataset.type === 'line') return `평균기온 ${fmt(a.avgTemp, 1)}°C`;
      return `공급량 ${fmt(a.supply, 1)} 백만㎥` + (a.supplyYoy !== null && a.supplyYoy !== undefined ? ` (전년 대비 ${signed(a.supplyYoy)}%)` : '');
    };

    new Chart($('trendChart'), {
      data: {
        labels: annual.map(a => `${a.year}년`),
        datasets: [
          { type: 'bar', label: '연간 공급량', data: supplies, yAxisID: 'y', borderRadius: 3, maxBarThickness: 56,
            backgroundColor: annual.map(a => a.year === year ? C('--seq-5') : C('--seq-3')) },
          { type: 'line', label: '평균기온', data: temps, yAxisID: 'y1', borderColor: C('--yellow-600'), backgroundColor: C('--yellow-600'), borderWidth: 2, pointRadius: 4, tension: 0 }
        ]
      },
      plugins: [barValues],
      options: {
        layout: { padding: { top: 8 } },
        scales: {
          x: { grid: { display: false } },
          y: { min: 0, max: supplyMax, ticks: { callback: v => fmt(v) }, title: axisTitle('공급량 (백만㎥)') },
          y1: { position: 'right', min: tempMin, max: tempMax, grid: { drawOnChartArea: false }, ticks: { callback: v => v + '°' }, title: axisTitle('평균기온 (°C)') }
        },
        plugins: { tooltip: { callbacks: { label: tooltipLabel } } }
      }
    });
    $('trendNotes').innerHTML = trendNotesOf(annual);
  };

  // 기온 민감도 + 예측 오차 (가로 막대): 막대를 클릭하면 지역 상세로 이동
  const drawBars = ({ sens, acc, bad, avgSens }) => {
    // 민감도: 전국 평균보다 높으면 겨울색(파랑)으로 강조
    D.hbar($('sensChart'),
      sens.map(r => ({ id: r.id, label: r.name, value: r.sensitivity, color: r.sensitivity > avgSens ? C('--season-winter') : C('--seq-2') })),
      { ref: avgSens, refLabel: `전국 평균 ${fmt(avgSens, 1)}%`, onClick: d => go(d.id), showValue: true, axisTitle: '공급량 증가율 (%/°C)' });

    // 예측 오차: 기준선을 넘으면 빨강
    D.hbar($('accChart'),
      acc.map(r => ({ id: r.id, label: r.name, value: r.mape, color: r.mape > MAPE_LIMIT ? C('--red-500') : C('--stone') })),
      { max: 14, ref: MAPE_LIMIT, refLabel: `임시 기준 ${MAPE_LIMIT}%`, onClick: d => go(d.id), showValue: true, axisTitle: 'MAPE (%)' });
    $('badBadge').innerHTML = `<i class="dot"></i>${bad.length}곳 경고`;
    // MAPE 가 아직 임시값이라 원인을 단정하는 문구는 넣지 않음. 지역 이름은 데이터에서 뽑음
    $('accCallout').innerHTML = bad.length
      ? D.callout('red', '경고 지역', `${bad.map(r => r.name).join('·')} — 임시 MAPE 기준입니다. 실제 예측 오차를 연동하면 달라질 수 있습니다.`)
      : D.callout('green', '경고 지역 없음', `모든 지역의 MAPE 가 ${MAPE_LIMIT}% 이하입니다.`);
  };

  // 히트맵 옆 설명 박스: r 값과 문장을 서버가 보낸 상관계수에서 만듦
  const corrNotesOf = ({ corrLabels, corr }) => {
    const r = (a, b) => {
      const i = corrLabels.indexOf(a), j = corrLabels.indexOf(b);
      return i < 0 || j < 0 ? null : corr[i][j];
    };
    const notes = [];
    const rHdd = r('공급량', '난방도일'), rTemp = r('공급량', '평균기온');
    if (rHdd !== null) {
      notes.push(D.callout('blue', `공급량 ↔ 난방도일 r = ${corrText(rHdd)}`,
        rTemp !== null && Math.abs(rHdd) > Math.abs(rTemp)
          ? `기온(r = ${corrText(rTemp)})보다 난방도일(18°C 기준)이 공급량을 더 잘 설명합니다.`
          : '난방도일(18°C 기준)과 기온 모두 공급량과 비슷한 수준으로 연동됩니다.'));
    }
    const rPop = r('인구', '세대수');
    if (rPop !== null) {
      notes.push(D.callout('purple', `인구 ↔ 세대수 r = ${corrText(rPop)}`,
        Math.abs(rPop) >= 0.9
          ? `${rPop < 0 ? '서로 반대로 움직이지만 ' : ''}상관이 매우 강해 거의 같은 정보를 담고 있어, 함께 쓰면 정보가 중복됩니다.`
          : '두 변수의 상관이 강하지 않아 각각 별개의 정보로 볼 수 있습니다.'));
    }
    // 월별 공급량은 계절 변동이 커서, 상관이 낮다고 '영향 없음'으로 읽으면 오해이므로 안내
    const rSupPop = r('공급량', '인구');
    if (rSupPop !== null && Math.abs(rSupPop) < 0.3) {
      notes.push(D.callout('blue', `공급량 ↔ 인구 r = ${corrText(rSupPop)}`,
        '월별 공급량은 계절 변동이 커서, 인구의 영향이 이 수치에는 잘 드러나지 않을 수 있습니다.'));
    }
    return notes.join('');
  };

  // 상관계수 (히트맵): lower = 대각선(자기 자신)과 대칭으로 겹치는 칸을 빼고 아래쪽 삼각형만 표시
  const drawCorrelation = ({ national, period }) => {
    D.renderHeatmap($('heatmap'), national.corrLabels, national.corr, { lower: true });
    $('corrSub').textContent = `전국 월별 데이터${period ? '(' + period + ')' : ''} · 계절 변동 포함`;
    $('corrNotes').innerHTML = corrNotesOf(national);
  };

  // 페이지 맨 아래 데이터 안내: 기간, 기준 연도, 임시값
  const drawDataNote = ({ year, period }) => {
    $('dataNote').textContent = `데이터 기간 ${period || '-'} · 연간 지표는 12개월이 모두 있는 ${year}년 기준, 연도별 추이는 12개월이 모두 있는 연도만 표시 · 예측 오차(MAPE)는 임시값입니다.`;
  };

  // 받아온 데이터로 화면 전체를 한 번 그림
  const draw = (regions, national) => {
    const s = summarize(regions, national);
    drawKpis(s);
    drawTreemap(s);
    drawDonut(s);
    drawTrend(s);
    drawBars(s);
    drawCorrelation(s);
    drawDataNote(s);
    D.icons();   // 새로 그린 HTML 안의 아이콘 표시
  };

  /* ---------- ④ 시작: 데이터를 받아온 뒤 그리기 ---------- */

  const init = async () => {
    await D.loadRegions().catch(() => {});   // 공용 지역 목록: 상단 검색창과 지역 이동에 쓰임 (실패해도 이 페이지는 그대로 그림)
    let regions, national;
    try {
      regions = (await axios.get(D.url('api/national/regions'))).data;
      nationalRegions = regions;
    } catch (err) {
      D.showError(err, '지역 목록');
      return;
    }
    try {
      national = (await axios.get(D.url('api/national'))).data;
    } catch (err) {
      D.showError(err, '전국 요약');
      return;
    }
    draw(regions, national);
  };

  init();
})();
