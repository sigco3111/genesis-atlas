// 부대 추적 카메라 보조: 추적 위치 선택과 카메라 완화 (순수 함수, 테스트 가능)

// 추적 카메라가 따라갈 위치를 고른다.
// 칩이 실제로 그려진 렌더 위치(sm.rx/ry, 틱 사이 보간·경로 호장 포함)를 우선해
// 화면에 보이는 부대와 카메라가 어긋나지 않게 하고, 부대 표시가 생략되는 고속 진행이나
// 추적 시작 직후처럼 렌더 위치가 아직 없을 때만 시뮬 위치(a.x/a.y)를 쓴다.
export function followPos(army, sm, showArmies) {
  if (showArmies !== false && sm && sm.rx != null && sm.ry != null) return [sm.rx, sm.ry];
  return [army.x, army.y];
}

// 카메라 중심을 목표 지점으로 지수 완화해 옮긴다 (dt: 초, rate: 반응 속도 1/초).
// dt가 0이면 움직이지 않고, 클수록 목표에 가까이 붙는다.
export function followEase(cx, cy, tx, ty, dt, rate = 7) {
  const k = 1 - Math.exp(-Math.max(0, dt) * rate);
  return [cx + (tx - cx) * k, cy + (ty - cy) * k];
}
