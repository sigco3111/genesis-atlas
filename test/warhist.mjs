// 전쟁 결과 요약 테스트: 스냅샷·점령 집계·종전 요약, 멸망 종전, 구형 저장 호환, 실제 시뮬레이션 결합
import { WARHIST_MAX, WARCAPS_MAX, BIGCAPS_MAX, snapWar, recordCap, rostersOf, capsBySide, buildSummary, pushSummary, deltaOf } from '../js/warhist.js';
import { loadEarthNode } from './loadearth.mjs';
import * as sim from '../js/sim.js';
let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.error('FAIL', msg); } else console.log('ok', msg); };

// 1) 개전 스냅샷: 참전국(동맹 포함) 인구·지방 수 기록
{
  const S = {
    P: { owner: [0, 0, 0, 1, 2, -1], pop: [500, 400, 335, 500, 42, 77] },
    nations: [{ pop: 999999, pc: 99 }, { pop: 1, pc: 1 }, { pop: 2, pc: 2 }],
  }; // 캐시 집계는 일부러 틀리게: 실제 소유를 직접 세야 함
  const w = { A: [0, 2], D: [1] };
  const s = snapWar(S, w);
  ok(s[0][0] === 1235 && s[0][1] === 3 && s[1][0] === 500 && s[1][1] === 1 && s[2][1] === 1, '스냅샷: 캐시 집계가 아닌 실제 소유 기준 인구·지방 수');
  ok(!('99' in s), '스냅샷: 없는 국가는 무시');
}

// 2) 점령 기록 상한과 측별 집계
{
  const w = { A: [0], D: [1], caps: [] };
  for (let i = 0; i < WARCAPS_MAX + 50; i++) recordCap(w, { q: i, f: 1, t: 0, y: i, big: 0 });
  ok(w.caps.length === WARCAPS_MAX, `점령 기록은 ${WARCAPS_MAX}개로 제한`);
  recordCap(w, { q: 1, f: 0, t: 1, y: 1, big: 0 });
  recordCap(w, { q: 2, f: 0, t: 1, y: 2, big: 1 });
  ok(capsBySide(w)[0] === WARCAPS_MAX - 2 && capsBySide(w)[1] === 2, '측별 점령 집계: 점령한 나라 기준 (상한 초과분은 오래된 것부터 잘림)');
  const w2 = { A0: [0, 2], D0: [1], A: [0], D: [], caps: [{ q: 1, f: 1, t: 2, y: 1 }] }; // 멸망해 빠진 동맹국 2의 점령
  ok(capsBySide(w2)[0] === 1, '원래 명단(A0/D0) 기준으로 멸망 동맹의 점령도 집계');
  ok(rostersOf(w2)[0].join(',') === '0,2' && rostersOf(w2)[1][0] === 1, 'rostersOf: A0/D0 우선');
}

// 3) 종전 요약: 기간·승자·이름·주요 점령·멸망국 처리
{
  const S = {
    year: 130,
    P: { owner: [0, 0, 0, -1, -1], pop: [700, 700, 600, 10, 20] },
    nations: [
      { name: '알파', rgb: [1, 1, 1], alive: true, pop: 1, pc: 1 }, // 캐시는 일부러 틀리게
      { name: '베타', rgb: [2, 2, 2], alive: false, pop: 0, pc: 0 },
    ],
  };
  const w = { id: 7, A: [0], D: [1], start: 100, caps: [] };
  w.snap = snapWar(S, w);
  for (let i = 0; i < BIGCAPS_MAX + 5; i++) recordCap(w, { q: i, f: 1, t: 0, y: 100 + i, big: 1 });
  const s = buildSummary(S, w, 'A');
  ok(s.dur === 30 && s.win === 'A' && s.y0 === 100 && s.y1 === 130, '요약: 기간·승자·연도');
  ok(s.nm[1] === '베타' && s.now[1][0] === 0 && s.now[1][1] === 0, '요약: 멸망국 이름은 남기고 현재값은 0');
  ok(s.big.length === BIGCAPS_MAX && s.capsA === BIGCAPS_MAX + 5, `요약: 주요 점령은 ${BIGCAPS_MAX}개, 전체 점령 수는 별도 집계`);
  ok(s.snap[0][1] === 3 && s.now[0][1] === 3 && s.now[0][0] === 2000, '요약: 개전/종전 영토·인구를 실제 소유로 집계');
}

// 4) 요약 목록 상한과 deltaOf
{
  const S = {};
  for (let i = 0; i < WARHIST_MAX + 10; i++) pushSummary(S, { id: i });
  ok(S.warHist.length === WARHIST_MAX && S.warHist[0].id === 10, `요약 목록은 최근 ${WARHIST_MAX}개만 보관`);
  const d = deltaOf(1000, 850);
  ok(d.d === -150 && Math.abs(d.pct + 15) < 1e-9, 'deltaOf: 절대값·비율');
  ok(deltaOf(0, 5).pct === null && deltaOf(null, 5) === null, 'deltaOf: 이전 0·없음이면 비율 null');
}

// 5) 실제 시뮬레이션: 전쟁이 끝나면 요약이 쌓이고 필드가 일관
{
  const map = await loadEarthNode('./data');
  const S = sim.createState(map, { mode: 'real', seed: 3 });
  for (let i = 0; i < 400; i++) sim.step(S, map);
  ok(S.warHist.length > 0, `실제 시뮬레이션 400년: 종전 요약 ${S.warHist.length}건`);
  let good = true, snapped = true;
  for (const s of S.warHist) {
    if (!(s.id > 0 && s.y1 >= s.y0 && s.A.length && s.D.length && s.nm[s.A[0]] && s.nm[s.D[0]] && s.now[s.A[0]])) good = false;
    if (!s.snap || !s.snap[s.A[0]]) snapped = false;
    if (s.capsA + s.capsD > s.capsN) good = false;
  }
  ok(good, '요약 필드 일관성: id·연도·양측 이름·현재값·점령 집계');
  ok(snapped, '새 전쟁은 모두 개전 스냅샷 보유');
  const logEnds = S.log.filter((l) => /전쟁이 .*끝났습니다/.test(l.t)).length;
  ok(logEnds > 0, '종전 연대기 기록 유지');
}

// 6) 한쪽 멸망으로 끝난 전쟁도 요약·연대기 기록 (step 경유)
{
  const map = await loadEarthNode('./data');
  const S = sim.createState(map, { mode: 'real', seed: 5 });
  const alive = S.nations.filter((n) => n.alive && n.pc > 2);
  const a = alive[0], d = alive[1];
  sim.startWar(S, map, a, d);
  ok(S.wars.length === 1, '전쟁 강제 시작');
  const before = S.warHist.length;
  S.wars[0].D = []; // 방어측 멸망과 동일한 상태 (killNation이 측 명단에서 제거)
  sim.step(S, map);
  ok(S.warHist.length === before + 1, '멸망 종전도 요약에 기록');
  const s = S.warHist[S.warHist.length - 1];
  ok(s.win === 'A' && s.nm[s.D[0]] === d.name, '멸망 종전: 살아남은 측 승리 + 멸망국 이름 보존');
  ok(S.log.some((l) => l.t.includes('전쟁이') && l.t.includes('끝났습니다') && l.t.includes(d.name)), '멸망 종전 연대기 기록');
}

// 7) 구형 저장 호환: snap·caps·A0 없는 전쟁이 끝나도 안전, restore가 필드를 채움
{
  const map = await loadEarthNode('./data');
  const S = sim.createState(map, { mode: 'real', seed: 7 });
  const alive = S.nations.filter((n) => n.alive && n.pc > 2);
  sim.startWar(S, map, alive[0], alive[1]);
  const w = S.wars[0];
  delete w.snap; delete w.caps; delete w.A0; delete w.D0; // v32까지의 저장 형태
  sim.endWar(S, map, w, 'D');
  const s = S.warHist[S.warHist.length - 1];
  ok(s && s.snap === null && s.capsN === 0 && s.nm[s.A[0]] === alive[0].name, '구형 전쟁 종전: 스냅샷 없이도 요약 생성');
  const raw = JSON.parse(sim.serialize(S)); delete raw.warHist; // v32 저장본에는 warHist가 없음
  const S2 = sim.restore(JSON.stringify(raw));
  ok(Array.isArray(S2.warHist) && S2.warHist.length === 0, 'restore: warHist 없는 구형 저장은 빈 목록으로');
  sim.startWar(S2, map, alive[0], alive[1]);
  const raw2 = JSON.parse(sim.serialize(S2));
  delete raw2.wars[0].caps; delete raw2.wars[0].A0; delete raw2.wars[0].D0; delete raw2.wars[0].snap;
  const S3 = sim.restore(JSON.stringify(raw2));
  const w3 = S3.wars[0];
  ok(Array.isArray(w3.caps) && w3.A0.length >= 1 && w3.D0.length >= 1 && w3.snap === undefined, 'restore: 진행 중 구형 전쟁에 caps·A0·D0 채움, snap은 비워 둠');
}

// 8) 직렬화 왕복: 요약이 저장·복원됨
{
  const map = await loadEarthNode('./data');
  const S = sim.createState(map, { mode: 'real', seed: 11 });
  for (let i = 0; i < 300; i++) sim.step(S, map);
  const n0 = S.warHist.length;
  const S2 = sim.restore(sim.serialize(S));
  ok(S2.warHist.length === n0, '직렬화 왕복: 종전 요약 보존');
}

// 9) 경계 정합: 종전 당해의 마지막 점령·멸망이 결과에 즉시 반영 (캐시 집계 지연 없음)
{
  const map = await loadEarthNode('./data');
  const S = sim.createState(map, { mode: 'real', seed: 13 });
  const big = S.nations.filter((n) => n.alive && n.pc > 5);
  const a = big[0], d = big[1];
  sim.startWar(S, map, a, d);
  const w = S.wars[S.wars.length - 1];
  const sa = w.snap[a.id][1], sd = w.snap[d.id][1];
  const dq = S.P.owner.findIndex((o) => o === d.id);
  S.P.owner[dq] = a.id; // 종전 직전 마지막 점령 (올해 집계는 아직 안 돈 상태)
  sim.endWar(S, map, w, 'A');
  const s1 = S.warHist[S.warHist.length - 1];
  ok(s1.now[a.id][1] === sa + 1 && s1.now[d.id][1] === sd - 1, '마지막 점령이 종전 영토에 즉시 반영');
  const c = big[2], e = big[3];
  sim.startWar(S, map, c, e);
  const w2 = S.wars[S.wars.length - 1];
  const se = w2.snap[e.id][1];
  for (let p = 0; p < S.P.owner.length; p++) if (S.P.owner[p] === e.id) S.P.owner[p] = c.id; // 멸망 직후 상태
  sim.endWar(S, map, w2, 'A');
  const s2 = S.warHist[S.warHist.length - 1];
  ok(se > 0 && s2.now[e.id][1] === 0 && s2.now[e.id][0] === 0, '멸망 경계: 종전 시점 소유 0을 정확히 반영');
}

if (fails) { console.error(fails + '개 실패'); process.exit(1); }
console.log('ALL OK');
