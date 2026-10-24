// 부대 회귀 시험: 불변식 + 실제 이동 지속 + 옛 저장 기본값. node test/armyreg.mjs
import { loadEarthNode } from './loadearth.mjs'; import * as sim from '../js/sim.js';
import { ARMY_GLOBAL_MAX } from '../js/units.js';
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } else console.log('ok -', m); };
const map = await loadEarthNode('./data');
let moved = 0, seenArmies = 0, badInv = 0, maxMen = 0, mergeIncr = 0, stuck = 0;
for (const seed of [3, 7]) {
  const S = sim.createState(map, { mode: 'emergent', seed, hearths: 8, aggr: 2.5 });
  const last = new Map(), still = new Map();
  for (let y = 0; y < 1600; y++) {
    sim.step(S, map);
    const ids = new Set();
    for (const a of S.armies) {
      seenArmies++;
      if (ids.has(a.id)) badInv++; ids.add(a.id);
      if (!Number.isFinite(a.x + a.y + a.men) || a.men < 0 || a.men > 7000 + 1) badInv++;
      if ((a.mor != null && (a.mor < 0 || a.mor > 1.0001)) || (a.xp != null && a.xp < 0)) badInv++;
      if (!S.nations[a.nat] || !S.nations[a.nat].alive) badInv++;
      if (a.war != null && !S.wars.some((w) => w.id === a.war)) badInv++;
      maxMen = Math.max(maxMen, a.men);
      const p = last.get(a.id);
      if (p) { if (Math.hypot(p[0] - a.x, p[1] - a.y) > 0.5) { moved++; still.set(a.id, 0); } else { const c = (still.get(a.id) || 0) + 1; still.set(a.id, c); if (c === 40 && a.st === 'march') stuck++; } }
      last.set(a.id, [a.x, a.y]);
    }
  }
  const R = sim.restore(sim.serialize(S));
  for (const a of R.armies) { delete a.mor; delete a.xp; delete a.cmd; }
  delete R.fields;
  try { for (let i = 0; i < 30; i++) sim.step(R, map); ok(true, `seed ${seed}: 옛 저장(사기·경험·지휘관·전장흔적 없음) 30년 진행`); } catch (e) { ok(false, '옛 저장: ' + e.message); }
}

// 합류 보존·초과 거부 + 저장 동일성
{
  const { stepArmies } = await import('../js/units.js');
  let mergedN = 0, overflowN = 0, bad = 0;
  for (const seed of [3, 7, 11]) {
    const S = sim.createState(map, { mode: 'emergent', seed, hearths: 8, aggr: 2.5 });
    for (let i = 0; i < 2600; i++) { sim.step(S, map); if (i % 100 === 99 && [...S.fr.keys()].some((k) => S.nations[(k / 4096) | 0] && S.nations[(k / 4096) | 0].alive && S.nations[k % 4096] && S.nations[k % 4096].alive)) break; }
    let a = null, d = null; for (const [k] of S.fr) { const x = (k / 4096) | 0, y = k % 4096; const nx = S.nations[x], ny = S.nations[y]; if (nx && ny && nx.alive && ny.alive) { a = nx; d = ny; break; } }
    if (!a) continue; sim.startWar(S, map, a, d, 't'); const w = S.wars[S.wars.length - 1];
    for (let i = 0; i < 40 && !S.armies.length; i++) sim.step(S, map);
    for (const [m1, m2] of [[2000, 2500], [3600, 3600]]) {
      const R = S; R.armies = [];
      const P = map.provinces[a.cap];
      const mk = (id, men) => ({ id, nat: a.id, men, men0: men, x: P.ax, y: P.ay, path: null, dlen: 0, prog: 0, tgt: a.cap, home: a.cap, st: 'garrison', sg: 0, war: w.id, mor: 0.5, xp: 0.2 });
      R.armies.push(mk(9101, m1), mk(9102, m2));
      // 합류만 격리해 보려고 시험 단계에서는 새 편성을 막는다: 모든 수도 인구를 잠시 0으로 두면
      // 편성 조건(P.pop[cap] < men*2.5)이 막혀 적군 교전·아군 합류 끼어듦이 없어진다 (rng 무관하게 결정적)
      const P0 = R.P; const capList = R.nations.filter((n) => n && n.alive && n.cap >= 0).map((n) => n.cap);
      const popSave = capList.map((c) => P0.pop[c]); for (const c of capList) P0.pop[c] = 0;
      const before = m1 + m2; stepArmies(R, map);
      capList.forEach((c, i) => { P0.pop[c] = popSave[i]; });
      const mine = R.armies.filter((x) => x.id === 9101 || x.id === 9102 && x.men > 0).filter((x) => x.men > 0);
      const after = mine.reduce((s, x) => s + x.men, 0);
      if (before <= 7000) { if (mine.length === 1 && after >= before - 1e-6 && after - before < 800 && mine[0].men0 >= before && mine[0].mor > 0.5 && mine[0].mor <= 1) mergedN++; else bad++; }
      else { if (mine.length === 2 && after >= before - 1e-6 && after - before < 800) overflowN++; else bad++; }
    }
  }
  ok(mergedN >= 1 && bad === 0, `합류: 병력·men0 합 보존, 단일 부대화 (${mergedN}건), 위반 ${bad}`);
  ok(overflowN >= 1, `합류 상한 초과(7200>7000)는 합류 거부, 병력 불변 (${overflowN}건)`);
  // 저장/복원 동일성 + 이어서 진행 시 동일 전개
  const S = sim.createState(map, { mode: 'emergent', seed: 3, hearths: 8, aggr: 2.5 });
  for (let i = 0; i < 1500; i++) sim.step(S, map);
  const snap = (X) => JSON.stringify(X.armies.map((x) => [x.id, x.nat, Math.round(x.men), Math.round(x.x), Math.round(x.y), x.st, x.mor == null ? 1 : +x.mor.toFixed(3), x.xp || 0, x.cmd ? x.cmd.n : '']));
  const R2 = sim.restore(sim.serialize(S));
  ok(snap(R2) === snap(S) && R2.year === S.year && R2.wars.length === S.wars.length, '저장/복원 직후 부대·전쟁 상태 동일');
  for (let i = 0; i < 20; i++) { sim.step(S, map); sim.step(R2, map); }
  ok(snap(R2) === snap(S), '복원본이 이후 20년도 원본과 동일하게 전개 (부대 상태 일치)');
  const R3 = sim.restore(sim.serialize(S)); const before = R3.armies.map((x) => [x.id, x.men, x.x, x.y, x.st]);
  for (const x of R3.armies) { delete x.mor; delete x.xp; delete x.cmd; }
  const R4 = sim.restore(sim.serialize(R3));
  ok(JSON.stringify(R4.armies.map((x) => [x.id, x.men, x.x, x.y, x.st])) === JSON.stringify(before), '옛 형식 저장: 병력·위치·상태 보존, 새 필드는 기본값');
}
ok(seenArmies > 500, `부대 충분히 관찰 (${seenArmies})`);
ok(badInv === 0, `불변식 위반 0 (병력 0~7000·사기 0~1·중복 id·사라진 국가/전쟁 참조) 위반 ${badInv}`);
ok(moved > 150, `부대가 시간이 지나며 실제로 이동 (${moved})`);
ok(stuck === 0, `행군 중 40년 정지 부대 0 (${stuck})`);
console.log('   최대 병력', Math.round(maxMen));
console.log(fail ? 'FAILED ' + fail : 'ALL OK'); process.exit(fail ? 1 : 0);
