import fs from 'fs'; import { loadEarthNode } from './loadearth.mjs'; import * as sim from '../js/sim.js';
const map = await loadEarthNode('./data'); const places = JSON.parse(fs.readFileSync('data/places.json'));
const S = sim.createState(map, { mode: 'real', seed: +process.argv[2]||1, places }); const a0=S.stats.alive;
for (let i=0;i<200;i++) sim.step(S,map);
console.log('alive',a0,'->',S.stats.alive,'wars now',S.wars.length,'year',S.year,'maxT',S.stats.maxT.toFixed(2));
console.log(S.log.filter(l=>l.i>=3).slice(0,12).map(l=>l.y+' '+l.t).join('\n'));
