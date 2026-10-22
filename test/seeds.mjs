import { loadEarthNode } from './loadearth.mjs'; import { generateMap } from '../js/world.js'; import * as sim from '../js/sim.js';
const earth = await loadEarthNode('./data'); const kind = process.argv[2] || 'earth'; const from = +process.argv[3] || 10; const to = +process.argv[4] || 16;
for (let seed = from; seed <= to; seed++) {
  const map = kind === 'earth' ? earth : generateMap(kind, seed); const S = sim.createState(map, { seed, mode: 'emergent' }); const cross = {}; let minAlive = 99, maxShare = 0;
  for (let i = 0; i < 12000; i++) { sim.step(S, map); const e = Math.floor(S.stats.maxT); if (!cross[e]) cross[e] = S.year; if (i > 500) minAlive = Math.min(minAlive, S.stats.alive); if (i % 200 === 0) { const al = S.nations.filter((n) => n.alive); const top = Math.max(0, ...al.map((n) => n.pop)) / (S.stats.world || 1); maxShare = Math.max(maxShare, top); } }
  console.log(kind, seed, 't5', cross[5], 't8', cross[8], 't9', cross[9], 'pop', (S.stats.world / 1e9).toFixed(2) + 'B', 'nations', S.stats.alive, 'minAlive', minAlive, 'maxShare', maxShare.toFixed(2), 'wars', S.wars.length);
}
