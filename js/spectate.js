// 주요 전투 자동 관전 보조: 카메라가 알아서 따라갈 큰 교전을 고른다 (순수 함수, 테스트 가능)
import { pairKey } from './battles.js';

export const SPECTATE_MIN_MEN = 3000; // 양측 초기 병력 합이 이 이상인 교전만 '주요 전투'로 본다 (격돌 로그 기준 1600보다 높게)

// 자동 관전할 교전을 고른다. 열린 교전(S.battlesOpen) 중
//  - 양쪽 부대가 모두 살아 있고 교전 상태이며
//  - 초기 병력 합(e.m)이 기준 이상이고
//  - 이용자가 직접 지도를 움직여 놓아준(released) 교전이 아닌 것 중 가장 큰 것.
// 초기 병력을 쓰므로 교전 중 손실로 기준 아래로 내려가도 계속 관전한다.
// 반환: { key: 교전 키, id: 따라갈 부대(병력이 많은 쪽), tot: 초기 병력 합 } 또는 null
export function pickSpectate(S, released) {
  const open = S.battlesOpen || {};
  let best = null;
  for (const k of Object.keys(open)) {
    const e = open[k];
    const A = (S.armies || []).find((x) => x.id === e.a);
    const B = (S.armies || []).find((x) => x.id === e.b);
    if (!A || !B || A.men <= 0 || B.men <= 0 || A.st !== 'battle' || B.st !== 'battle') continue;
    const tot = (e.m[e.a] || 0) + (e.m[e.b] || 0);
    if (tot < SPECTATE_MIN_MEN) continue;
    const key = pairKey(A.id, B.id);
    if (released && released.has(key)) continue;
    if (!best || tot > best.tot) best = { key, id: A.men >= B.men ? A.id : B.id, tot };
  }
  return best;
}

// 자동 관전 중이던 교전(키)이 아직 진행 중인지 본다.
// 교전 카드로 마감되어 열린 교전에서 지워졌거나, 어느 한쪽이 전멸·후퇴·이탈했으면 끝난 것이다.
export function spectateLive(S, key) {
  const e = (S.battlesOpen || {})[key];
  if (!e) return false;
  const A = (S.armies || []).find((x) => x.id === e.a);
  const B = (S.armies || []).find((x) => x.id === e.b);
  return !!(A && B && A.men > 0 && B.men > 0 && A.st === 'battle' && B.st === 'battle');
}
