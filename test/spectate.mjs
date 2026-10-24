// 주요 전투 자동 관전 테스트: 대상 선택과 진행 중 판정
import { pickSpectate, spectateLive, SPECTATE_MIN_MEN } from '../js/spectate.js';
import { pairKey } from '../js/battles.js';
let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.error('FAIL', msg); } else console.log('ok', msg); };

const army = (id, men, st = 'battle') => ({ id, men, st, x: 0, y: 0 });
const eng = (A, B) => ({ a: A.id, b: B.id, na: 0, nb: 1, y0: 100, p: 5, m: { [A.id]: Math.round(A.men), [B.id]: Math.round(B.men) } });
const wrap = (armies, engs) => {
  const open = {};
  for (const e of engs) open[pairKey(e.a, e.b)] = e;
  return { armies, battlesOpen: open };
};

// 1) 열린 교전이 없으면 후보 없음
ok(pickSpectate(wrap([], []), new Set()) === null, '열린 교전이 없으면 null');
ok(pickSpectate({ armies: [] }, new Set()) === null, 'battlesOpen 자체가 없어도 null');

// 2) 기준 미만의 작은 교전은 주요 전투가 아님
{
  const A = army(1, 900), B = army(2, 800); // 합 1700: 격돌 로그는 뜨지만 자동 관전 기준(3000) 미만
  ok(pickSpectate(wrap([A, B], [eng(A, B)]), new Set()) === null, '합산 ' + SPECTATE_MIN_MEN + ' 미만 교전은 고르지 않음');
}

// 3) 큰 교전을 고르고, 병력이 많은 쪽 부대를 따라감
{
  const A = army(1, 2500), B = army(2, 1200);
  const p = pickSpectate(wrap([A, B], [eng(A, B)]), new Set());
  ok(p && p.key === pairKey(1, 2) && p.id === 1 && p.tot === 3700, '큰 교전을 고르고 병력 많은 쪽을 따라감');
}

// 4) 여러 큰 교전이면 초기 병력 합이 가장 큰 것을 고름
{
  const A = army(1, 2500), B = army(2, 1200), C = army(3, 4000), D = army(4, 3800);
  const p = pickSpectate(wrap([A, B, C, D], [eng(A, B), eng(C, D)]), new Set());
  ok(p && p.key === pairKey(3, 4) && p.id === 3, '여러 교전 중 가장 큰 교전을 고름');
}

// 5) 이용자가 놓아준(released) 교전은 다시 잡지 않음
{
  const A = army(1, 2500), B = army(2, 1200), C = army(3, 4000), D = army(4, 3800);
  const S = wrap([A, B, C, D], [eng(A, B), eng(C, D)]);
  const p = pickSpectate(S, new Set([pairKey(3, 4)]));
  ok(p && p.key === pairKey(1, 2), '놓아준 교전을 빼고 다음 교전을 고름');
  ok(pickSpectate(S, new Set([pairKey(1, 2), pairKey(3, 4)])) === null, '모두 놓아줬으면 null');
}

// 6) 교전 상태가 아니거나 전멸·소멸한 부대는 제외
{
  const A = army(1, 2500, 'march'), B = army(2, 1200);
  ok(pickSpectate(wrap([A, B], [eng(A, B)]), new Set()) === null, '한쪽이 행군 상태면 고르지 않음');
  const C = army(3, 0), D = army(4, 3800);
  ok(pickSpectate(wrap([C, D], [eng(C, D)]), new Set()) === null, '한쪽이 전멸(men 0)이면 고르지 않음');
  const E = army(5, 2500);
  ok(pickSpectate(wrap([E], [{ a: 5, b: 99, na: 0, nb: 1, y0: 1, p: -1, m: { 5: 2500, 99: 2500 } }]), new Set()) === null, '상대 부대가 이미 없으면 고르지 않음');
  const F = army(6, 2500, 'retreat'), G = army(7, 3000);
  ok(pickSpectate(wrap([F, G], [eng(F, G)]), new Set()) === null, '한쪽이 후퇴면 고르지 않음');
}

// 7) 초기 병력(e.m) 기준: 교전 중 손실로 현재 병력이 기준 아래로 내려가도 계속 후보
{
  const A = army(1, 400), B = army(2, 500); // 현재 합 900이지만
  const e = { a: 1, b: 2, na: 0, nb: 1, y0: 100, p: 5, m: { 1: 2500, 2: 1500 } }; // 초기 합 4000
  const p = pickSpectate(wrap([A, B], [e]), new Set());
  ok(p && p.id === 2 && p.tot === 4000, '초기 병력 기준으로 판단하고 현재 병력 많은 쪽을 따라감');
}

// 8) 진행 중 판정: 열린 교전 + 양측 교전 상태일 때만 true
{
  const A = army(1, 2500), B = army(2, 1200);
  const S = wrap([A, B], [eng(A, B)]);
  const k = pairKey(1, 2);
  ok(spectateLive(S, k) === true, '열린 교전 + 양측 교전 상태면 진행 중');
  S.battlesOpen = {};
  ok(spectateLive(S, k) === false, '교전 카드로 마감되어 열린 교전에서 지워지면 종료');
  const S2 = wrap([army(1, 2500, 'retreat'), army(2, 1200)], [eng(army(1, 2500), army(2, 1200))]);
  ok(spectateLive(S2, k) === false, '한쪽이 후퇴하면 종료');
  const S3 = wrap([army(1, 0), army(2, 1200)], [eng(army(1, 2500), army(2, 1200))]);
  ok(spectateLive(S3, k) === false, '한쪽이 전멸하면 종료');
  const S4 = wrap([army(1, 2500), army(2, 1200, 'siege')], [eng(army(1, 2500), army(2, 1200))]);
  ok(spectateLive(S4, k) === false, '한쪽이 포위로 복귀하면 종료');
  ok(spectateLive({ armies: [] }, k) === false, 'battlesOpen이 없으면 종료');
}

if (fails) { console.error(fails + ' failures'); process.exit(1); } else console.log('all spectate tests passed');
