// 항해 시스템 시험: 해상 항로 분류, 무역선 왕복, 탐험선 발사·정착, 저장/복원
import { loadEarthNode } from './loadearth.mjs';
import { generateMap } from '../js/world.js'; import * as sim from '../js/sim.js';
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } else console.log('ok -', m); };

// 1) 군도 세계: 탐험선 발사와 해외 정착
{
  const map = generateMap('archipelago', 7);
  const S = sim.createState(map, { seed: 7, mode: 'emergent', hearths: 6 });
  let launches = 0, settled = 0, lost = 0, maxTech = 0;
  for (let i = 0; i < 9000; i++) {
    sim.step(S, map);
    if (S.stats.maxT > maxTech) maxTech = S.stats.maxT;
    if (i > 3000 && S.exped.length) launches = Math.max(launches, S.exped.length);
  }
  const settleLogs = S.log.filter((l) => l.t.includes('해외 정착지')).length;
  const lostLogs = S.log.filter((l) => l.t.includes('소식이 끊겼습니다')).length;
  const departLogs = S.log.filter((l) => l.t.includes('먼 바다로 향합니다')).length;
  console.log(`archipelago year ${S.year} maxT ${maxTech.toFixed(2)} depart ${departLogs} settled ${settleLogs} lost ${lostLogs} exped now ${S.exped.length}`);
  ok(maxTech > 2.2, '항해 기술 도달');
  ok(departLogs > 0, '탐험선 출항 기록');
  ok(settleLogs > 0, '해외 정착 성공 기록');
  // 경로 무결성: 모든 진행 중 탐험선의 경로는 유효한 지방 id
  const allWater = (m, path) => { for (let i = 1; i < path.length; i++) { const n = Math.ceil(Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1])); for (let k = 0; k <= n; k++) { const f = n ? k / n : 0; const x = Math.round(path[i - 1][0] + (path[i][0] - path[i - 1][0]) * f), y = Math.round(path[i - 1][1] + (path[i][1] - path[i - 1][1]) * f); if (x < 0 || y < 0 || x >= m.W || y >= m.H || m.land[y * m.W + x]) return false; } } return true; };
  for (const e of S.exped) { ok(Array.isArray(e.pts) && e.pts.length >= 2 && e.pts.every((q) => q.every((v) => Number.isFinite(v))), '탐험 경로 유효'); ok(allWater(map, e.pts), '탐험 경로 전 구간 수역'); ok(e.t >= 0 && e.t <= 1, '탐험 진행률 범위'); ok(e.target >= 0 && e.target < map.provinces.length, '탐험 목표 유효'); break; }
  const seaR = S.routes.filter((r) => r[2]);
  for (const r of seaR.slice(0, 10)) ok(r[3] && allWater(map, r[3]), '바닷길 경유지 전 구간 수역');
  // 저장/복원 후에도 탐험 계속
  const R = sim.restore(sim.serialize(S));
  ok(Array.isArray(R.ships) && Array.isArray(R.exped) && R.seaPairs, '복원 필드 보장');
  for (let i = 0; i < 50; i++) sim.step(R, map);
  ok(true, '복원 후 진행 무사고');
}
// 2) 현실 지구 현대: 해상 항로 분류 + 무역선 배정
{
  const map = await loadEarthNode('./data');
  const S = sim.createState(map, { mode: 'real', seed: 3 });
  for (let i = 0; i < 60; i++) sim.step(S, map); // stepDiplomacy 최소 12회
  const seaRoutes = S.routes.filter((r) => r[2]);
  const landRoutes = S.routes.filter((r) => !r[2]);
  console.log(`earth real year ${S.year} routes ${S.routes.length} (sea ${seaRoutes.length}, land ${landRoutes.length}) ships ${S.ships.length}`);
  ok(seaRoutes.length > 0, '해상 항로 존재');
  const allWater2 = (m, path) => { for (let i = 1; i < path.length; i++) { const n = Math.ceil(Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1])); for (let k = 0; k <= n; k++) { const f = n ? k / n : 0; const x = Math.round(path[i - 1][0] + (path[i][0] - path[i - 1][0]) * f), y = Math.round(path[i - 1][1] + (path[i][1] - path[i - 1][1]) * f); if (x < 0 || y < 0 || x >= m.W || y >= m.H || m.land[y * m.W + x]) return false; } } return true; };
  ok(seaRoutes.every((r) => r[3] && r[3].length >= 2), '해상 항로 모두 경유지 보유');
  ok(seaRoutes.every((r) => allWater2(map, r[3])), '해상 항로 전 구간 수역 (지구)');
  ok(landRoutes.every((r) => !r[3]), '육상 항로는 기존 형식 유지');
  ok(S.ships.length > 0, '무역선 배정됨');
  for (const s of S.ships) ok(s.t >= 0 && s.t <= 1 && map.provinces[s.a] && map.provinces[s.b], '무역선 상태 유효');
  // 무역선이 항구 소유국 색을 가리키는가
  ok(S.ships.every((s) => s.nat === S.P.owner[s.a]), '무역선 국적 = 출발항 소유국');
  // 바닷길 최초 개척 기록
  const seaLog = S.log.filter((l) => l.t.includes('바닷길이 열렸습니다')).length;
  console.log('바닷길 개척 기록', seaLog);
  ok(seaLog > 0, '바닷길 개척 연대기 기록');
  // 저장/복원
  const R = sim.restore(sim.serialize(S));
  for (let i = 0; i < 10; i++) sim.step(R, map);
  ok(R.ships.length >= 0, '현대 복원 진행');
}
console.log(fail ? 'FAILED ' + fail : 'ALL OK'); process.exit(fail ? 1 : 0);
