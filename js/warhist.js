// 전쟁 결과 요약: 개전 스냅샷·점령 기록·종전 요약 집계 (순수 함수, 테스트 가능)

export const WARHIST_MAX = 60;   // 보관하는 종전 요약 최대 수 (오래된 것부터 덮어씀)
export const WARCAPS_MAX = 600;  // 진행 중 전쟁이 기억하는 점령 기록 최대 수
export const BIGCAPS_MAX = 12;   // 요약에 남기는 주요 점령(수도·대도시) 최대 수

// 개전 시점 참전국 인구·영토 스냅샷: { 국가id: [인구, 지방 수] }
export function snapWar(S, w) {
  const snap = {};
  for (const id of [...w.A, ...w.D]) { const n = S.nations[id]; if (n) snap[id] = [Math.round(n.pop || 0), n.pc || 0]; }
  return snap;
}

// 진행 중 전쟁에 점령 기록 추가: { q: 지방, f: 빼앗긴 나라, t: 점령한 나라, y: 연도, big: 주요 점령 }
export function recordCap(w, cap) {
  if (!w.caps) w.caps = [];
  w.caps.push(cap);
  if (w.caps.length > WARCAPS_MAX) w.caps.splice(0, w.caps.length - WARCAPS_MAX);
}

// 원래 참전국 명단 (한쪽이 멸망해 w.A/w.D에서 빠져도 남김). 구형 저장은 현재 명단으로 대체
export function rostersOf(w) { return [w.A0 || w.A || [], w.D0 || w.D || []]; }

// 측별 점령 수 집계: 점령한 나라가 A측이면 A의 점령
export function capsBySide(w) {
  const [A0, D0] = rostersOf(w);
  let a = 0, d = 0;
  for (const c of w.caps || []) { if (A0.includes(c.t)) a++; else if (D0.includes(c.t)) d++; }
  return [a, d];
}

// 종전 요약 생성. winner: 'A' | 'D' | ''(승패 없이 휴전). 멸망한 나라는 now가 [0, 0]
export function buildSummary(S, w, winner) {
  const [A0, D0] = rostersOf(w);
  const nm = {}, rgb = {}, now = {};
  for (const id of [...A0, ...D0]) {
    const n = S.nations[id]; if (!n) continue;
    nm[id] = n.name; rgb[id] = n.rgb;
    now[id] = n.alive ? [Math.round(n.pop || 0), n.pc || 0] : [0, 0];
  }
  const [capsA, capsD] = capsBySide(w);
  const big = (w.caps || []).filter((c) => c.big).slice(-BIGCAPS_MAX).map((c) => ({ q: c.q, f: c.f, t: c.t, y: c.y }));
  return {
    id: w.id, y0: w.start, y1: S.year, dur: Math.max(0, S.year - w.start), win: winner || '',
    A: [...A0], D: [...D0], nm, rgb, snap: w.snap || null, now,
    capsA, capsD, capsN: (w.caps || []).length, big,
  };
}

// 요약을 저장 목록에 추가 (오래된 것부터 잘라냄)
export function pushSummary(S, sum) {
  if (!S.warHist) S.warHist = [];
  S.warHist.push(sum);
  if (S.warHist.length > WARHIST_MAX) S.warHist.splice(0, S.warHist.length - WARHIST_MAX);
}

// [이전, 이후] -> { d, pct } (이전이 0 이하거나 없으면 pct null)
export function deltaOf(before, after) {
  if (before == null || after == null) return null;
  return { d: after - before, pct: before > 0 ? (after - before) / before * 100 : null };
}
