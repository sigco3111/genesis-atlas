// 전쟁 관찰 테스트: 점령 표시 유지 시간, 추적 국가 전쟁 감지, 실제 시뮬레이션과의 결합
import { CAP_AGE_STEPS, nextCapAge, capAgeLabel, visibleCaps, capAlpha, trackedWarIds, warEvents } from '../js/warwatch.js';
import { loadEarthNode } from './loadearth.mjs';
import * as sim from '../js/sim.js';
let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.error('FAIL', msg); } else console.log('ok', msg); };

// 1) 유지 시간 단계 순환: 3 → 10 → 30 → 끄기(0) → 3, 모르면 기본 3부터
ok(nextCapAge(3) === 10 && nextCapAge(10) === 30 && nextCapAge(30) === 0 && nextCapAge(0) === 3, '유지 시간 순환 3→10→30→끄기→3');
ok(nextCapAge(7) === CAP_AGE_STEPS[0] && nextCapAge(-1) === CAP_AGE_STEPS[0], '목록에 없는 값은 첫 단계(3년)로');
ok(capAgeLabel(3) === '3년' && capAgeLabel(30) === '30년' && capAgeLabel(0) === '끄기', '유지 시간 표기');

// 2) 점령 표시 필터: keep년 이내만, 경계값 포함, 0이면 전부 숨김
{
  const caps = [{ y: 100 }, { y: 96 }, { y: 93 }, { y: 70 }]; // 103년 기준 3·7·10·33년 전
  ok(visibleCaps(caps, 103, 3).length === 1, '3년 유지: 3년 전 점령까지 표시 (경계 포함)');
  ok(visibleCaps(caps, 103, 10).length === 3 && visibleCaps(caps, 103, 30).length === 3, '10년·30년 유지: 10년 전까지 표시');
  ok(visibleCaps(caps, 103, 40).length === 4, '40년 유지: 모두 표시');
  ok(visibleCaps(caps, 103, 0).length === 0, '끄기: 아무것도 표시하지 않음');
  ok(visibleCaps(null, 103, 3).length === 0, '기록 없음(null)도 안전');
}
// 3) 투명도: 새 점령은 1에 가깝고 keep + 0.5년이면 0
ok(capAlpha(0, 3) === 1 && capAlpha(3.5, 3) === 0, '투명도: 0년=1, keep+0.5년=0');
ok(capAlpha(1, 3) > capAlpha(2, 3) && capAlpha(9, 30) > 0.5, '투명도는 시간이 갈수록 감소, 긴 유지는 천천히 옅어짐');

// 4) 추적 국가 전쟁 감지
const mkS = (track, alive, wars) => ({ track, nations: [{ id: 0, alive }], wars });
const war = (id, A, D) => ({ id, A, D });
ok(trackedWarIds(mkS(null, true, [war(1, [0], [1])])).length === 0, '추적 없음 → 감지 없음');
ok(trackedWarIds(mkS({ id: 0 }, false, [war(1, [0], [1])])).length === 0, '추적 국가 멸망 → 감지 없음');
{
  const ids = trackedWarIds(mkS({ id: 0 }, true, [war(1, [0], [1]), war(2, [2], [3]), war(3, [4], [0])]));
  ok(ids.length === 2 && ids.includes(1) && ids.includes(3), '공격·방어·동맹 참전 모두 감지, 무관한 전쟁 제외');
}
// 5) 발발·종료 전이
{
  let ev = warEvents([], [7]); ok(ev.started.length === 1 && ev.ended.length === 0, '평화 → 전쟁: 발발 1건');
  ev = warEvents([7], [7]); ok(!ev.started.length && !ev.ended.length, '전쟁 지속: 변화 없음');
  ev = warEvents([7], []); ok(!ev.started.length && ev.ended.length === 1, '전쟁 → 평화: 종료 1건');
  ev = warEvents([7, 8], [8, 9]); ok(ev.started.length === 1 && ev.started[0] === 9 && ev.ended.length === 1 && ev.ended[0] === 7, '한 번에 종료+발발도 구분');
}

// 6) 실제 시뮬레이션 결합: 이웃한 두 나라의 전쟁을 일으켜 발발·종전 감지 확인
{
  const map = await loadEarthNode('./data');
  const S = sim.createState(map, { mode: 'real', seed: 1 });
  for (let i = 0; i < 30; i++) sim.step(S, map);
  // 육상 이웃이 있는 나라를 추적
  let a = null, d = null;
  for (const n of S.nations.filter((x) => x.alive).sort((x, y) => y.pop - x.pop)) {
    const nb = [...sim.neighborsOf(S, n)].find(([, info]) => info.land > 0);
    if (nb && !n.allies.includes(nb[0])) { a = n; d = S.nations[nb[0]]; break; }
  }
  ok(!!a && !!d, '시험용 이웃 국가 쌍 확보 (' + (a && a.name) + ' vs ' + (d && d.name) + ')');
  sim.setTrack(S, a.id);
  let prev = trackedWarIds(S);
  ok(prev.length === 0, '전쟁 전: 참전 없음');
  sim.startWar(S, map, a, d);
  let cur = trackedWarIds(S);
  let ev = warEvents(prev, cur);
  ok(cur.length === 1 && ev.started.length === 1, '전쟁 선포 → 추적 국가 전쟁 발발 감지');
  ok(S.wars.some((w) => w.id === ev.started[0]), '감지된 전쟁이 실제 전쟁 목록에 존재');
  prev = cur;
  sim.endWar(S, map, S.wars.find((w) => w.id === cur[0]), 'A');
  cur = trackedWarIds(S);
  ev = warEvents(prev, cur);
  ok(cur.length === 0 && ev.ended.length === 1, '종전 → 추적 국가 전쟁 종료 감지');
  // 반대편(방어국)을 추적해도 동일하게 감지
  sim.setTrack(S, d.id);
  prev = trackedWarIds(S);
  sim.startWar(S, map, a, d);
  ok(warEvents(prev, trackedWarIds(S)).started.length === 1, '방어국 추적도 발발 감지');
}
// 7) 저장·복원 후에도 감지 함수가 동작 (상태 필드를 추가하지 않았으므로 호환)
{
  const map = await loadEarthNode('./data');
  const S = sim.createState(map, { mode: 'real', seed: 2 });
  for (let i = 0; i < 30; i++) sim.step(S, map);
  const n = S.nations.filter((x) => x.alive)[0];
  sim.setTrack(S, n.id);
  const S2 = sim.restore(sim.serialize(S));
  ok(trackedWarIds(S2).join(',') === trackedWarIds(S).join(','), '저장·복원 후 추적 전쟁 감지 동일');
}

console.log(fails ? fails + ' failures' : 'all warwatch tests passed');
process.exit(fails ? 1 : 0);
