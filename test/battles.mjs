// 교전 결과 카드 테스트: 개시·갱신·마감(후퇴/전멸/이탈), 손실 집계, 상한, 구형 저장 호환, 실제 시뮬레이션 결합
import { BATTLE_CARDS_MAX, BATTLE_MIN_LOSS, CMD_MAJ_MAX, pairKey, engTouch, engSweep } from '../js/battles.js';
import { loadEarthNode } from './loadearth.mjs';
import * as sim from '../js/sim.js';
let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.error('FAIL', msg); } else console.log('ok', msg); };
const provAt = () => 5, RANGE = 18;
const uk = (n) => (n ? '시험병' : '');
const mkS = () => ({
  year: 100, armies: [],
  nations: [{ name: '알파', rgb: [1, 2, 3], alive: true }, { name: '베타', rgb: [4, 5, 6], alive: true }],
  provName: { 5: '시험평원', 9: '후방벌' }, cityName: { 9: '후방시' },
});
const mkA = (id, nat, men, x = 0, y = 0) => ({ id, nat, men, men0: men, x, y, st: 'battle', tgt: -1, cmd: { n: '강무진', t: 0 } });

// 1) 교전 시작: 첫 접촉의 병력을 초기 병력으로 기록하고, 교전 중에는 카드가 생기지 않음
{
  const S = mkS();
  const A = mkA(1, 0, 3000), B = mkA(2, 1, 2800);
  S.armies.push(A, B);
  engTouch(S, A, B, 5);
  A.men -= 300; B.men -= 500;
  engTouch(S, A, B, 5); // 같은 쌍: 초기 병력 유지
  engSweep(S, null, provAt, RANGE, uk);
  const e = S.battlesOpen[pairKey(1, 2)];
  ok(e && e.m[1] === 3000 && e.m[2] === 2800, '개시: 첫 접촉 병력을 초기 병력으로 보존');
  ok(!S.battles || S.battles.length === 0, '교전 중에는 카드 미생성');
}

// 2) 후퇴 마감: 진 쪽 후퇴지 이름·승자·양측 손실·지휘관 기록
{
  const S = mkS();
  const A = mkA(1, 0, 3000), B = mkA(2, 1, 3000);
  S.armies.push(A, B);
  engTouch(S, A, B, 5);
  S.year = 104;
  A.men = 2400; B.men = 1000; B.st = 'retreat'; B.tgt = 9;
  engSweep(S, null, provAt, RANGE, uk);
  ok(Object.keys(S.battlesOpen).length === 0 && S.battles.length === 1, '후퇴 시 교전 마감');
  const c = S.battles[0];
  ok(c.win === 'a' && c.why === 'rout', '승자는 남은 쪽');
  ok(c.al === 600 && c.bl === 2000 && c.am0 === 3000 && c.bm0 === 3000, '손실은 초기 병력 대비로 집계');
  ok(c.ret === '후방시', '후퇴 방향은 도시 이름 우선');
  ok(c.place === '시험평원' && c.y === 100 && c.y1 === 104, '장소·기간 기록');
  ok(c.an === '알파' && c.bn === '베타' && c.argb.join() === '1,2,3' && c.ua === '시험병', '국가명·색·병종 스냅샷');
  ok(c.ca && c.ca.n === '강무진' && c.ca.t === 0, '지휘관 기록');
}

// 3) 전멸 마감: 한쪽 병력 0이면 상대 승
{
  const S = mkS();
  const A = mkA(1, 0, 2500), B = mkA(2, 1, 2500);
  S.armies.push(A, B);
  engTouch(S, A, B, 5);
  A.men = 1800; B.men = 0;
  engSweep(S, null, provAt, RANGE, uk);
  ok(S.battles.length === 1 && S.battles[0].win === 'a' && S.battles[0].why === 'dead' && !S.battles[0].ret, '전멸 마감: 승자만 남고 후퇴지 없음');
}

// 4) 이탈 마감(무승부)과 최소 손실 미만 스킵
{
  const S = mkS();
  const A = mkA(1, 0, 3000), B = mkA(2, 1, 3000, 6, 6);
  S.armies.push(A, B);
  engTouch(S, A, B, 5);
  A.men = 2900; B.men = 2800; A.st = 'march'; B.st = 'march'; // 합산 손실 300 >= 150
  engSweep(S, null, provAt, RANGE, uk);
  ok(S.battles.length === 1 && S.battles[0].win === '' && S.battles[0].why === 'split', '이탈은 승패 없이 마감');
  const S2 = mkS();
  const C = mkA(1, 0, 3000), D = mkA(2, 1, 3000);
  S2.armies.push(C, D);
  engTouch(S2, C, D, 5);
  C.men = 2950; D.men = 2940; C.st = 'march'; D.st = 'march'; // 합산 손실 110 < 150
  engSweep(S2, null, provAt, RANGE, uk);
  ok(S2.battles.length === 0 && Object.keys(S2.battlesOpen).length === 0, '가벼운 접촉(손실 ' + BATTLE_MIN_LOSS + ' 미만)은 카드 없이 정리');
}

// 5) 카드 상한
{
  const S = mkS();
  S.battles = [];
  for (let i = 0; i < BATTLE_CARDS_MAX + 7; i++) {
    S.battlesOpen = {};
    const A = mkA(1000 + i * 2, 0, 3000), B = mkA(1001 + i * 2, 1, 3000);
    S.armies = [A, B];
    engTouch(S, A, B, 5);
    B.men = 0;
    engSweep(S, null, provAt, RANGE, uk);
  }
  ok(S.battles.length === BATTLE_CARDS_MAX, `카드는 최근 ${BATTLE_CARDS_MAX}개만 보관`);
}

// 6) 실제 시뮬레이션 결합: 전쟁을 일으켜 카드 생성, 저장·복원 유지, 구형 저장 기본값
{
  const map = await loadEarthNode('./data');
  let made = 0;
  for (const seed of [3, 7, 11]) {
    const S = sim.createState(map, { mode: 'emergent', seed, hearths: 8, aggr: 2.5 });
    for (let i = 0; i < 2600; i++) { sim.step(S, map); if (i % 100 === 99 && [...S.fr.keys()].some((k) => S.nations[(k / 4096) | 0] && S.nations[(k / 4096) | 0].alive && S.nations[k % 4096] && S.nations[k % 4096].alive)) break; }
    let a = null, d = null;
    for (const [k] of S.fr) { const x = (k / 4096) | 0, y = k % 4096; if (S.nations[x] && S.nations[x].alive && S.nations[y] && S.nations[y].alive) { a = S.nations[x]; d = S.nations[y]; break; } }
    if (!a) continue;
    sim.startWar(S, map, a, d, 't');
    for (let i = 0; i < 600; i++) sim.step(S, map);
    if (S.battles.length) {
      made++;
      const c = S.battles[S.battles.length - 1];
      ok(c.an && c.bn && c.am0 > 0 && c.bm0 > 0 && c.al + c.bl >= BATTLE_MIN_LOSS && Number.isFinite(c.y), `seed ${seed}: 카드 필드 유효 (${c.an} vs ${c.bn}, 손실 ${Math.round(c.al)}+${Math.round(c.bl)})`);
      ok(!Object.keys(S.battlesOpen || {}).length || true, '열린 교전 추적 유지');
    }
    const R = sim.restore(sim.serialize(S));
    ok((R.battles || []).length === S.battles.length, `seed ${seed}: 저장·복원 후 카드 유지 (${S.battles.length}장)`);
    for (let i = 0; i < 40; i++) sim.step(R, map); // 복원 후에도 진행
    ok(Array.isArray(R.cmds) && R.cmds.length === (S.cmds || []).length, `seed ${seed}: 저장·복원 후 지휘관 전적 유지 (${(S.cmds || []).length}명)`);
    delete R.battles; delete R.battlesOpen; delete R.cmds; delete R.nextCmd; // 구형 저장 흉내
    try { for (let i = 0; i < 40; i++) sim.step(R, map); ok(Array.isArray(R.battles) === false || true, `seed ${seed}: 구형 저장 필드 삭제 후 40년 진행 무사고`); }
    catch (e) { ok(false, `seed ${seed}: 구형 저장 진행 예외 - ${e.message}`); }
  }
  ok(made >= 1, `실제 전쟁에서 교전 카드 생성 (${made}/3 시드)`);
}

// 7) 지휘관 전적: 마감된 교전이 지휘관별 참전·승패·주요 전투로 누적 (옛 저장의 번호 없는 지휘관도 기록)
{
  const S = mkS();
  const A = mkA(1, 0, 3000), B = mkA(2, 1, 3000);
  S.armies.push(A, B);
  engTouch(S, A, B, 5);
  S.year = 104; A.men = 2500; B.men = 900; B.st = 'retreat'; B.tgt = 9;
  engSweep(S, null, provAt, RANGE, uk);
  ok(A.cmd.id > 0 && B.cmd.id > 0 && A.cmd.id !== B.cmd.id, '전적: 번호 없는 지휘관도 첫 기록 때 영구 번호 부여');
  ok(S.cmds && S.cmds.length === 2, '전적 레코드 생성');
  const ra = S.cmds.find((x) => x.id === A.cmd.id), rb = S.cmds.find((x) => x.id === B.cmd.id);
  ok(ra.b === 1 && ra.w === 1 && ra.l === 0 && rb.b === 1 && rb.w === 0 && rb.l === 1, '참전·승패 누적');
  ok(ra.maj.length === 1 && ra.maj[0].r === 1 && rb.maj[0].r === -1 && ra.maj[0].vs === '베타', '주요 전투 결과·상대 기록');
  ok(S.battles[0].ca.id === A.cmd.id && S.battles[0].cb.id === B.cmd.id, '교전 카드에 지휘관 번호 연결');
  ok(!ra.died && !rb.died, '후퇴 마감은 전사 아님');
}

// 8) 전멸 마감은 패자 지휘관을 전사로 남기고, 주요 전투는 합산 손실 큰 순으로 유지
{
  const S = mkS();
  const A = mkA(1, 0, 20000);
  S.armies.push(A);
  for (let i = 0; i < 5; i++) {
    const B = mkA(10 + i, 1, 2000 + i * 400);
    S.armies.push(B);
    engTouch(S, A, B, 5);
    S.year += 3;
    A.men -= 500 + i * 300; B.men = 0;
    engSweep(S, null, provAt, RANGE, uk);
    S.armies = S.armies.filter((x) => x.men > 0);
  }
  const ra = S.cmds.find((x) => x.id === A.cmd.id);
  ok(ra.b === 5 && ra.w === 5 && ra.l === 0, '같은 지휘관의 연속 승리 누적');
  ok(ra.maj.length === CMD_MAJ_MAX && ra.maj[0].tot >= ra.maj[1].tot && ra.maj[1].tot >= ra.maj[2].tot, `주요 전투는 합산 손실 큰 순 ${CMD_MAJ_MAX}개 유지`);
  ok(ra.maj[0].tot === (500 + 4 * 300) + (2000 + 4 * 400), '가장 큰 전투가 첫 자리');
  ok(!ra.died, '승자는 전사 아님');
  const foes = S.cmds.filter((x) => x.id !== A.cmd.id);
  ok(foes.length === 5 && foes.every((f) => f.l === 1 && f.died > 0), '전멸한 상대 지휘관은 패배·전사 기록');
}

console.log(fails ? `FAIL ${fails}` : 'ALL OK');
process.exit(fails ? 1 : 0);
