import fs from 'fs'; import { loadEarthNode } from './loadearth.mjs'; import * as sim from '../js/sim.js';
const map = await loadEarthNode('./data'); const places = JSON.parse(fs.readFileSync('data/places.json'));
for (const seed of [1,2,3,4]) { const S = sim.createState(map, { mode: 'real', seed, places }); const ev=[];
 for (let i=0;i<300;i++){ sim.step(S,map); } const succ=S.nations.filter(n=>n.gov==='후계 세력').length; const bigs=S.nations.filter(n=>n.real&&!n.alive).length; console.log(seed,'successor states',succ,'real nations dead',bigs); }
