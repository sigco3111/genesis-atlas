import fs from 'fs'; import { loadEarthNode } from './loadearth.mjs'; import * as sim from '../js/sim.js';
const map = await loadEarthNode('./data'); const places = JSON.parse(fs.readFileSync('data/places.json'));
const S = sim.createState(map, { mode: 'real', seed: 1, places });
for (let i=0;i<=600;i++){ if(i%100==0) console.log(S.year,(S.stats.world/1e9).toFixed(2)+'B', 'deaths', JSON.stringify(S.deaths)); sim.step(S,map);} 
