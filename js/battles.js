// 교전 결과 카드: 부대 대 부대의 개별 교전이 끝날 때 손실·승패·후퇴 방향을 남긴다 (순수 함수, 테스트 가능)
// 종전 요약(warhist.js)이 전쟁 전체의 결과라면, 이 기록은 교전 하나하나의 결과다.
export const BATTLE_CARDS_MAX = 40;  // 보관하는 교전 카드 최대 수 (오래된 것부터 덮어씀)
export const BATTLE_MIN_LOSS = 150;  // 양측 합산 손실이 이보다 적은 스치는 접촉은 남기지 않음

// 지휘관 전적: 교전 카드가 마감될 때 지휘관별 참전·승패·주요 전투를 내구 기록(S.cmds)에 누적한다.
// 카드(BATTLE_CARDS_MAX까지 순환)와 달리 전적은 지워지지 않고 쌓이며 저장·이어하기에 유지된다.
export const CMD_HIST_MAX = 100; // 보관하는 지휘관 전적 최대 수 (현역 우선, 오래된 비현역부터 덮어씀)
export const CMD_MAJ_MAX = 3;    // 지휘관마다 남기는 주요 전투 수 (양측 합산 손실이 큰 순)

export function pairKey(a, b) { return a < b ? a * 1e6 + b : b * 1e6 + a; }

// 지휘관에게 영구 번호를 붙인다 (옛 저장의 지휘관은 처음 기록될 때 번호를 받는다)
export function cmdUid(S, cmd) {
  if (!cmd) return 0;
  if (cmd.id == null) { S.nextCmd = S.nextCmd || 1; cmd.id = S.nextCmd++; }
  return cmd.id;
}

// 지휘관 번호의 전적 레코드를 찾거나 만든다
export function careerOf(S, id, cmd, nat) {
  const list = S.cmds || (S.cmds = []);
  let r = list.find((x) => x.id === id);
  if (!r) { r = { id, n: cmd.n, t: cmd.t, nat, b: 0, w: 0, l: 0, died: 0, maj: [] }; list.push(r); }
  return r;
}

// 마감된 카드 한 장의 결과를 양쪽 지휘관 전적에 반영한다 (engSweep 안에서 호출)
function cmdNote(S, c, side, cmd, nat, dead) {
  const id = cmdUid(S, cmd);
  const r = careerOf(S, id, cmd, nat);
  r.b++;
  const won = c.win === side, lost = c.win && c.win !== side;
  if (won) r.w++; else if (lost) r.l++;
  const ml = side === 'a' ? c.al : c.bl, fl = side === 'a' ? c.bl : c.al;
  const tot = ml + fl;
  const m = { y: c.y, p: c.p, place: c.place, vs: side === 'a' ? c.bn : c.an, r: won ? 1 : lost ? -1 : 0, ml, fl, tot };
  r.maj.push(m);
  r.maj.sort((p, q) => q.tot - p.tot);
  if (r.maj.length > CMD_MAJ_MAX) r.maj.length = CMD_MAJ_MAX;
  if (dead && !r.died) r.died = c.y1;
  return id;
}

// 전적 상한: 현역(지금 부대를 이끄는 지휘관)을 우선 보존하고 오래된 비현역부터 버린다
export function cmdTrim(S) {
  const list = S.cmds; if (!list || list.length <= CMD_HIST_MAX) return;
  const active = new Set((S.armies || []).map((a) => a.cmd && a.cmd.id).filter((v) => v != null));
  let i = 0;
  while (list.length > CMD_HIST_MAX && i < list.length) {
    if (!active.has(list[i].id)) list.splice(i, 1); else i++;
  }
  if (list.length > CMD_HIST_MAX) list.splice(0, list.length - CMD_HIST_MAX);
}

// 교전 갱신: 회전 처리에서 전투 중인 쌍마다 매 해 호출. 처음 보는 쌍이면 그때의 병력을 초기 병력으로 교전을 연다
export function engTouch(S, A, B, p) {
  const open = S.battlesOpen || (S.battlesOpen = {});
  const k = pairKey(A.id, B.id);
  let e = open[k];
  if (!e) e = open[k] = { a: A.id, b: B.id, na: A.nat, nb: B.nat, y0: S.year, p: p >= 0 ? p : -1, m: { [A.id]: Math.round(A.men), [B.id]: Math.round(B.men) } };
  e.ly = S.year;
  return e;
}

// 열린 교전을 훑어 끝난 것을 카드로 마감한다. stepArmies의 회전·상태 복귀 처리 후, 소멸 부대 정리 전에 호출.
// 종료 조건: 한쪽이 죽었거나(dead), 한쪽이 후퇴를 시작했거나(rout), 교전 상태가 풀렸거나 멀어짐(split).
// provAt(map,x,y)->지방 번호, range: 교전 거리, unitKey(nation)->병종 이름(선택)
export function engSweep(S, map, provAt, range, unitKey) {
  const open = S.battlesOpen; if (!open) return;
  const cards = S.battles || (S.battles = []);
  for (const k of Object.keys(open)) {
    const e = open[k];
    const A = S.armies.find((x) => x.id === e.a), B = S.armies.find((x) => x.id === e.b);
    let why = '';
    if (!A || !B) why = 'split';
    else if (A.men <= 0 || B.men <= 0) why = 'dead';
    else if (A.st === 'retreat' || B.st === 'retreat') why = 'rout';
    else if (A.st !== 'battle' || B.st !== 'battle') why = 'split';
    else if ((A.x - B.x) ** 2 + (A.y - B.y) ** 2 > range * range) why = 'split';
    if (!why) continue;
    delete open[k];
    const mA = A ? Math.max(0, Math.round(A.men)) : 0, mB = B ? Math.max(0, Math.round(B.men)) : 0;
    const m0A = e.m[e.a] || 0, m0B = e.m[e.b] || 0;
    const la = Math.max(0, m0A - mA), lb = Math.max(0, m0B - mB);
    if (la + lb < BATTLE_MIN_LOSS) continue; // 가벼운 접촉은 기록하지 않음
    let win = '';
    if (why === 'dead') win = mA <= 0 && mB <= 0 ? '' : mA <= 0 ? 'b' : 'a';
    else if (why === 'rout') win = A.st === 'retreat' && B.st === 'retreat' ? '' : A.st === 'retreat' ? 'b' : 'a';
    const loser = win === 'a' ? B : win === 'b' ? A : null;
    let ret = '';
    if (loser && loser.st === 'retreat' && loser.tgt >= 0) ret = (S.cityName && S.cityName[loser.tgt]) || (S.provName && S.provName[loser.tgt]) || '';
    const nm = (id) => (S.nations[id] && S.nations[id].name) || '?';
    const rgb = (id) => (S.nations[id] && S.nations[id].rgb) || [140, 150, 160];
    cards.push({
      y: e.y0, y1: S.year, p: e.p,
      place: e.p >= 0 ? ((S.cityName && S.cityName[e.p]) || (S.provName && S.provName[e.p]) || '') : '',
      a: e.na, b: e.nb, an: nm(e.na), bn: nm(e.nb), argb: rgb(e.na), brgb: rgb(e.nb),
      ua: A && unitKey ? unitKey(S.nations[e.na]) : '', ub: B && unitKey ? unitKey(S.nations[e.nb]) : '',
      am0: m0A, bm0: m0B, al: la, bl: lb, win, ret, why,
      ca: A && A.cmd ? { n: A.cmd.n, t: A.cmd.t, id: cmdUid(S, A.cmd) } : null,
      cb: B && B.cmd ? { n: B.cmd.n, t: B.cmd.t, id: cmdUid(S, B.cmd) } : null,
    });
    const c = cards[cards.length - 1];
    // 지휘관 전적 누적: 부대가 전멸해 갈라진 교전은 지휘관을 전사로 남긴다
    if (A && A.cmd) cmdNote(S, c, 'a', A.cmd, e.na, why === 'dead' && mA <= 0);
    if (B && B.cmd) cmdNote(S, c, 'b', B.cmd, e.nb, why === 'dead' && mB <= 0);
    if (cards.length > BATTLE_CARDS_MAX) cards.splice(0, cards.length - BATTLE_CARDS_MAX);
  }
  cmdTrim(S);
}
