/* =====================================================================
 * national.js — 전국 통계 페이지
 * 화면: KPI 4개 → 마켓맵(트리맵) + 공급 비중 도넛 → 기온 민감도 / 예측 정확도 막대 → 상관계수 히트맵
 * 지역 선택 상태가 없어서 render() 없이 위에서 아래로 한 번만 그림
 * (마켓맵만 탭 변경·창 크기 변경 때 다시 그림)
 *
 * 사용하는 API (자세한 응답 모양은 common.js 맨 위 참고)
 *   ① GET /api/regions   → 지역별 공급량·인구·민감도·MAPE
 *   ③ GET /api/national  → 전년 대비 증감률, MAPE 변화, 상관계수 표
 * ===================================================================== */
(function () {
  // D = 공통 함수(common.js)
  const D = window.Dash, { C, fmt } = D;
  const $ = id => document.getElementById(id);
  // 지역 클릭 시 해당 지역 상세 페이지로 이동
  // ★ 클릭한 지역의 id 를 페이지 주소의 ?region= 에 넣음 → /region?region=se
  const go = id => { location.href = D.url(`region?region=${id}`); };

  // 페이지 시작: 데이터 2개를 받아온 뒤 화면 그리기
  //   async/await : 서버 응답을 기다렸다가 다음 줄을 실행 (.then(res => ...) 과 같은 뜻)
  async function init() {
    let regions, national;
    try {
      regions = await D.loadRegions();                       // API ① 지역 목록
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
    // 기온 민감도 큰 순 + 평균
    const sens = [...regions].sort((a, b) => b.sensitivity - a.sensitivity);
    const avgSens = sens.reduce((s, r) => s + r.sensitivity, 0) / sens.length;
    // 예측 오차(MAPE) 큰 순 / MAPE 8% 넘는 '경고' 지역
    const acc = [...regions].sort((a, b) => b.mape - a.mape);
    const bad = acc.filter(r => r.mape > 8);
    // 전국 MAPE: 공급량이 큰 지역에 더 큰 비중을 두는 가중 평균
    const avgMape = acc.reduce((s, r) => s + r.mape * r.supply, 0) / total;

    // KPI
    // 전년 대비(supplyYoy), 전분기 대비(mapeDelta) 는 서버가 계산해서 보내줌 (예전에는 1.9, -0.8 고정)
    $('kpis').innerHTML = [
      D.kpi({ label: '전국 연간 공급량 (2025)', value: fmt(total), unit: '백만㎥', delta: national.supplyYoy, deltaLabel: '전년 대비' }),
      D.kpi({ label: '평균 기온 민감도', value: fmt(avgSens, 1), unit: '%/°C', caption: '겨울철 1°C 하락 시 증가율', accent: 'var(--season-winter)' }),
      D.kpi({ label: '전국 가중 MAPE', value: fmt(avgMape, 1), unit: '%', delta: national.mapeDelta, deltaLabel: '전분기 대비', goodWhen: 'down' }),
      D.kpi({ label: '정확도 경고 지역', value: bad.length, unit: '곳', caption: 'MAPE 8% 초과', accent: 'var(--red-500)' })
    ].join('');

    // 마켓맵
    // metric: 'supply'(총 공급량) / 'percap'(1인당). 탭을 누르면 바뀌고 다시 그림
    let metric = 'supply';
    function renderTree() {
      D.renderTabs($('metricTabs'), [{ id: 'supply', label: '총 공급량' }, { id: 'percap', label: '1인당' }], metric, m => { metric = m; renderTree(); });
      const data = regions.map(r => ({ id: r.id, label: r.name, value: metric === 'supply' ? r.supply : (r.supply * 1e6) / (r.pop * 1e4) }));
      D.renderTreemap($('treemap'), data, { unit: metric === 'supply' ? '' : '㎥', onSelect: go });
    }
    renderTree();
    // 창 크기가 바뀌면 트리맵 칸 크기를 다시 계산 (크기 조절이 0.15초 멈췄을 때 한 번만)
    window.addEventListener('resize', D.debounce(renderTree, 150));

    // 공급 비중 도넛
    // 상위 7개 지역 + 나머지는 '기타'로 합침
    const slices = R.slice(0, 7).map((r, i) => ({ label: r.name, value: r.supply, color: C(`--cat-${i + 1}`) }));
    slices.push({ label: `기타 ${R.length - 7}개 지역`, value: R.slice(7).reduce((s, r) => s + r.supply, 0), color: C('--cat-8') });
    new Chart($('donut'), {
      type: 'doughnut',
      data: { labels: slices.map(d => d.label), datasets: [{ data: slices.map(d => d.value), backgroundColor: slices.map(d => d.color), borderColor: '#fff', borderWidth: 2, hoverOffset: 4 }] },
      options: { cutout: '68%', plugins: { tooltip: { callbacks: { label: it => `${fmt(it.raw)} 백만㎥ · ${fmt((it.raw / total) * 100, 1)}%` } } } }
    });
    // 도넛 가운데 전국 합계 (백만㎥ → 십억㎥ 로 /1000)
    $('donutCenter').innerHTML = `<span>전국</span><b>${fmt(total / 1000, 1)}</b><span>십억㎥</span>`;
    $('donutLegend').innerHTML = slices.map(d => `<i class="sw" style="background:${d.color}"></i><span>${d.label}</span><b>${fmt((d.value / total) * 100, 1)}%</b>`).join('');

    // 기온 민감도
    // 평균보다 높으면 겨울색(파랑)으로 강조, 막대 클릭 시 지역 상세로 이동
    D.hbar($('sensChart'), sens.map(r => ({ id: r.id, label: r.name, value: r.sensitivity, color: r.sensitivity > avgSens ? C('--season-winter') : C('--seq-2') })),
      { ref: avgSens, refLabel: `평균 ${fmt(avgSens, 1)}%`, onClick: d => go(d.id) });

    // 정확도 낮은 지역
    // 기준선 8%: 넘으면 빨강
    D.hbar($('accChart'), acc.map(r => ({ id: r.id, label: r.name, value: r.mape, color: r.mape > 8 ? C('--red-500') : C('--stone') })),
      { max: 14, ref: 8, refLabel: '기준 8%', onClick: d => go(d.id) });
    $('badBadge').innerHTML = `<i class="dot"></i>${bad.length}곳 경고`;
    // 경고 지역 이름은 데이터에서 뽑음 (예전에는 '세종·제주·울산' 이 문장에 고정으로 적혀 있었음)
    $('accCallout').innerHTML = bad.length
      ? D.callout('red', '원인 추정', `${bad.map(r => r.name).join('·')} — 공급량이 작거나 산업용 비중이 높으면 기온만으로 설명되지 않습니다.`)
      : D.callout('green', '경고 지역 없음', '모든 지역의 MAPE 가 8% 이하입니다.');

    // 상관계수 (서버가 보내준 변수 이름 + 2차원 배열)
    D.renderHeatmap($('heatmap'), national.corrLabels, national.corr);

    // 새로 그린 HTML 안의 아이콘 표시
    D.icons();
  }

  init();
})();
