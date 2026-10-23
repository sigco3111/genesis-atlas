// 전쟁 관찰 보조: 점령 표시 유지 시간 + 추적 국가 전쟁 감지 (순수 함수, 테스트 가능)

// 점령 표시 유지 시간 단계(년). 0 = 표시 끄기
export const CAP_AGE_STEPS = [3, 10, 30, 0];
export function nextCapAge(cur) {
  const i = CAP_AGE_STEPS.indexOf(cur);
  return CAP_AGE_STEPS[(i + 1) % CAP_AGE_STEPS.length];
}
export function capAgeLabel(v) { return v > 0 ? v + '년' : '끄기'; }

// caps: [{ y, ... }] (y = 점령된 해). year 기준 keep년 이내 점령만 남김. keep<=0 이면 전부 숨김
export function visibleCaps(caps, year, keep) {
  if (keep <= 0) return [];
  return (caps || []).filter((c) => year - c.y <= keep);
}
// 점령 표시 투명도: 지날수록 옅어지고 keep + 0.5년에 완전히 사라짐
export function capAlpha(age, keep) { return Math.max(0, 1 - age / (keep + 0.5)); }

// 추적 국가가 참전 중인 전쟁 id 목록 (추적 없음·멸망이면 빈 배열)
export function trackedWarIds(S) {
  const T = S && S.track; if (!T) return [];
  const n = S.nations[T.id]; if (!n || !n.alive) return [];
  return S.wars.filter((w) => w.A.includes(T.id) || w.D.includes(T.id)).map((w) => w.id);
}
// 이전/현재 참전 목록의 차이: 새로 시작된 전쟁과 끝난 전쟁
export function warEvents(prev, cur) {
  return { started: cur.filter((id) => !prev.includes(id)), ended: prev.filter((id) => !cur.includes(id)) };
}
