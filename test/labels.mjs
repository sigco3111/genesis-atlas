// 지도 라벨 배치 계획 테스트: 줌 단계별 예산, 충돌 회피, 추적 국가(force) 우선
import { planLabels, nationBudget, cityBudget } from '../js/labels.js';
let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.error('FAIL', msg); } else console.log('ok', msg); };
const cand = (t, x, y, opts = {}) => ({ t, x, y, size: opts.size || 12, w: opts.w || 40, big: opts.big || 1, force: !!opts.force });

// 1) 줌 단계별 예산 구간
ok(nationBudget(1.0) === 8 && nationBudget(2.0) === 14 && nationBudget(3.0) === 24 && nationBudget(5.0) === 40 && nationBudget(9) === 80, '국가 라벨 예산 단계');
ok(cityBudget(1.0) === 0 && cityBudget(2.0) === 4 && cityBudget(3.0) === 10 && cityBudget(5.0) === 18 && cityBudget(9) === 40, '도시 라벨 예산 단계 (저확대 0)');

// 2) 예산 초과 시 큰 나라 우선
{
  const cs = []; for (let i = 0; i < 30; i++) cs.push(cand('n' + i, i * 200, 0, { big: i }));
  const placed = planLabels(cs, 8);
  ok(placed.length === 8, '예산 8 → 8개만 배치 (got ' + placed.length + ')');
  ok(placed[0].t === 'n29' && placed[7].t === 'n22', '큰 나라부터 배치');
}

// 3) 겹치는 라벨은 하나만
{
  const placed = planLabels([cand('a', 100, 100, { big: 5 }), cand('b', 110, 105, { big: 1 }), cand('c', 500, 100, { big: 1 })], 10);
  ok(placed.length === 2 && placed.some((p) => p.t === 'a') && placed.some((p) => p.t === 'c'), '겹침 회피: 큰 쪽 생존');
}

// 4) 추적 국가(force): 가장 작아도 예산 밖에서도 배치, 예산 소모 없음, 최우선 충돌 우선권
{
  const cs = []; for (let i = 0; i < 20; i++) cs.push(cand('n' + i, i * 200, 0, { big: 100 - i }));
  cs.push(cand('tracked', 0, 0, { big: 0, force: true }));
  const placed = planLabels(cs, 8);
  ok(placed.length === 9 && placed[0].t === 'tracked', '추적 국가는 예산과 무관하게 배치');
}
{
  const placed = planLabels([cand('big', 100, 100, { big: 99 }), cand('tracked', 105, 102, { big: 0, force: true })], 10);
  ok(placed.length === 1 && placed[0].t === 'tracked', '추적 국가가 큰 나라와 겹치면 추적 국가 우선');
}

// 5) 전부 겹쳐도 force는 최소한 자리 확보 시도 (비어 있으면 배치)
{
  const placed = planLabels([cand('tracked', 50, 50, { force: true })], 0);
  ok(placed.length === 1, '예산 0이어도 추적 국가는 배치');
}

console.log(fails ? fails + ' failures' : 'all label tests passed');
process.exit(fails ? 1 : 0);
