// 교전 결과 카드: 부대 대 부대의 개별 교전이 끝날 때 손실·승패·후퇴 방향을 남긴다 (순수 함수, 테스트 가능)
// 종전 요약(warhist.js)이 전쟁 전체의 결과라면, 이 기록은 교전 하나하나의 결과다.
export const BATTLE_CARDS_MAX = 40;  // 보관하는 교전 카드 최대 수 (오래된 것부터 덮어씀)
export const BATTLE_MIN_LOSS = 150;  // 양측 합산 손실이 이보다 적은 스치는 접촉은 남기지 않음

export function pairKey(a, b) { return a < b ? a * 1e6 + b : b * 1e6 + a; }

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
      ca: A && A.cmd ? { n: A.cmd.n, t: A.cmd.t } : null,
      cb: B && B.cmd ? { n: B.cmd.n, t: B.cmd.t } : null,
    });
    if (cards.length > BATTLE_CARDS_MAX) cards.splice(0, cards.length - BATTLE_CARDS_MAX);
  }
}
