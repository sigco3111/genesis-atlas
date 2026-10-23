// 국가 비교 데이터: 국가별 인구·영토 추이 기록(hist) + 저장/복원 호환 검사
import { generateMap } from '../js/world.js'; import * as sim from '../js/sim.js';
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } else console.log('ok -', m); };
const map = generateMap('twin', 11);
const S = sim.createState(map, { seed: 11, mode: 'emergent', hearths: 8, aggr: 1.5 });
for (let i = 0; i < 2500; i++) sim.step(S, map);
const alive = S.nations.filter((n) => n.alive);
ok(alive.length >= 2, 'at least 2 nations alive: ' + alive.length);
// hist가 10년 간격으로 쌓이는가
const withHist = alive.filter((n) => n.hist && n.hist.length >= 2);
ok(withHist.length >= alive.filter((n) => S.year - n.born >= 20).length, 'nations born >=20y ago have >=2 hist points');
ok(alive.every((n) => n.hist && n.hist.length >= 1), 'every alive nation has its founding point');
const h0 = alive[0].hist;
ok(h0.every((p, i) => i === 0 || h0[i - 1][0] < p[0]), 'hist years strictly increasing');
ok(h0.every((p) => p.length === 3 && Number.isFinite(p[1]) && Number.isFinite(p[2])), 'hist points are [year, pop, pc]');
// 마지막 점이 현재와 어긋나지 않는가 (10년 간격 샘플링)
const top = alive.sort((a, b) => b.pop - a.pop)[0];
const last = top.hist[top.hist.length - 1];
ok(S.year - last[0] < 20, 'latest hist point is recent: gap ' + (S.year - last[0]));
// 멸망 국가는 추이가 0으로 마감되는가
const dead = S.nations.filter((n) => !n.alive);
if (dead.length) ok(dead.every((n) => { const l = n.hist[n.hist.length - 1]; return l[1] === 0 && l[0] === n.died; }), 'dead nations end with [died, 0, 0]');
// 장기 실행에서 포인트 수 상한(240) 유지
ok(S.nations.every((n) => n.hist.length <= 240), 'hist capped at 240 points');
// 저장/복원 후 hist 유지
const R = sim.restore(sim.serialize(S));
ok(R.nations[top.id].hist.length === top.hist.length, 'hist survives save/restore');
// 구형 저장(hist 없음)과의 호환: 현재값 한 점으로 시드
const legacy = sim.restore(sim.serialize(S));
for (const n of legacy.nations) delete n.hist;
legacy.nations[0].hist = [];
const R2 = sim.restore(JSON.stringify(legacy));
ok(R2.nations.every((n) => Array.isArray(n.hist) && n.hist.length >= 1), 'legacy save without hist gets seeded');
ok(R2.nations[0].hist[0][1] === Math.round(R2.nations[0].pop), 'seeded point holds current pop');
console.log(fail ? 'FAILED ' + fail : 'ALL OK  alive:' + alive.length + ' dead:' + dead.length + ' topHist:' + top.hist.length);
process.exit(fail ? 1 : 0);
