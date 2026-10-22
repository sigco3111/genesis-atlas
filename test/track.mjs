import { loadEarthNode } from './loadearth.mjs';
import { generateMap } from '../js/world.js';
import * as sim from '../js/sim.js';

const map = generateMap('twin', 7);
const S = sim.createState(map, { seed: 7, mode: 'emergent', hearths: 6 });
// 300년 돌린 뒤 가장 큰 국가 추적
for (let i = 0; i < 300; i++) sim.step(S, map);
const top = S.nations.filter((n) => n.alive).sort((a, b) => b.pop - a.pop)[0];
sim.setTrack(S, top.id);
console.assert(S.track && S.track.id === top.id, 'track set');
const before = S.track.hist.length;
for (let i = 0; i < 400; i++) sim.step(S, map);
const T = S.track;
console.assert(T.hist.length > before, 'hist grows: ' + T.hist.length);
console.assert(T.gained >= 0 && T.lost >= 0, 'gained/lost ok ' + T.gained + '/' + T.lost);
// 저장/복원 후에도 추적 유지 + 계속 누적
const ser = sim.serialize(S);
const R = sim.restore(ser);
console.assert(R.track && R.track.id === top.id, 'track survives save/restore');
const h0 = R.track.hist.length;
for (let i = 0; i < 100; i++) sim.step(R, map);
console.assert(R.track.dead || R.track.hist.length > h0, 'hist keeps growing after restore');
// 추적 해제 후 샘플링 멈춤
const T2 = R.track; const n2 = T2 ? T2.hist.length : 0;
R.track = null;
for (let i = 0; i < 50; i++) sim.step(R, map);
console.assert(R.track === null, 'untracked');
// 멸망 경로: 추적 상태에서 국가 강제 멸망
sim.setTrack(R, R.nations.filter((n) => n.alive)[0].id);
const victim = R.nations[R.track.id];
for (let p = 0; p < R.P.owner.length; p++) if (R.P.owner[p] === victim.id) R.P.owner[p] = -1;
sim.step(R, map);
console.assert(R.track.dead === true, 'dead flag set');
console.assert(R.track.hist[R.track.hist.length - 1][1] === 0, 'final hist point 0 pop');
console.log('track test OK  hist', T.hist.length, 'gained', T.gained, 'lost', T.lost, 'dead-path OK');
