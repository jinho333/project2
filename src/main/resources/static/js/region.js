/* =====================================================================
 * 지역 상세 통계 페이지 (region.js)
 * ---------------------------------------------------------------------
 * 화면 구성
 *   1) 지역 선택 지도(타일맵) + 지역 정보 + 연도 선택 버튼
 *   2) KPI 카드 4개 (연간 공급량 / 겨울 비중 / 1인당 공급량 / 피크 월)
 *   3) 월별 공급량 막대 차트 (계절별 색상, 예측월은 연한 색)
 *   4) 기온 구간별 공급량 막대 차트
 *   5) 분기별 인구 추이 선 차트
 *
 * 동작 흐름
 *   지역 클릭 / 연도 클릭 → 변수(regionId, year) 변경 → render() 다시 실행
 *   → 화면 전체를 새 값으로 다시 그림
 *
 * 다른 파일에서 준비해 두는 것
 *   window.GasData : 지역·연도·월별 데이터 (G)
 *   window.Dash    : 공통 화면 함수 모음 (D) - 지도, KPI 카드, 버튼, 숫자 포맷 등
 *   Chart          : Chart.js 라이브러리 (차트 그리기)
 * ===================================================================== */

// (function () { ... })();
// → 함수를 만들자마자 바로 실행하는 문법(즉시 실행 함수).
//   이 안에서 만든 변수(year, charts 등)가 다른 js 파일의 변수와 이름이 겹쳐도
//   서로 영향을 주지 않게 "울타리"를 치는 용도.
(function () {

  // ---------------------------------------------------------------
  // 준비: 자주 쓰는 것들을 짧은 이름으로 꺼내두기
  // ---------------------------------------------------------------
  const G = window.GasData;   // 데이터
  const D = window.Dash;      // 공통 화면 함수

  // const { C, fmt } = D;  → D.C, D.fmt 를 꺼내서 C, fmt 라는 이름으로 쓰겠다는 뜻 (구조 분해 할당)
  //   C('--변수명') : CSS 변수에 정의된 색상값을 가져옴  예) C('--cat-3') → '#4a7bd0'
  //   fmt(숫자, 소수자리) : 숫자를 보기 좋게 (천 단위 콤마 등) 문자열로 바꿈
  const { C, fmt } = D;

  // $('kpis') 는 document.getElementById('kpis') 와 같음. 매번 길게 쓰기 싫어서 줄여 둔 것
  const $ = id => document.getElementById(id);

  // 현재 화면 상태
  let regionId = D.getRegion();   // 선택된 지역 (다른 페이지에서 골라둔 지역을 이어받음)
  let year = 2025;                // 선택된 연도 (기본값 2025)

  // 만들어진 차트들을 보관하는 곳 { monthly: 차트, temp: 차트, pop: 차트 }
  const charts = {};

  // 차트 생성 함수
  // Chart.js는 같은 <canvas>에 새 차트를 그리기 전에 기존 차트를 destroy() 해야 함.
  // 안 하면 차트가 겹쳐 그려지고, 마우스를 올릴 때 옛날 데이터가 튀어나오는 버그가 생김.
  const make = (key, canvas, cfg) => {
    if (charts[key]) charts[key].destroy();   // 기존 차트가 있으면 지우고
    charts[key] = new Chart(canvas, cfg);     // 새로 만들어서 저장
  };


  // ===============================================================
  // render() : 화면 전체를 현재 regionId, year 기준으로 다시 그림
  // ===============================================================
  function render() {

    // 선택된 지역 데이터 1개 찾기 (Java의 stream().filter().findFirst() 와 비슷)
    const r = G.regions.find(x => x.id === regionId);

    // ---------------------------------------------------------------
    // 1) 지도 / 지역 정보 / 연도 버튼
    // ---------------------------------------------------------------

    // 타일맵: 지역별 연간 공급량으로 색을 칠함
    D.renderTileMap($('map'), {
      valueOf: x => x.supply,        // 색을 정할 기준값 = 공급량
      selected: r.id,                // 현재 선택된 지역 강조
      legendLabel: '연간 공급량',
      // 지도에서 지역을 클릭하면: 선택 지역 변경 → 저장 → 화면 다시 그리기
      onSelect: id => { regionId = id; D.setRegion(id); render(); }
    });

    // 지역 기본 정보 박스
    D.renderRegionInfo($('regionInfo'), r);

    // 연도 선택 버튼 (2021, 2022, ... 2026)
    // 2026년은 아직 끝나지 않은 해라서 '2026 (진행)'으로 표시
    D.renderPills(
      $('yearPills'),
      G.YEARS.map(y => ({ id: y, label: y === 2026 ? '2026 (진행)' : String(y) })),
      year,                                   // 현재 선택된 연도
      y => { year = y; render(); }            // 버튼 클릭 시: 연도 변경 → 다시 그리기
    );


    // ---------------------------------------------------------------
    // 2) KPI 카드 계산
    // ---------------------------------------------------------------
    // months : 선택 연도의 12개월 데이터 배열 [{ m: 0, value: 공급량, temp: 기온, forecast: 예측여부 }, ...]
    //          m 은 0부터 시작 (0 = 1월, 11 = 12월)
    const months = r.years[year];
    const prev = r.years[year - 1];   // 전년도 데이터 (2021년이면 없음 → undefined)

    // 배열의 value를 모두 더하는 함수
    // reduce: 배열을 돌면서 값을 하나로 누적 (for문으로 s += d.value 하는 것과 같음)
    const sum = a => a.reduce((s, d) => s + d.value, 0);

    // 연간 공급량 (단위: 백만㎥)
    const annual = sum(months);

    // 전년 대비 증감률(%) = (올해 - 작년) / 작년 × 100
    // 작년 데이터가 없으면 undefined → 카드에 '비교 데이터 없음' 표시
    const yoy = prev ? ((annual - sum(prev)) / sum(prev)) * 100 : undefined;

    // 겨울 비중(%) = (1월 + 2월 + 12월) / 연간 × 100
    // 배열 인덱스 0 = 1월, 1 = 2월, 11 = 12월
    const winter = ([0, 1, 11].reduce((s, i) => s + months[i].value, 0) / annual) * 100;

    // 1인당 공급량(㎥) - 단위 맞추기
    //   annual 은 '백만㎥' → × 1,000,000 해서 ㎥ 로
    //   r.pop  은 '만 명'  → × 10,000 해서 명 으로
    const perCap = (annual * 1e6) / (r.pop * 1e4);

    // 공급량이 가장 많은 달 찾기 (최댓값 찾기)
    const peak = months.reduce((a, d) => (d.value > a.value ? d : a));

    // 2026년은 실적 + 예측이 섞여 있음
    const partial = year === 2026;

    // KPI 카드 4개를 HTML 문자열로 만들어서 한 번에 넣기
    // D.kpi({...}) 는 카드 1개의 HTML을 만들어주는 공통 함수, join('')으로 이어 붙임
    $('kpis').innerHTML = [
      D.kpi({
        label: partial ? '연간 공급량 (실적+예측)' : '연간 공급량',
        value: fmt(annual),
        unit: '백만㎥',
        delta: yoy,                                             // 증감률 (↑↓ 표시)
        deltaLabel: yoy !== undefined ? '전년 대비' : '비교 데이터 없음'
      }),
      D.kpi({
        label: '겨울(12–2월) 비중',
        value: fmt(winter, 1),                                  // 소수 첫째 자리까지
        unit: '%',
        caption: '연간 공급량 중',
        accent: 'var(--season-winter)'                          // 겨울 색상으로 강조
      }),
      D.kpi({
        label: '1인당 공급량',
        value: fmt(perCap),
        unit: '㎥',
        caption: `인구 ${fmt(r.pop)}만 명 기준`                  // `...${변수}...` : 문자열 안에 변수 넣기 (템플릿 문자열)
      }),
      D.kpi({
        label: '피크 월',
        value: G.MONTHS[peak.m],                                // 0 → '1월' 로 변환
        caption: `${fmt(peak.value)} 백만㎥`
      })
    ].join('');


    // ---------------------------------------------------------------
    // 3) 월별 공급량 막대 차트 (계절별 색상)
    // ---------------------------------------------------------------
    $('monthlyTitle').textContent = `${year}년 월별 공급량`;

    // 예측 범례('연한 색 = 예측')는 2026년일 때만 보여줌
    $('legendForecast').hidden = !partial;

    make('monthly', $('monthlyChart'), {
      type: 'bar',
      data: {
        labels: G.MONTHS,                                        // x축: 1월 ~ 12월
        datasets: [{
          data: months.map(d => d.value),                        // y축: 월별 공급량
          // 막대 색: 계절 색상 사용. 예측값이면 '-soft'(연한 색)를 붙임
          //   예) 1월 실적 → '--season-winter', 11월 예측 → '--season-autumn-soft'
          backgroundColor: months.map(d => C(`--season-${G.season(d.m)}${d.forecast ? '-soft' : ''}`)),
          borderRadius: 3,          // 막대 모서리 둥글게
          maxBarThickness: 48       // 막대 최대 두께
        }]
      },
      options: {
        scales: {
          x: { grid: { display: false } },                                  // 세로 격자선 숨김
          y: { beginAtZero: true, ticks: { callback: v => fmt(v) } }        // y축 0부터, 숫자 포맷 적용
        },
        plugins: {
          // 마우스를 올렸을 때 나오는 말풍선 내용
          tooltip: {
            callbacks: {
              // 제목: '2025년 1월 · 겨울 · 평균 -2.4°C' (예측이면 ' · 예측' 추가)
              title: it => {
                const d = months[it[0].dataIndex];
                return `${year}년 ${d.m + 1}월 · ${G.SEASON_KO[G.season(d.m)]} · 평균 ${fmt(d.temp, 1)}°C${d.forecast ? ' · 예측' : ''}`;
              },
              // 내용: '1,234 백만㎥'
              label: it => `${fmt(it.raw)} 백만㎥`
            }
          }
        }
      }
    });


    // ---------------------------------------------------------------
    // 4) 기온 구간별 공급량 막대 차트 (12구간)
    // ---------------------------------------------------------------
    // bins : [{ label: '-10~-5', value: 일평균 공급량, days: 해당 구간 일수 }, ...] 12개
    //        인덱스 0 = 가장 추운 구간, 11 = 가장 따뜻한 구간
    const bins = r.tempBins;

    // 구간별 막대 색 정하기
    //   9 이상(따뜻함, 18°C 이상)  → 회색 (난방 수요 거의 없음)
    //   0~1 (매우 추움)            → 가장 진한 파랑
    //   2~4 (추움)                 → 중간 파랑
    //   5~8 (선선함)               → 연한 파랑
    const binColor = i => (i >= 9 ? C('--stone') : i <= 1 ? C('--seq-5') : i <= 4 ? C('--seq-4') : C('--seq-3'));

    make('temp', $('tempChart'), {
      type: 'bar',
      data: {
        labels: bins.map(b => b.label),                          // x축: 기온 구간
        datasets: [{
          data: bins.map(b => b.value),                          // y축: 일평균 공급량
          backgroundColor: bins.map((_, i) => binColor(i)),      // _ : 안 쓰는 값이라는 표시 (인덱스 i만 필요)
          borderRadius: 3
        }]
      },
      options: {
        scales: {
          // autoSkip: false → 라벨 12개 전부 표시, maxRotation: 0 → 글자 기울이지 않음
          x: { grid: { display: false }, ticks: { autoSkip: false, maxRotation: 0 } },
          y: { beginAtZero: true, ticks: { callback: v => fmt(v, 1) } }
        },
        plugins: {
          tooltip: {
            callbacks: {
              title: it => `${bins[it[0].dataIndex].label}°C 구간 · ${bins[it[0].dataIndex].days}일`,
              label: it => `일평균 ${fmt(it.raw, 1)} 백만㎥`
            }
          }
        }
      }
    });

    // 설명 박스: 가장 추운 구간이 가장 따뜻한 구간보다 몇 배 많이 쓰는지
    // 해당 기온의 날이 하루도 없는 구간(days = 0)은 제외하고 찾음
    const cold = bins.find(b => b.days > 0);                  // 앞에서부터 → 실제 존재하는 가장 추운 구간
    const warm = [...bins].reverse().find(b => b.days > 0);   // 뒤집어서 앞에서부터 → 가장 따뜻한 구간
    //   [...bins] : 배열 복사. reverse()는 원본을 바꾸기 때문에 복사본을 뒤집음
    //   Math.max(0.01, ...) : 따뜻한 구간 값이 0이면 나누기 오류가 나므로 최소 0.01로 막음
    $('tempCallout').innerHTML = D.callout(
      'blue',
      `가장 추운 구간(${cold.label}°C)은 가장 따뜻한 구간(${warm.label}°C) 대비 ${fmt(cold.value / Math.max(0.01, warm.value), 1)}배`,
      '18°C 이상은 난방 수요가 거의 없는 구간(회색)입니다.'
    );


    // ---------------------------------------------------------------
    // 5) 분기별 인구 추이 선 차트
    // ---------------------------------------------------------------
    // pop : [{ label: '2021 Q1', value: 인구(만 명) }, ...]
    const pop = r.popQ;

    make('pop', $('popChart'), {
      type: 'line',
      data: {
        labels: pop.map(p => p.label),
        datasets: [{
          data: pop.map(p => p.value),
          borderColor: C('--cat-3'),      // 선 색
          backgroundColor: '#fff',        // 점 안쪽 색 (흰색 → 속이 빈 점처럼 보임)
          borderWidth: 2,                 // 선 두께
          pointRadius: 2.5,               // 점 크기
          pointBorderWidth: 1.5,
          tension: 0.25                   // 선을 살짝 곡선으로 (0이면 직선)
        }]
      },
      options: {
        // 점 위가 아니라 세로줄 근처에만 마우스를 올려도 툴팁이 뜨게 함
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: {
            grid: { display: false },
            // 분기 라벨이 많아서 4개마다(= 1년마다) 하나씩만 표시, 나머지는 빈칸
            ticks: { autoSkip: false, maxRotation: 0, callback: (v, i) => (i % 4 === 0 ? pop[i].label : '') }
          },
          y: { ticks: { callback: v => fmt(v, 1) } }   // 인구는 변화폭이 작아서 0부터 시작하지 않음
        },
        plugins: {
          tooltip: { callbacks: { label: it => `${fmt(it.raw, 1)} 만 명` } }
        }
      }
    });

    // 전체 기간 인구 변화율(%) = (마지막 분기 - 첫 분기) / 첫 분기 × 100
    const chg = ((pop[pop.length - 1].value - pop[0].value) / pop[0].value) * 100;

    // 증가면 '+' 붙여서 표시 (감소는 숫자에 이미 '-'가 있음)
    // ⚠️ TODO: '공급량 상관 0.42'는 계산값이 아니라 고정된 숫자.
    //          지금은 어느 지역을 골라도 0.42로 나오므로, 지역별 실제 상관계수로 바꿔야 함
    $('popStats').innerHTML =
      `<div><span>기간 변화 </span><b>${chg >= 0 ? '+' : ''}${fmt(chg, 2)}%</b></div>` +
      `<div><span>공급량 상관 </span><b>0.42</b></div>`;

    // 새로 그린 HTML 안의 아이콘 표시 (공통 함수)
    D.icons();
  }


  // ---------------------------------------------------------------
  // 페이지 처음 열릴 때 실행
  // ---------------------------------------------------------------
  D.setRegion(regionId);   // 현재 지역 저장
  render();                // 첫 화면 그리기
})();