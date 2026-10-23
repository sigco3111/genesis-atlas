// 국가별 연대기: n2 상대국 태깅 + nationLog 필터 + 저장/복원 유지 검사
import { generateMap } from '../js/world.js'; import * as sim from '../js/sim.js';
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } else console.log('ok -', m); };
const map = generateMap('twin', 7);
const S = sim.createState(map, { seed: 7, mode: 'emergent', hearths: 8, aggr: 1.5 });
for (let i = 0; i < 3000; i++) sim.step(S, map);
// 전쟁 선포 로그에 n2가 붙는가
const decl = S.log.filter((l) => l.t.includes('전쟁을 선포'));
ok(decl.length > 0, 'war declarations happened: ' + decl.length);
ok(decl.every((l) => l.n2 >= 0), 'every declaration carries defender n2');
// 피선포국 관점에서도 nationLog에 잡히는가
const d = decl[decl.length - 1];
const defLog = sim.nationLog(S, d.n2, 120);
ok(defLog.some((l) => l === d), 'defender sees the declaration in its chronicle');
// 동맹/종전 로그 n2
const ally = S.log.filter((l) => l.t.includes('동맹'));
if (ally.length) ok(ally.every((l) => l.n2 >= 0), 'alliance logs carry n2');
const ends = S.log.filter((l) => l.t.includes('전쟁이') && l.t.includes('끝났습니다'));
if (ends.length) ok(ends.every((l) => l.n2 >= 0), 'war-end logs carry n2');
// 점령 로그 n2
const caps = S.log.filter((l) => l.t.includes('점령했습니다'));
if (caps.length) ok(caps.every((l) => l.n2 >= 0), 'capture logs carry loser n2');
// nationLog 최신순 + 개수 제한
const top = S.nations.filter((n) => n.alive).sort((a, b) => b.pop - a.pop)[0];
const nl = sim.nationLog(S, top.id, 5);
ok(nl.length <= 5 && nl.every((l) => l.n === top.id || l.n2 === top.id), 'nationLog filters and limits');
ok(nl.every((l, i) => i === 0 || nl[i - 1].y >= l.y), 'nationLog newest-first');
// 저장/복원 후 n2 유지
const R = sim.restore(sim.serialize(S));
const rd = R.log.filter((l) => l.t.includes('전쟁을 선포'));
ok(rd.length === decl.length && rd.every((l) => l.n2 >= 0), 'n2 survives save/restore');
// 구형 저장(엔트리에 n2 없음)과의 호환: n2 없는 항목은 필터에서 빠지지 않고 n으로만 매칭
const legacy = { y: 1, t: '옛 기록', i: 1, p: 3, n: 7 };
R.log.push(legacy);
ok(sim.nationLog(R, 7, 10).includes(legacy), 'legacy entry without n2 still matched by n');
console.log(fail ? 'FAILED ' + fail : 'ALL OK  wars:' + decl.length + ' allies:' + ally.length + ' caps:' + caps.length);
process.exit(fail ? 1 : 0);
