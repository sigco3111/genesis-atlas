import { loadEarthNode } from './loadearth.mjs'; import * as sim from '../js/sim.js';
const map = await loadEarthNode('./data'); const S = sim.createState(map, { seed: 2, mode: 'emergent' });
for (let i=0;i<12000;i++) sim.step(S,map);
const o = JSON.parse(sim.serialize(S)); for (const k of Object.keys(o)) console.log(k, JSON.stringify(o[k]).length);
for (const k of Object.keys(o.P)) console.log(' P.'+k, JSON.stringify(o.P[k]).length);
console.log('nation0', JSON.stringify(o.nations[0]).length, o.nations.length, Object.keys(o.nations[5]).join());
