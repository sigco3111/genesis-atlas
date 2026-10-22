// v27 권능 미리보기/결과 요약 시험: node test/powers.mjs
import { loadEarthNode } from './loadearth.mjs';
import { generateMap } from '../js/world.js';
import * as sim from '../js/sim.js';
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } };
const map = generateMap('pangaea', 7);
const S = sim.createState(map, { mode: 'emergent', seed: 7, hearths: 6 });
for (let i = 0; i < 1500; i++) sim.step(S, map);
ok(S.stats.alive > 1, 'nations alive');
const P = S.P;
// 유효 대상/무효 대상 찾기
let owned = -1, empty = -1, city = -1;
for (let p = 0; p < map.provinces.length; p++) {
  if (owned < 0 && P.owner[p] >= 0 && P.pop[p] > 100) owned = p;
  if (empty < 0 && P.owner[p] < 0 && P.pop[p] < 2 && map.provinces[p].fert > 0.4) empty = p;
  if (city < 0 && P.city[p] >= 2) city = p;
}
ok(owned >= 0 && empty >= 0, 'test provinces found (owned=' + owned + ' empty=' + empty + ')');
// 1. powerArea: 범위와 유효성
const aBless = sim.powerArea(S, map, 'bless', owned);
ok(aBless.ok && aBless.provs.length >= 1 && aBless.provs[0] === owned, 'bless area center first');
ok(typeof aBless.expect === 'string' && aBless.expect.length > 3, 'bless expect text');
const aTribeBad = sim.powerArea(S, map, 'tribe', owned);
ok(!aTribeBad.ok && aTribeBad.msg.length > 0, 'tribe on owned land invalid');
const aTribe = sim.powerArea(S, map, 'tribe', empty);
ok(aTribe.ok, 'tribe on empty fertile valid');
const aHero = sim.powerArea(S, map, 'hero', owned);
ok(aHero.ok && aHero.nation === P.owner[owned] && aHero.provs.length >= 1, 'hero nation-wide area');
// 2. applyPower diff: 운석은 인구 감소를 정확히 보고해야 한다
if (city >= 0) {
  const before = P.pop[city], cBefore = P.city[city];
  const r = sim.applyPower(S, map, 'meteor', city);
  ok(r.ok, 'meteor ok');
  ok(r.diff && r.diff.popLost > 0, 'meteor popLost > 0');
  ok(r.diff.popLost >= before - P.pop[city] - 1, 'meteor popLost covers center loss');
  const ctr = r.diff.provs.find((x) => x.p === city);
  ok(ctr && ctr.pop0 === Math.round(before) && ctr.pop1 === Math.round(P.pop[city]), 'meteor center before/after exact');
  ok(r.diff.citiesLost === Math.max(0, cBefore - P.city[city]), 'meteor citiesLost matches');
  ok(r.diff.events.length >= 1, 'meteor logged event');
} else ok(false, 'no city province for meteor test');
// 3. 영웅: 안정도 상승이 국가 diff 에 보여야 한다
{
  const n = S.nations[P.owner[owned]]; const s0 = n.stab;
  const r = sim.applyPower(S, map, 'hero', owned);
  ok(r.ok, 'hero ok');
  const dn = r.diff.nations.find((x) => x.id === n.id);
  ok(dn && dn.stab1 > dn.stab0 && Math.abs(dn.stab0 - s0) < 1e-6, 'hero stab diff reported');
}
// 4. 전쟁의 불씨: 전쟁 로그 이벤트가 diff 에 잡혀야 한다
{
  const r = sim.applyPower(S, map, 'war', owned);
  if (r.ok) { ok(r.diff.events.some((e) => e.includes('전쟁')), 'war event captured'); ok(r.diff.warsDelta >= 1, 'war started counted'); }
  else ok(r.msg.length > 0, 'war refused with msg');
}
// 5. 새 부족: 새 국가 탄생 보고
{
  const r = sim.applyPower(S, map, 'tribe', empty);
  ok(r.ok, 'tribe ok');
  ok(r.diff.newNation && r.diff.popGained >= 100, 'tribe new nation + population reported');
}
// 6. 무효 대상은 ok=false 이고 세계를 바꾸지 않는다
{
  const y = S.log.length; const r = sim.applyPower(S, map, 'tribe', owned);
  ok(!r.ok && S.log.length === y, 'invalid power no side effects');
}
// 7. 저장/복원 후에도 권능 정상
{
  const R = sim.restore(sim.serialize(S));
  for (const k of Object.keys(sim.POWERS)) { const r = sim.applyPower(R, map, k, owned); ok(typeof r.ok === 'boolean' && r.diff !== undefined, 'restored power ' + k + ' has diff'); }
}
console.log(fail ? 'FAILED ' + fail : 'ALL OK'); process.exit(fail ? 1 : 0);
