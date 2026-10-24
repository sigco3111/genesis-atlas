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

// 밀집 전장 부대 라벨 계획 (순수 함수, 테스트 가능)
// 부대 칩이 차지하는 상자를 피해 병력 라벨을 놓는다. 붐비면 큰 부대 위주로
// 줄이고, 추적(follow) 부대는 예산과 무관하게 항상 남긴다.
// items: [{ id, x, y, w, size, men, follow, tx }]
//   x,y = 칩 중심 화면 좌표, w = 라벨 너비(px), size = 글자 크기(px)
// opts:
//   chipW/chipUp/chipDown: 칩+깃발+막대 상자 (중심 기준 너비·위·아래 거리)
//   downY/upY: 칩 중심에서 아래/위 첫 후보 라벨 중심까지 거리
//   gapY: 후보 사이 세로 간격, budget: 추적 외 라벨 최대 수 (기본 무제한)
//   extraBoxes: 추가 장애물 상자 배열(도시 라벨 등) — 이 상자와도 겹치지 않게 놓는다
// 반환: [{ id, x, y, tx, follow }] — y는 라벨 중심. 자리가 없으면 생략하고,
//        추적 부대만 첫 자리에 강제 배치한다.
export function planArmyLabels(items, opts = {}) {
  const chipW = opts.chipW || 30, chipUp = opts.chipUp == null ? 18 : opts.chipUp, chipDown = opts.chipDown == null ? 11 : opts.chipDown;
  const downY = opts.downY == null ? 23 : opts.downY, upY = opts.upY == null ? 25 : opts.upY;
  const gapY = opts.gapY || 11;
  const budget = opts.budget == null ? Infinity : opts.budget;
  const chipBoxes = items.map((it) => [it.x - chipW / 2, it.y - chipUp, it.x + chipW / 2, it.y + chipDown]);
  const labBoxes = [];
  const extra = opts.extraBoxes || [];
  const hit = (b) => {
    for (const q of chipBoxes) if (!(b[2] < q[0] || b[0] > q[2] || b[3] < q[1] || b[1] > q[3])) return true;
    for (const q of labBoxes) if (!(b[2] < q[0] || b[0] > q[2] || b[3] < q[1] || b[1] > q[3])) return true;
    for (const q of extra) if (!(b[2] < q[0] || b[0] > q[2] || b[3] < q[1] || b[1] > q[3])) return true;
    return false;
  };
  const box = (it, ly) => [it.x - it.w / 2 - 2, ly - it.size / 2 - 1, it.x + it.w / 2 + 2, ly + it.size / 2 + 1];
  const sorted = [...items].sort((a, b) => (b.follow ? 1 : 0) - (a.follow ? 1 : 0) || b.men - a.men);
  const placed = [];
  let room = budget;
  for (const it of sorted) {
    if (!it.follow && room <= 0) continue;
    let ly = null;
    for (let k = 0; k < 3 && ly == null; k++) { const c = it.y + downY + k * gapY; if (!hit(box(it, c))) ly = c; }
    for (let k = 0; k < 2 && ly == null; k++) { const c = it.y - upY - k * gapY; if (!hit(box(it, c))) ly = c; }
    if (ly == null) { if (it.follow) ly = it.y + downY; else continue; } // 추적 부대는 겹쳐도 첫 자리에
    labBoxes.push(box(it, ly)); placed.push({ id: it.id, x: it.x, y: ly, tx: it.tx, follow: !!it.follow });
    if (!it.follow) room--;
  }
  return placed;
}
