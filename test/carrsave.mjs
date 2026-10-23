// 대상(육상 짐마차) 저장/복원 + 환불/손실 회계 검증
import { loadEarthNode } from './loadearth.mjs';
import * as sim from '../js/sim.js';
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } else console.log('ok -', m); };

const map = await loadEarthNode('./data');
const S = sim.createState(map, { mode: 'real', seed: 3 });
for (let i = 0; i < 600; i++) sim.step(S, map);
console.log(`year ${S.year} caravans ${S.carr.length} withCargo ${S.carr.filter(s=>s.cargo).length} landRoutes ${S.routes.filter(r=>!r[2]).length} delivL voyL=${S.trade.voyL}`);

// 1) 화물 실은 대상이 있는 상태에서 저장/복원
const withCargo = S.carr.filter(s => s.cargo);
ok(withCargo.length > 0, '화물 실은 대상 존재 (전제)');
const before = withCargo.map(s => ({a:s.a,b:s.b,t:s.t,dir:s.dir,g:s.cargo.g,amt:s.cargo.amt,from:s.cargo.from}));
const json = sim.serialize(S);
const R = sim.restore(json);
const rw = R.carr.filter(s => s.cargo);
ok(R.carr.length === S.carr.length, `복원 후 대상 수 동일 (${R.carr.length}===${S.carr.length})`);
ok(rw.length === withCargo.length, `복원 후 화물 대상 수 동일 (${rw.length}===${withCargo.length})`);
let match = true;
for (const b of before) {
  const s = R.carr.find(x => x.a===b.a && x.b===b.b && x.t===b.t && x.dir===b.dir);
  if (!s || !s.cargo || s.cargo.g!==b.g || s.cargo.amt!==b.amt || s.cargo.from!==b.from) { match = false; console.log('  mismatch', JSON.stringify(b)); }
}
ok(match, '화물 품목·수량·판매국·진행률·방향 모두 복원 일치');

// 2) 복원본을 10년 진행: 대상 운행 계속, 하역 계속
const voyL0 = R.trade.voyL || 0;
for (let i = 0; i < 10; i++) sim.step(R, map);
ok(R.carr.length >= 0 && Number.isFinite(R.trade.voyL), '복원 후 진행 무사고');
console.log(`  after+10y voyL ${voyL0} -> ${R.trade.voyL}`);

// 3) 국가 멸망 시 회계: 대상 경로의 한쪽 국가를 죽이고 5년 재계산 경과
const S2 = sim.restore(sim.serialize(S));
const carr2 = S2.carr.filter(s=>s.cargo);
if (carr2.length) {
  const s0 = carr2[0];
  const sellerId = s0.cargo.from, amt0 = s0.cargo.amt, g0 = s0.cargo.g;
  const victim = S2.P.owner[s0.b]; // 도착지 국가를 멸망시킴
  const seller = S2.nations[sellerId];
  const stock0 = seller && seller.eco ? seller.eco.stock[g0] : null;
  const lost0 = S2.trade.lost[g0], load0 = S2.trade.load[g0];
  const vic = S2.nations[victim];
  if (vic) { vic.alive = false; for (let p=0;p<S2.P.owner.length;p++) if (S2.P.owner[p]===victim) S2.P.owner[p] = -1; }
  for (let i = 0; i < 8; i++) sim.step(S2, map); // 5년 재계산 1회 이상 경과
  const stillThere = S2.carr.filter(s => s.a===s0.a && s.b===s0.b).length;
  ok(stillThere === 0, '멸망 국가 경로의 대상 회수됨');
  const dStock = seller && seller.eco ? seller.eco.stock[g0] - stock0 : NaN;
  const dLost = S2.trade.lost[g0] - lost0, dLoad = S2.trade.load[g0] - load0;
  console.log(`  seller stock Δ${dStock?.toFixed?.(2)} (amt ${amt0.toFixed(2)}) lost Δ${dLost.toFixed(2)} load Δ${dLoad.toFixed(2)}`);
  const refunded = Math.abs(dStock - amt0) < 1e-6 && Math.abs(dLoad + amt0) < 1e-6;
  const lossAccounted = Math.abs(dLost - amt0) < 1e-6;
  ok(refunded || lossAccounted, '화물이 판매국 재고로 환불되거나(판매국 생존) 손실 계상(판매국 멸망) — 증발/중복 없음');
}
console.log(fail ? `FAILURES: ${fail}` : 'ALL OK');
process.exit(fail ? 1 : 0);
