// 국가 비교 추이: 인구·영토·안정도를 같은 기간으로 비교하는 순수 함수 모음 (테스트 가능)
// hist 점 형식: [year, pop, pc, stab] — 구형 저장은 stab 없는 3요소 점이 섞일 수 있다.

export const METRICS = [['pop', '인구'], ['pc', '영토'], ['stab', '안정도']];
const IDX = { pop: 1, pc: 2, stab: 3 };

// 한 점에서 지표 값을 꺼낸다. 기록이 없으면(구형 3요소 점의 안정도 등) null
export function metricVal(p, key) {
  if (!p) return null;
  const v = p[IDX[key]];
  return Number.isFinite(v) ? v : null;
}
// 시리즈에서 year 이하의 가장 최근 값 (기록 있는 점만 본다). 없으면 null
export function valueAt(hist, year, key) {
  let v = null;
  for (const p of hist || []) {
    if (p[0] > year) break;
    const x = metricVal(p, key);
    if (x != null) v = x;
  }
  return v;
}
// 두 시리즈가 모두 기록을 갖는 공통 구간 [y0, y1]과 그 양끝 값. 겹치는 구간이 없으면 null
export function commonWindow(hA, hB, key) {
  const first = (h) => { for (const p of h || []) { if (metricVal(p, key) != null) return p[0]; } return null; };
  const last = (h) => { const hs = h || []; for (let i = hs.length - 1; i >= 0; i--) { if (metricVal(hs[i], key) != null) return hs[i][0]; } return null; };
  const a0 = first(hA), b0 = first(hB), a1 = last(hA), b1 = last(hB);
  if (a0 == null || b0 == null || a1 == null || b1 == null) return null;
  const y0 = Math.max(a0, b0), y1 = Math.min(a1, b1);
  if (y1 <= y0) return null;
  return { y0, y1, a0: valueAt(hA, y0, key), a1: valueAt(hA, y1, key), b0: valueAt(hB, y0, key), b1: valueAt(hB, y1, key) };
}
// 증감 계산: 인구는 %, 영토는 지방 수(+%), 안정도는 %p
export function changeOf(key, v0, v1) {
  if (v0 == null || v1 == null) return null;
  if (key === 'stab') return { kind: 'pp', d: Math.round((v1 - v0) * 100) };
  if (key === 'pc') {
    const n = Math.round(v1 - v0);
    const pct = v0 > 0 ? Math.round((v1 / v0 - 1) * 100) : null;
    return { kind: 'pc', n, pct };
  }
  if (v0 <= 0) return v1 > 0 ? { kind: 'new', d: 1 } : null;
  return { kind: 'pct', d: Math.round((v1 / v0 - 1) * 100) };
}
// 증감의 부호 (비교·색상용). 계산 불가면 null
export function changeDir(ch) {
  if (!ch) return null;
  if (ch.kind === 'pp' || ch.kind === 'pct') return ch.d;
  if (ch.kind === 'pc') return ch.n;
  return ch.d;
}
export function fmtChange(ch) {
  if (!ch) return '—';
  if (ch.kind === 'new') return '새로 생김';
  if (ch.kind === 'pp') return (ch.d > 0 ? '+' : '') + ch.d + '%p';
  if (ch.kind === 'pc') {
    const n = (ch.n > 0 ? '+' : '') + ch.n + ' 지방';
    return ch.pct == null ? n : `${n} (${ch.pct > 0 ? '+' : ''}${ch.pct}%)`;
  }
  return (ch.d > 0 ? '+' : '') + ch.d + '%';
}
// 차트용 [year, value] 시리즈 (기록 있는 점만)
export function seriesOf(hist, key) {
  const out = [];
  for (const p of hist || []) { const v = metricVal(p, key); if (v != null) out.push([p[0], v]); }
  return out;
}
// 지표의 차트 최댓값: 안정도는 1(100%) 고정, 나머지는 자동
export function chartMax(key, sA, sB) {
  if (key === 'stab') return 1;
  let m = 1;
  for (const s of [sA, sB]) for (const p of s) m = Math.max(m, p[1]);
  return m;
}
// 지표의 표시용 최댓값 라벨
export function maxLabel(key, mx) {
  if (key === 'stab') return '100%';
  return null; // pop/pc는 호출 측에서 numStr 사용
}
