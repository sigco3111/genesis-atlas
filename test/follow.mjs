// 부대 추적 카메라 테스트: 추적 위치 선택(렌더 우선·시뮬 대체)과 카메라 완화
import { followPos, followEase } from '../js/follow.js';
let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.error('FAIL', msg); } else console.log('ok', msg); };

// 1) 추적 위치: 렌더 위치 우선
{
  const a = { id: 1, x: 100, y: 50 };
  const sm = { rx: 96, ry: 47 }; // 틱 보간 중인 화면상 위치
  const [x, y] = followPos(a, sm, true);
  ok(x === 96 && y === 47, '렌더 위치가 있으면 시뮬 위치가 아니라 렌더 위치를 따라감');
}
// 2) 시뮬 위치 대체: sm 없음 / rx 없음 / 부대 숨김(고속 진행)
{
  const a = { id: 1, x: 100, y: 50 };
  ok(followPos(a, null, true).join() === '100,50', '렌더 상태가 없으면 시뮬 위치');
  ok(followPos(a, {}, true).join() === '100,50', '렌더 좌표가 아직 없으면 시뮬 위치');
  ok(followPos(a, { rx: 96, ry: 47 }, false).join() === '100,50', '부대 표시 생략(고속)이면 시뮬 위치');
}
// 3) 카메라 완화: dt=0이면 정지, 시간이 가면 목표에 수렴, 되돌아가지 않음
{
  let [x, y] = followEase(0, 0, 100, -60, 0);
  ok(x === 0 && y === 0, 'dt=0이면 카메라 정지');
  let px = 0, py = 0, mono = true;
  for (let i = 0; i < 600; i++) {
    const [nx, ny] = followEase(px, py, 100, -60, 1 / 60);
    if (nx < px || ny > py) mono = false; px = nx; py = ny;
  }
  ok(mono, '완화 중 카메라가 목표에서 멀어지지 않음(단조 접근)');
  ok(Math.abs(px - 100) < 0.01 && Math.abs(py + 60) < 0.01, '10초 후 목표에 사실상 도달');
  const [sx, sy] = followEase(0, 0, 100, 0, 10);
  ok(sx > 99.9 && sy === 0, '아주 큰 dt면 한 프레임에 거의 도달(발산 없음)');
}
if (fails) { console.error(fails + ' failures'); process.exit(1); } else console.log('all follow tests passed');
