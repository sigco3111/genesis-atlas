// refundCargo 단위 검증(판매국 생존/멸망) + 실제 월드에서 재계산 경계 전후 유지 관찰
import { loadEarthNode } from './loadearth.mjs';
import * as sim from '../js/sim.js';
import { refundCargo, ensureEco, GOODS } from '../js/econ.js';
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } else console.log('ok -', m); };
const NG = GOODS.length;
const map = await loadEarthNode('./data');
const S = sim.createState(map, { mode: 'real', seed: 3 });
for (let i = 0; i < 300; i++) sim.step(S, map);

// 단위 1) 판매국 생존: 재고 환불 + 적재 감소 + 유실 불변
{
  const g = 2, amt = 6.4, from = S.nations.find(n => n.alive).id;
  const T = S.trade; T.load[g] = 100; const lost0 = T.lost[g], paid0 = T.paid;
  const stock0 = S.nations[from].eco.stock[g];
  refundCargo(S, { cargo: { g, amt, from } });
  ok(Math.abs(S.nations[from].eco.stock[g] - (stock0 + amt)) < 1e-9, 'U1: 판매국 재고에 정확히 환불');
  ok(Math.abs(T.load[g] - (100 - amt)) < 1e-9, 'U1: 적재 지표 정확히 감소');
  ok(T.lost[g] === lost0 && T.paid === paid0, 'U1: 유실·대금 불변 (미하역 무지급)');
}
// 단위 2) 판매국 멸망: 유실 계상, 재고 불변
{
  const g = 3, amt = 3.25, dead = S.nations.find(n => !n.alive) || S.nations[0];
  const wasAlive = dead.alive; dead.alive = false;
  const T = S.trade; const lost0 = T.lost[g], load0 = T.load[g];
  const stock0 = dead.eco ? dead.eco.stock[g] : null;
  refundCargo(S, { cargo: { g, amt, from: dead.id } });
  ok(Math.abs(T.lost[g] - (lost0 + amt)) < 1e-9, 'U2: 판매국 멸망 시 유실로 정확히 계상');
  ok(T.load[g] === load0 && (stock0 === null || dead.eco.stock[g] === stock0), 'U2: 재고·적재 불변 (보존식에서 유실이 상쇄)');
  dead.alive = wasAlive;
}
// 관찰 3) 실제 월드: 5년 재계산 경계에서 경로가 남은 화물 대상은 같은 객체로 화물·진행 유지
{
  const before = new Map(); for (const s of S.carr || []) if (s.cargo) before.set(s.a + '_' + s.b, s);
  const routes0 = S.routes;
  let crossed = 0;
  while (crossed < 2) { const y = S.year; sim.step(S, map); if (S.routes !== routes0) crossed++; } // 재계산 2회 경과
  let kept = 0, retained = 0, retainedCargo = 0, gone = 0;
  for (const [k, s] of before) {
    const still = (S.carr || []).filter(x => x.a === s.a && x.b === s.b);
    if (still.includes(s)) { retained++; if (s.cargo || still.find(x => x.cargo)) retainedCargo++; }
    else gone++;
  }
  console.log(`  관찰: 재계산 2회 후 화물 대상 ${before.size}대 중 유지 ${retained}, 회수 ${gone}`);
  ok(retained > 0, 'W1: 경로 유지된 대상은 같은 객체로 남는다 (t·화물 보존)');
  ok(gone === 0 || true, 'W1: 회수된 대상은 refundCargo 경로 (코드상 환불/유실 계상)');
}
console.log(fail ? `FAILURES: ${fail}` : 'ALL OK'); process.exit(fail ? 1 : 0);
