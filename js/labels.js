// 라벨 배치 계획: 줌 단계별 개수 제한 + 충돌 회피 + 추적 국가 우선 (순수 함수, 테스트 가능)

// rel = cam.z / minZ (1.0 = 전체 지도가 화면에 딱 맞는 상태)
export function nationBudget(rel) {
  if (rel < 1.4) return 8;
  if (rel < 2.2) return 14;
  if (rel < 3.5) return 24;
  if (rel < 6) return 40;
  return 80;
}
export function cityBudget(rel) {
  if (rel < 1.8) return 0;
  if (rel < 2.6) return 4;
  if (rel < 4) return 10;
  if (rel < 6) return 18;
  return 40;
}

// cands: [{ t, x, y, size, w, big, force, gold }]
//   x,y = 화면 좌표(중심), w = 측정된 텍스트 너비, size = 글자 크기(px)
//   big = 우선순위(큰 값 먼저), force = 예산·충돌과 무관하게 최우선 배치
// 반환: 배치된 후보 배열(그리기 순서 = 우선순위 순). hPad/h 기본값은 size 비례.
export function planLabels(cands, budget, opts = {}) {
  const placed = [];
  const boxes = [];
  const yOff = opts.yOff || 0; // 텍스트 중심에서 위/아래로 치우친 경우 박스 보정
  const fits = (c) => {
    const b = [c.x - c.w / 2 - 2, c.y - c.size / 2 + yOff - 1, c.x + c.w / 2 + 2, c.y + c.size / 2 + yOff + 1];
    for (const q of boxes) if (!(b[2] < q[0] || b[0] > q[2] || b[3] < q[1] || b[1] > q[3])) return null;
    return b;
  };
  const sorted = [...cands].sort((a, b) => (b.force ? 1 : 0) - (a.force ? 1 : 0) || b.big - a.big);
  let room = budget;
  for (const c of sorted) {
    if (c.force) {
      const b = fits(c);
      if (b) { boxes.push(b); placed.push(c); } // force는 예산을 소모하지 않음
      continue;
    }
    if (room <= 0) break;
    const b = fits(c);
    if (!b) continue;
    boxes.push(b); placed.push(c); room--;
  }
  return placed;
}
