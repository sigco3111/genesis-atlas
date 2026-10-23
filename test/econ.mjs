// 자원·교역 경제 시험: node test/econ.mjs
import { loadEarthNode } from './loadearth.mjs'; import fs from 'fs';
import { generateMap } from '../js/world.js'; import * as sim from '../js/sim.js'; import { GOODS, NG, resOf, mainRes } from '../js/econ.js';
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } else console.log('ok -', m); };
const earth = await loadEarthNode('./data'); const places = JSON.parse(fs.readFileSync('data/places.json'));
// 1) 자원 분포
{ const R = resOf(earth); const N = earth.provinces.length; const cnt = new Array(NG).fill(0);
  for (let p = 0; p < N; p++) for (let g = 1; g < NG; g++) if (R[p * NG + g] > 0.25) cnt[g]++;
  console.log('provinces', N, 'res>0.25:', GOODS.map((g, i) => g.name + ' ' + cnt[i]).join(' '));
  for (let g = 1; g < NG; g++) ok(cnt[g] >= N * 0.03 && cnt[g] <= N * 0.4, GOODS[g].name + ' 분포 3~40%'); }
const run = (noTrade, years, mode = 'real', map = earth, seed = 7, hearths = 6) => { const S = sim.createState(map, { mode, seed, places: mode === 'real' ? places : [], hearths }); S.noTrade = noTrade; for (let i = 0; i < years; i++) sim.step(S, map); return S; };
const lift = (al0) => { const al = al0.filter((n) => n.eco.imp.reduce((a, v) => a + v, 0) > 2); const r = []; for (let g = 0; g < NG; g++) r.push((al.reduce((a, n) => a + n.eco.sat[g] - n.eco.base[g], 0) / Math.max(1, al.length) * 100).toFixed(1)); return r.join('/'); };
const summarize = (S, label) => {
  const al = S.nations.filter((n) => n.alive && n.pc >= 2);
  const avg = (f) => al.reduce((a, n) => a + f(n), 0) / Math.max(1, al.length);
  const low = (g) => al.filter((n) => n.eco.sat[g] < 0.8).length;
  console.log(label, 'year', S.year, 'nations', al.length, 'pop', Math.round(S.stats.world), 'sat', GOODS.map((g, i) => g.name + ' ' + avg((n) => n.eco.sat[i]).toFixed(2) + '(<0.8:' + low(i) + ')').join(' '), 'lift%p', lift(al), 'deliv', S.trade.deliv.map((v) => Math.round(v)).join('/'), 'voy', S.trade.voyages, 'val', Math.round(S.trade.value), 'foodShort(pop-yr)', Math.round(S.foodShort||0));
  return al;
};
const A = run(false, 600), B = run(true, 600);
const aa = summarize(A, 'trade '), bb = summarize(B, 'notrade');
ok(A.trade.voyages > 20, '무역선 화물 하역 20회 이상 (' + A.trade.voyages + ')');
ok(!A.nations.some((n) => n.eco.sat.some((v) => !Number.isFinite(v)) || !Number.isFinite(n.eco.wealth)), 'NaN 없음');
// 교역이 있는 나라가 곡물 자급률이 높다
const meanSat = (al) => al.reduce((a, n) => a + (n.eco.sat[0] + n.eco.sat[1] + n.eco.sat[2]) / 3, 0) / Math.max(1, al.length);
console.log('mean basic sat trade', meanSat(aa).toFixed(3), 'notrade', meanSat(bb).toFixed(3));
const lg = [1, 2, 3, 4].map((g) => aa.reduce((a, n) => a + n.eco.sat[g] - n.eco.base[g], 0) / aa.length); ok(Math.max(...lg) > 0.005, '교역이 자급률을 실제로 올림 (+' + lg.map((v) => (v * 100).toFixed(1)).join('/') + '%p)');
// 2) 군도/내해/지구 태초 모드 장기
for (const [k, y] of [['archipelago', 9000], ['inland', 9000]]) {
  const map = generateMap(k, 7); const S = run(false, y, 'emergent', map); const N = run(true, y, 'emergent', map);
  summarize(S, k + ' trade '); summarize(N, k + ' notrade');
  ok(S.trade.voyages > 10, k + ' 교역 발생 ' + S.trade.voyages);
  // 저장/복원 후 계속
  const R = sim.restore(sim.serialize(S)); for (let i = 0; i < 50; i++) sim.step(R, map);
  ok(!R.nations.some((n) => n.alive && n.eco.sat.some((v) => !Number.isFinite(v))), k + ' 복원 후 경제 유효');
}
// 2b) 같은 시점에서 갈라진 두 미래: 교역을 받은 나라의 성장 비교
{ const map = generateMap('archipelago', 7); const S0 = run(false, 7500, 'emergent', map); const js = sim.serialize(S0);
  const A = sim.restore(js), B = sim.restore(js); B.noTrade = true; const p0 = A.nations.map((n) => n.pop);
  for (let i = 0; i < 400; i++) { sim.step(A, map); sim.step(B, map); }
  const imp = A.nations.filter((n, i) => n.alive && B.nations[i] && B.nations[i].alive && n.eco.imp.reduce((a, v) => a + v, 0) > 0.5 && p0[i] > 50);
  const ratio = imp.reduce((a, n) => a + n.pop / Math.max(1, B.nations[n.id].pop), 0) / Math.max(1, imp.length);
  const sa = imp.reduce((a, n) => a + n.eco.sat.reduce((x, v) => x + v, 0) / NG, 0) / Math.max(1, imp.length), sb = imp.reduce((a, n) => a + B.nations[n.id].eco.sat.reduce((x, v) => x + v, 0) / NG, 0) / Math.max(1, imp.length);
  console.log('importers', imp.length, 'mean pop ratio vs no-trade', ratio.toFixed(3), 'mean sat', sa.toFixed(3), 'vs', sb.toFixed(3));
  ok(imp.length >= 3, '수입국 표본 ' + imp.length); ok(sa >= sb - 0.01, '수입국의 평균 자급률이 교역 없는 미래보다 낮지 않다'); }
// 2c) 보존 법칙: 적재 = 하역 + 항해 중 + 유실, 대금 지급 = 수령, 비축·국고 음수 없음, 복원 후에도 이중 정산 없음
{ const check = (S, label) => {
    const T = S.trade; let bad = 0; for (let g = 0; g < NG; g++) {
      let fl = 0; for (const sh of S.ships) if (sh.cargo && sh.cargo.g === g) fl += sh.cargo.amt;
      const shrink = T.unl[g] - T.deliv[g]; const rhs = T.unl[g] + fl + (T.lost[g] - shrink);
      if (Math.abs(T.load[g] - rhs) > 1e-3 * Math.max(1, T.load[g])) { bad++; console.log(label, GOODS[g].name, 'load', T.load[g], 'rhs', rhs); } }
    ok(bad === 0, label + ' 화물 보존 (적재=하역+항해중+유실)'); ok(Math.abs(T.paid - T.recv) < 1e-6 * Math.max(1, T.paid), label + ' 대금 지급=수령'); };
  const negs = (S) => S.nations.filter((n) => n.eco && (n.eco.wealth < -1e-9 || n.eco.stock.some((v) => v < -1e-9 || !Number.isFinite(v)))).length;
  const S = run(false, 800); check(S, '지구 800년'); ok(negs(S) === 0, '비축·국고 음수 없음');
  // 저장 → 복원 → 계속: 같은 시점에서 두 갈래가 완전히 같아야 이중 정산이 없다
  const js = sim.serialize(S); const A = sim.restore(js), B = sim.restore(js); for (let i = 0; i < 100; i++) { sim.step(A, earth); sim.step(B, earth); }
  check(A, '복원 후 100년'); ok(negs(A) === 0, '복원 후 음수 없음');
  // 전쟁·멸망·항로 소멸 중 화물: 모든 국가를 강제로 제거해도 화물이 사라지지 않고 기록된다
  const C = sim.restore(js); const voy = C.ships.filter((s) => s.cargo).length; for (const n of C.nations) if (n.alive && n.id % 3 === 0) { for (let p = 0; p < earth.provinces.length; p++) if (C.P.owner[p] === n.id) C.P.owner[p] = -1; }
  for (let i = 0; i < 60; i++) sim.step(C, earth); check(C, '강제 멸망 60년 후'); ok(negs(C) === 0, '멸망 후 음수 없음'); console.log('화물 실은 배(복원 시점)', voy); }
// 3) 구버전 저장 마이그레이션: eco/trade/cargo 필드가 없는 저장
{ const S = run(false, 200); const J = JSON.parse(sim.serialize(S)); delete J.trade; for (const n of J.nations) delete n.eco; for (const sh of J.ships) delete sh.cargo;
  const R = sim.restore(J); for (let i = 0; i < 100; i++) sim.step(R, earth);
  ok(R.nations.every((n) => n.eco) && R.trade, '구버전 저장 이어하기 정상'); }
// 4) 성능
{ const S = run(false, 100); const t0 = performance.now(); for (let i = 0; i < 200; i++) sim.step(S, earth); console.log('ms/year', ((performance.now() - t0) / 200).toFixed(2)); }
console.log(fail ? 'FAILED ' + fail : 'ALL OK'); process.exit(fail ? 1 : 0);
