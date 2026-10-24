// 지도 라벨 배치 계획 테스트: 줌 단계별 예산, 충돌 회피, 추적 국가(force) 우선
import { planLabels, nationBudget, cityBudget, planArmyLabels } from '../js/labels.js';
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

// 6) 부대 라벨: 칩 상자 회피 — 위아래로 가까운 두 부대의 라벨이 칩·서로와 겹치지 않음
{
  const opts = { chipW: 30, chipUp: 18, chipDown: 11, downY: 23, upY: 25, gapY: 10.5 };
  const items = [
    { id: 1, x: 100, y: 100, w: 30, size: 10, men: 5000, tx: '5.0k' },
    { id: 2, x: 104, y: 130, w: 30, size: 10, men: 3000, tx: '3.0k' },
  ];
  const placed = planArmyLabels(items, opts);
  ok(placed.length === 2, '가까운 두 부대 모두 라벨 배치 (got ' + placed.length + ')');
  const boxesOverlap = (a, b) => !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]);
  const labBox = (q) => [q.x - 17, q.y - 6, q.x + 17, q.y + 6];
  const chipBox = (it) => [it.x - 15, it.y - 18, it.x + 15, it.y + 11];
  let clean = true;
  for (const q of placed) for (const it of items) if (boxesOverlap(labBox(q), chipBox(it))) clean = false;
  if (placed.length === 2 && boxesOverlap(labBox(placed[0]), labBox(placed[1]))) clean = false;
  ok(clean, '부대 라벨이 칩·다른 라벨과 겹치지 않음');
}

// 7) 밀집 + 예산: 큰 부대만 남고 추적 부대는 예산 밖에서 항상 배치
{
  const items = [];
  for (let i = 0; i < 8; i++) items.push({ id: i, x: i * 120, y: 100, w: 30, size: 10, men: (8 - i) * 1000, tx: String(i) });
  items.push({ id: 99, x: 60, y: 400, w: 30, size: 10, men: 10, follow: true, tx: 'F' });
  const placed = planArmyLabels(items, { budget: 5 });
  ok(placed.length === 6, '예산 5 + 추적 1 = 6개 (got ' + placed.length + ')');
  ok(placed.some((q) => q.id === 99 && q.follow), '가장 작아도 추적 부대는 배치');
  ok(placed.filter((q) => !q.follow).every((q) => q.id < 5), '예산 안에서는 큰 부대부터');
}

// 8) 추적 부대는 모든 자리가 막혀도 첫 자리에 강제 배치, 일반 부대는 생략
{
  const opts = { chipW: 30, chipUp: 18, chipDown: 11, downY: 23, upY: 25, gapY: 10.5 };
  const items = [
    { id: 1, x: 100, y: 100, w: 30, size: 10, men: 100, follow: true, tx: 'F' },
    { id: 2, x: 100, y: 135, w: 30, size: 10, men: 9000, tx: 'B' }, // id1의 아래 후보 3곳을 막는 칩
    { id: 3, x: 100, y: 72, w: 30, size: 10, men: 8000, tx: 'C' }, // id1의 위 후보 2곳을 막는 칩
    { id: 4, x: 100, y: 170, w: 30, size: 10, men: 7000, tx: 'D' }, // id2의 아래 후보까지 막는 칩
  ];
  const placed = planArmyLabels(items, opts);
  const f = placed.find((q) => q.id === 1);
  ok(f && f.y === 123, '추적 부대는 막혀도 첫 자리에 강제 배치 (got ' + (f && f.y) + ')');
  ok(!placed.some((q) => q.id === 2), '자리 없는 일반 부대는 라벨 생략');
}

console.log(fails ? fails + ' failures' : 'all label tests passed');
process.exit(fails ? 1 : 0);
