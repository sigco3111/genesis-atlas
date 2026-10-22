import { loadEarthNode } from './loadearth.mjs'; import { generateMap } from '../js/world.js'; import * as sim from '../js/sim.js';
const kind = process.argv[2] || 'earth'; const years = +process.argv[3] || 12000; const seed = +process.argv[4] || 1;
let t0 = Date.now();
const map = kind === 'earth' || kind === 'real' ? await loadEarthNode('./data') : generateMap(kind, seed);
console.log('map', kind, 'provinces', map.provinces.length, 'edges', map.edges.length, 'ms', Date.now() - t0);
const S = sim.createState(map, { seed, mode: kind === 'real' ? 'real' : 'emergent', hearths: 6 });
t0 = Date.now();
const cross = {}; const techRate = +process.argv[5] || 1; S.techRate = techRate;
for (let i = 0; i < years; i++) { sim.step(S, map); { const e = Math.floor(S.stats.maxT); if (!cross[e]) { cross[e] = S.year; } } if (i % 1000 === 999 || i === years - 1) { const st = S.stats; console.log(S.year, 'pop', (st.world / 1e6).toFixed(1) + 'M', 'nations', st.alive, 'maxT', st.maxT.toFixed(2), 'wars', S.wars.length, 'cultures', S.cultures.length, 'cities', S.P.city.filter((x) => x > 0).length, 'owned', S.P.owner.filter((o) => o >= 0).length, 'ms', Date.now() - t0); } }
console.log('era crossings', JSON.stringify(cross));
const ser = sim.serialize(S); console.log('save bytes', ser.length); const R = sim.restore(ser); sim.step(R, map);
console.log('log', S.log.length, S.log.filter((l) => l.i >= 3).slice(-8).map((l) => l.y + ' ' + l.t).join('\n'));
