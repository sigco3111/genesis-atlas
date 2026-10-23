import { generateMap, MAP_KINDS, buildEarth, W, H } from './world.js';
import { Renderer } from './render.js';
import * as sim from './sim.js';
import { CAP_AGE_STEPS, nextCapAge, capAgeLabel, trackedWarIds, warEvents } from './warwatch.js';
import { capsBySide, warMapPoints, fitWarView } from './warhist.js';
import { METRICS, seriesOf, chartMax, commonWindow, changeOf, changeDir, fmtChange } from './cmptrend.js';
import { yearStr, numStr, ERA_NAMES } from './names.js';
const $ = (id) => document.getElementById(id);
const SAVE = 'genesis-atlas-save-v1';
const CAPAGE_PREF = 'genesis-atlas-capage', WARPAUSE_PREF = 'genesis-atlas-warpause';
let autoWarPause = false, prevTrkWars = [];
try { autoWarPause = localStorage.getItem(WARPAUSE_PREF) === '1'; } catch (e) {}
function readCapAge() { try { const raw = localStorage.getItem(CAPAGE_PREF); if (raw === null) return 3; const v = +raw; return CAP_AGE_STEPS.includes(v) ? v : 3; } catch (e) { return 3; } }
let map = null, S = null, R = null, running = false, speed = 1, prevSpeed = 1, acc = 0, last = 0, tab = 'world', lastRefresh = 0, needRefresh = true, earthCache = null;
const SPEEDS = [[0, '⏸'], [0.5, '0.5'], [1, '1'], [3, '3'], [10, '10'], [100, '100']];
const MODES = [['political', '정치'], ['culture', '문화'], ['religion', '종교'], ['pop', '인구'], ['tech', '기술'], ['unrest', '불안'], ['terrain', '지형']];

function toast(t) { const e = $('toast'); e.textContent = t; e.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.remove('show'), 2400); }
async function loadImg(url) {
  const b = await (await fetch(url)).blob(); const bm = await createImageBitmap(b);
  const c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height; const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(bm, 0, 0); return x.getImageData(0, 0, c.width, c.height).data;
}
async function getEarth() {
  if (earthCache) return earthCache;
  const [meta, elev, prov] = await Promise.all([fetch('data/earth.json').then((r) => r.json()), loadImg('data/earth_elev.png'), loadImg('data/earth_prov.png')]);
  earthCache = buildEarth(elev, prov, meta); return earthCache;
}
async function getPlaces() { try { return await (await fetch('data/places.json')).json(); } catch (e) { return []; } }
async function getMap(kind, seed) { return kind === 'earth' ? await getEarth() : generateMap(kind, seed); }

// ---------- 시작 화면 ----------
const ERA_LIST = [
  [-10000, '기원전 10000년 — 신석기의 새벽'], [-3000, '기원전 3000년 — 최초의 문명'],
  [-500, '기원전 500년 — 고전 문명의 시대'], [-323, '기원전 323년 — 알렉산드로스의 시대'],
  [100, '서기 100년 — 로마와 한의 전성기'], [600, '서기 600년 — 고대 제국들의 세계'],
  [1000, '서기 1000년 — 송과 바이킹의 시대'], [1279, '서기 1279년 — 몽골 제국의 전성기'],
  [1492, '서기 1492년 — 콜럼버스의 항해'], [1650, '서기 1650년 — 화약 제국의 시대'],
  [1815, '서기 1815년 — 나폴레옹 이후의 세계'], [1914, '서기 1914년 — 제1차 세계대전 전야'],
  [1945, '서기 1945년 — 제2차 세계대전 종전'], [2026, '서기 2026년 — 현재의 세계'],
];
for (const k of MAP_KINDS) { const o = document.createElement('option'); o.value = k.id; o.textContent = k.name + (k.desc ? ' - ' + k.desc : ''); $('selMap').appendChild(o); }
for (const [y, label] of ERA_LIST) { const o = document.createElement('option'); o.value = y; o.textContent = label; if (y === 2026) o.selected = true; $('selEra').appendChild(o); }
function syncMode() { const earth = $('selMap').value === 'earth'; $('selMode').querySelector('[value=real]').disabled = !earth; if (!earth) $('selMode').value = 'emergent'; $('eraRow').style.display = $('selMode').value === 'real' && earth ? '' : 'none'; }
$('selMap').onchange = syncMode; $('selMode').onchange = syncMode; syncMode();
async function getEra(year) { return await (await fetch(`data/era/${year}.json`)).json(); }
if (localStorage.getItem(SAVE)) $('cont').classList.remove('hide');
$('go').onclick = async () => {
  $('loadmsg').textContent = '세계를 만드는 중...'; await new Promise((r) => setTimeout(r, 30));
  try {
    const kind = $('selMap').value, seed = +$('seed').value || 1, mode = $('selMode').value;
    const eraYear = mode === 'real' ? +$('selEra').value : 2026;
    map = await getMap(kind, seed);
    let places = [], startYear, eraLabel;
    if (mode === 'real' && eraYear !== 2026) {
      const era = await getEra(eraYear);
      map = structuredClone(map);
      map.countries = era.countries;
      era.owner.forEach((c, i) => { map.provinces[i].c = c; });
      startYear = era.year; eraLabel = era.label;
    } else if (mode === 'real') places = await getPlaces();
    S = sim.createState(map, { mode, seed, hearths: +$('hearths').value || 6, aggr: +$('aggr').value, places, startYear, eraLabel });
    boot();
  } catch (e) { $('loadmsg').textContent = '시작 실패: ' + e.message; console.error(e); }
};
$('cont').onclick = async () => {
  $('loadmsg').textContent = '불러오는 중...';
  try {
    const raw = await unpack(localStorage.getItem(SAVE)); const s = sim.restore(raw); map = await getMap(s.mapKind, s.seed); S = s;
    if (S.P.owner.length !== map.provinces.length) throw new Error('저장 데이터가 지도와 맞지 않습니다');
    sim.step(sim.restore(raw), map); // 부팅 점검
    boot();
  } catch (e) { $('loadmsg').textContent = '저장 데이터를 열 수 없어 폐기합니다: ' + e.message; localStorage.removeItem(SAVE); $('cont').classList.add('hide'); }
};
function boot() { console.log('boot', S.mode, S.year);
  $('start').classList.add('hide');
  R = new Renderer($('map'), map); if (!boot.done) { boot.done = true; bindInput(); window.addEventListener('resize', () => { R.resize(); needRefresh = true; }); requestAnimationFrame(loop); }
  R.capAge = readCapAge(); prevTrkWars = trackedWarIds(S);
  R.terrainKind = map.kind + map.seed; R.fit(); if (R.cssW < 700 && map.kind === 'earth') { R.cam.z = Math.max(R.minZ, R.cssW / 520); R.cam.x = 640; R.cam.y = 190; R.clamp(); } R.mode = 'political'; R.sel = -1; selPower = null; histWar = null; { const wv0 = $('warview'); if (wv0) wv0.classList.add('hide'); } pwCount = 0; pwPending = null; updateArmChip(); R.trackId = S.track ? S.track.id : -1; cmpA = cmpB = -1; speed = window.__speed ?? 1; running = true; needRefresh = true; buildBars(); renderPanel(); renderTrack();
  let pref = null; try { pref = localStorage.getItem(PANEL_PREF); } catch (e) {}
  setPanelOpen(pref === null ? !isMobileLayout() : pref === '1', false);
  toast('휠·드래그로 이동, 지역을 눌러 살펴보세요');
}
function buildBars() {
  $('speed').innerHTML = ''; for (const [v, t] of SPEEDS) { const b = document.createElement('button'); b.textContent = t; b.dataset.v = v; b.title = v ? (v >= 1 ? '1초에 ' + v + '년' : (1 / v) + '초에 1년') : '일시정지'; b.onclick = () => { speed = v; if (v > 0) prevSpeed = v; markBars(); }; $('speed').appendChild(b); }
  $('modes').innerHTML = ''; for (const [v, t] of MODES) { const b = document.createElement('button'); b.textContent = t; b.dataset.m = v; b.onclick = () => { R.mode = v; needRefresh = true; markBars(); }; $('modes').appendChild(b); }
  const lb = document.createElement('button'); lb.id = 'lblBtn'; lb.textContent = '이름'; lb.title = '국가·도시 이름 표시/숨기기 (확대 정도에 따라 자동 정리됩니다)';
  lb.classList.toggle('on', R.showLabels !== false);
  lb.onclick = () => { R.showLabels = R.showLabels === false; lb.classList.toggle('on', R.showLabels !== false); };
  $('modes').appendChild(lb);
  const cb = document.createElement('button'); cb.id = 'capBtn';
  const paintCap = () => { cb.textContent = '점령 ' + capAgeLabel(R.capAge); cb.classList.toggle('on', R.capAge > 0); cb.title = '점령 화살표·링을 몇 년 동안 지도에 남길지 바꿉니다 (누를 때마다 3년 → 10년 → 30년 → 끄기)'; };
  paintCap();
  cb.onclick = () => { R.capAge = nextCapAge(R.capAge); try { localStorage.setItem(CAPAGE_PREF, String(R.capAge)); } catch (e) {} paintCap(); needRefresh = true; };
  $('speed').appendChild(cb); // 모바일에서 지도 모드 줄이 세 줄로 늘어나 추적 카드와 겹치지 않게 속도 줄에 둠
  markBars();
}
let warFocusIdx = 0;
function focusWar(w) {
  if (!w) return false;
  const wf = (R.warPts || []).find((x) => x.id === w.id);
  let x, y;
  if (wf && wf.pts.length) { x = wf.pts.reduce((t, p) => t + p[0], 0) / wf.pts.length; y = wf.pts.reduce((t, p) => t + p[1], 0) / wf.pts.length; }
  else { const A = S.nations[w.A[0]], D = S.nations[w.D[0]]; if (!A || !D) return false; x = (A.lx + D.lx) / 2; y = (A.ly + D.ly) / 2; }
  R.focusWorld(x, y, 3.5); needRefresh = true; return true;
}
// ---------- 끝난 전쟁 지도 표시 ----------
let histWar = null;
function showWarOnMap(sumId) {
  const s = (S.warHist || []).find((x) => x.id === sumId);
  const pts = s ? warMapPoints(S, map, s) : [];
  if (!pts.length) { toast('지도에 표시할 점령 지점 기록이 없습니다'); return; }
  const aN = s.nm[s.A[0]] || '?', dN = s.nm[s.D[0]] || '?';
  histWar = { id: s.id, title: aN + ' 대 ' + dN, pts };
  R.histWar = histWar;
  const el = $('warview');
  el.innerHTML = `<div class="wvtxt">🗺 <b>${histWar.title}</b> · ${yearStr(s.y0)}~${yearStr(s.y1)} · 점령 지점 ${pts.length}곳<em>과거 점령 기록 · 국경은 현재 기준</em></div><button id="wvClose" title="표시 닫기">✕</button>`;
  el.classList.remove('hide');
  $('wvClose').onclick = () => { hideWarView(); panelSig = ''; renderPanel(); };
  if (isMobileLayout()) setPanelOpen(false);
  layoutFloaters();
  // 상단 플로터·하단 조작에 가려지는 가장자리를 뺀 보이는 영역에 모든 점령 지점이 들어오게 카메라 맞춤
  const ins = { top: 0, bottom: 0, left: 0, right: 0 };
  const wr = el.getBoundingClientRect();
  if (wr.height > 0) ins.top = Math.max(0, Math.ceil(wr.bottom)) + 6;
  if (isMobileLayout()) {
    ins.bottom = 40; // 접힌 패널 손잡이(32px) + 여유
    const pa = document.getElementById('pwarm');
    if (pa && !pa.classList.contains('hide')) { const pr = pa.getBoundingClientRect(); if (pr.height > 0) ins.bottom = Math.max(ins.bottom, Math.ceil(R.cssH - pr.top) + 6); }
  }
  const f = fitWarView(pts, R.cssW, R.cssH, R.minZ, ins);
  // focusWorld는 줌을 키우기만 하므로(Math.max), 화면 맞춤에는 계산된 줌을 직접 설정
  if (f) { R.cam.x = f.x; R.cam.y = f.y; R.cam.z = f.z; R.clamp(); needRefresh = true; }
  toast('🗺 전쟁이 벌어진 곳을 지도에 표시합니다');
}
function hideWarView() {
  histWar = null; if (R) R.histWar = null;
  const el = $('warview'); if (el && !el.classList.contains('hide')) { el.classList.add('hide'); layoutFloaters(); }
}
$('swar').style.cursor = 'pointer'; $('swar').title = '눌러서 전선으로 이동';
$('swar').onclick = () => {
  if (!S || !S.wars.length) { toast('진행 중인 전쟁이 없습니다'); return; }
  const w = S.wars[warFocusIdx++ % S.wars.length];
  if (focusWar(w)) toast('⚔ ' + (S.nations[w.A[0]] || {}).name + ' 대 ' + (S.nations[w.D[0]] || {}).name + ' 전선');
};
function markBars() { $('rate').textContent = speed ? (speed >= 1 ? '· 1초에 ' + speed + '년' : '· ' + 1 / speed + '초에 1년') : '· 일시정지'; for (const b of $('speed').children) if (b.dataset.v) b.classList.toggle('on', +b.dataset.v === speed); for (const b of $('modes').children) if (b.dataset.m) b.classList.toggle('on', b.dataset.m === R.mode); }
// ---------- 패널 접기/펼치기 ----------
const PANEL_PREF = 'genesis-atlas-panel';
const isMobileLayout = () => window.innerWidth <= 760;
function setPanelOpen(open, save = true) {
  $('panel').classList.toggle('open', open);
  if (save) try { localStorage.setItem(PANEL_PREF, open ? '1' : '0'); } catch (e) {}
  updateHandle();
}
function updateHandle() {
  const h = $('panelHandle'); const f = $('panelFold');
  const open = $('panel').classList.contains('open');
  const mob = isMobileLayout();
  if (h) { h.textContent = open ? (mob ? '\u25be 패널 접기' : '패널 접기') : (mob ? '\u25b4 패널 펼치기' : '패널 펼치기'); h.title = open ? '패널 접기' : '패널 펼치기'; }
  if (f) f.textContent = (mob ? '\u25be' : '\u25c0') + ' 패널 접기';
}
$('menuBtn').onclick = () => setPanelOpen(!$('panel').classList.contains('open'));
$('panelHandle').onclick = () => setPanelOpen(!$('panel').classList.contains('open'));
$('panelFold').onclick = () => setPanelOpen(false);
window.addEventListener('resize', updateHandle);

// ---------- 루프 ----------
function loop(t) { if (!loop.n) console.log('loop1'); loop.n = (loop.n || 0) + 1; if (loop.n === 3) console.log('loop3');
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, (t - last) / 1000 || 0.016); last = t;
  if (running && speed > 0 && S) {
    acc += dt * speed; let n = 0;
    const budget = performance.now() + 22;
    while (acc >= 1 && n < 600) { sim.step(S, map); acc -= 1; n++; if (performance.now() > budget) { acc = Math.min(acc, 1); break; } }
    if (n) needRefresh = true;
    if (S.auto && n) for (let i = 0; i < Math.min(n, 3); i++) sim.autoGod(S, map);
  }
  for (const f of S.fxQueue.splice(0)) if (speed < 20) R.addEffect(f[0], f[1], f[1] === 'war' ? '#ff5050' : f[1] === 'plague' ? '#9be26a' : '#ffd27a');
  if (S.log.length) { const lg = S.log; let i = lg.length - 1; while (i >= 0 && lg[i] !== loop.lastLog) i--; const fresh = i < 0 ? lg.slice(-1) : lg.slice(i + 1); loop.lastLog = lg[lg.length - 1];
    if (speed <= 100 && t - (loop.tt || 0) > 2500) { const big = fresh.filter((l) => l.i >= 3).pop(); if (big) { loop.tt = t; toast(yearStr(big.y) + ' · ' + big.t); } } }
  if (S && S.track) {
    const cur = trackedWarIds(S);
    if (autoWarPause && speed > 0) {
      const ev = warEvents(prevTrkWars, cur);
      if (ev.started.length || ev.ended.length) {
        const tn = S.nations[S.track.id];
        speed = 0; markBars(); loop.tt = t; // 자동 정지 알림이 큰 사건 알림에 바로 덮이지 않게 함
        const nm = tn ? tn.name : '추적 국가';
        const what = tn && !tn.alive ? '멸망' : ev.started.length ? '전쟁 발발' : '전쟁 종료';
        toast('★ ' + nm + ' ' + what + ' — 자동으로 멈췄습니다 (스페이스바로 재개)');
        trackSig = ''; renderTrack();
      }
    }
    prevTrkWars = cur;
  } else prevTrkWars = [];
  if (needRefresh && t - lastRefresh > 100) { R.refresh(S); lastRefresh = t; needRefresh = false; }
  { const c = R.cam; const key = c.x + '|' + c.y + '|' + c.z + '|' + R.sel + '|' + R.mode + '|' + R.cssW + R.cssH + '|' + lastRefresh; if (speed > 0 || R.effects.length || R.pvOn || key !== loop.dk || R.fresh) { R.draw(dt, S); loop.dk = key; R.fresh = false; } }
  $('year').textContent = yearStr(S.year); $('era').textContent = ERA_NAMES[Math.min(9, Math.floor(S.stats.maxT))];
  $('spop').textContent = '인구 ' + numStr(S.stats.world); $('snat').textContent = '국가 ' + S.stats.alive; $('swar').textContent = '전쟁 ' + S.wars.length;
  if (t - (loop.pt || 0) > 800) { loop.pt = t; renderPanel(true); renderTrack(); layoutFloaters(); }
  if (t - (loop.st || 0) > 20000 && running) { loop.st = t; save(); }
}
async function pack(txt) {
  if (typeof CompressionStream === 'undefined') return txt;
  const buf = await new Response(new Blob([txt]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
  let b = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 8192) b += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return 'gz:' + btoa(b);
}
async function unpack(raw) {
  if (!raw.startsWith('gz:')) return raw;
  const bin = atob(raw.slice(3)); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return await new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
}
let saving = false;
async function save() { if (saving || !S) return; saving = true; try { const t = await pack(sim.serialize(S)); localStorage.setItem(SAVE, t); } catch (e) { toast('자동 저장 실패(용량)'); } saving = false; }


// ---------- 입력 ----------
function bindInput() {
  const cv = $('map'); const pts = new Map(); let moved = 0, pd = 0;
  cv.addEventListener('pointerdown', (e) => { lastPtr = e.pointerType || 'mouse'; cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); moved = 0; pd = pts.size === 2 ? dist() : 0; });
  cv.addEventListener('pointerleave', () => { if (selPower && !pwPending) { R.setPowerPreview(null); hideFloater(pwEl('pwhint')); } });
  cv.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) { R.hover = R.provAt(e.clientX, e.clientY); if (selPower) updatePowerPreview(R.hover); return; }
    const o = pts.get(e.pointerId); const dx = e.clientX - o[0], dy = e.clientY - o[1]; pts.set(e.pointerId, [e.clientX, e.clientY]); moved += Math.abs(dx) + Math.abs(dy);
    if (pts.size === 1) R.pan(dx, dy); else if (pts.size === 2) { const d = dist(); if (pd) { const m = mid(); R.zoomAt(m[0], m[1], d / pd); } pd = d; }
  });
  const up = (e) => { if (pts.has(e.pointerId) && pts.size === 1 && moved < 8) select(R.provAt(e.clientX, e.clientY)); pts.delete(e.pointerId); pd = 0; };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', (e) => { pts.delete(e.pointerId); });
  cv.addEventListener('wheel', (e) => { e.preventDefault(); R.zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
  const dist = () => { const a = [...pts.values()]; return Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]); };
  const mid = () => { const a = [...pts.values()]; return [(a[0][0] + a[1][0]) / 2, (a[0][1] + a[1][1]) / 2]; };
  window.addEventListener('keydown', (e) => { if (e.key === ' ') { speed = speed ? 0 : prevSpeed; markBars(); e.preventDefault(); } if (e.key === 'Escape' && selPower) { disarmPower(); toast('권능 선택을 해제했습니다'); } });
}
let selPower = null, pwCount = 0;
// v35 관찰 화면 정리: 미리보기·결과 카드 접기 상태 (접혀도 발동·취소·해제는 유지)
let pwHintFold = false, resFold = false;
try { pwHintFold = localStorage.getItem('genesis-atlas-pwfold') === '1'; } catch (e) {}
try { resFold = localStorage.getItem('genesis-atlas-resfold') === '1'; } catch (e) {}
function setPwHintFold(v) { pwHintFold = v; try { localStorage.setItem('genesis-atlas-pwfold', v ? '1' : '0'); } catch (e) {} }
function setResFold(v) { resFold = v; try { localStorage.setItem('genesis-atlas-resfold', v ? '1' : '0'); } catch (e) {} }
// ---------- 권능 미리보기 / 결과 요약 ----------
const PW_GOOD = new Set(['bless', 'tribe', 'prophet', 'hero', 'peace']);
const PW_ICON = { bless: '🌧', drought: '🏜', plague: '☠', quake: '💥', volcano: '🌋', meteor: '☄', tribe: '🛖', prophet: '📿', hero: '⭐', revolt: '🔥', peace: '🕊', war: '⚔' };
let pwPending = null, lastPtr = 'mouse';
// 힌트/결과 카드: CSS나 HTML이 캐시로 섞여도 깨지지 않도록 필수 스타일을 JS가 보장한다.
function pwEl(id) {
  let el = $(id);
  if (!el) { el = document.createElement('div'); el.id = id; el.className = 'hide'; document.body.appendChild(el); }
  if (!el.dataset.fixed) {
    el.dataset.fixed = '1';
    el.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);background:#0a1a2bee;border:1px solid #3a5f86;border-radius:12px;padding:8px 14px;z-index:6;font-size:13px;max-width:92vw;text-align:center;box-shadow:0 4px 16px #0008;color:#e8eef5';
  }
  const mob = isMobileLayout();
  const useTop = mob && id !== 'pwarm'; // 사용 중 칩은 모바일에서도 아래에 둬 추적 카드·미리보기와 겹치지 않게 함
  const off = !mob && id !== 'pwarm' && selPower ? 52 : 0; // 데스크톱: 권능 사용 중 칩과 겹치지 않게 미리보기·결과 카드를 안쪽으로 내림 (모바일은 layoutFloaters가 정리)
  el.style[useTop ? 'top' : 'bottom'] = ((useTop ? 44 : id === 'pwarm' && mob ? 120 : 84) + off) + 'px';
  el.style[useTop ? 'bottom' : 'top'] = 'auto';
  return el;
}
// 모바일 동시 표시 정리: 미리보기→결과→추적 카드 순으로 위에서부터 쌓아 서로 덮지 않게 한다.
// 시작점은 상단바(연도·속도·지도 레이어 버튼)의 실제 아래 끝 — 두 줄로 넓어진 모바일 상단바와도 겹치지 않게 한다.
function floatBase() {
  const t = $('top');
  const b = t ? t.getBoundingClientRect().bottom : 0;
  return Math.max(44, Math.ceil(b) + 6);
}
function layoutFloaters() {
  if (!isMobileLayout() || !document.body) return;
  let top = floatBase();
  for (const id of ['pwhint', 'pwres', 'warview']) {
    const el = $(id);
    if (el && !el.classList.contains('hide')) {
      el.style.top = top + 'px'; el.style.bottom = 'auto';
      top += el.offsetHeight + 8;
    }
  }
  const tr = $('track');
  if (tr && !tr.classList.contains('hide')) {
    tr.style.top = (top + 8) + 'px';
    // 아래쪽 권능 사용 중 칩(해제 버튼)까지 가리지 않도록 펼친 카드 높이를 남은 공간으로 제한
    const chip = $('pwarm');
    const reserve = chip && !chip.classList.contains('hide') ? 175 : 16;
    tr.style.maxHeight = Math.max(120, Math.min(window.innerHeight * 0.52, window.innerHeight - (top + 8) - reserve)) + 'px';
  }
}
function hideFloater(el) { el.classList.add('hide'); layoutFloaters(); }
function touchUI() { return (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || lastPtr === 'touch'; }
function powerColor(type, ok) { return !ok ? '#9aa7b5' : PW_GOOD.has(type) ? '#7fe08a' : '#ff6a55'; }
// 권능 연속 사용: 한 번 고른 권능은 해제할 때까지 유지되고, 사용 중 칩이 상태와 해제 길을 보여 준다.
function updateArmChip() {
  const el = pwEl('pwarm');
  if (!selPower) { el.classList.add('hide'); return; }
  el.classList.remove('hide');
  el.innerHTML = `<span class="armtxt">${PW_ICON[selPower] || ''} ${sim.POWERS[selPower].name} 사용 중${pwCount ? ' · ' + pwCount + '회' : ''}</span><button id="pwOff" title="권능 선택 해제">해제</button>`;
  el.title = '지도를 눌러 같은 권능을 계속 사용할 수 있습니다';
  el.querySelector('#pwOff').onclick = () => { disarmPower(); toast('권능 선택을 해제했습니다'); };
}
function armPower(type) {
  if (selPower !== type) pwCount = 0;
  selPower = type; pwPending = null; updateArmChip();
}
function disarmPower() {
  selPower = null; pwCount = 0; pwPending = null;
  if (R) R.setPowerPreview(null);
  hideFloater(pwEl('pwhint')); updateArmChip();
}
function updatePowerPreview(p) {
  const hint = pwEl('pwhint');
  if (!selPower || p == null || p < 0) { R.setPowerPreview(null); hideFloater(hint); return; }
  const a = sim.powerArea(S, map, selPower, p);
  R.setPowerPreview({ center: p, provs: a.provs, color: powerColor(selPower, a.ok) });
  const nm = S.provName[p] || '이름 없는 땅';
  const scope = a.nation != null ? S.nations[a.nation].name + ' 전체 (' + a.provs.length + '지방)' : a.provs.length > 1 ? '중심+인접 ' + a.provs.length + '곳' : '1개 지방';
  const pend = pwPending && pwPending.p === p && pwPending.type === selPower;
  const label = `<b>${PW_ICON[selPower] || ''} ${sim.POWERS[selPower].name}</b> → ${nm}`;
  let h;
  if (pwHintFold) {
    // 접힌 상태: 한 줄만 보여 지도를 가리지 않되, 확정 단계라면 발동·취소는 그대로 둠
    h = `<span class="phlabel">${label}</span><button id="phFold" class="foldbtn" title="미리보기 펼치기">펼치기 ▾</button>`;
    if (pend) h += '<span class="acts"><button id="pwGo">여기에 발동</button><button id="pwNo">취소</button></span>';
    hint.classList.add('folded');
  } else {
    h = label + ` <button id="phFold" class="foldbtn" title="한 줄로 접어 지도가 잘 보이게 하기">접기 ▴</button>`;
    h += a.ok ? `<div class="okln">${scope} · ${a.expect}</div>` : `<div class="badln">${a.msg}</div>`;
    if (pend) h += '<div class="acts"><button id="pwGo">여기에 발동</button><button id="pwNo">취소</button></div>';
    hint.classList.remove('folded');
  }
  hint.innerHTML = h; hint.classList.remove('hide'); layoutFloaters();
  const fo = hint.querySelector('#phFold'); if (fo) fo.onclick = (e) => { e.stopPropagation(); setPwHintFold(!pwHintFold); updatePowerPreview(p); };
  const go = hint.querySelector('#pwGo'); if (go) go.onclick = () => firePower(selPower, p);
  const no = hint.querySelector('#pwNo'); if (no) no.onclick = () => { pwPending = null; R.setPowerPreview(null); hideFloater(hint); };
}
function firePower(type, p) {
  const r = sim.applyPower(S, map, type, p);
  if (!r.ok) { toast(r.msg); pwPending = null; updatePowerPreview(p); return; }
  pwPending = null; R.setPowerPreview(null); hideFloater(pwEl('pwhint'));
  pwCount++; updateArmChip();
  toast((PW_ICON[type] || '') + ' ' + sim.POWERS[type].name + ' 발동 (' + pwCount + '회) — 다른 지역에도 계속 쓸 수 있습니다');
  showPowerResult(type, p, r.diff);
  needRefresh = true; R.sel = p; R.paintHL();
}
const dnum = (v) => (v < 0 ? '-' : '') + numStr(Math.abs(v));
function showPowerResult(type, p, d) {
  const el = pwEl('pwres'); if (!d) { hideFloater(el); return; }
  const nm = S.provName[p] || '';
  const headTxt = `${PW_ICON[type] || ''} ${sim.POWERS[type].name} 결과${nm ? ' — ' + nm : ''}`;
  let h = `<div class="prhead">${headTxt}</div>`;
  const lines = [];
  const ctr = d.provs.find((x) => x.p === p);
  if (ctr && ctr.pop1 !== ctr.pop0) { const dp = ctr.pop1 - ctr.pop0; lines.push(`인구 ${numStr(ctr.pop0)} → ${numStr(ctr.pop1)} <em class="${dp > 0 ? 'up' : 'down'}">(${dp > 0 ? '+' : ''}${dnum(dp)})</em>`); }
  const nearLost = d.popLost - (ctr && ctr.pop1 < ctr.pop0 ? ctr.pop0 - ctr.pop1 : 0);
  if (nearLost > 0) lines.push(`주변 인구 <em class="down">-${numStr(Math.round(nearLost))}</em>`);
  else if (!ctr && d.popLost > 0) lines.push(`인구 <em class="down">-${numStr(Math.round(d.popLost))}</em>`);
  if (d.popGained > 0 && !(ctr && ctr.pop1 > ctr.pop0)) lines.push(`인구 <em class="up">+${numStr(Math.round(d.popGained))}</em>`);
  if (d.citiesLost > 0) lines.push(`도시 ${d.citiesLost}곳 파괴`);
  for (const n of d.nations.slice(0, 2)) {
    const bits = [];
    if (Math.round(n.stab0 * 100) !== Math.round(n.stab1 * 100)) bits.push(`안정도 ${Math.round(n.stab0 * 100)}% → ${Math.round(n.stab1 * 100)}%`);
    if (n.pc0 !== n.pc1) bits.push(`지방 ${n.pc0} → ${n.pc1}`);
    if (bits.length) lines.push(`${n.name}: ${bits.join(' · ')}`);
  }
  for (const e of d.events.slice(0, type === 'peace' || type === 'war' ? 3 : 1)) lines.push(`<em>${e}</em>`);
  if (!lines.length) lines.push('눈에 띄는 즉각 변화는 없습니다');
  const btns = `<button id="prFold" class="foldbtn">${resFold ? '펼치기 ▾' : '접기 ▴'}</button><button id="prX" class="foldbtn" title="닫기">✕</button>`;
  if (resFold) {
    el.classList.add('folded');
    el.innerHTML = `<span class="prhead">${headTxt}</span><span class="prbtns">${btns}</span>`;
  } else {
    el.classList.remove('folded');
    el.innerHTML = `<div class="prhead"><span>${headTxt}</span><span class="prbtns">${btns}</span></div>` + lines.slice(0, 6).map((l) => `<div class="prline">${l}</div>`).join('');
  }
  el.classList.remove('hide'); layoutFloaters();
  clearTimeout(showPowerResult.t); showPowerResult.t = setTimeout(() => hideFloater(el), 8000);
  el.onclick = (e) => {
    if (e.target.closest('button')) return;
    if (resFold) { setResFold(false); showPowerResult(type, p, d); }
    else hideFloater(el);
  };
  el.querySelector('#prFold').onclick = (e) => { e.stopPropagation(); setResFold(!resFold); showPowerResult(type, p, d); };
  el.querySelector('#prX').onclick = (e) => { e.stopPropagation(); clearTimeout(showPowerResult.t); hideFloater(el); };
}
function select(p) {
  if (p < 0) { R.sel = -1; R.paintHL(); return; }
  if (selPower) {
    if (touchUI() && (!pwPending || pwPending.p !== p || pwPending.type !== selPower)) { pwPending = { type: selPower, p }; updatePowerPreview(p); return; }
    firePower(selPower, p); return;
  }
  R.sel = p; R.paintHL(); tab = 'sel'; setPanelOpen(true); renderPanel();
}

// ---------- 패널 ----------
const TABS = [['world', '세계'], ['sel', '선택'], ['cmp', '비교'], ['log', '연대기'], ['war', '전쟁'], ['god', '권능'], ['set', '설정']];
let panelSig = '';
let logNat = null; // 연대기 탭 국가 필터 (null = 전체)
let cmpA = -1, cmpB = -1; // 비교 탭의 두 나라 슬롯
let cmpMetric = 'pop'; // 추이 차트 지표 (pop/pc/stab)
try { const m = localStorage.getItem('genesis-atlas-cmpmetric'); if (METRICS.some(([k]) => k === m)) cmpMetric = m; } catch (e) {}
function goTo(p) { if (p == null || p < 0 || !map.provinces[p]) return; R.sel = p; R.paintHL(); R.focus(p, 4); needRefresh = true; if (isMobileLayout()) setPanelOpen(false); }
function kv(k, v) { return `<div class="kv"><span>${k}</span><b>${v}</b></div>`; }
// ---------- 국가 비교 ----------
function addToCompare(id) {
  if (cmpA === id || cmpB === id) { tab = 'cmp'; panelSig = ''; renderPanel(); return; }
  if (cmpA < 0) cmpA = id; else cmpB = id;
  toast(S.nations[id].name + '을(를) 비교에 담았습니다');
  tab = 'cmp'; panelSig = ''; renderPanel();
}
function cmpNatOptions(selId) {
  const list = S.nations.filter((n) => n.alive).sort((a, b) => b.pop - a.pop);
  let o = '<option value="-1">— 나라 선택 —</option>';
  for (const n of list) o += `<option value="${n.id}"${n.id === selId ? ' selected' : ''}>${n.name} · ${numStr(n.pop)}</option>`;
  if (selId >= 0 && !list.some((n) => n.id === selId) && S.nations[selId]) o += `<option value="${selId}" selected>${S.nations[selId].name} (멸망)</option>`;
  return o;
}
function drawCmpChart(cv, A, B, key) {
  const c = cv.getContext('2d'); const Wd = cv.width, Ht = cv.height;
  c.clearRect(0, 0, Wd, Ht);
  const sA = seriesOf(A.hist, key), sB = seriesOf(B.hist, key);
  const mx = chartMax(key, sA, sB);
  const y0 = Math.min(sA.length ? sA[0][0] : S.year, sB.length ? sB[0][0] : S.year);
  const y1 = Math.max(sA.length ? sA[sA.length - 1][0] : S.year, sB.length ? sB[sB.length - 1][0] : S.year, y0 + 1);
  const X = (y) => (y - y0) / (y1 - y0) * (Wd - 8) + 4;
  const Y = (v) => Ht - 14 - v / mx * (Ht - 26);
  if (key === 'stab') { c.strokeStyle = '#223c58'; c.setLineDash([3, 3]); c.beginPath(); c.moveTo(0, Y(0.5)); c.lineTo(Wd, Y(0.5)); c.stroke(); c.setLineDash([]); }
  c.strokeStyle = '#1d3652'; c.beginPath(); c.moveTo(0, Y(0)); c.lineTo(Wd, Y(0)); c.stroke();
  for (const [h, rgb] of [[sA, A.rgb], [sB, B.rgb]]) {
    if (!h.length) continue;
    c.strokeStyle = 'rgb(' + rgb + ')'; c.lineWidth = 1.6; c.beginPath();
    h.forEach((x, i) => { const px = X(x[0]), py = Y(x[1]); i ? c.lineTo(px, py) : c.moveTo(px, py); });
    c.stroke();
  }
  c.fillStyle = '#8aa3bd'; c.font = '10px sans-serif';
  c.fillText(key === 'stab' ? '100%' : numStr(mx), 4, 11);
  const ys = (y) => y <= 0 ? 'BC ' + (1 - Math.round(y)) : '' + Math.round(y);
  const t0 = ys(y0), t1 = ys(y1);
  c.fillText(t0, 4, Ht - 3);
  c.fillText(t1, Wd - 4 - c.measureText(t1).width, Ht - 3);
}
function renderPanel(auto) {
  if (!S) return;
  if (auto && $('panel').matches(':active')) return;
  if (auto && tab === 'cmp' && $('tabBody').querySelector('select:focus')) return;
  $('tabs').innerHTML = TABS.map(([k, t]) => `<button data-t="${k}" class="${tab === k ? 'on' : ''}">${t}</button>`).join('');
  for (const b of $('tabs').children) b.onclick = () => { tab = b.dataset.t; panelSig = ''; renderPanel(); };
  const body = $('tabBody'); const st = S.stats; let h = '';
  if (tab === 'world') {
    h += '<h3>세계 현황</h3>' + kv('시대', ERA_NAMES[Math.min(9, Math.floor(st.maxT))]) + kv('총 인구', numStr(st.world)) + kv('살아있는 국가', st.alive) + kv('진행 중인 전쟁', S.wars.length) + kv('문화 / 종교', S.cultures.length + ' / ' + S.religions.length);
    h += '<h3>강대국</h3>' + S.nations.filter((n) => n.alive).sort((a, b) => b.pop - a.pop).slice(0, 10).map((n) => `<div class="kv"><span><i style="color:rgb(${n.rgb})">■</i> <a href="#" data-n="${n.id}">${n.name}</a> <a href="#" data-w="${n.id}" title="이 국가 추적">${S.track && S.track.id === n.id ? '★' : '☆'}</a></span><b>${numStr(n.pop)}</b></div>`).join('');
    h += '<h3>인구 추이</h3><canvas class="spark" id="spark" width="300" height="60"></canvas>';
  } else if (tab === 'sel') {
    const p = R.sel; if (p < 0) h = '<p>지도에서 지역을 눌러 보세요.</p>'; else {
      const o = map.provinces[p], ow = S.P.owner[p]; const n = ow >= 0 ? S.nations[ow] : null;
      h += `<h3>${S.provName[p] || '무인 지대'}</h3>` + kv('인구', numStr(S.P.pop[p])) + kv('기술', S.P.tech[p].toFixed(2)) + kv('불안', Math.round(S.P.unrest[p] * 100) + '%') + kv('도시', S.cityName[p] || '-') + kv('문화', S.P.cult[p] >= 0 ? S.cultures[S.P.cult[p]].name : '-') + kv('신앙', S.P.rel[p] >= 0 ? S.religions[S.P.rel[p]].name : '-');
      if (n) h += `<h3>${n.name}</h3>` + kv('정체', n.gov) + kv('지도자', n.lead.name + ' (' + sim.traitText(n.lead) + ')') + kv('인구', numStr(n.pop)) + kv('지방', n.pc) + kv('안정도', Math.round(n.stab * 100) + '%') + kv('건국', yearStr(n.born)) + kv('전적', n.wins + '승 ' + n.losses + '패');
      if (n && n.alive) h += `<button class="pw" data-trk="${n.id}">${S.track && S.track.id === n.id ? '★ 추적 해제' : '☆ 이 국가 추적'}<small>인구·영토·전쟁 변화를 화면 왼쪽 위 카드로 계속 보여 줍니다.</small></button>`;
      if (n) h += `<button class="pw" data-cmp="${n.id}">⇄ 이 국가 비교하기<small>다른 나라와 인구·영토·안정도·전적·성장 추이를 나란히 비교합니다.</small></button>`;
      if (n) {
        const nl = sim.nationLog(S, n.id, 6);
        if (nl.length) h += `<h3>${n.name}의 연대기</h3><div class="log nlog">` + nl.map((l) => `<div class="i${l.i}${l.p >= 0 ? ' hasloc' : ''}"${l.p >= 0 ? ` data-lp="${l.p}" title="눌러서 위치로 이동"` : ''}>${yearStr(l.y)} · ${l.t}</div>`).join('') + `</div><button class="pw" data-nlog="${n.id}">연대기 전체 보기<small>이 국가의 건국·지도자·전쟁·권능 개입 기록을 모아 봅니다.</small></button>`;
        else h += `<button class="pw" data-nlog="${n.id}">이 국가의 연대기<small>아직 기록된 사건이 없습니다.</small></button>`;
      }
    }
  } else if (tab === 'cmp') {
    const A = S.nations[cmpA], B = S.nations[cmpB];
    h += '<h3>국가 비교</h3>';
    h += `<div class="cmpsel"><select id="cmpSelA" title="첫째 나라">${cmpNatOptions(cmpA)}</select><select id="cmpSelB" title="둘째 나라">${cmpNatOptions(cmpB)}</select></div>`;
    const chips = [];
    if (R.sel >= 0 && S.P.owner[R.sel] >= 0) chips.push('<button class="chip" id="cmpAddSel">선택 지역의 국가 담기</button>');
    if (S.track) chips.push('<button class="chip" id="cmpAddTrk">추적 국가 담기</button>');
    if (A && B) chips.push('<button class="chip" id="cmpSwap">⇄ 맞바꾸기</button>');
    if (chips.length) h += '<div class="cmpchips">' + chips.join('') + '</div>';
    if (!A || !B) h += '<p class="fine">비교할 나라 두 곳을 골라 주세요. 지도에서 지역을 누른 뒤 선택 탭의 `이 국가 비교하기`로도 담을 수 있습니다.</p>';
    else if (A.id === B.id) h += '<p class="fine">서로 다른 나라를 골라 주세요.</p>';
    else {
      const dead = (n) => n.alive ? '' : ` · ${yearStr(n.died)} 멸망`;
      h += `<div class="cmphead"><div><i style="color:rgb(${A.rgb})">■</i><b>${A.name}</b><div class="cmpgov">${A.gov}${dead(A)}</div></div><span class="cmpvs">VS</span><div class="cmpr"><i style="color:rgb(${B.rgb})">■</i><b>${B.name}</b><div class="cmpgov">${B.gov}${dead(B)}</div></div></div>`;
      const mutual = S.wars.find((w) => (w.A.includes(A.id) && w.D.includes(B.id)) || (w.A.includes(B.id) && w.D.includes(A.id)));
      if (mutual) h += `<div class="cmpwar">⚔ 두 나라는 지금 전쟁 중입니다 (${S.year - mutual.start}년째)</div>`;
      const rel = Math.round(A.relat[B.id] || 0);
      if (rel) h += `<div class="cmprel">현재 관계 ${rel > 0 ? '+' : ''}${rel} — ${rel >= 30 ? '우호적' : rel <= -30 ? '적대적' : '미묘한 사이'}</div>`;
      const world = Math.max(1, S.stats.world);
      const row = (label, va, vb, na, nb) => {
        const win = na == null || nb == null || na === nb ? null : na > nb ? 'a' : 'b';
        return `<div class="cmprow"><span>${label}</span><b class="${win === 'a' ? 'win' : ''}">${va}</b><b class="${win === 'b' ? 'win' : ''}">${vb}</b></div>`;
      };
      h += row('인구', `${numStr(A.pop)} <small>세계의 ${(A.pop / world * 100).toFixed(1)}%</small>`, `${numStr(B.pop)} <small>세계의 ${(B.pop / world * 100).toFixed(1)}%</small>`, A.pop, B.pop);
      h += row('영토', A.pc + ' 지방', B.pc + ' 지방', A.pc, B.pc);
      h += row('안정도', Math.round(A.stab * 100) + '%', Math.round(B.stab * 100) + '%', A.stab, B.stab);
      h += row('기술', A.tech.toFixed(2) + ' · ' + ERA_NAMES[Math.min(9, Math.floor(A.tech))], B.tech.toFixed(2) + ' · ' + ERA_NAMES[Math.min(9, Math.floor(B.tech))], A.tech, B.tech);
      const milTot = Math.max(1, S.nations.filter((n) => n.alive).reduce((t, n) => t + n.mil, 0));
      h += row('군사력', `세계의 ${(A.mil / milTot * 100).toFixed(1)}%`, `세계의 ${(B.mil / milTot * 100).toFixed(1)}%`, A.mil, B.mil);
      const wr = (n) => (n.wins + n.losses) ? ' <small>승률 ' + Math.round(n.wins / (n.wins + n.losses) * 100) + '%</small>' : '';
      h += row('전적', `${A.wins}승 ${A.losses}패${wr(A)}`, `${B.wins}승 ${B.losses}패${wr(B)}`, A.wins, B.wins);
      const age = (n) => Math.max(1, (n.alive ? S.year : n.died) - n.born);
      h += row('건국', `${yearStr(A.born)} <small>${age(A)}년째</small>`, `${yearStr(B.born)} <small>${age(B)}년째</small>`, null, null);
      h += row('지도자', `${A.lead.name} <small>${sim.traitText(A.lead)}</small>`, `${B.lead.name} <small>${sim.traitText(B.lead)}</small>`, null, null);
      h += '<h3>성장 추이 비교</h3>';
      h += '<div class="cmpchips">' + METRICS.map(([k, label]) => `<button class="chip ${cmpMetric === k ? 'on' : ''}" data-cmpm="${k}">${label}</button>`).join('') + '</div>';
      h += '<canvas id="cmpSpark" width="300" height="96"></canvas>';
      h += '<h3>같은 기간의 증감</h3>';
      let w0 = null, w1 = null, rows = 0;
      for (const [k, label] of METRICS) {
        const w = commonWindow(A.hist, B.hist, k);
        if (!w) { h += `<div class="cmprow"><span>${label}</span><b>—</b><b>—</b></div>`; continue; }
        const chA = changeOf(k, w.a0, w.a1), chB = changeOf(k, w.b0, w.b1);
        const dA = changeDir(chA), dB = changeDir(chB);
        const win = dA == null || dB == null || dA === dB ? null : dA > dB ? 'a' : 'b';
        const cls = (d, w2) => (w2 ? 'win ' : '') + (d == null ? '' : d >= 0 ? 'up' : 'down');
        h += `<div class="cmprow"><span>${label}</span><b class="${cls(dA, win === 'a')}">${fmtChange(chA)}</b><b class="${cls(dB, win === 'b')}">${fmtChange(chB)}</b></div>`;
        if (w0 == null || w.y0 < w0) w0 = w.y0;
        if (w1 == null || w.y1 > w1) w1 = w.y1;
        rows++;
      }
      if (rows) h += `<p class="fine">${yearStr(w0)}~${yearStr(w1)} · 지표마다 두 나라 모두 기록이 있는 구간만 비교 · 10년 간격 기록</p>`;
      else h += '<p class="fine">아직 비교할 기록이 없습니다. 시간이 지나면 10년 간격으로 추이가 쌓입니다.</p>';
      h += `<div class="cmpchips"><button class="chip" data-cmpgo="${A.cap}">${A.name} 위치로</button><button class="chip" data-cmpgo="${B.cap}">${B.name} 위치로</button></div>`;
    }
  } else if (tab === 'log') {
    const chips = [`<button class="chip ${logNat == null ? 'on' : ''}" data-lf="-1">전체</button>`];
    const chipIds = new Set();
    if (S.track) chipIds.add(S.track.id);
    if (logNat != null) chipIds.add(logNat);
    if (R.sel >= 0 && S.P.owner[R.sel] >= 0) chipIds.add(S.P.owner[R.sel]);
    for (const id of chipIds) { const cn = S.nations[id]; if (cn) chips.push(`<button class="chip ${logNat === id ? 'on' : ''}" data-lf="${id}"><i style="color:rgb(${cn.rgb})">■</i> ${cn.name}${cn.alive ? '' : ' (멸망)'}</button>`); }
    h = '<div class="logflt">' + chips.join('') + '</div>';
    let entries;
    if (logNat != null && S.nations[logNat]) {
      const nn = S.nations[logNat];
      entries = sim.nationLog(S, logNat, 120);
      if (!entries.some((l) => l.y <= nn.born && l.t.includes(nn.name))) entries.push({ y: nn.born, t: nn.name + '의 시작' + (S.mode === 'real' ? ' (시작 시나리오 배치)' : ' (건국)'), i: 3, p: nn.cap, n: logNat });
      h += `<div class="logsum">${nn.name}의 사건 ${entries.length}개 · 최신순${S.log.length >= 880 ? ' · 오래된 기록은 서서히 덮어씌워집니다' : ''}</div>`;
    } else { logNat = null; entries = S.log.slice(-80).reverse(); }
    h += '<div class="log">' + entries.map((l) => `<div class="i${l.i}${l.p >= 0 ? ' hasloc' : ''}"${l.p >= 0 ? ` data-lp="${l.p}" title="눌러서 위치로 이동"` : ''}>${yearStr(l.y)} · ${l.t}</div>`).join('') + '</div>';
  } else if (tab === 'war') {
    h = '<h3>진행 중인 전쟁</h3>';
    if (!S.wars.length) h += '<p class="fine">지금은 전쟁이 없습니다.</p>';
    for (const w of S.wars) {
      const side = (ids) => ids.map((i) => S.nations[i]).filter((n) => n && n.alive);
      const As = side(w.A), Ds = side(w.D);
      const [ca, cd] = capsBySide(w);
      const aN = As[0] ? As[0].name : '?', dN = Ds[0] ? Ds[0].name : '?';
      h += '<div class="warcard"><div class="whead">⚔ <b>' + aN + '</b>' + (As.length > 1 ? ` 외 ${As.length - 1}개국` : '') + ' 대 <b>' + dN + '</b>' + (Ds.length > 1 ? ` 외 ${Ds.length - 1}개국` : '') + '</div>';
      h += `<div class="wmeta">${yearStr(w.start)} 시작 · ${S.year - w.start}년째 · 점령 ${ca + cd ? `${aN}측 ${ca} · ${dN}측 ${cd} 지방` : '아직 없음'}</div>`;
      h += `<div class="wbtns"><button class="chip" data-warfront="${w.id}">전선으로 이동</button></div></div>`;
    }
    h += '<h3>끝난 전쟁 결과</h3>';
    const wh = (S.warHist || []).slice().reverse();
    if (!wh.length) h += '<p class="fine">아직 끝난 전쟁이 없습니다. 전쟁이 끝나면 승패·기간·점령 지역과 양국의 변화를 여기에 정리합니다.</p>';
    else {
      h += '<p class="fine">인구·영토 변화는 개전~종전 사이의 전체 증감으로, 전쟁으로 인한 손실만은 아닙니다.</p>';
      for (const s of wh) {
        const aId = s.A[0], dId = s.D[0];
        const aN = s.nm[aId] || '?', dN = s.nm[dId] || '?';
        const aRgb = s.rgb[aId] || [140, 150, 160], dRgb = s.rgb[dId] || [140, 150, 160];
        h += '<div class="warcard">';
        h += `<div class="whead"><i style="color:rgb(${aRgb})">■</i> <b>${aN}</b>${s.A.length > 1 ? ` 외 ${s.A.length - 1}개국` : ''} 대 <i style="color:rgb(${dRgb})">■</i> <b>${dN}</b>${s.D.length > 1 ? ` 외 ${s.D.length - 1}개국` : ''}</div>`;
        h += `<div class="wmeta">${yearStr(s.y0)}~${yearStr(s.y1)} · ${s.dur}년 · ${s.win ? '승자: ' + (s.nm[s.win === 'A' ? aId : dId] || '?') : '승패 없이 휴전'}</div>`;
        h += `<div class="wline">${s.capsN ? `점령: ${aN}측 ${s.capsA}지방 · ${dN}측 ${s.capsD}지방` : '점령된 지방 없이 끝남'}</div>`;
        const sideRow = (id) => {
          const nm2 = s.nm[id] || '?';
          const b = s.snap && s.snap[id], a = s.now[id];
          if (!b || !a) return `<div class="wrow"><span>${nm2}</span><b>개전 기록 없음</b></div>`;
          const dead = a[1] === 0 && b[1] > 0 ? ' (멸망)' : '';
          const td = a[1] - b[1], pd = a[0] - b[0];
          const pct = b[0] > 0 ? pd / b[0] * 100 : null;
          const cls = (v) => v > 0 ? 'up' : v < 0 ? 'down' : '';
          const sign = (v) => (v > 0 ? '+' : '') + v;
          return `<div class="wrow"><span>${nm2}${dead}</span><b>영토 ${b[1]}→${a[1]} (<em class="${cls(td)}">${sign(td)}</em>) · 인구 ${numStr(b[0])}→${numStr(a[0])} (<em class="${cls(pd)}">${pct == null ? '—' : sign(Math.round(pct * 10) / 10) + '%'}</em>)</b></div>`;
        };
        h += sideRow(aId) + sideRow(dId);
        if (s.big && s.big.length) h += '<div class="wbig">' + s.big.slice(-4).reverse().map((c) => `<div class="hasloc" data-lp="${c.q}" title="눌러서 위치로 이동">${sim.josa(`${yearStr(c.y)} · ${s.nm[c.t] || '?'}이(가) ${s.nm[c.f] || '?'}의 ${S.cityName[c.q] || S.provName[c.q] || '주요 도시'} 점령`)}</div>`).join('') + '</div>';
        if (s.big && s.big.length) h += `<div class="wbtns"><button class="chip ${histWar && histWar.id === s.id ? 'on' : ''}" data-warmap="${s.id}">🗺 점령 지점 ${s.big.length}곳 지도에서 보기</button></div>`;
        h += '</div>';
      }
    }
  } else if (tab === 'god') {
    h = '<h3>신의 권능</h3><p>권능을 고르면 지도에 영향 범위와 예상 효과가 미리 보입니다. 한 번 고른 권능은 해제할 때까지 여러 지역에 계속 사용할 수 있고, 발동할 때마다 실제 변화를 요약해 보여 줍니다.</p>' + Object.entries(sim.POWERS).map(([k, v]) => `<button class="pw ${selPower === k ? 'on' : ''}" data-p="${k}">${v.name}<small>${v.desc}</small></button>`).join('');
    h += `<button class="pw ${S.auto ? 'on' : ''}" id="autoBtn">자동 신 위임: ${S.auto ? '켜짐' : '꺼짐'}<small>신이 알아서 균형을 맞춥니다.</small></button>`;
  } else {
    h = '<h3>도움말</h3><p class="fine">드래그로 이동, 휠/핀치로 확대. 지역을 누르면 정보가 나옵니다. 위쪽 버튼으로 속도와 지도 모드를 바꾸고, 권능 탭에서 신의 힘을 쓰거나 자동 신 위임을 켜 보세요. 아무것도 하지 않아도 세계는 계속 흘러갑니다.</p><h3>설정</h3><button class="pw" id="bSave">지금 저장</button><button class="pw" id="bExp">파일로 내보내기</button><button class="pw" id="bImp">파일에서 불러오기</button><button class="pw" id="bNew">새 세계 시작</button><input type="file" id="fImp" class="hide" accept=".json">';
    h += '<p class="fine">지도 데이터: Natural Earth (퍼블릭 도메인). 지구 국경은 근사이며 대체 역사입니다.</p>';
  }
  const sig = tab === 'god' ? 'god' + selPower + S.auto : tab + h.length + (tab === 'world' || tab === 'log' || tab === 'cmp' || tab === 'war' ? Math.floor(S.year / 5) : '');
  if (auto && sig === panelSig) return;
  panelSig = sig; body.innerHTML = h;
  for (const a of body.querySelectorAll('[data-n]')) a.onclick = (e) => { e.preventDefault(); const n = S.nations[+a.dataset.n]; R.sel = n.cap; R.paintHL(); R.focus(n.cap, 3); tab = 'sel'; renderPanel(); };
  for (const a of body.querySelectorAll('[data-w]')) a.onclick = (e) => { e.preventDefault(); setTracking(+a.dataset.w); };
  for (const b of body.querySelectorAll('[data-trk]')) b.onclick = () => setTracking(+b.dataset.trk);
  for (const d of body.querySelectorAll('[data-lp]')) d.onclick = () => goTo(+d.dataset.lp);
  for (const d of body.querySelectorAll('[data-lf]')) d.onclick = () => { const v = +d.dataset.lf; logNat = v >= 0 ? v : null; panelSig = ''; renderPanel(); };
  for (const b of body.querySelectorAll('[data-nlog]')) b.onclick = () => { logNat = +b.dataset.nlog; tab = 'log'; panelSig = ''; renderPanel(); };
  for (const b of body.querySelectorAll('[data-p]')) b.onclick = () => { if (selPower === b.dataset.p) { disarmPower(); toast('권능 선택을 해제했습니다'); } else { armPower(b.dataset.p); toast(sim.POWERS[selPower].name + ' 선택 — 지도를 눌러 사용하세요. 해제 전까지 여러 지역에 계속 쓸 수 있습니다'); } panelSig = ''; renderPanel(); };
  const q = (id) => body.querySelector('#' + id);
  for (const b of body.querySelectorAll('[data-cmp]')) b.onclick = () => addToCompare(+b.dataset.cmp);
  for (const b of body.querySelectorAll('[data-cmpgo]')) b.onclick = () => goTo(+b.dataset.cmpgo);
  for (const b of body.querySelectorAll('[data-warfront]')) b.onclick = () => { const w = S.wars.find((x) => x.id === +b.dataset.warfront); if (focusWar(w)) toast('⚔ 전선으로 이동합니다'); };
  for (const b of body.querySelectorAll('[data-warmap]')) b.onclick = () => { const id = +b.dataset.warmap; if (histWar && histWar.id === id) hideWarView(); else showWarOnMap(id); panelSig = ''; renderPanel(); };
  for (const b of body.querySelectorAll('[data-cmpm]')) b.onclick = () => { cmpMetric = b.dataset.cmpm; try { localStorage.setItem('genesis-atlas-cmpmetric', cmpMetric); } catch (e) {} panelSig = ''; renderPanel(); };
  const csa = q('cmpSelA'), csb = q('cmpSelB');
  if (csa) csa.onchange = () => { cmpA = +csa.value; panelSig = ''; renderPanel(); };
  if (csb) csb.onchange = () => { cmpB = +csb.value; panelSig = ''; renderPanel(); };
  if (q('cmpSwap')) q('cmpSwap').onclick = () => { const t = cmpA; cmpA = cmpB; cmpB = t; panelSig = ''; renderPanel(); };
  if (q('cmpAddSel')) q('cmpAddSel').onclick = () => { if (R.sel >= 0 && S.P.owner[R.sel] >= 0) addToCompare(S.P.owner[R.sel]); };
  if (q('cmpAddTrk')) q('cmpAddTrk').onclick = () => { if (S.track) addToCompare(S.track.id); };
  if (q('autoBtn')) q('autoBtn').onclick = () => { S.auto = !S.auto; panelSig = ''; renderPanel(); };
  if (q('bSave')) q('bSave').onclick = () => { save(); toast('저장했습니다'); };
  if (q('bNew')) q('bNew').onclick = () => { running = false; $('start').classList.remove('hide'); };
  if (q('bExp')) q('bExp').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([sim.serialize(S)], { type: 'application/json' })); a.download = 'genesis-atlas-save.json'; a.click(); };
  if (q('bImp')) q('bImp').onclick = () => q('fImp').click();
  if (q('fImp')) q('fImp').onchange = async (e) => { try { localStorage.setItem(SAVE, await pack(await e.target.files[0].text())); $('cont').click(); } catch (x) { toast('불러오기 실패'); } };
  const sp = q('spark'); if (sp) { const c = sp.getContext('2d'), hs = S.hist; c.strokeStyle = '#6db3ff'; c.beginPath(); const mx = Math.max(1, ...hs.map((x) => x.pop)); hs.forEach((x, i) => { const v = x.pop; const X = i / Math.max(1, hs.length - 1) * 300, Y = 58 - v / mx * 54; i ? c.lineTo(X, Y) : c.moveTo(X, Y); }); c.stroke(); }
  const cs = q('cmpSpark'); if (cs && S.nations[cmpA] && S.nations[cmpB] && cmpA !== cmpB) drawCmpChart(cs, S.nations[cmpA], S.nations[cmpB], cmpMetric);
}
// ---------- 국가 추적 카드 ----------
let trackSig = '';
let trackFold = false;
try { trackFold = localStorage.getItem('genesis-atlas-trackfold') === '1'; } catch (e) {}
function setTracking(id) {
  if (id == null || (S.track && S.track.id === id)) S.track = null; else sim.setTrack(S, id);
  R.trackId = S.track ? S.track.id : -1;
  prevTrkWars = trackedWarIds(S);
  needRefresh = true; trackSig = ''; panelSig = ''; renderTrack(); renderPanel();
  toast(S.track ? S.nations[S.track.id].name + ' 추적 시작' : '추적 해제');
}
function renderTrack() {
  const el = $('track'); if (!S) return;
  const T = S.track;
  if (!T) { el.classList.add('hide'); trackSig = ''; layoutFloaters(); return; }
  const n = S.nations[T.id];
  if (!n) { el.classList.add('hide'); layoutFloaters(); return; }
  el.classList.remove('hide');
  if (T.dead && !T.mourned) { T.mourned = true; toast('추적 중이던 ' + n.name + '이(가) 역사에서 사라졌습니다'); }
  const wars = n.alive ? S.wars.filter((w) => w.A.includes(n.id) || w.D.includes(n.id)) : [];
  const news = sim.nationLog(S, n.id, 3);
  const sig = [n.alive, Math.round(n.pop), n.pc, Math.round(n.stab * 100), wars.length, news.length ? news[0].y + news[0].t : '', T.gained, T.lost, T.dead, autoWarPause].join('|');
  if (sig === trackSig) return; trackSig = sig;
  let h = `<div class="thead"><i style="color:rgb(${n.rgb})">■</i><b>${n.name}</b><span>${n.gov}</span><button id="tFold" class="foldbtn" title="한 줄로 접어 지도가 잘 보이게 하기">접기 ▾</button></div>`;
  if (trackFold) {
    h = `<div class="thead"><i style="color:rgb(${n.rgb})">■</i><b>${n.name}</b><span>${n.alive ? numStr(n.pop) : '멸망'}</span><button id="tFold" class="foldbtn" title="추적 카드 펼치기">펼치기 ▴</button></div>`;
    el.classList.add('folded');
    el.innerHTML = h;
    const unfold = () => { trackFold = false; try { localStorage.setItem('genesis-atlas-trackfold', '0'); } catch (e) {} trackSig = ''; renderTrack(); };
    el.querySelector('.thead').onclick = unfold;
    el.querySelector('.thead').title = '눌러서 펼치기';
    el.querySelector('#tFold').onclick = (e) => { e.stopPropagation(); unfold(); };
    layoutFloaters();
    return;
  }
  el.classList.remove('folded');
  if (!n.alive) {
    h += `<div class="tdead">${yearStr(n.died)} 멸망 · 존속 ${Math.max(1, n.died - n.born)}년</div>`;
    h += `<div class="trow">최대 인구 ${numStr(n.peakPop)} · 최대 지방 ${n.peakPc}</div>`;
  } else {
    const dp = T.pop0 > 0 ? Math.round((n.pop / T.pop0 - 1) * 100) : 0;
    h += `<div class="trow">인구 <b>${numStr(n.pop)}</b> <em class="${dp >= 0 ? 'up' : 'down'}">${dp >= 0 ? '+' : ''}${dp}%</em> · 지방 <b>${n.pc}</b> <em>${T.gained || T.lost ? '+' + T.gained + '/-' + T.lost : '±0'}</em></div>`;
    h += `<div class="trow">안정도 ${Math.round(n.stab * 100)}% · ${n.lead.name} · ${n.wins}승 ${n.losses}패</div>`;
    if (wars.length) h += wars.map((w) => { const foe = (w.A.includes(n.id) ? w.D : w.A).map((x) => S.nations[x] && S.nations[x].name).filter(Boolean).join('·'); return `<div class="trow twar" data-war="${w.id}" title="눌러서 전선으로 이동">⚔ ${foe}와 전쟁 중 (${S.year - w.start}년째)</div>`; }).join('');
    else h += '<div class="trow tpeace">전쟁 없이 평화 유지 중</div>';
  }
  h += '<canvas id="tspark" width="222" height="40"></canvas>';
  h += `<div class="tfine">${yearStr(T.since)}부터 추적 중</div>`;
  if (news.length) h += '<div class="tnews">' + news.map((l) => `<div${l.p >= 0 ? ` class="hasloc" data-tp="${l.p}" title="눌러서 위치로 이동"` : ''}>${yearStr(l.y)} · ${l.t}</div>`).join('') + '</div>';
  h += '<div class="tbtns"><button id="tFocus">지도에서 보기</button><button id="tLog">연대기</button><button id="tOff">추적 해제</button></div>';
  if (n.alive) h += `<button id="tWarPause" class="twp${autoWarPause ? ' on' : ''}" title="켜 두면 이 국가가 전쟁을 시작하거나 전쟁이 끝날 때 자동으로 일시정지합니다">⚔ 전쟁 시작·종료 시 자동 정지: ${autoWarPause ? '켜짐' : '꺼짐'}</button>`;
  el.innerHTML = h;
  const fold = () => { trackFold = true; try { localStorage.setItem('genesis-atlas-trackfold', '1'); } catch (e) {} trackSig = ''; renderTrack(); };
  el.querySelector('.thead').onclick = fold;
  el.querySelector('.thead').title = '눌러서 접기';
  el.querySelector('#tFold').onclick = (e) => { e.stopPropagation(); fold(); };
  for (const d of el.querySelectorAll('[data-war]')) d.onclick = () => { const w = S.wars.find((x) => x.id === +d.dataset.war); if (w) focusWar(w); };
  $('tFocus').onclick = () => goTo(n.cap);
  for (const d of el.querySelectorAll('[data-tp]')) d.onclick = () => goTo(+d.dataset.tp);
  $('tLog').onclick = () => { logNat = n.id; tab = 'log'; setPanelOpen(true); panelSig = ''; renderPanel(); };
  $('tOff').onclick = () => setTracking(null);
  const twp = $('tWarPause');
  if (twp) twp.onclick = () => {
    autoWarPause = !autoWarPause;
    try { localStorage.setItem(WARPAUSE_PREF, autoWarPause ? '1' : '0'); } catch (e) {}
    prevTrkWars = trackedWarIds(S);
    trackSig = ''; renderTrack();
    toast(autoWarPause ? '추적 국가의 전쟁이 시작되거나 끝나면 자동으로 멈춥니다' : '전쟁 자동 정지를 껐습니다');
  };
  const c = $('tspark').getContext('2d'); const hs = T.hist;
  if (hs.length) {
    c.strokeStyle = '#7fd0ff'; c.lineWidth = 1.5; c.beginPath();
    const mx = Math.max(1, ...hs.map((x) => x[1]));
    hs.forEach((x, i) => { const X = i / Math.max(1, hs.length - 1) * 220, Y = 38 - x[1] / mx * 34; i ? c.lineTo(X, Y) : c.moveTo(X, Y); }); c.stroke();
  }
  layoutFloaters();
}
{ const q = new URLSearchParams(location.search); if (q.has('map')) $('selMap').value = q.get('map'); if (q.has('mode')) $('selMode').value = q.get('mode'); if (q.has('auto')) { $('go').click(); window.__skip = +q.get('auto') || 0; if (q.has('speed')) window.__speed = +q.get('speed'); } }
