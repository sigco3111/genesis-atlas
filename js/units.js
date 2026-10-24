// 자율 부대 전투: 전쟁 중인 국가가 스스로 부대를 편성해 행군·회전·포위로 싸운다.
// DOM/Canvas에 의존하지 않는 순수 로직 모듈. 시각화는 render.js가 S.armies를 읽어 처리한다.
import { findLandPath, pathLen, captureProvince, addLog } from './sim.js';
import { engTouch, engSweep } from './battles.js';

export const ARMY_GLOBAL_MAX = 70;      // 세계 전체 부대 상한
export const ARMY_SPEED = 26;           // 1년에 이동하는 지도 픽셀. 무역선(26px/년)과 같은 체감 속도로 낮춰 행군이 여러 해에 걸쳐 눈에 보이게 한다
export const BATTLE_RANGE = 18;         // 이 거리 안의 적 부대와 회전
const SIEGE_RANGE = 14;                 // 목표 지방 앵커에 이 만큼 가까우면 포위
const MIN_MEN = 80;                     // 이보다 적으면 소멸
const RETREAT_FRAC = 0.42;              // 초기 병력의 이 비율 아래면 후퇴

// 시대(기술 수준)별 병종: 부대 표식·아이콘이 바뀌고 전투력·이동 속도에 차이를 둔다
// 시대 구분은 국가 기술 n.tech의 정수부(eraCheck와 동일 기준)를 그대로 쓴다
export const ERA_UNITS = [
  { key: '돌도끼 전사', str: 1.00, spd: 0.90 }, // 0 석기
  { key: '청동 창병',   str: 1.03, spd: 0.95 }, // 1 청동기
  { key: '철기 검병',   str: 1.06, spd: 1.00 }, // 2 철기
  { key: '군단 중보병', str: 1.10, spd: 1.00 }, // 3 고전
  { key: '중세 기병',   str: 1.15, spd: 1.18 }, // 4 중세: 기동력 우위
  { key: '화승총병',    str: 1.21, spd: 1.06 }, // 5 근세
  { key: '소총·포병',   str: 1.29, spd: 1.10 }, // 6 산업
  { key: '기갑 부대',   str: 1.40, spd: 1.30 }, // 7 현대
  { key: '정밀 타격군', str: 1.55, spd: 1.36 }, // 8 정보화
  { key: '궤도 강하군', str: 1.75, spd: 1.45 }, // 9 우주
];
export function eraOf(n) { return Math.min(9, Math.max(0, Math.floor(n && n.tech || 0))); }
export function unitOf(n) { return ERA_UNITS[eraOf(n)]; }

const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
const shieldOf = (S, nat) => (S.buffs || []).some((b) => b.nat === nat && (b.kind || 'golden') === 'shield' && (b.until == null || b.until > S.year));

// 지휘관: 편성될 때 이름과 기질을 얻는다. 기질은 전투·행군·포위·사기에 작은 보정을 준다
const CMD_FAM = ['강', '김', '박', '서', '송', '유', '윤', '장', '조', '한', '백', '류', '문', '오', '진', '하'];
const CMD_GIV = ['무진', '태웅', '도윤', '서준', '하랑', '시율', '건우', '이안', '준혁', '세찬', '다온', '한결', '민재', '라온', '해솔', '재하', '율', '현우'];
export const CMD_TRAITS = [
  { key: '맹장', desc: '공세' },   // 전투력 +9%
  { key: '책사', desc: '포위' },   // 포위 진행 +30%
  { key: '기동장', desc: '기동' }, // 이동 +14%
  { key: '명장', desc: '사기' },   // 사기 하락 -35%
];
export function makeCommander(rng, id) {
  return { n: CMD_FAM[rng.int(CMD_FAM.length)] + CMD_GIV[rng.int(CMD_GIV.length)], t: rng.int(CMD_TRAITS.length), id }; // id: 전적 추적용 영구 번호 (옛 저장에는 없을 수 있고, 교전 기록 때 부여)
}
export const cmdTrait = (a) => (a.cmd ? a.cmd.t : -1);

// 국가당 부대 상한: 영토가 클수록 많이 유지
export function armyCap(n) { return Math.min(5, 1 + Math.floor(n.pc / 3)); }

// 전쟁 중인 두 나라인지
export function atWar(S, a, b) {
  for (const w of S.wars) if ((w.A.includes(a) && w.D.includes(b)) || (w.A.includes(b) && w.D.includes(a))) return w;
  return null;
}

// 부대의 현재 전투력: 병력 × 기술 × 지형(고도) × 방패
// 보급: 본국 수도에서 멀수록 전투력·소모가 나빠진다 (0.6~1)
export function supplyOf(map, a) {
  const h = map.provinces[a.home]; if (!h) return 1;
  const d = Math.hypot(a.x - h.ax, a.y - h.ay);
  return clamp(1 - Math.max(0, d - 160) / 700, 0.6, 1);
}
// 사기(0~1)·경험(0~1)은 옛 저장에 없을 수 있으므로 기본값을 둔다
export const moraleOf = (a) => a.mor == null ? 1 : a.mor;
export const xpOf = (a) => a.xp == null ? 0 : a.xp;
export function armyStrength(S, map, a, defenderProv = -1) {
  const n = S.nations[a.nat]; if (!n) return 0;
  let s = a.men * (1 + 0.12 * n.tech) * unitOf(n).str;
  s *= (0.73 + 0.27 * moraleOf(a)) * (1 + 0.28 * xpOf(a)) * supplyOf(map, a) * (cmdTrait(a) === 0 ? 1.09 : 1);
  if (defenderProv >= 0) s *= 1 + 0.3 * map.provinces[defenderProv].e;
  if (shieldOf(S, a.nat)) s *= 1.25;
  return s;
}

// 픽셀 좌표의 지방 번호 (맵 밖이면 -1)
export function provAt(map, x, y) {
  const xi = Math.round(x), yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= map.W || yi >= map.H) return -1;
  return map.prov[yi * map.W + xi];
}

// 공격 목표 선택: 전선(S.fr)에 맞닿은 적 지방 중 도시·인구 가중치가 큰 곳
function pickTarget(S, map, n, w) {
  const rng = S.rng, P = S.P; const foes = w.A.includes(n.id) ? w.D : w.A;
  let best = -1, bs = 0;
  for (const f of foes) {
    const list = S.fr.get(n.id * 4096 + f) || S.fr.get(f * 4096 + n.id);
    if (!list) continue;
    for (let i = 0; i < Math.min(6, list.length); i++) {
      const e = list[rng.int(list.length)];
      const q = P.owner[e[0]] === n.id ? e[1] : e[0];
      if (P.owner[q] === n.id || P.owner[q] < 0) continue;
      const sc = 1 + P.city[q] * 1.6 + Math.min(2, P.pop[q] / 1200) + rng.next() * 0.8;
      if (sc > bs) { bs = sc; best = q; }
    }
  }
  return best;
}

// 새 부대 편성: 수도에서 징집, 병력만큼 수도 인구가 줄어든다
function muster(S, map, n, w) {
  const rng = S.rng, P = S.P;
  const cap = n.cap; if (cap < 0 || P.owner[cap] !== n.id) return false;
  const men = clamp(Math.round(n.pop * 0.004 * (0.85 + rng.next() * 0.3)), 150, 4500);
  if (P.pop[cap] < men * 2.5) return false; // 수도가 감당 못 하면 징집하지 않음
  const tgt = pickTarget(S, map, n, w);
  if (tgt < 0) return false;
  const A = map.provinces[cap], B = map.provinces[tgt];
  const path = findLandPath(map, A.ax, A.ay, B.ax, B.ay);
  if (!path) return false; // 육로가 없으면(바다 건너) 이번 라운드에서는 보내지 않음
  P.pop[cap] -= men;
  S.armies.push({
    id: S.nextArmy++, nat: n.id, men, men0: men, x: A.ax, y: A.ay,
    path, dlen: pathLen(path), prog: 0, tgt, home: cap, st: 'march', sg: 0, war: w.id, mor: 1, xp: 0, cmd: makeCommander(rng, (S.nextCmd = (S.nextCmd || 1) + 1) - 1),
  });
  return true;
}

// 후퇴 경로 설정: 가장 가까운 아군 지방으로
function retreat(S, map, a) {
  const P = S.P; let best = -1, bd = 1e18;
  for (let q = 0; q < map.provinces.length; q++) {
    if (P.owner[q] !== a.nat) continue;
    const o = map.provinces[q]; const d = (o.ax - a.x) ** 2 + (o.ay - a.y) ** 2;
    if (d < bd) { bd = d; best = q; }
  }
  if (best < 0) { a.men = 0; return; } // 갈 곳이 없으면 전멸 처리
  const o = map.provinces[best];
  const path = findLandPath(map, a.x, a.y, o.ax, o.ay);
  a.st = 'retreat'; a.sg = 0; a.tgt = best;
  if (path) { a.path = path; a.dlen = pathLen(path); a.prog = 0; } else { a.path = null; a.x = o.ax; a.y = o.ay; }
}

// 회전 한 해 진행: 양쪽이 피해를 입고, 한쪽이 무너지면 후퇴·소멸
export function battleTick(S, map, A, B) {
  const rng = S.rng;
  const provA = provAt(map, A.x, A.y), provB = provAt(map, B.x, B.y);
  const sA = armyStrength(S, map, A, provB) * rng.range(0.85, 1.15);
  const sB = armyStrength(S, map, B, provA) * rng.range(0.85, 1.15);
  const dA = Math.min(A.men, B.men * 0.26 * Math.sqrt(sB / Math.max(1, sA)) * rng.range(0.7, 1.3));
  const dB = Math.min(B.men, A.men * 0.26 * Math.sqrt(sA / Math.max(1, sB)) * rng.range(0.7, 1.3));
  const mA0 = A.men, mB0 = B.men;
  A.men -= dA; B.men -= dB; S.deaths.war += dA + dB;
  // 전장 흔적: 큰 전투가 벌어진 자리는 수십 년간 지도에 남는다 (저장에 포함, 옛 저장엔 없으면 새로 만든다)
  S.fields = S.fields || [];
  if (dA + dB > 350) {
    const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
    const near = S.fields.find((f) => Math.hypot(f.x - mx, f.y - my) < 14);
    if (near) { near.y0 = S.year; near.k = Math.min(3, near.k + (dA + dB > 900 ? 1 : 0)); }
    else { S.fields.push({ x: mx, y: my, y0: S.year, k: dA + dB > 900 ? 2 : 1 }); if (S.fields.length > 80) S.fields.shift(); }
  }
  // 사기·경험: 손실이 큰 쪽은 사기가 꺾이고, 더 많이 쓰러뜨린 쪽은 경험과 사기를 얻는다
  for (const [U, loss, dealt, m0] of [[A, dA, dB, mA0], [B, dB, dA, mB0]]) {
    const lf = loss / Math.max(1, U.men0);
    U.mor = clamp(moraleOf(U) - lf * 1.7 * (cmdTrait(U) === 3 ? 0.65 : 1) + (dealt > loss ? 0.035 : -0.01), 0, 1);
    U.xp = clamp(xpOf(U) + 0.04 + (dealt > loss ? 0.05 : 0), 0, 1);
  }
  if (S.year % 2 === 0) { const p = provA >= 0 ? provA : provB; if (p >= 0) S.fxQueue.push([p, 'war']); }
  for (const [U, sU, sF] of [[A, sA, sB], [B, sB, sA]]) {
    if (U.men < MIN_MEN) {
      U.men = 0;
      if (U.cmd && xpOf(U) >= 0.25 && !U.fallen) { U.fallen = 1; const un = S.nations[U.nat]; if (un) addLog(S, `${un.name}의 ${CMD_TRAITS[U.cmd.t].key} ${U.cmd.n}이(가) 전사하고 부대가 괴멸했습니다.`, 2, provAt(map, U.x, U.y), U.nat, (U === A ? B : A).nat); }
    }
    else if ((U.men < U.men0 * RETREAT_FRAC || moraleOf(U) < 0.18) && U.st !== 'retreat') {
      const foe = U === A ? B : A; const fn = S.nations[foe.nat], un = S.nations[U.nat];
      if (un && fn && U.men0 + foe.men0 > 1500) addLog(S, `${fn.name}의 ${unitOf(fn).key}이(가) ${un.name}의 ${unitOf(un).key}을(를) 물리쳤습니다.`, 2, provAt(map, U.x, U.y), fn.id, un.id);
      retreat(S, map, U);
    }
  }
}

// 포위 한 해 진행: 포위가 끝나면 지방을 점령
function siegeTick(S, map, a, w) {
  const rng = S.rng, P = S.P, q = a.tgt;
  const ow = P.owner[q];
  if (ow < 0 || ow === a.nat || !atWar(S, a.nat, ow)) { a.st = 'march'; a.tgt = -1; a.sg = 0; return; }
  const o = map.provinces[q];
  const need = (1 + 0.45 * o.e + P.city[q] * 0.35) * (shieldOf(S, ow) ? 1.6 : 1);
  // 공성 장비: 시대가 오를수록 성벽을 빨리 무너뜨리고, 수비측 도시는 성벽 시대가 낮으면 버티기 쉽다
  const ea = eraOf(S.nations[a.nat]), ed = eraOf(S.nations[ow]);
  const engine = ea >= 7 ? 1.55 : ea >= 5 ? 1.3 : ea >= 3 ? 1.12 : 1;
  const wall = 1 + Math.max(0, P.city[q] - 1) * 0.12 * (ed >= ea ? 1 : 0.6);
  a.sg += Math.max(a.men, 1000) / (2600 * need) * (cmdTrait(a) === 1 ? 1.3 : 1) * engine / wall; // 소규모 부족군도 몇 해 안에 결판이 나도록 하한을 둔다
  // 농성군의 출격: 큰 도시일수록 포위군에 작은 피해를 준다
  if (P.city[q] >= 2) { const sortie = a.men * 0.006 * (P.city[q] - 1); a.men -= sortie; S.deaths.war += sortie; }
  const attr = a.men * 0.03 * (2 - supplyOf(map, a)); a.men -= attr; S.deaths.war += attr;
  const drain = P.pop[q] * 0.012; P.pop[q] = Math.max(0, P.pop[q] - drain); S.deaths.war += drain;
  if (S.year % 2 === 0) S.fxQueue.push([q, 'war']);
  if (a.men < MIN_MEN) { a.men = 0; return; }
  if (a.sg >= 1) {
    a.sg = 0; a.xp = clamp(xpOf(a) + 0.12, 0, 1); a.mor = clamp(moraleOf(a) + 0.2, 0, 1);
    captureProvince(S, map, q, ow, a.nat, w, a.home);
    if (a.cmd && xpOf(a) >= 0.45 && !a.cmdFame) { a.cmdFame = 1; const nn = S.nations[a.nat]; if (nn) addLog(S, `${nn.name}의 ${CMD_TRAITS[a.cmd.t].key} ${a.cmd.n}이(가) ${S.provName[q] || '적지'}를 함락하며 명성을 떨쳤습니다.`, 2, q, a.nat, ow); }
    a.st = 'march'; a.tgt = -1; // 다음 목표는 stepArmies가 고른다
  }
}

// 전쟁이 끝나면 그 전쟁의 부대는 해산하고 병력 일부가 고향으로 돌아간다
export function onWarEnd(S, map, w) {
  const P = S.P;
  for (const a of S.armies) {
    if (a.war !== w.id) continue;
    const n = S.nations[a.nat];
    if (n && n.alive && n.cap >= 0 && P.owner[n.cap] === n.id) P.pop[n.cap] += Math.round(a.men * 0.7);
    a.men = 0;
  }
  S.armies = S.armies.filter((a) => a.men > 0);
}

// 한 해 진행: 편성 → 이동 → 회전 → 포위 → 해산
export function stepArmies(S, map) {
  const rng = S.rng, P = S.P;
  S.armies = S.armies || [];
  // 1) 편성: 전쟁 중인 나라가 상한 안에서 새 부대를 띄운다 (전쟁 초기에 집중)
  if (S.armies.length < ARMY_GLOBAL_MAX) {
    for (const w of S.wars) {
      for (const id of [...w.A, ...w.D]) {
        const n = S.nations[id]; if (!n || !n.alive) continue;
        const have = S.armies.reduce((c, a) => c + (a.nat === id ? 1 : 0), 0);
        if (have >= armyCap(n)) continue;
        const dur = S.year - w.start;
        const p = dur < 2 ? 0.5 : 0.12; // 개전 직후 빠르게 편성, 이후 가끔 보충
        if (rng.next() < p) muster(S, map, n, w);
        if (S.armies.length >= ARMY_GLOBAL_MAX) break;
      }
    }
  }
  // 2) 부대별 행동
  for (const a of S.armies) {
    const n = S.nations[a.nat];
    if (!n || !n.alive) { a.men = 0; continue; }
    const w = S.wars.find((z) => z.id === a.war);
    if (!w) { a.men = 0; continue; } // 전쟁이 끝난 부대는 onWarEnd에서 해산됨
    if (a.st === 'battle') continue; // 회전은 아래에서 한 번에 처리
    // 목표 재선정
    if (a.tgt < 0 || (a.st === 'march' && (!a.path || a.prog >= a.dlen))) { // 경로가 없거나 이미 도달한 상태(포위 해제 직후 등)면 목표를 다시 고른다
      const t = pickTarget(S, map, n, w);
      if (t < 0) { // 더 뺏을 곳이 없으면 귀환
        retreat(S, map, a); a.st = 'garrison'; continue;
      }
      const B = map.provinces[t];
      const path = findLandPath(map, a.x, a.y, B.ax, B.ay);
      a.tgt = t; a.sg = 0;
      if (path) { a.path = path; a.dlen = pathLen(path); a.prog = 0; a.st = 'march'; }
      else { a.st = 'garrison'; a.path = null; } // 육로 불가: 주둔
    }
    if (a.st === 'march') a.mor = clamp(moraleOf(a) + 0.03, 0, 1);
    else if (a.st === 'garrison' || a.st === 'retreat') a.mor = clamp(moraleOf(a) + 0.06, 0, 1);
    else if (a.st === 'siege' && supplyOf(map, a) < 0.8) a.mor = clamp(moraleOf(a) - 0.015, 0, 1);
    if (a.st === 'march' || a.st === 'retreat') {
      if (!a.path || a.dlen <= 0) { a.st = a.st === 'retreat' ? 'garrison' : a.st; a.tgt = a.st === 'garrison' ? a.tgt : -1; continue; }
      const elev = map.provinces[provAt(map, a.x, a.y) >= 0 ? provAt(map, a.x, a.y) : a.home] || { e: 0 };
      a.prog += ARMY_SPEED * unitOf(n).spd * (cmdTrait(a) === 2 ? 1.14 : 1) * (1 - 0.3 * Math.min(1, elev.e)) * (a.st === 'retreat' ? 1.25 : 1);
      if (a.prog >= a.dlen) {
        const last = a.path[a.path.length - 1]; a.x = last[0]; a.y = last[1];
        if (a.st === 'retreat') { a.st = 'garrison'; a.path = null; }
        else {
          const q = a.tgt;
          if (q >= 0 && P.owner[q] >= 0 && P.owner[q] !== a.nat && atWar(S, a.nat, P.owner[q])) a.st = 'siege';
          else { a.tgt = -1; a.path = null; }
        }
      } else {
        // 경로 위 현재 위치 갱신
        let d = a.prog, x = a.path[0][0], y = a.path[0][1];
        for (let i = 1; i < a.path.length; i++) {
          const dx = a.path[i][0] - a.path[i - 1][0], dy = a.path[i][1] - a.path[i - 1][1], l = Math.hypot(dx, dy);
          if (d <= l || i === a.path.length - 1) { const f = l ? Math.min(1, d / l) : 0; x = a.path[i - 1][0] + dx * f; y = a.path[i - 1][1] + dy * f; break; }
          d -= l;
        }
        a.x = x; a.y = y;
      }
    } else if (a.st === 'siege') {
      siegeTick(S, map, a, w);
    } else if (a.st === 'garrison') {
      // 주둔지에서 천천히 보충, 전황이 있으면 다시 출정
      const cap = Math.min(4500, Math.max(150, Math.round(n.pop * 0.004)));
      if (a.men < cap) {
        const add = Math.min(cap - a.men, cap * 0.08);
        const src = n.cap >= 0 && P.owner[n.cap] === n.id ? n.cap : -1;
        if (src >= 0 && P.pop[src] > add * 3) { P.pop[src] -= add; a.men += add; a.men0 = Math.max(a.men0, a.men); }
      }
      if (a.men > 0.7 * Math.min(4500, Math.max(150, Math.round(n.pop * 0.004))) && rng.next() < 0.3) { a.tgt = -1; a.st = 'march'; }
    }
  }
  // 2.5) 합류: 같은 나라·같은 전쟁의 부대가 행군/주둔 중 가까워지면 하나의 대군으로 합쳐진다
  for (let i = 0; i < S.armies.length; i++) {
    const A = S.armies[i]; if (A.men <= 0 || (A.st !== 'march' && A.st !== 'garrison')) continue;
    for (let j = i + 1; j < S.armies.length; j++) {
      const B = S.armies[j]; if (B.men <= 0 || B.nat !== A.nat || B.war !== A.war || (B.st !== 'march' && B.st !== 'garrison')) continue;
      if ((A.x - B.x) ** 2 + (A.y - B.y) ** 2 > 12 * 12 || A.men + B.men > 7000) continue;
      const tot = A.men + B.men, wa = A.men / tot, wb = B.men / tot;
      A.xp = clamp(xpOf(A) * wa + xpOf(B) * wb + 0.04, 0, 1); A.mor = clamp(moraleOf(A) * wa + moraleOf(B) * wb + 0.05, 0, 1);
      if (xpOf(B) > xpOf(A) && B.cmd) A.cmd = B.cmd; // 더 노련한 쪽의 지휘관이 대군을 이끈다
      A.men = tot; A.men0 = A.men0 + B.men0; B.men = 0;
      const nn = S.nations[A.nat];
      if (nn && tot > 3500) addLog(S, `${nn.name}의 부대들이 합류해 병력 ${(tot / 1000).toFixed(1)}천 명의 대군이 되었습니다.`, 1, provAt(map, A.x, A.y), A.nat, -1);
    }
  }
  // 3) 회전: 전쟁 중인 나라의 부대끼리 가까우면 교전
  for (let i = 0; i < S.armies.length; i++) {
    const A = S.armies[i]; if (A.men <= 0 || A.st === 'retreat') continue;
    for (let j = i + 1; j < S.armies.length; j++) {
      const B = S.armies[j]; if (B.men <= 0 || B.st === 'retreat') continue;
      if (A.nat === B.nat || !atWar(S, A.nat, B.nat)) continue;
      const d2 = (A.x - B.x) ** 2 + (A.y - B.y) ** 2;
      if (d2 > BATTLE_RANGE * BATTLE_RANGE) continue;
      const bp = provAt(map, A.x, A.y);
      if (A.st !== 'battle' && B.st !== 'battle' && A.men + B.men > 1600) {
        addLog(S, `${S.nations[A.nat].name}의 ${unitOf(S.nations[A.nat]).key}과(과) ${S.nations[B.nat].name}의 ${unitOf(S.nations[B.nat]).key}이(가) ${S.provName[bp] || '한 지방'}에서 격돌했습니다.`, 2, bp >= 0 ? bp : A.home, A.nat, B.nat);
      }
      A.st = 'battle'; B.st = 'battle'; // 포위 진행(sg)은 유지: 전투가 끝나면 포위를 이어간다
      engTouch(S, A, B, bp); // 교전 결과 카드용 개별 교전 추적
      battleTick(S, map, A, B);
    }
  }
  // 교전에서 벗어난 부대는 상태 복귀 (상대가 죽거나 멀어짐)
  for (const a of S.armies) {
    if (a.st !== 'battle') continue;
    const engaged = S.armies.some((b) => b !== a && b.men > 0 && b.st === 'battle' && b.nat !== a.nat && atWar(S, a.nat, b.nat) && (a.x - b.x) ** 2 + (a.y - b.y) ** 2 <= BATTLE_RANGE * BATTLE_RANGE);
    if (!engaged) {
      const backAtSiege = a.tgt >= 0 && a.path && a.prog >= a.dlen && P.owner[a.tgt] >= 0 && P.owner[a.tgt] !== a.nat && atWar(S, a.nat, P.owner[a.tgt]);
      a.st = backAtSiege ? 'siege' : 'march';
    }
  }
  // 3.5) 끝난 교전을 결과 카드로 마감 (소멸 부대 정리 전이라 전멸한 쪽의 최종 병력도 잡힌다)
  engSweep(S, map, provAt, BATTLE_RANGE, (n) => (n ? unitOf(n).key : ''));
  if (S.fields && S.fields.length && S.fields.some((f) => S.year - f.y0 > 35)) S.fields = S.fields.filter((f) => S.year - f.y0 <= 35);
  // 4) 소멸한 부대 정리
  S.armies = S.armies.filter((a) => a.men >= MIN_MEN);
}
