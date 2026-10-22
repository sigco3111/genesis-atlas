import fs from 'fs'; import { loadEarthNode } from './loadearth.mjs'; import * as sim from '../js/sim.js';
const map = await loadEarthNode('./data'); const places = JSON.parse(fs.readFileSync('data/places.json'));
for (const seed of [1,2,3]) { const S = sim.createState(map, { mode: 'real', seed, places }); let wars=0, conq=0; const seen=new Set();
 for (let i=0;i<150;i++){ sim.step(S,map); } 
 const L=S.log; const w=L.filter(l=>/선포/.test(l.t)).length, c=L.filter(l=>/점령/.test(l.t)).length;
 console.log(seed,'year',S.year,'declared(in kept log)',w,'captures',c,'logLen',L.length,'first war year',L.find(l=>/선포/.test(l.t))?.y,'alive',S.stats.alive); }
