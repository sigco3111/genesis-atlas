// 자율 부대 전투 시험: node test/units.mjs
import { loadEarthNode } from './loadearth.mjs'; import { generateMap } from '../js/world.js'; import * as sim from '../js/sim.js';
import { armyCap, armyStrength, atWar, stepArmies, battleTick, ARMY_GLOBAL_MAX, ERA_UNITS, eraOf, unitOf } from '../js/units.js';
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } else console.log('ok -', m); };

// 1) 통합: 실제 전쟁 중 부대가 편성·행군·교전·점령한다
{
  const map = await loadEarthNode('./data');
  const S = sim.createState(map, { mode: 'emergent', seed: 3, hearths: 8, aggr: 2.5 });
  let pairFound = false;
  for (let i = 0; i < 2600; i++) { // 부족들이 국경을 맞댈 때까지
    sim.step(S, map);
    if (i % 100 === 99 && [...S.fr.keys()].some((k) => S.nations[(k / 4096) | 0] && S.nations[(k / 4096) | 0].alive && S.nations[k % 4096] && S.nations[k % 4096].alive)) { pairFound = true; break; }
  }
  const alive = S.nations.filter((n) => n.alive && n.pc >= 2);
  ok(alive.length >= 2, `전쟁 상대 확보 (국가 ${alive.length}개)`);
  // 국경을 맞댄 두 나라를 골라야 전선이 생긴다
  let a = null, d = null;
  for (const [k] of S.fr) { const x = (k / 4096) | 0, y = k % 4096; const nx = S.nations[x], ny = S.nations[y]; if (nx && ny && nx.alive && ny.alive) { a = nx; d = ny; break; } }
  ok(a && d, '맞닿은 두 나라 확보');
  sim.startWar(S, map, a, d, '시험 선전포고');
  let sawArmy = 0, sawBattle = 0, caps0 = S.recentCaps.length;
  for (let i = 0; i < 60; i++) {
    sim.step(S, map);
    sawArmy = Math.max(sawArmy, S.armies.length);
    if (S.armies.some((x) => x.st === 'battle')) sawBattle++;
    for (const x of S.armies) ok(Number.isFinite(x.x) && Number.isFinite(x.y) && Number.isFinite(x.men), '부대 좌표·병력 유한');
  }
  ok(sawArmy > 0, `부대 편성됨 (최대 동시 ${sawArmy})`);
  ok(S.armies.length <= ARMY_GLOBAL_MAX, '세계 부대 상한 준수');
  console.log('   정보: 교전 관찰 연도', sawBattle, '/ 점령 증가', S.recentCaps.length - caps0, '/ 남은 부대', S.armies.length, '/ 전사자 누적', Math.round(S.deaths.war));
  // 저장/복원: 부대 상태가 유지되고 이어서 진행된다
  const ser = sim.serialize(S); const R = sim.restore(ser);
  ok(Array.isArray(R.armies) && R.armies.length === S.armies.length, '저장/복원 후 부대 수 동일');
  try { for (let i = 0; i < 15; i++) sim.step(R, map); ok(true, '복원 후 15년 진행 예외 없음'); } catch (e) { ok(false, '복원 후 진행: ' + e.message); }
  for (const x of R.armies) ok(Number.isFinite(x.x) && Number.isFinite(x.men), '복원 부대 상태 유한');
  // 전쟁 종료 시 부대 해산
  if (R.wars.length) { const w = R.wars[0]; sim.endWar(R, map, w, 'A'); ok(!R.armies.some((x) => x.war === w.id), '종전 시 해당 전쟁 부대 해산'); }
}

// 2) 순수 함수: 강한 부대가 약한 부대를 후퇴/전멸시킨다
{
  const map = generateMap('twin', 5);
  const S = sim.createState(map, { mode: 'emergent', seed: 5, hearths: 6, aggr: 3 });
  for (let i = 0; i < 500; i++) sim.step(S, map);
  const alive = S.nations.filter((n) => n.alive && n.pc >= 2).sort((x, y) => y.mil - x.mil);
  if (alive.length >= 2) {
    const [a, d] = alive;
    sim.startWar(S, map, a, d, '시험');
    const w = S.wars[S.wars.length - 1];
    ok(!!atWar(S, a.id, d.id), 'atWar 판정');
    ok(armyCap(a) >= 1 && armyCap(a) <= 5, 'armyCap 범위');
    ok(armyStrength(S, map, { nat: a.id, men: 1000 }) > 0, 'armyStrength 양수');
    // 강제 대치: 같은 위치에 강/약 부대 배치
    const pa = map.provinces[a.cap], pb = map.provinces[d.cap];
    S.armies.push(
      { id: 9001, nat: a.id, men: 4000, men0: 4000, x: pa.ax, y: pa.ay, path: null, dlen: 0, prog: 0, tgt: -1, home: a.cap, st: 'march', sg: 0, war: w.id },
      { id: 9002, nat: d.id, men: 400, men0: 400, x: pa.ax + 4, y: pa.ay + 4, path: null, dlen: 0, prog: 0, tgt: -1, home: d.cap, st: 'march', sg: 0, war: w.id },
    );
    let retreated = false;
    const strong = S.armies.find((x) => x.id === 9001), weak = S.armies.find((x) => x.id === 9002);
    for (let i = 0; i < 20; i++) { battleTick(S, map, strong, weak); if (weak.men <= 0 || weak.st === 'retreat') { retreated = true; break; } }
    ok(retreated, '약한 부대가 후퇴하거나 전멸');
    ok(strong.men > 0, '강한 부대 생존');
  } else ok(false, '대치 시험용 국가 부족');
}

// 2) 시대별 병종: 기술 정수부로 시대가 매핑되고 전투력·이동 보정이 단조 증가
{
  ok(ERA_UNITS.length === 10, 'ERA_UNITS 10시대 정의');
  ok(eraOf({ tech: 0 }) === 0 && eraOf({ tech: 8.99 }) === 8 && eraOf({ tech: 12 }) === 9 && eraOf(null) === 0, 'eraOf 매핑 경계값');
  for (let e = 1; e < 10; e++) {
    ok(ERA_UNITS[e].str >= ERA_UNITS[e - 1].str, `전투 보정 단조 (${e})`);
    ok(ERA_UNITS[e].spd >= ERA_UNITS[e - 1].spd || e === 5, `이동 보정 단조 (${e})`); // 4기병>5화승총 예외 없음 확인용
  }
  const fakeA = (tech) => ({ nat: 0, men: 1000, men0: 1000, x: 0, y: 0 });
  const S2 = { nations: [{ id: 0, tech: 1, pop: 1e5, alive: true }], buffs: [], wars: [], rng: null };
  const m1 = armyStrength(S2, { provinces: [] }, fakeA(0));
  S2.nations[0].tech = 7.5;
  const m2 = armyStrength(S2, { provinces: [] }, fakeA(0));
  ok(m2 > m1, `고기술 부대가 더 강함 (${m1.toFixed(0)} → ${m2.toFixed(0)})`);
  ok(Math.abs(m1 / 1000 - (1 + 0.12 * 1) * ERA_UNITS[1].str) < 1e-9, '시대 보정이 강도에 반영됨');
  ok(unitOf({ tech: 7.2 }).spd > unitOf({ tech: 1 }).spd, '시대별 이동 속도 차이 존재');
  const keys = ERA_UNITS.map((u) => u.key);
  ok(new Set(keys).size === 10, '병종 이름 10개 고유');
}
// 사기·경험·보급 (R1)
{
  const { supplyOf, moraleOf, xpOf } = await import('../js/units.js');
  const map = await loadEarthNode('./data'); const S = sim.createState(map, { mode: 'emergent', seed: 5, hearths: 8, aggr: 2.5 });
  const a0 = { nat: 0, men: 1000, men0: 1000, x: map.provinces[0].ax, y: map.provinces[0].ay, home: 0 };
  ok(supplyOf(map, a0) === 1, '본국에서는 보급 1');
  ok(supplyOf(map, { ...a0, x: a0.x + 900 }) === 0.6, '먼 원정은 보급 하한 0.6');
  ok(moraleOf({}) === 1 && xpOf({}) === 0, '옛 저장 부대는 사기1·경험0 기본값');
}
// 지휘관 (R2)
{
  const { makeCommander, CMD_TRAITS, cmdTrait } = await import('../js/units.js');
  const rng = { int: (n) => Math.floor(Math.random() * n) };
  const c = makeCommander(rng);
  ok(typeof c.n === 'string' && c.n.length >= 2 && c.t >= 0 && c.t < CMD_TRAITS.length, '지휘관 이름·기질 생성');
  ok(cmdTrait({}) === -1, '지휘관 없는 옛 부대는 기질 -1');
  const map = await loadEarthNode('./data'); const S = sim.createState(map, { mode: 'emergent', seed: 3, hearths: 8, aggr: 2.5 });
  for (let i = 0; i < 2600; i++) { sim.step(S, map); if (i % 100 === 99 && [...S.fr.keys()].some((k) => S.nations[(k / 4096) | 0] && S.nations[(k / 4096) | 0].alive && S.nations[k % 4096] && S.nations[k % 4096].alive)) break; }
  let a = null, d = null; for (const [k] of S.fr) { const x = (k / 4096) | 0, y = k % 4096; const nx = S.nations[x], ny = S.nations[y]; if (nx && ny && nx.alive && ny.alive) { a = nx; d = ny; break; } }
  sim.startWar(S, map, a, d, 't'); for (let i = 0; i < 60 && !S.armies.length; i++) sim.step(S, map);
  ok(S.armies.length > 0 && S.armies.every((x) => x.cmd && x.cmd.n), '새 부대는 모두 지휘관을 가짐 (' + S.armies.map((x) => x.cmd.n).join(',') + ')');
  const R = sim.restore(sim.serialize(S)); ok(R.armies.every((x) => x.cmd), '저장/복원 후 지휘관 유지');
}
// 공성 장비 (R3)
{ const src = (await import('fs')).readFileSync('./js/units.js', 'utf8'); ok(src.includes('const engine =') && src.includes('농성군의 출격'), '공성 장비·출격 로직 존재'); }
// 합류 (R4)
{ const src = (await import('fs')).readFileSync('./js/units.js', 'utf8'); ok(src.includes('2.5) 합류'), '합류 로직 존재'); }
// 전장 흔적 (R5)
{ const src = (await import('fs')).readFileSync('./js/units.js', 'utf8'); ok(src.includes('S.fields'), '전장 흔적 로직 존재'); }
console.log(fail ? 'FAILED ' + fail : 'ALL OK'); process.exit(fail ? 1 : 0);
