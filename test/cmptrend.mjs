// 비교 추이 모듈(js/cmptrend.js) 단위 검사: 같은 기간 증감·지표 추출·구형 기록 호환
import { METRICS, metricVal, valueAt, commonWindow, changeOf, changeDir, fmtChange, seriesOf, chartMax } from '../js/cmptrend.js';
import { generateMap } from '../js/world.js'; import * as sim from '../js/sim.js';
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } else console.log('ok -', m); };

// 지표 추출
ok(METRICS.length === 3, 'three metrics');
ok(metricVal([100, 5000, 12, 0.7], 'pop') === 5000, 'pop from 4-element point');
ok(metricVal([100, 5000, 12, 0.7], 'pc') === 12, 'pc from 4-element point');
ok(metricVal([100, 5000, 12, 0.7], 'stab') === 0.7, 'stab from 4-element point');
ok(metricVal([100, 5000, 12], 'stab') === null, 'stab missing in legacy 3-element point');
ok(metricVal([100, 5000, 12], 'pop') === 5000, 'pop still works in legacy point');

// valueAt: year 이하 최근 값, 기록 없는 점은 건너뜀
const h = [[0, 100, 1], [10, 200, 2, 0.6], [20, 300, 3, 0.8]];
ok(valueAt(h, 5, 'pop') === 100, 'valueAt picks earlier point');
ok(valueAt(h, 25, 'pc') === 3, 'valueAt picks latest within year');
ok(valueAt(h, 5, 'stab') === null, 'stab null before first stab record');
ok(valueAt(h, 15, 'stab') === 0.6, 'stab after first stab record');
ok(valueAt(null, 15, 'pop') === null, 'null hist safe');

// commonWindow: 겹치는 구간만
const A = [[0, 100, 1, 0.5], [10, 150, 2, 0.55], [20, 300, 4, 0.6]];
const B = [[10, 200, 2, 0.7], [20, 160, 1, 0.4]];
let w = commonWindow(A, B, 'pop');
ok(w && w.y0 === 10 && w.y1 === 20, 'common window is the overlap 10..20');
ok(w.a0 === 150 && w.a1 === 300 && w.b0 === 200 && w.b1 === 160, 'window endpoint values');
ok(commonWindow([[0, 1, 1, 0.5]], [[10, 2, 1, 0.5]], 'pop') === null, 'single points, no window');
ok(commonWindow([[0, 1, 1]], [[0, 1, 1]], 'stab') === null, 'no stab records anywhere');
// 구형 기록이 앞부분에 섞여 있으면 안정도 창은 뒤로 밀린다
const C = [[0, 100, 1], [10, 150, 2, 0.5], [20, 200, 3, 0.6]];
const D = [[0, 100, 1], [10, 120, 2, 0.7], [20, 140, 3, 0.65]];
w = commonWindow(C, D, 'stab');
ok(w && w.y0 === 10 && w.y1 === 20, 'legacy gap shifts stab window forward');

// 증감 계산과 표기
ok(changeDir(changeOf('pop', 100, 145)) === 45, 'pop pct +45');
ok(changeDir(changeOf('pop', 100, 60)) === -40, 'pop pct -40');
ok(fmtChange(changeOf('pc', 10, 14)) === '+4 지방 (+40%)', 'pc format with pct');
ok(fmtChange(changeOf('pc', 14, 10)) === '-4 지방 (-29%)', 'pc negative format');
ok(fmtChange(changeOf('stab', 0.5, 0.62)) === '+12%p', 'stab pp format');
ok(fmtChange(changeOf('stab', 0.62, 0.5)) === '-12%p', 'stab negative pp');
ok(fmtChange(changeOf('pop', 0, 500)) === '새로 생김', 'zero-to-positive is new');
ok(fmtChange(null) === '—', 'missing change is dash');
ok(changeOf('pop', 0, 0) === null, 'zero-to-zero has no change');

// seriesOf / chartMax
ok(seriesOf(h, 'stab').length === 2, 'seriesOf skips legacy points without stab');
ok(chartMax('stab', [[0, 0.2]], [[0, 0.9]]) === 1, 'stab chart fixed to 1');
ok(chartMax('pop', [[0, 500]], [[0, 900]]) === 900, 'pop chart auto max');

// 실제 시뮬레이션 통합: 두 생존 국가의 세 지표 창이 모두 잡힌다
const map = generateMap('twin', 21);
const S = sim.createState(map, { seed: 21, mode: 'emergent', hearths: 8, aggr: 1.5 });
for (let i = 0; i < 3000; i++) sim.step(S, map);
const two = S.nations.filter((n) => n.alive && n.hist.length >= 5).slice(0, 2);
ok(two.length === 2, 'two long-lived nations for integration check');
if (two.length === 2) {
  for (const [k] of METRICS) {
    const w2 = commonWindow(two[0].hist, two[1].hist, k);
    ok(w2 && w2.y1 > w2.y0, `sim window exists for ${k}`);
  }
}
console.log(fail ? 'FAILED ' + fail : 'ALL OK');
process.exit(fail ? 1 : 0);
