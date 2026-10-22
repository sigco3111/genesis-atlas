// 전 지도/모드 스모크 시험: node test/smoke.mjs  (예외, NaN, 저장/복원 불일치 검사)
import { loadEarthNode } from './loadearth.mjs'; import fs from 'fs';
import { generateMap, MAP_KINDS } from '../js/world.js'; import * as sim from '../js/sim.js';
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } };
const earth = await loadEarthNode('./data'); const places = JSON.parse(fs.readFileSync('data/places.json'));
for (const k of MAP_KINDS) for (const mode of k.id === 'earth' ? ['emergent', 'real'] : ['emergent']) {
  const map = k.id === 'earth' ? earth : generateMap(k.id, 7);
  const S = sim.createState(map, { mode, seed: 7, places: mode === 'real' ? places : [] });
  const years = mode === 'real' ? 300 : 2500;
  try { for (let i = 0; i < years; i++) { sim.step(S, map); if (i % 50 === 0 && S.auto === false) S.auto = true; if (S.auto) sim.autoGod(S, map); } } catch (e) { ok(false, `${k.id}/${mode} exception ${e.stack}`); continue; }
  for (const key of ['pop', 'tech', 'unrest']) ok(!S.P[key].some((v) => !Number.isFinite(v)), `${k.id}/${mode} NaN in ${key}`);
  ok(S.stats.world > 0, `${k.id}/${mode} world pop > 0`);
  const R = sim.restore(sim.serialize(S)); try { for (let i = 0; i < 20; i++) sim.step(R, map); } catch (e) { ok(false, `${k.id}/${mode} restore step ${e.message}`); }
  for (const p of Object.keys(sim.POWERS)) { const r = sim.applyPower(R, map, p, 100); ok(typeof r.ok === 'boolean', 'power ' + p); }
  console.log(k.id, mode, 'ok year', S.year, 'pop', Math.round(S.stats.world), 'nations', S.stats.alive);
}
console.log(fail ? 'FAILED ' + fail : 'ALL OK'); process.exit(fail ? 1 : 0);
