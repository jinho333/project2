/* =====================================================================
 * national.js — 전국 통계 페이지 (/national)
 *
 * 화면 구성 (위 → 아래)
 *   KPI 4개 → 지역별 공급 현황(트리맵) + 광역경제권별 공급 비중(도넛) → 연도별 추이
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

  const MAPE_LIMIT = 8;   // MAPE 경고 기준(%)
  const METRIC_TABS = [{ id: 'yoy', label: '전년 대비 증감률' }, { id: 'percap', label: '1인당 공급량' }];

  // 트리맵 색: 진할수록 큰 값, 흰 글씨는 가장 진한 단계에만 씀
  //  - 전년 대비: 모든 지역이 늘어서 0 기준 빨강-파랑으로 나누면 거의 한 색이 됨 → 빨강 한 계열을 실제 범위에 맞춰 4단계로
  //  - 1인당: 중간 파랑(--seq-4)은 검정·흰 글씨 모두 대비가 모자라 뺀 4단계
  const YOY_COLORS = ['var(--div-pos-1)', 'color-mix(in srgb, var(--div-pos-1), var(--div-pos-2))', 'var(--div-pos-2)', 'var(--div-pos-3)'];
  const SEQ_COLORS = ['--seq-1', '--seq-2', '--seq-3', '--seq-5'].map(v => `var(${v})`);

  // 도넛 권역: 정부 5+2 광역경제권 (5대 = 수도권·충청권·호남권·대경권·동남권, 2대 특별경제권 = 강원권·제주권)
  const GROUPS = [
    { label: '수도권', ids: ['se', 'gg', 'ic'] },
    { label: '동남권', ids: ['bs', 'us', 'gn'] },
    { label: '충청권', ids: ['dj', 'sj', 'cb', 'cn'] },
    { label: '대경권', ids: ['dg', 'gb'] },
    { label: '호남권', ids: ['gj', 'jb', 'jn'] },
    { label: '강원권', ids: ['gw'] },
    { label: '제주권', ids: ['jj'] }
  ];

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;   // 켜져 있으면 애니메이션 없이 바로 바뀜

  /* ---------- ② 계산·표시 도구 ---------- */

  const signed = v => (v > 0 ? '+' : v < 0 ? '−' : '') + fmt(Math.abs(v), 1);   // +6.3 / −2.1
  const corrText = v => (v < 0 ? '−' : '') + Math.abs(v).toFixed(2);             // 상관계수 (범례와 같은 마이너스 기호)
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
  const goToRegion = id => {
    const name = (nationalRegions.find(r => r.id === id) || {}).name;
    const shared = D.getRegions().find(r => r.name === name);
    location.href = D.url(`region?region=${shared ? shared.id : id}`);
  };

  // 여러 섹션이 같이 쓰는 값을 한 번만 계산
  const summarize = (regions, national) => {
    const year = national.year;   // 기준 연도 (서버가 정함: 12개월이 모두 있는 가장 최근 연도)
    const total = sortedDesc(regions, 'supply').reduce((sum, r) => sum + r.supply, 0);
    const bySensitivity = sortedDesc(regions, 'sensitivity');
    const byMape = sortedDesc(regions, 'mape');
    return {
      regions, national, year, total, bySensitivity, byMape,
      prevYear: String(Number(year) - 1),
      hasMape: regions.some(r => r.mape !== null && r.mape !== undefined),   // 예측 서버(FastAPI)가 꺼져 있으면 MAPE 가 비어서(null) 옴
      overLimit: byMape.filter(r => r.mape > MAPE_LIMIT),   // 경고 지역
      avgSens: weightedAvg(bySensitivity, 'sensitivity', total),
      avgMape: weightedAvg(byMape, 'mape', total),
      period: toKoreanPeriod(national.corrPeriod)
    };
  };

  /* ---------- ③ 섹션별 그리기 (화면 순서와 같음) ---------- */

  // KPI 4개: 전년 대비, 전분기 대비는 서버가 계산해서 보내줌
  const drawKpis = ({ national, year, prevYear, total, avgSens, avgMape, overLimit, hasMape }) => {
    $('kpis').innerHTML = [
      D.kpi({ label: `전국 연간 공급량 (${year})`, value: fmt(total), unit: '백만㎥', delta: national.supplyYoy, deltaLabel: `${prevYear}년 대비` }),
      D.kpi({ label: '전국 기온 민감도 (공급량 가중)', value: fmt(avgSens, 1), unit: '%/°C', caption: '겨울철 1°C 하락 시 증가율', accent: 'var(--season-winter)' }),
      // MAPE 는 비율이라 전분기와의 차이는 %p
      D.kpi({ label: '예측 오차율 (MAPE)', value: hasMape ? fmt(avgMape, 1) : '–', unit: '%', delta: national.mapeDelta, deltaUnit: '%p', deltaLabel: '전분기 대비', goodWhen: 'down' }),
      D.kpi({ label: '오차 큰 지역', value: hasMape ? overLimit.length : '–', unit: '곳', caption: `MAPE ${MAPE_LIMIT}% 초과`, accent: 'var(--red-500)' })
    ].join('');
  };

  // 지역별 공급 현황 (트리맵): 면적은 항상 기준 연도 공급량, 색만 토글(전년 대비 증감률 / 1인당 공급량)로 바뀜
  const drawTreemap = ({ regions, national, year, total }) => {
    const yoys = regions.map(r => r.supplyYoy);
    const yoyMin = Math.min(...yoys), yoyMax = Math.max(...yoys);
    const perCapitaSorted = regions.map(percapOf).sort((a, b) => a - b);
    const perCapitaMin = perCapitaSorted[0], perCapitaMax = perCapitaSorted[perCapitaSorted.length - 1];
    // 제주·세종이 유난히 낮아서 최소~최대를 균등 분할하면 나머지가 두 색으로만 갈림 → 지역 수 기준 4분위로 나눔
    const perCapitaCuts = [1, 2, 3].map(k => perCapitaSorted[Math.floor((perCapitaSorted.length * k) / SEQ_COLORS.length)]);

    let metric = 'yoy';
    const lastPaint = {};   // 지난번에 칠한 칸 (토글할 때 이전 색에서 새 색으로 이어지게)

    // 칸 하나의 색·글자색·문구 (면적 값은 공통)
    const tileOf = r => {
      const perCapita = percapOf(r);
      const head = `<b>${r.name}</b>공급량 ${fmt(r.supply, 1)} 백만㎥ (${fmt((r.supply / total) * 100, 1)}%)<br>`;
      const yoyText = `${signed(r.supplyYoy)}%`, perCapitaText = `${fmt(perCapita)}㎥/인·년`;
      const base = { id: r.id, label: r.name, value: r.supply };
      if (metric === 'yoy') {
        const step = Math.min(YOY_COLORS.length - 1, Math.floor(((r.supplyYoy - yoyMin) / (yoyMax - yoyMin || 1)) * YOY_COLORS.length));
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
      ? `<span>${signed(yoyMin)}%</span>${swatches(YOY_COLORS)}<span>${signed(yoyMax)}%</span><span class="tm-legend-note">전국 평균 ${signed(national.supplyYoy)}% · 진할수록 많이 증가 · 기온 영향 포함</span>`
      : `<span>${fmt(perCapitaMin)}㎥</span>${swatches(SEQ_COLORS)}<span>${fmt(perCapitaMax)}㎥</span><span class="tm-legend-note">1인당 연간 공급량 · 지역을 4등분해 색칠, 진할수록 많음</span>`;

    const render = animate => {
      const data = regions.map(tileOf);
      D.renderTreemap($('treemap'), data, { unit: '', onSelect: goToRegion });
      if (animate && !reduceMotion) fadeFromPrevious(data);
      else data.forEach(d => { lastPaint[d.id] = d; });
      $('treemapLegend').innerHTML = legendOf();
    };

    // 토글: 색 기준 스위치
    const syncTabs = slideTabs($('metricTabs'), METRIC_TABS, metric, m => {
      metric = m;
      render(true);
    });

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

  // 광역경제권별 공급 비중 (도넛): 조각, 범례, 가운데 글자가 호버에 함께 반응. 권역은 상세 페이지가 없어 클릭 이동은 없음
  const drawDonut = ({ regions, year, total }) => {
    const slices = buildSlices(regions);
    const pctOf = d => fmt((d.value / total) * 100, 1);

    // 범례: 한 줄(.dl-row)이 하나의 요소여야 줄 단위로 호버·강조할 수 있음
    const legend = $('donutLegend');
    legend.innerHTML = slices.map((d, i) =>
      `<div class="dl-row" data-i="${i}"><i class="sw" style="background:${d.color}"></i><span class="dl-name">${d.label}<small>${d.members}</small></span><b>${pctOf(d)}%</b></div>`).join('');
    const rows = [...legend.querySelectorAll('.dl-row')];

    // 가운데 글자: 평소에는 전국 합계(백만㎥ → 억㎥), 호버하면 해당 조각의 비중과 공급량
    $('donutSub').textContent = `${year}년 · 5+2 광역경제권 기준 · 17개 시·도 합산`;
    const center = $('donutCenter');
    const centerDefault = `<span>전국</span><b>${fmt(total / 100, 1)}</b><span>억㎥</span>`;
    center.innerHTML = centerDefault;

    const donut = new Chart($('donut'), {
      type: 'doughnut',
      data: { labels: slices.map(d => d.label), datasets: [{ data: slices.map(d => d.value), backgroundColor: slices.map(d => d.color), borderColor: '#fff', borderWidth: 2, hoverOffset: 8 }] },
      options: {
        cutout: '68%',
        layout: { padding: 10 },                      // 호버로 조각이 튀어나올 자리를 미리 비워 둠 (안 비우면 가장자리가 잘림)
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
    const pickBy = (better, key) => annual.reduce((a, b) => (better(b[key], a[key]) ? b : a));
    const peakYear = pickBy((x, y) => x > y, 'supply');
    const lowYear = pickBy((x, y) => x < y, 'supply');
    const warmestYear = pickBy((x, y) => x > y, 'avgTemp');
    const notes = [];
    if (warmestYear.year === lowYear.year) {
      notes.push(D.callout('blue', `${warmestYear.year}년: 가장 따뜻하고 공급량은 가장 적음`,
        `평균기온 ${fmt(warmestYear.avgTemp, 1)}°C로 가장 높았고 공급량은 ${fmt(lowYear.supply)}백만㎥로 가장 적었습니다. 기온이 높은 해에 난방 수요가 줄어드는 것과 일치합니다.`));
    }
    notes.push(D.callout('purple', '연도별 최대·최소', `가장 많은 해 ${peakYear.year}년 ${fmt(peakYear.supply)}백만㎥, 가장 적은 해 ${lowYear.year}년 ${fmt(lowYear.supply)}백만㎥ (${signed(((lowYear.supply - peakYear.supply) / peakYear.supply) * 100)}%)`));
    // 기온이 거의 같은데(0.1°C 이내) 공급량이 2% 이상 다른 두 해 → 기온만으로는 설명되지 않는 부분
    let gap = null;
    annual.forEach((a, i) => annual.slice(i + 1).forEach(b => {
      const diff = Math.abs(b.supply - a.supply) / Math.min(a.supply, b.supply) * 100;
      if (Math.abs(a.avgTemp - b.avgTemp) <= 0.1 && diff >= 2 && (!gap || diff > gap.diff)) gap = { a, b, diff };
    }));
    if (gap) {
      const [lo, hi] = gap.a.supply < gap.b.supply ? [gap.a, gap.b] : [gap.b, gap.a];
      notes.push(D.callout('blue', '기온 외 요인', `${lo.year}년과 ${hi.year}년은 평균기온이 ${fmt(lo.avgTemp, 1)}°C로 비슷하지만 공급량은 ${hi.year}년이 ${fmt(gap.diff, 1)}% 더 많았습니다. 기온 외에 인구·세대 수나 산업용 수요도 영향을 줄 수 있습니다.`));
    }
    notes.push(D.callout('blue', '해석 시 주의', `${annual.length}개 연도만 비교한 것이라 경향을 보는 참고용입니다.`));
    return notes.join('');
  };

  // 연도별 추이: 막대 = 연간 공급량(기준 연도는 진하게), 선 = 평균기온. 서버가 12개월이 모두 있는 연도만 보내줌
  const drawTrend = ({ national, year }) => {
    const annual = national.annual || [];
    if (!annual.length) {
      $('trendCard').style.display = 'none';
      return;
    }
    $('trendSub').textContent = `${annual[0].year}~${annual[annual.length - 1].year}년 · 12개월이 모두 있는 연도만 비교`;

    const supplies = annual.map(a => a.supply), temps = annual.map(a => a.avgTemp);
    // 막대는 아래쪽 65% 안, 기온 선은 그 위쪽(높이 74~94%)에 놓이도록 두 축의 범위를 잡음 (서로 겹쳐 글자가 가려지지 않게)
    // 기온 축은 눈금 없이 값을 점마다 표시하므로, 선의 높낮이는 해 사이의 차이를 보기 쉽게 키운 것
    const supplyMax = Math.ceil(Math.max(...supplies) / 0.65 / 2000) * 2000;
    const tempLow = Math.min(...temps), tempSpan = Math.max(Math.max(...temps) - tempLow, 0.5) / 0.2;
    const tempMin = tempLow - tempSpan * 0.74, tempMax = tempMin + tempSpan;
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
    const axisTitle = text => ({ display: true, text, color: C('--mute'), font: { size: 12 } });
    const tooltipLabel = i => {
      const a = annual[i.dataIndex];
      if (i.dataset.type === 'line') return `평균기온 ${fmt(a.avgTemp, 1)}°C`;
      return `공급량 ${fmt(a.supply, 1)} 백만㎥` + (a.supplyYoy !== null && a.supplyYoy !== undefined ? ` (전년 대비 ${signed(a.supplyYoy)}%)` : '');
    };

    new Chart($('trendChart'), {
      data: {
        labels: annual.map(a => [`${a.year}년`, a.supplyYoy === null || a.supplyYoy === undefined ? '' : `전년 ${signed(a.supplyYoy)}%`]),   // 두 줄: 연도 / 전년 대비
        datasets: [
          { type: 'bar', label: '연간 공급량', data: supplies, yAxisID: 'y', borderRadius: 3, maxBarThickness: 56,
            backgroundColor: annual.map(a => a.year === year ? C('--seq-5') : C('--seq-3')) },
          { type: 'line', label: '평균기온', data: temps, yAxisID: 'y1', borderColor: C('--yellow-700'), backgroundColor: C('--yellow-700'), borderWidth: 2, pointRadius: 4, tension: 0 }
        ]
      },
      plugins: [barValues, tempValues],
      options: {
        layout: { padding: { top: 8 } },
        interaction: { mode: 'index', intersect: false },   // 한 해에 올리면 공급량과 기온을 함께 보여줌
        scales: {
          x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: false } },   // 두 줄 라벨이 기울지 않게
          y: { min: 0, max: supplyMax, ticks: { callback: v => fmt(v) }, title: axisTitle('공급량 (백만㎥)') },
          y1: { display: false, min: tempMin, max: tempMax }
        },
        plugins: { tooltip: { callbacks: { title: items => `${annual[items[0].dataIndex].year}년`, label: tooltipLabel } } }
      }
    });
    $('trendNotes').innerHTML = trendNotesOf(annual);
  };

  // 값이 큰 순으로 정렬된 지역 목록을 4구간(4분위)으로 나눔 → 지역 id 별 0(낮음)~3(높음). 극단 값 하나에 색이 쏠리지 않게 값이 아닌 순위로 나눔
  const bandsOf = rows => {
    const bands = {};
    rows.forEach((r, i) => { bands[r.id] = 3 - Math.min(3, Math.floor((i * 4) / rows.length)); });
    return bands;
  };
  // 색 범례: 낮음 → 높음 (4구간)
  const bandLegend = (colors, lowText, highText) =>
    `${lowText}${colors.map(c => `<i style="background:${c}"></i>`).join('')}${highText}<span class="tm-legend-note">4분위 (순위 기준)</span>`;

  // 기온 민감도 + 예측 오차 (가로 막대): 막대를 클릭하면 지역 상세로 이동
  const drawBars = ({ bySensitivity, byMape, overLimit, avgSens, hasMape }) => {
    // 민감도: 높을수록 진한 파랑 (4구간). 전국 평균은 기준선으로 따로 표시
    const sensColors = ['--seq-2', '--seq-3', '--seq-4', '--seq-5'].map(v => C(v));
    const sensBand = bandsOf(bySensitivity);
    D.hbar($('sensChart'),
      bySensitivity.map(r => ({ id: r.id, label: r.name, value: r.sensitivity, color: sensColors[sensBand[r.id]], detail: `공급량 ${fmt(r.supply)} 백만㎥` })),
      { ref: avgSens, refLabel: `전국 평균 ${fmt(avgSens, 1)}%`, onClick: d => goToRegion(d.id), showValue: true, axisTitle: '공급량 증가율 (%/°C)', barThickness: 16 });
    $('sensLegend').innerHTML = bandLegend(sensColors, '민감도 낮음', '높음');
    const lowest = bySensitivity[bySensitivity.length - 1];
    $('sensNote').innerHTML = D.callout('blue', '해석 시 주의', `겨울철 월별 자료로 추정한 값이라 표본이 적습니다. 가장 낮은 ${lowest.name}(${fmt(lowest.sensitivity, 1)}%)처럼 극단 값은 참고용으로 보세요.`);

    // 예측 오차: 기준선을 넘으면 빨강. 가로축 최대값은 가장 큰 MAPE 를 10 단위로 올림 (실제 값이 14% 를 넘어도 막대가 잘리지 않게, 최소 14)
    const mapeAxisMax = Math.max(14, Math.ceil(Math.max(...byMape.map(r => r.mape || 0)) / 10) * 10);
    // 오차: 클수록 노랑 → 빨강 (4구간). 예측 오차를 못 받아오면 순위를 알 수 없어 한 색으로 둠
    const mapeColors = [C('--yellow-500'), `color-mix(in srgb, ${C('--yellow-500')}, ${C('--red-500')})`, C('--red-500'), C('--div-pos-3')];
    const mapeBand = bandsOf(byMape);
    D.hbar($('accChart'),
      byMape.map(r => ({ id: r.id, label: r.name, value: r.mape, color: hasMape ? mapeColors[mapeBand[r.id]] : C('--stone'), detail: `공급량 ${fmt(r.supply)} 백만㎥` })),
      { max: mapeAxisMax, ref: MAPE_LIMIT, refLabel: `기준 ${MAPE_LIMIT}%`, onClick: d => goToRegion(d.id), showValue: true, axisTitle: 'MAPE (%)', barThickness: 16 });
    $('accLegend').innerHTML = hasMape ? bandLegend(mapeColors, '오차 작음', '큼') : '';
    $('badBadge').innerHTML = hasMape ? `<i class="dot"></i>${overLimit.length}곳 경고` : '';
    $('badBadge').hidden = !hasMape;
    // 원인은 지역마다 다를 수 있어서 단정하는 문구는 넣지 않고, 어떻게 구한 값인지만 설명. 지역 이름은 데이터에서 뽑음
    if (!hasMape) {
      $('accCallout').innerHTML = D.callout('purple', '예측 오차를 불러오지 못했습니다', '파이썬 예측 서버(FastAPI)가 켜져 있는지 확인하세요.');
    } else if (overLimit.length) {
      $('accCallout').innerHTML = D.callout('red', '경고 지역', `${overLimit.map(r => r.name).join('·')} — 최근 12개월을 모델로 다시 예측해 본 오차가 ${MAPE_LIMIT}%를 넘는 지역입니다.`);
    } else {
      $('accCallout').innerHTML = D.callout('green', '경고 지역 없음', `모든 지역의 MAPE 가 ${MAPE_LIMIT}% 이하입니다.`);
    }
  };

  // 공급량과 함께 보여줄 요인 (이름, 보충 설명). 난방도일은 기온에서 계산한 값이라 같이 움직이는 게 당연함
  const CORR_FACTORS = [
    { name: '평균기온' },
    { name: '난방도일', hint: '기온에서 계산' },
    { name: '인구' },
    { name: '세대수' }
  ];

  // 공급량과의 상관 막대: 요인마다 원본(계절 포함)과 계절 제거 두 줄. 가운데가 0, 오른쪽이 +, 왼쪽이 −
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
    const raw = C('--stone'), yoyColor = C('--seq-4');
    $('corrBars').innerHTML =
      `<div class="corr-legend"><i style="background:${raw}"></i>원본(계절 포함)<i style="background:${yoyColor}"></i>전년 동월 대비 변화(계절·추세 제거)</div>` +
      CORR_FACTORS.map(f =>
        `<div class="corr-row"><div class="corr-name">${f.name}${f.hint ? `<small>${f.hint}</small>` : ''}</div>` +
        bar('원본', valueOf(corr, f.name), raw) + bar('전년비', valueOf(corrYoy, f.name), yoyColor) + '</div>').join('') +
      '<div class="corr-axis"><span></span><span><span>−1</span><span>0</span><span>+1</span></span><span></span></div>';
  };

  // 오른쪽 설명 박스: r 값과 문장을 서버가 보낸 상관계수에서 만듦
  const corrNotesOf = ({ corrLabels, corr, corrYoy }) => {
    const corrOf = (matrix, a, b) => {
      const i = corrLabels.indexOf(a), j = corrLabels.indexOf(b);
      return !matrix || i < 0 || j < 0 ? null : matrix[i][j];
    };
    const notes = [];
    const hdd = corrOf(corr, '공급량', '난방도일'), temp = corrOf(corr, '공급량', '평균기온');
    const hddYoy = corrOf(corrYoy, '공급량', '난방도일'), tempYoy = corrOf(corrYoy, '공급량', '평균기온');
    if (hdd !== null && hddYoy !== null && tempYoy !== null) {
      notes.push(D.callout('blue', '계절·추세를 빼도 기온 영향은 남음',
        `원본 난방도일 r = ${corrText(hdd)}은 겨울에 추우면서 공급이 많은 계절 패턴이 더해진 값입니다. 작년 같은 달과 비교한 변화끼리 보아도 난방도일 ${corrText(hddYoy)}, 평균기온 ${corrText(tempYoy)}로, 작년보다 추운 달일수록 공급이 늘었습니다.`));
    } else if (hdd !== null) {
      notes.push(D.callout('blue', `공급량 ↔ 난방도일 r = ${corrText(hdd)}`,
        temp !== null && Math.abs(hdd) > Math.abs(temp) ? `기온(r = ${corrText(temp)})보다 난방도일(18°C 기준)이 공급량을 더 잘 설명합니다.` : '난방도일(18°C 기준)과 기온 모두 공급량과 비슷한 수준으로 연동됩니다.'));
    }
    const pop = corrOf(corr, '공급량', '인구'), popYoy = corrOf(corrYoy, '공급량', '인구');
    const hhYoy = corrOf(corrYoy, '공급량', '세대수');
    if (pop !== null && popYoy !== null && hhYoy !== null) {
      // 월별 공급량은 계절 변동이 커서 원본 상관이 낮으면 '영향 없음'으로 읽히기 쉬움 → 전년 동월 대비로도 같은 결과인지 함께 보여줌
      const weak = Math.abs(popYoy) < 0.3 && Math.abs(hhYoy) < 0.3;
      notes.push(D.callout('purple', '인구·세대수와는 뚜렷한 관계가 안 보임',
        `인구는 원본 ${corrText(pop)}, 전년 동월 대비 ${corrText(popYoy)}이고 세대수는 원본 ${corrText(corrOf(corr, '공급량', '세대수'))}, 전년 동월 대비 ${corrText(hhYoy)}입니다. ${weak ? '계절과 추세를 빼도 모두 약해서, 월별 공급량의 움직임은 주로 기온이 설명합니다. 다만 5년 남짓한 자료라 인구의 장기 영향까지 배제하는 것은 아닙니다.' : '값이 일정하지 않아 해석에 주의가 필요합니다.'}`));
    }
    const popHousehold = corrOf(corr, '인구', '세대수'), popHouseholdYoy = corrOf(corrYoy, '인구', '세대수');
    if (popHousehold !== null && Math.abs(popHousehold) >= 0.9) {
      notes.push(D.callout('blue', `인구 ↔ 세대수 r = ${corrText(popHousehold)}`,
        `${popHousehold < 0 ? '서로 반대 방향으로 ' : ''}매우 강하게 움직이는 것처럼 보이지만, 전년 동월 대비 변화로는 ${popHouseholdYoy !== null ? corrText(popHouseholdYoy) : '-'}로 약해집니다. 두 변수가 장기 추세를 따라 함께 움직여서 생긴 값에 가깝습니다. (전체 상관표에서 확인)`));
    }
    return notes.join('');
  };

  // 상관계수: [요인 비교] 공급량과의 막대 / [상관표] 전체 상관표(히트맵, 기준은 원본 또는 전년 동월 대비)
  //   히트맵 lower = 대각선과 대칭으로 겹치는 칸을 빼고 아래쪽 삼각형만 표시
  const CORR_VIEWS = [{ id: 'factors', label: '요인 비교' }, { id: 'table', label: '상관표' }];
  const CORR_BASES = [{ id: 'raw', label: '원본(계절 포함)' }, { id: 'yoy', label: '전년 동월 대비' }];
  const drawCorrelation = ({ national, period }) => {
    let view = 'factors', basis = 'raw';
    const bases = national.corrYoy ? CORR_BASES : CORR_BASES.slice(0, 1);   // 전년 동월 대비 값이 없으면 기준 스위치는 숨김
    let syncBasis = () => {};
    const render = () => {
      const matrix = basis === 'yoy' && national.corrYoy ? national.corrYoy : national.corr;
      $('corrBars').hidden = view !== 'factors';
      $('corrTable').hidden = view !== 'table';
      $('corrBasisSwitch').hidden = view !== 'table' || bases.length < 2;
      syncBasis();   // 보이게 된 뒤에 선택 배경 위치를 맞춤
      D.renderHeatmap($('heatmap'), national.corrLabels, matrix, { lower: true });
    };
    slideTabs($('corrTabs'), CORR_VIEWS, view, v => { view = v; render(); });
    syncBasis = slideTabs($('corrBasisTabs'), bases, basis, b => { basis = b; render(); });
    drawCorrBars(national);
    $('corrSub').textContent = `전국 월별 데이터${period ? '(' + period + ')' : ''} · 공급량과의 상관계수(r)`;
    $('corrNotes').innerHTML = corrNotesOf(national);
    render();
  };

  // 페이지 맨 아래 데이터 안내: 기간, 기준 연도, 예측 오차 기준
  const drawDataNote = ({ national, year, period, hasMape }) => {
    // 마지막 달이 12월이 아니면 그 해는 진행 중이라 연간 비교에서 뺐다고 알림
    const [endYear, endMonth] = (national.corrPeriod || '').split(' ~ ').pop().split('-').map(Number);
    const partial = endMonth && endMonth < 12 ? ` (${endYear}년은 ${endMonth}월까지라 연간 비교에서 제외)` : '';
    const mapeNote = hasMape ? '예측 오차(MAPE)는 최근 12개월을 예측 모델로 다시 예측해 구한 값입니다.' : '예측 오차(MAPE)는 예측 서버가 꺼져 있어 불러오지 못했습니다.';
    $('dataNote').textContent = `데이터 기간 ${period || '-'} · 연간 지표는 12개월이 모두 있는 ${year}년 기준${partial}, 연도별 추이는 12개월이 모두 있는 연도만 표시 · ${mapeNote}`;
  };

  // 받아온 데이터로 화면 전체를 한 번 그림
  const draw = (regions, national) => {
    const summary = summarize(regions, national);
    drawKpis(summary);
    drawTreemap(summary);
    drawDonut(summary);
    drawTrend(summary);
    drawBars(summary);
    drawCorrelation(summary);
    drawDataNote(summary);
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
