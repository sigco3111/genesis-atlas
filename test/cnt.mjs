import { loadEarthNode } from './loadearth.mjs'; import * as sim from '../js/sim.js';
const map = await loadEarthNode('./data'); const S = sim.createState(map, { seed: 2, mode: 'emergent' });
for (let i=0;i<12000;i++) sim.step(S,map);
const g={}; for (const n of S.nations) g[n.gov]=(g[n.gov]||0)+1; console.log(Object.entries(g).sort((a,b)=>b[1]-a[1]).slice(0,8));
const life=S.nations.filter(n=>!n.alive).map(n=>n.died-n.born).sort((a,b)=>a-b); console.log('dead',life.length,'median life',life[life.length>>1]);
const t={}; for(const l of S.log){const k=l.t.replace(/[^가-힣 ]/g,'').slice(-8);} 
