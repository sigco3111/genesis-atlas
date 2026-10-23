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
ok(seenArmies > 500, `부대 충분히 관찰 (${seenArmies})`);
ok(badInv === 0, `불변식 위반 0 (병력 0~7000·사기 0~1·중복 id·사라진 국가/전쟁 참조) 위반 ${badInv}`);
ok(moved > 150, `부대가 시간이 지나며 실제로 이동 (${moved})`);
ok(stuck === 0, `행군 중 40년 정지 부대 0 (${stuck})`);
console.log('   최대 병력', Math.round(maxMen));
console.log(fail ? 'FAILED ' + fail : 'ALL OK'); process.exit(fail ? 1 : 0);
