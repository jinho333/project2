/* =====================================================================
 * forecast.js — 공급 예측 페이지
 * ---------------------------------------------------------------------
 * 탭 2개
 *   [예측]       지역·기간(3/6개월) 선택 → 예측 선 차트 + KPI + 월별 표
 *   [시뮬레이션] 기온 범위·인구 변화율 슬라이더 → '실행' → 기준 vs 시나리오 비교
 *
 * 화면 상태 변수
 *   regionId : 선택 지역      view     : 'forecast' | 'simulation'
 *   horizon  : 3 | 6 (개월)   showBand : 신뢰구간 표시 여부
 *
 * 동작 흐름: 값 변경 → render() → renderHead() + (예측 또는 시뮬레이션) 다시 그리기
 * ===================================================================== */
/* 공급 예측 + 시뮬레이션 */
(function () {
  const G = window.GasData, D = window.Dash, { C, fmt } = D;
  const $ = id => document.getElementById(id);
  let regionId = D.getRegion(), view = 'forecast', horizon = 6, showBand = true;
  // 만든 차트 보관 + 같은 캔버스에 다시 그릴 땐 기존 차트 삭제 후 생성 (region.js 와 같은 방식)
  const charts = {};
  const make = (key, canvas, cfg) => { if (charts[key]) charts[key].destroy(); charts[key] = new Chart(canvas, cfg); };
  // 현재 선택 지역 데이터 가져오기
  const region = () => G.regions.find(x => x.id === regionId);
  // 계절 → 배지 색 (표의 '계절' 칸)
  const SEASON_TONE = { winter: 'blue', autumn: 'yellow', summer: 'red', spring: 'green' };

  // 시뮬레이션 상태
  // def     : 지역 기본 기온 범위 [최저, 최고]
  // draft   : 슬라이더로 조정 중인 값 (아직 실행 안 함)
  // applied : '실행' 버튼을 눌러 결과에 반영된 값
  let def, draft, applied;
  // 지역을 바꾸거나 초기화할 때 기본값으로 되돌림
  function resetSim() {
    const r = region();
    def = [Math.round(r.lo), Math.round(r.hi)];
    draft = { range: [...def], popPct: 0 };
    applied = { range: [...def], popPct: 0 };
  }

  /* ---------- 공통 헤더 ---------- */
  // 지역 정보·탭은 두 화면 공통. view 에 따라 보여줄 영역을 hidden 으로 켜고 끔
  function renderHead() {
    D.renderRegionInfo($('regionInfo'), region());
    D.renderTabs($('viewTabs'), [{ id: 'forecast', label: '예측', icon: 'trending-up' }, { id: 'simulation', label: '시뮬레이션', icon: 'sliders-horizontal' }], view, v => { view = v; render(); });
    const sel = $('regionSelect');
    sel.hidden = view !== 'simulation';
    sel.innerHTML = G.regions.map(x => `<option value="${x.id}"${x.id === regionId ? ' selected' : ''}>${x.name}</option>`).join('');
    $('mapCard').hidden = view !== 'forecast';
    $('fcLayout').classList.toggle('grid-map--single', view !== 'forecast');
    $('forecastView').hidden = view !== 'forecast';
    $('simView').hidden = view !== 'simulation';
  }

  // 지역 변경 공통 처리: 저장 → 시뮬레이션 초기화 → 다시 그리기
  function changeRegion(id) { regionId = id; D.setRegion(id); resetSim(); render(); }

  /* ---------- 예측 ---------- */
  function renderForecast() {
    const r = region();
    // 지도 색 = 각 지역의 향후 horizon개월 예측 합계
    D.renderTileMap($('map'), { valueOf: x => G.forecast(x, { horizon }).fut.reduce((s, f) => s + f.value, 0), selected: r.id, legendLabel: `${horizon}개월 예측`, onSelect: changeRegion });
    D.renderTabs($('horizonTabs'), [{ id: 3, label: '3개월' }, { id: 6, label: '6개월' }], horizon, h => { horizon = h; renderForecast(); });

    // hist: 최근 실적 12개월, fut: 예측 horizon개월 (data.js 의 G.forecast)
    const { hist, fut } = G.forecast(r, { horizon });
    const n = hist.length;
    // 차트용 배열 만들기 (x축 = 실적 라벨 + 예측 라벨)
    //   actual   : 실적 구간만 값, 예측 구간은 null (선을 안 그림)
    //   fc/lo/hi : 예측 구간만 값. 단 실적 마지막 달 값도 넣어서 실적 선과 끊기지 않고 이어지게 함
    const labels = [...hist.map(h => h.label), ...fut.map(f => f.label)];
    const last = (i, v) => (i === n - 1 ? v : null);
    const actual = [...hist.map(h => h.value), ...fut.map(() => null)];
    const fc = [...hist.map((h, i) => last(i, h.value)), ...fut.map(f => f.value)];
    const lo = [...hist.map((h, i) => last(i, h.value)), ...fut.map(f => f.lo)];
    const hi = [...hist.map((h, i) => last(i, h.value)), ...fut.map(f => f.hi)];
    // KPI 계산: 예측 합계 vs 1년 전 같은 기간 실적
    const tot = fut.reduce((s, f) => s + f.value, 0);
    const lastYear = hist.slice(0, horizon).reduce((s, h) => s + h.value, 0);
    const end = fut[fut.length - 1];

    $('fcKpis').innerHTML = [
      D.kpi({ label: `다음 달 예측 (${fut[0].label})`, value: fmt(fut[0].value), unit: '백만㎥', caption: `범위 ${fmt(fut[0].lo)}–${fmt(fut[0].hi)}` }),
      D.kpi({ label: `향후 ${horizon}개월 합계`, value: fmt(tot), unit: '백만㎥', delta: ((tot - lastYear) / lastYear) * 100, deltaLabel: '전년 동기 대비' }),
      D.kpi({ label: '예측 입력', value: `${fmt(end.temp, 1)}°C`, caption: `${end.label} 평년 기온 · 인구 ${r.trend >= 0 ? '+' : ''}${r.trend}%/년`, accent: 'var(--season-winter)' })
    ].join('');
    $('fcTitle').textContent = `${r.name} 공급량 예측`;

    // 선 4개: 상한·하한(두 선 사이를 색칠 = 신뢰구간), 실적(실선), 예측(점선)
    make('fc', $('fcChart'), {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: '상한', data: hi, borderWidth: 0, pointRadius: 0, fill: false, hidden: !showBand },
          { label: '하한', data: lo, borderWidth: 0, pointRadius: 0, fill: '-1', backgroundColor: C('--viz-band'), hidden: !showBand },
          { label: '실적', data: actual, borderColor: C('--viz-actual'), backgroundColor: '#fff', borderWidth: 2, pointRadius: 2.5, pointBorderWidth: 1.5 },
          { label: '예측', data: fc, borderColor: C('--viz-forecast'), backgroundColor: '#fff', borderDash: [5, 4], borderWidth: 2, pointRadius: 2.5, pointBorderWidth: 1.5 }
        ]
      },
      options: {
        interaction: { mode: 'index', intersect: false },
        scales: { x: { grid: { display: false }, ticks: { maxRotation: 0 } }, y: { ticks: { callback: v => fmt(v) } } },
        plugins: {
          // split: common.js 에 만든 플러그인. 실적/예측 경계에 세로선 + 예측 구간 음영
          split: { index: n - 1, label: '예측' },
          tooltip: {
            // 툴팁에는 실적·예측만 표시(상한·하한 제외), 예측 구간이면 범위도 추가
            filter: it => it.datasetIndex >= 2 && it.raw !== null,
            callbacks: {
              label: it => `${it.dataset.label} ${fmt(it.raw)} 백만㎥`,
              afterBody: it => { const k = it[0].dataIndex; return k >= n ? `범위 ${fmt(lo[k])}–${fmt(hi[k])}` : ''; }
            }
          }
        }
      }
    });

    // 월별 예측 표: 예측 배열 → <tr> 문자열로 만들어 한 번에 넣기
    $('fcTable').innerHTML = fut.map(f => {
      const s = G.season(f.m);
      return `<tr><td class="strong">${f.label}</td><td>${fmt(f.temp, 1)}°C</td><td class="strong">${fmt(f.value)}</td><td class="muted">${fmt(f.lo)}</td><td class="muted">${fmt(f.hi)}</td><td><span class="badge badge--${SEASON_TONE[s]}">${G.SEASON_KO[s]}</span></td></tr>`;
    }).join('');
  }

  /* ---------- 시뮬레이션 ---------- */
  // 슬라이더 최소/최대값과, 값 → 막대 위치(%) 변환 함수
  const T_MIN = -20, T_MAX = 40, P_MIN = -10, P_MAX = 10;
  const pctT = v => ((v - T_MIN) / (T_MAX - T_MIN)) * 100;
  const pctP = v => ((v - P_MIN) / (P_MAX - P_MIN)) * 100;
  // dirty: 슬라이더 값이 실행된 값과 다른지 (true 면 '실행' 버튼 활성화)
  const dirty = () => draft.range[0] !== applied.range[0] || draft.range[1] !== applied.range[1] || draft.popPct !== applied.popPct;

  // draft 값을 화면(슬라이더 위치, 라벨, 색 막대, 기온 미리보기)에 반영
  function syncInputs() {
    const [a, b] = draft.range;
    $('tempLo').value = a; $('tempHi').value = b;
    // 두 슬라이더가 겹쳐 있어서, 최저 손잡이가 오른쪽에 있을 땐 위로 올려야 잡을 수 있음
    $('tempLo').style.zIndex = a > (T_MIN + T_MAX) / 2 ? 3 : 2;
    $('tempLoLabel').textContent = `${a}°C`; $('tempHiLabel').textContent = `${b}°C`;
    $('tempFill').style.left = pctT(a) + '%'; $('tempFill').style.width = (pctT(b) - pctT(a)) + '%';
    $('tempPreview').innerHTML = G.MONTHS.map((_, m) => {
      const t = G.monthTemp(a, b, m);
      return `<div title="${m + 1}월 ${t.toFixed(1)}°C" style="height:${Math.max(6, ((t - T_MIN) / (T_MAX - T_MIN)) * 100)}%;background:var(--season-${G.season(m)})"></div>`;
    }).join('');
    const p = draft.popPct;
    $('popSlider').value = p;
    $('popLabel').textContent = `${p > 0 ? '+' : ''}${p}%`;
    const z = pctP(0), v = pctP(p);
    $('popFill').style.left = Math.min(z, v) + '%'; $('popFill').style.width = Math.abs(v - z) + '%';
    $('runSim').disabled = !dirty();
  }

  // applied 기준으로 결과 그리기: 기준(평년) vs 시나리오 연간 합계 차이(%)
  function renderSimResult() {
    const r = region();
    const base = G.yearProfile(r, {}), sim = G.yearProfile(r, applied);
    const bTot = base.reduce((s, d) => s + d.value, 0), sTot = sim.reduce((s, d) => s + d.value, 0);
    const diff = ((sTot - bTot) / bTot) * 100;
    const peak = sim.reduce((a, d) => (d.value > a.value ? d : a));
    $('simKpis').innerHTML = [
      D.kpi({ label: '연간 공급량 (시나리오)', value: fmt(sTot), unit: '백만㎥', delta: diff, deltaLabel: '기준 대비', accent: 'var(--viz-scenario)' }),
      D.kpi({ label: '피크 월 공급량', value: fmt(peak.value), unit: '백만㎥', caption: `${peak.m + 1}월 · ${fmt(peak.temp, 1)}°C` }),
      D.kpi({ label: '적용 조건', value: `${applied.range[0]}~${applied.range[1]}°C`, caption: `인구 ${applied.popPct >= 0 ? '+' : ''}${applied.popPct}%` })
    ].join('');
    make('sim', $('simChart'), {
      type: 'line',
      data: {
        labels: G.MONTHS,
        datasets: [
          { label: '기준', data: base.map(d => d.value), borderColor: C('--viz-forecast'), borderDash: [5, 4], borderWidth: 2, pointRadius: 0 },
          { label: '시나리오', data: sim.map(d => d.value), borderColor: C('--viz-scenario'), backgroundColor: '#fff', borderWidth: 2.5, pointRadius: 3, pointBorderWidth: 1.5 }
        ]
      },
      options: {
        interaction: { mode: 'index', intersect: false },
        scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { callback: v => fmt(v) } } },
        plugins: { tooltip: { callbacks: { label: it => `${it.dataset.label} ${fmt(it.raw)} 백만㎥` } } }
      }
    });
    renderSimCallout(diff);
  }

  // 결과 설명 박스: 입력만 바꾸고 실행 안 했으면 '실행하세요' 안내, 5% 넘게 변하면 빨강
  function renderSimCallout(diff) {
    if (dirty()) { $('simCallout').innerHTML = D.callout('purple', '입력이 변경되었습니다', '‘시뮬레이션 실행’을 눌러 결과에 반영하세요.'); }
    else {
      const same = Math.abs(diff) < 0.05;
      $('simCallout').innerHTML = D.callout(Math.abs(diff) > 5 ? 'red' : 'blue', `연간 공급량 ${diff >= 0 ? '+' : ''}${fmt(diff, 1)}%`,
        same ? '기준 시나리오와 동일합니다.' : `기온 범위 ${applied.range[0]}~${applied.range[1]}°C, 인구 ${applied.popPct}% 조건에서 ${diff >= 0 ? '증가' : '감소'}량의 대부분은 12–2월에 발생합니다.`);
    }
    D.icons();
  }
  // 현재 applied 기준 변화율(%) 다시 계산
  const currentDiff = () => { const r = region(); const b = G.yearProfile(r, {}).reduce((s, d) => s + d.value, 0); const s = G.yearProfile(r, applied).reduce((x, d) => x + d.value, 0); return ((s - b) / b) * 100; };

  // 이벤트 연결 (페이지 시작 시 한 번만)
  function bindSim() {
    // 최저·최고 기온은 최소 5°C 차이를 유지
    $('tempLo').oninput = () => { let v = +$('tempLo').value; v = Math.min(v, draft.range[1] - 5); draft.range = [v, draft.range[1]]; syncInputs(); renderSimCallout(currentDiff()); };
    $('tempHi').oninput = () => { let v = +$('tempHi').value; v = Math.max(v, draft.range[0] + 5); draft.range = [draft.range[0], v]; syncInputs(); renderSimCallout(currentDiff()); };
    $('popSlider').oninput = () => { draft.popPct = +$('popSlider').value; syncInputs(); renderSimCallout(currentDiff()); };
    // 실행: draft → applied 로 복사하고 결과 다시 그리기
    $('runSim').onclick = () => { applied = { range: [...draft.range], popPct: draft.popPct }; syncInputs(); renderSimResult(); };
    $('resetSim').onclick = () => { resetSim(); syncInputs(); renderSimResult(); };
    $('regionSelect').onchange = e => changeRegion(e.target.value);
    $('bandToggle').onchange = e => { showBand = e.target.checked; renderForecast(); };
  }

  // 화면 전체 다시 그리기
  function render() {
    renderHead();
    if (view === 'forecast') renderForecast();
    else { syncInputs(); renderSimResult(); }
    D.icons();
  }

  // 페이지 처음 열릴 때 실행
  D.setRegion(regionId);
  resetSim();
  bindSim();
  render();
})();
