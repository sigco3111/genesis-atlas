import { loadEarthNode } from './loadearth.mjs'; import * as sim from '../js/sim.js';
const map = await loadEarthNode('./data'); const S = sim.createState(map, { seed: 2, mode: 'emergent' });
let prev=1; const born={};
for (let i=0;i<8000;i++){ sim.step(S,map); const n=S.nations.length; for(let k=prev;k<n;k++){ const g=S.nations[k].gov; born[g]=(born[g]||0)+1;} prev=n; }
console.log(born, S.nations.length);
const c={}; for(const l of S.log){ const m=l.t.match(/(봉기|내전|분열|독립|새 부족|정착|건국|세력)/); if(m) c[m[1]]=(c[m[1]]||0)+1;} console.log(c, S.log.length);
