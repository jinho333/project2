/* =====================================================================
 * national.js — 전국 통계 페이지
 * 화면: KPI 4개 → 마켓맵(트리맵) + 공급 비중 도넛 → 기온 민감도 / 예측 정확도 막대 → 상관계수 히트맵
 * 지역 선택 상태가 없어서 render() 없이 위에서 아래로 한 번만 그림
 * (마켓맵만 탭 변경·창 크기 변경 때 다시 그림)
 * ===================================================================== */
/* 전국 통계 */
(function () {
  // G = 데이터(data.js), D = 공통 함수(common.js)
  const G = window.GasData, D = window.Dash, { C, fmt } = D;
  const $ = id => document.getElementById(id);
  // 지역 클릭 시 해당 지역 상세 페이지로 이동
  const go = id => { location.href = D.url(`region?region=${id}`); };
  // ※ byName 은 현재 쓰는 곳 없음
  const byName = n => G.regions.find(r => r.name === n);

  // 공급량 큰 순 정렬 ([...배열] 로 복사 후 정렬 → 원본 순서는 그대로)
  const R = [...G.regions].sort((a, b) => b.supply - a.supply);
  const total = R.reduce((s, r) => s + r.supply, 0);
  // 기온 민감도 큰 순 + 평균
  const sens = [...G.regions].sort((a, b) => b.sensitivity - a.sensitivity);
  const avgSens = sens.reduce((s, r) => s + r.sensitivity, 0) / sens.length;
  // 예측 오차(MAPE) 큰 순 / MAPE 8% 넘는 '경고' 지역
  const acc = [...G.regions].sort((a, b) => b.mape - a.mape);
  const bad = acc.filter(r => r.mape > 8);
  // 전국 MAPE: 공급량이 큰 지역에 더 큰 비중을 두는 가중 평균
  const avgMape = acc.reduce((s, r) => s + r.mape * r.supply, 0) / total;

  // KPI
  // ⚠️ '전년 대비 1.9%', '전분기 대비 -0.8%' 는 계산값이 아닌 고정 숫자
  $('kpis').innerHTML = [
    D.kpi({ label: '전국 연간 공급량 (2025)', value: fmt(total), unit: '백만㎥', delta: 1.9, deltaLabel: '전년 대비' }),
    D.kpi({ label: '평균 기온 민감도', value: fmt(avgSens, 1), unit: '%/°C', caption: '겨울철 1°C 하락 시 증가율', accent: 'var(--season-winter)' }),
    D.kpi({ label: '전국 가중 MAPE', value: fmt(avgMape, 1), unit: '%', delta: -0.8, deltaLabel: '전분기 대비', goodWhen: 'down' }),
    D.kpi({ label: '정확도 경고 지역', value: bad.length, unit: '곳', caption: 'MAPE 8% 초과', accent: 'var(--red-500)' })
  ].join('');

  // 마켓맵
  // metric: 'supply'(총 공급량) / 'percap'(1인당). 탭을 누르면 바뀌고 다시 그림
  let metric = 'supply';
  function renderTree() {
    D.renderTabs($('metricTabs'), [{ id: 'supply', label: '총 공급량' }, { id: 'percap', label: '1인당' }], metric, m => { metric = m; renderTree(); });
    const data = G.regions.map(r => ({ id: r.id, label: r.name, value: metric === 'supply' ? r.supply : (r.supply * 1e6) / (r.pop * 1e4) }));
    D.renderTreemap($('treemap'), data, { unit: metric === 'supply' ? '' : '㎥', onSelect: go });
  }
  renderTree();
  // 창 크기가 바뀌면 트리맵 칸 크기를 다시 계산 (크기 조절이 0.15초 멈췄을 때 한 번만)
  window.addEventListener('resize', D.debounce(renderTree, 150));

  // 공급 비중 도넛
  // 상위 7개 지역 + 나머지 10개는 '기타'로 합침
  const slices = R.slice(0, 7).map((r, i) => ({ label: r.name, value: r.supply, color: C(`--cat-${i + 1}`) }));
  slices.push({ label: '기타 10개 지역', value: R.slice(7).reduce((s, r) => s + r.supply, 0), color: C('--cat-8') });
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
  // ⚠️ 원인 설명 문장에 지역명(세종·제주·울산)이 고정으로 적혀 있음
  $('accCallout').innerHTML = D.callout('red', '원인 추정', `${bad.map(r => r.name).join('·')} — 공급량이 작거나(세종·제주) 산업용 비중이 높아(울산) 기온만으로 설명되지 않습니다.`);

  // 상관계수
  D.renderHeatmap($('heatmap'), G.CORR_LABELS, G.CORR);

  // 새로 그린 HTML 안의 아이콘 표시
  D.icons();
})();
