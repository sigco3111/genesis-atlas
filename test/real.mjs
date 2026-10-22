import fs from 'fs'; import { loadEarthNode } from './loadearth.mjs'; import * as sim from '../js/sim.js';
const map = await loadEarthNode('./data'); const places = JSON.parse(fs.readFileSync('data/places.json'));
let t=Date.now(); const S = sim.createState(map, { mode: 'real', seed: 1, places }); console.log('create ms', Date.now()-t, S.stats.alive, S.year);
for (let i=0;i<100;i++) sim.step(S,map); console.log('100y', Date.now()-t, S.stats.alive, S.wars.length);
