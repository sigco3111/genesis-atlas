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
// 유효 대상/무효 대상 찾기 (세계 진행에 따라 빈 땅이 없을 수 있어 더 돌려 가며 탐색)
let owned = -1, empty = -1, city = -1;
const find = () => {
  for (let p = 0; p < map.provinces.length; p++) {
    if (owned < 0 && P.owner[p] >= 0 && P.pop[p] > 100) owned = p;
    if (empty < 0 && P.owner[p] < 0 && P.pop[p] <= 5 && map.provinces[p].fert >= 0.05) empty = p;
    if (city < 0 && P.city[p] >= 2 && P.owner[p] >= 0) city = p;
  }
};
find();
for (let t = 0; empty < 0 && t < 4; t++) { for (let i = 0; i < 1500; i++) sim.step(S, map); owned = -1; city = -1; find(); }
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
  const nid = P.owner[owned];
  const r = sim.applyPower(S, map, 'war', owned);
  if (r.ok) { // 이미 그 이웃과 전쟁 중이면 startWar는 조용히 넘어간다 — 권능 자체는 관계 악화·휴전 해제를 수행
    ok(r.diff.events.some((e) => e.includes('전쟁')) || r.diff.warsDelta >= 1 || S.wars.some((w) => w.A.includes(nid) || w.D.includes(nid)), 'war event captured or already at war');
  }
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
// 8. v37 권능 다양화: 풍요의 비는 인구 증가를 보고한다
{
  const r = sim.applyPower(S, map, 'bless', owned);
  ok(r.ok && r.diff.popGained > 0, 'bless popGained > 0');
  ok(P.fx[owned] > 1, 'bless fx raised');
}
// 9. 가뭄은 2단계 넓은 범위다
{
  const aDry = sim.powerArea(S, map, 'drought', owned);
  const aBl = sim.powerArea(S, map, 'bless', owned);
  ok(aDry.ok && aDry.shape === 'wide' && aDry.provs.length >= aBl.provs.length, 'drought wide area (' + aDry.provs.length + ' vs bless ' + aBl.provs.length + ')');
  const r = sim.applyPower(S, map, 'drought', owned);
  ok(r.ok && P.fx[owned] <= 0.5 + 1e-6, 'drought center fx <= 0.5');
  const ring1 = new Set([owned, ...map.provinces[owned].land]);
  const r2 = aDry.provs.find((q) => !ring1.has(q));
  if (r2 !== undefined) ok(P.fx[r2] < 1, 'drought ring2 fx lowered');
}
// 10. 사회 권능도 발동 시 지도 효과를 남긴다
{
  for (const [t, want] of [['hero', 'hero'], ['war', 'warshout'], ['peace', 'peace']]) {
    const q0 = S.fxQueue.length;
    const r = sim.applyPower(S, map, t, owned);
    if (r.ok) ok(S.fxQueue.length === q0 + 1 && S.fxQueue[S.fxQueue.length - 1][1] === want, t + ' fx pushed as ' + want);
    else ok(r.msg.length > 0, t + ' refused with msg');
  }
}
// 11. 미리보기 범위 모양 라벨이 구분된다
{
  ok(sim.powerArea(S, map, 'quake', owned).shape === 'spot', 'quake shape spot');
  ok(sim.powerArea(S, map, 'hero', owned).shape === 'nation', 'hero shape nation');
  ok(sim.powerArea(S, map, 'bless', owned).shape === 'cluster', 'bless shape cluster');
}
// 12. 전성기: 50년 지속 버프, 갱신·만료·저장 호환
{
  const nid = P.owner[owned]; const n = S.nations[nid];
  const aG = sim.powerArea(S, map, 'goldenage', owned);
  ok(aG.ok && aG.shape === 'nation' && aG.nation === nid, 'goldenage nation area');
  const q0 = S.fxQueue.length;
  const r = sim.applyPower(S, map, 'goldenage', owned);
  ok(r.ok, 'goldenage ok');
  const b = (S.buffs || []).find((x) => x.nat === nid);
  ok(b && b.until === S.year + 50, 'goldenage buff 50y');
  ok(r.diff.events.some((e) => e.includes('전성기')), 'goldenage logged');
  ok(S.fxQueue.length === q0 + 1 && S.fxQueue[S.fxQueue.length - 1][1] === 'goldenage', 'goldenage fx pushed');
  ok(sim.powerArea(S, map, 'goldenage', owned).expect.includes('새로 이어'), 'goldenage re-arm preview notes refresh');
  for (let i = 0; i < 30; i++) sim.step(S, map);
  ok((S.buffs || []).some((x) => x.nat === nid), 'goldenage persists 30y');
  b.until = S.year; sim.step(S, map);
  ok(!(S.buffs || []).some((x) => x.nat === nid), 'goldenage expires');
  ok(S.log.some((l) => l.t.includes('전성기가 저물')), 'goldenage expiry logged');
}
// 13. 이주의 바람: 인구 이동과 정착
{
  let src = -1, tg = null;
  const findM = () => {
    for (let p = 0; p < map.provinces.length && src < 0; p++) {
      if (P.pop[p] < 200) continue;
      const a = sim.powerArea(S, map, 'migrate', p);
      if (a.ok) { src = p; tg = a.provs.slice(1); }
    }
  };
  findM();
  for (let t = 0; src < 0 && t < 3; t++) { for (let i = 0; i < 800; i++) sim.step(S, map); findM(); }
  ok(src >= 0, 'migrate source found');
  let sparse = -1; for (let q = 0; q < map.provinces.length; q++) if (P.pop[q] < 200) { sparse = q; break; }
  if (sparse >= 0) ok(!sim.powerArea(S, map, 'migrate', sparse).ok, 'migrate on sparse land invalid');
  if (src >= 0) {
    const aM = sim.powerArea(S, map, 'migrate', src);
    ok(aM.ok && aM.shape === 'cluster' && aM.provs[0] === src && aM.provs.length >= 2, 'migrate cluster area');
    const pop0 = P.pop[src]; const t0 = tg.map((q) => P.pop[q]);
    const q0 = S.fxQueue.length;
    const r = sim.applyPower(S, map, 'migrate', src);
    ok(r.ok, 'migrate ok');
    ok(P.pop[src] < pop0, 'migrate source pop decreased');
    ok(tg.some((q, i) => P.pop[q] > t0[i]), 'migrate target pop increased');
    ok(r.diff.provs.some((d) => d.p === src && d.pop1 < d.pop0), 'migrate diff reports source');
    ok(S.fxQueue.length === q0 + 1 && S.fxQueue[S.fxQueue.length - 1][1] === 'migrate', 'migrate fx pushed');
  }
}
// 14. 구형 세이브(buffs 없음) 복원 호환
{
  const j = JSON.parse(sim.serialize(S)); delete j.buffs;
  const S2 = sim.restore(j);
  ok(Array.isArray(S2.buffs), 'old save restore gets buffs=[]');
  sim.step(S2, map);
  const j2 = JSON.parse(sim.serialize(S));
  ok(Array.isArray(j2.buffs), 'serialize keeps buffs');
}
// 15. 전시 권능 3종: 수호의 방패·총동원령·전장의 치유
{
  const N = map.provinces.length;
  const nid = P.owner[owned];
  if (!S.wars.some((w) => w.A.includes(nid) || w.D.includes(nid))) sim.applyPower(S, map, 'war', owned);
  const w = S.wars.find((x) => x.A.includes(nid) || x.D.includes(nid)) || S.wars[0];
  ok(!!w, 'wartime test war exists');
  if (w) {
    const wnat = (w.A.includes(nid) || w.D.includes(nid)) ? nid : w.A[0];
    let wprov = -1; for (let q = 0; q < N; q++) if (P.owner[q] === wnat) { wprov = q; break; }
    const wn = S.nations[wnat];
    let pnat = -1; for (const x of S.nations) if (x.alive && x.pc > 0 && !S.wars.some((z) => z.A.includes(x.id) || z.D.includes(x.id))) { pnat = x.id; break; }
    let pprov = -1; if (pnat >= 0) for (let q = 0; q < N; q++) if (P.owner[q] === pnat) { pprov = q; break; }
    if (pprov >= 0) {
      const r0 = sim.applyPower(S, map, 'warshield', pprov);
      ok(!r0.ok && r0.msg.includes('전쟁 중'), 'warshield refused in peace');
      const r0b = sim.applyPower(S, map, 'mobilize', pprov);
      ok(!r0b.ok && r0b.msg.includes('전쟁 중'), 'mobilize refused in peace');
    }
    const aS = sim.powerArea(S, map, 'warshield', wprov);
    ok(aS.ok && aS.shape === 'nation', 'warshield nation area at war');
    const q0 = S.fxQueue.length;
    const r1 = sim.applyPower(S, map, 'warshield', wprov);
    ok(r1.ok && (S.buffs || []).some((b) => b.kind === 'shield' && b.nat === wnat), 'warshield buff applied');
    ok(S.fxQueue.length === q0 + 1 && S.fxQueue[S.fxQueue.length - 1][1] === 'warshield', 'warshield fx pushed');
    ok(r1.diff.events.some((e) => e.includes('수호의 방패')), 'warshield logged');
    sim.step(S, map);
    ok((S.buffs || []).some((b) => b.kind === 'shield' && b.nat === wnat) === S.wars.some((x) => x.A.includes(wnat) || x.D.includes(wnat)), 'warshield persists only while at war');
    wn.exh = 0.6;
    const r2 = sim.applyPower(S, map, 'mobilize', wprov);
    ok(r2.ok && wn.exh === 0, 'mobilize resets exhaustion');
    ok((S.buffs || []).some((b) => b.kind === 'mobil' && b.nat === wnat && b.until === S.year + 10), 'mobilize buff 10y');
    ok(r2.diff.nations.some((d) => d.id === wnat && d.stab1 > d.stab0), 'mobilize stab bump in diff');
    let hprov = -1; for (let q = 0; q < N; q++) if (P.owner[q] === wnat && P.pop[q] > 10) { hprov = q; break; }
    ok(hprov >= 0, 'warheal target province alive');
    if (hprov >= 0) {
      // 불안만으로는 대상이 안 된다: 기록된 점령 피해(recentCaps)가 있어야 한다
      P.unrest[hprov] = 0.6;
      S.recentCaps = (S.recentCaps || []).filter((c) => c.q !== hprov);
      const uNo = P.unrest[hprov], pNo = P.pop[hprov];
      sim.applyPower(S, map, 'warheal', hprov); // 같은 국가의 다른 기록 보유 지방은 치유될 수 있다 — 무기록 지방만 검증
      ok(P.unrest[hprov] === uNo && P.pop[hprov] === pNo, 'warheal skips unrest-only province (no capture record)');
      // 점령 기록을 심으면 치유 가능
      S.recentCaps.push({ p: hprov, q: hprov, t: wnat, y: S.year, big: 0 });
      const u0 = P.unrest[hprov], pop0 = P.pop[hprov];
      const r3 = sim.applyPower(S, map, 'warheal', hprov);
      ok(r3.ok, 'warheal ok with capture record');
      ok(P.unrest[hprov] < u0 && P.pop[hprov] > pop0, 'warheal unrest down pop up');
      ok(r3.diff.events.some((e) => e.includes('치유')), 'warheal logged');
      const rec = S.recentCaps.find((c) => c.q === hprov);
      ok(!!rec && rec.healed === 1, 'warheal flags the damage record as healed');
      ok(S.recentCaps.some((c) => c.q === hprov), 'warheal preserves the capture record for map/war display');
      // 같은 피해로 반복 회복 불가
      P.unrest[hprov] = 0.6;
      const r3b = sim.applyPower(S, map, 'warheal', hprov);
      ok(!r3b.ok, 'warheal cannot re-heal consumed damage');
    }
    if (pprov >= 0) {
      for (let q = 0; q < N; q++) if (P.owner[q] === pnat) P.unrest[q] = 0.1;
      const r4 = sim.applyPower(S, map, 'warheal', pprov);
      ok(!r4.ok && r4.msg.includes('점령'), 'warheal refused when no damage');
    }
    for (const w2 of [...S.wars]) sim.endWar(S, map, w2, '');
    sim.step(S, map);
    ok(!(S.buffs || []).some((b) => b.kind === 'shield'), 'warshield ends at peace');
    ok(S.log.some((l) => l.t.includes('수호의 방패가 내려')), 'warshield end logged');
  }
}
console.log(fail ? 'FAILED ' + fail : 'ALL OK'); process.exit(fail ? 1 : 0);
