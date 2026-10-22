import { loadEarthNode } from './loadearth.mjs'; import * as sim from '../js/sim.js';
const map = await loadEarthNode('./data'); const S = sim.createState(map, { seed: 3, mode: 'emergent' });
for (let i=0;i<3000;i++) sim.step(S,map);
const R = sim.restore(sim.serialize(S));
for (let i=0;i<5;i++){ sim.step(S,map); sim.step(R,map); console.log(S.year,S.stats.alive,R.stats.alive,S.stats.world.toFixed(0),R.stats.world.toFixed(0),S.wars.length,R.wars.length); }
console.log(S.year,R.year,S.stats.world.toFixed(0),R.stats.world.toFixed(0),S.stats.alive,R.stats.alive, S.log.length,R.log.length);
