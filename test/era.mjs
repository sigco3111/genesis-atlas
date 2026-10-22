// 시대별 시나리오 스모크: node test/era.mjs
import { loadEarthNode } from './loadearth.mjs'; import fs from 'fs';
import * as sim from '../js/sim.js';
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } };
const base = await loadEarthNode('./data');
const eras = fs.readdirSync('./data/era').filter((f) => f.endsWith('.json')).map((f) => parseInt(f));
for (const y of eras) {
  const era = JSON.parse(fs.readFileSync(`./data/era/${y}.json`));
  const map = structuredClone(base);
  map.countries = era.countries;
  era.owner.forEach((c, i) => { map.provinces[i].c = c; });
  const S = sim.createState(map, { mode: 'real', seed: 7, places: [], startYear: era.year, eraLabel: era.label });
  try { for (let i = 0; i < 300; i++) { sim.step(S, map); if (S.auto) sim.autoGod(S, map); } } catch (e) { ok(false, `era ${y} exception ${e.stack}`); continue; }
  for (const key of ['pop', 'tech', 'unrest']) ok(!S.P[key].some((v) => !Number.isFinite(v)), `era ${y} NaN in ${key}`);
  ok(S.stats.world > 0, `era ${y} world pop > 0`);
  ok(S.stats.alive > 3, `era ${y} nations alive (${S.stats.alive})`);
  const R = sim.restore(sim.serialize(S));
  try { for (let i = 0; i < 20; i++) sim.step(R, map); } catch (e) { ok(false, `era ${y} restore ${e.message}`); }
  console.log('era', y, 'ok -> year', S.year, 'pop', Math.round(S.stats.world), 'nations', S.stats.alive);
}
console.log(fail ? 'FAILED ' + fail : 'ALL OK'); process.exit(fail ? 1 : 0);
