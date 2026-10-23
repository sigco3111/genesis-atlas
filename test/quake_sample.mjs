// v37 샘플 시험(배포 제외): 지진 권능 차별화 — 도시 집중 파괴 + 인구 피해 축소
import { generateMap } from '../js/world.js';
import * as sim from '../js/sim.js';
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } };
const map = generateMap('pangaea', 7);
const S = sim.createState(map, { mode: 'emergent', seed: 7, hearths: 6 });
for (let i = 0; i < 2000; i++) sim.step(S, map);
const P = S.P;
let city = -1, noCity = -1;
for (let p = 0; p < map.provinces.length; p++) {
  if (city < 0 && P.city[p] >= 3 && P.pop[p] > 500) city = p;
  if (noCity < 0 && P.city[p] === 0 && P.pop[p] > 500) noCity = p;
}
ok(city >= 0 && noCity >= 0, 'provinces found city=' + city + ' noCity=' + noCity);
// 1. 미리보기 문구가 도시 파괴 중심을 알린다
const a = sim.powerArea(S, map, 'quake', city);
ok(a.ok && a.expect.includes('도시') && a.expect.includes('12%'), 'quake expect text: ' + a.expect);
// 2. 도시 지방: 도시 2단계 붕괴, 인구는 약 -12%
{
  const pop0 = P.pop[city], c0 = P.city[city];
  const r = sim.applyPower(S, map, 'quake', city);
  ok(r.ok, 'quake ok');
  ok(c0 - P.city[city] === 2, 'city -2 levels (' + c0 + ' -> ' + P.city[city] + ')');
  const ratio = (pop0 - P.pop[city]) / pop0;
  ok(Math.abs(ratio - 0.12) < 0.005, 'pop loss ~12% (got ' + (ratio * 100).toFixed(1) + '%)');
  ok(r.diff.citiesLost === 2, 'diff citiesLost=2');
}
// 3. 도시 없는 지방: 도시 피해 없이 인구만
{
  const pop0 = P.pop[noCity];
  const r = sim.applyPower(S, map, 'quake', noCity);
  ok(r.ok && r.diff.citiesLost === 0, 'no-city: no city loss');
  ok(Math.abs((pop0 - P.pop[noCity]) / pop0 - 0.12) < 0.005, 'no-city pop -12%');
}
// 4. 이웃 지방은 무피해(단일 지방 정체성)
{
  const nb = map.provinces[city].land[0];
  const pop0 = P.pop[nb];
  sim.applyPower(S, map, 'quake', city);
  ok(Math.abs(P.pop[nb] - pop0) < 1, 'neighbor untouched');
}
console.log(fail ? 'FAILED ' + fail : 'ALL OK'); process.exit(fail ? 1 : 0);
