import { generateMap, MAP_KINDS, buildEarth, W, H } from './world.js';
import { Renderer } from './render.js';
import * as sim from './sim.js';
import { yearStr, numStr, ERA_NAMES } from './names.js';
const $ = (id) => document.getElementById(id);
const SAVE = 'genesis-atlas-save-v1';
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
  R.terrainKind = map.kind + map.seed; R.fit(); if (R.cssW < 700 && map.kind === 'earth') { R.cam.z = Math.max(R.minZ, R.cssW / 520); R.cam.x = 640; R.cam.y = 190; R.clamp(); } R.mode = 'political'; R.sel = -1; R.trackId = S.track ? S.track.id : -1; speed = window.__speed ?? 1; running = true; needRefresh = true; buildBars(); renderPanel(); renderTrack();
  let pref = null; try { pref = localStorage.getItem(PANEL_PREF); } catch (e) {}
  setPanelOpen(pref === null ? !isMobileLayout() : pref === '1', false);
  toast('휠·드래그로 이동, 지역을 눌러 살펴보세요');
}
function buildBars() {
  $('speed').innerHTML = ''; for (const [v, t] of SPEEDS) { const b = document.createElement('button'); b.textContent = t; b.dataset.v = v; b.title = v ? (v >= 1 ? '1초에 ' + v + '년' : (1 / v) + '초에 1년') : '일시정지'; b.onclick = () => { speed = v; if (v > 0) prevSpeed = v; markBars(); }; $('speed').appendChild(b); }
  $('modes').innerHTML = ''; for (const [v, t] of MODES) { const b = document.createElement('button'); b.textContent = t; b.dataset.m = v; b.onclick = () => { R.mode = v; needRefresh = true; markBars(); }; $('modes').appendChild(b); }
  markBars();
}
function markBars() { $('rate').textContent = speed ? (speed >= 1 ? '· 1초에 ' + speed + '년' : '· ' + 1 / speed + '초에 1년') : '· 일시정지'; for (const b of $('speed').children) b.classList.toggle('on', +b.dataset.v === speed); for (const b of $('modes').children) b.classList.toggle('on', b.dataset.m === R.mode); }
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
  if (needRefresh && t - lastRefresh > 100) { R.refresh(S); lastRefresh = t; needRefresh = false; }
  { const c = R.cam; const key = c.x + '|' + c.y + '|' + c.z + '|' + R.sel + '|' + R.mode + '|' + R.cssW + R.cssH + '|' + lastRefresh; if (speed > 0 || R.effects.length || key !== loop.dk || R.fresh) { R.draw(dt, S); loop.dk = key; R.fresh = false; } }
  $('year').textContent = yearStr(S.year); $('era').textContent = ERA_NAMES[Math.min(9, Math.floor(S.stats.maxT))];
  $('spop').textContent = '인구 ' + numStr(S.stats.world); $('snat').textContent = '국가 ' + S.stats.alive; $('swar').textContent = '전쟁 ' + S.wars.length;
  if (t - (loop.pt || 0) > 800) { loop.pt = t; renderPanel(true); renderTrack(); }
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
  cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); moved = 0; pd = pts.size === 2 ? dist() : 0; });
  cv.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) { R.hover = R.provAt(e.clientX, e.clientY); return; }
    const o = pts.get(e.pointerId); const dx = e.clientX - o[0], dy = e.clientY - o[1]; pts.set(e.pointerId, [e.clientX, e.clientY]); moved += Math.abs(dx) + Math.abs(dy);
    if (pts.size === 1) R.pan(dx, dy); else if (pts.size === 2) { const d = dist(); if (pd) { const m = mid(); R.zoomAt(m[0], m[1], d / pd); } pd = d; }
  });
  const up = (e) => { if (pts.has(e.pointerId) && pts.size === 1 && moved < 8) select(R.provAt(e.clientX, e.clientY)); pts.delete(e.pointerId); pd = 0; };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', (e) => { pts.delete(e.pointerId); });
  cv.addEventListener('wheel', (e) => { e.preventDefault(); R.zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
  const dist = () => { const a = [...pts.values()]; return Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]); };
  const mid = () => { const a = [...pts.values()]; return [(a[0][0] + a[1][0]) / 2, (a[0][1] + a[1][1]) / 2]; };
  window.addEventListener('keydown', (e) => { if (e.key === ' ') { speed = speed ? 0 : prevSpeed; markBars(); e.preventDefault(); } });
}
let selPower = null;
function select(p) {
  if (p < 0) { R.sel = -1; R.paintHL(); return; }
  if (selPower) { const r = sim.applyPower(S, map, selPower, p); toast(r.ok ? sim.POWERS[selPower].name + ' 발동' : r.msg); needRefresh = true; if (r.ok) { R.sel = p; R.paintHL(); } return; }
  R.sel = p; R.paintHL(); tab = 'sel'; setPanelOpen(true); renderPanel();
}

// ---------- 패널 ----------
const TABS = [['world', '세계'], ['sel', '선택'], ['log', '연대기'], ['god', '권능'], ['set', '설정']];
let panelSig = '';
function kv(k, v) { return `<div class="kv"><span>${k}</span><b>${v}</b></div>`; }
function renderPanel(auto) {
  if (!S) return;
  if (auto && $('panel').matches(':active')) return;
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
    }
  } else if (tab === 'log') {
    h = '<div class="log">' + S.log.slice(-80).reverse().map((l) => `<div class="i${l.i}">${yearStr(l.y)} · ${l.t}</div>`).join('') + '</div>';
  } else if (tab === 'god') {
    h = '<h3>신의 권능</h3><p>권능을 고른 뒤 지도의 지역을 누르세요. 횟수 제한 없이 얼마든지 쓸 수 있습니다.</p>' + Object.entries(sim.POWERS).map(([k, v]) => `<button class="pw ${selPower === k ? 'on' : ''}" data-p="${k}">${v.name}<small>${v.desc}</small></button>`).join('');
    h += `<button class="pw ${S.auto ? 'on' : ''}" id="autoBtn">자동 신 위임: ${S.auto ? '켜짐' : '꺼짐'}<small>신이 알아서 균형을 맞춥니다.</small></button>`;
  } else {
    h = '<h3>도움말</h3><p class="fine">드래그로 이동, 휠/핀치로 확대. 지역을 누르면 정보가 나옵니다. 위쪽 버튼으로 속도와 지도 모드를 바꾸고, 권능 탭에서 신의 힘을 쓰거나 자동 신 위임을 켜 보세요. 아무것도 하지 않아도 세계는 계속 흘러갑니다.</p><h3>설정</h3><button class="pw" id="bSave">지금 저장</button><button class="pw" id="bExp">파일로 내보내기</button><button class="pw" id="bImp">파일에서 불러오기</button><button class="pw" id="bNew">새 세계 시작</button><input type="file" id="fImp" class="hide" accept=".json">';
    h += '<p class="fine">지도 데이터: Natural Earth (퍼블릭 도메인). 지구 국경은 근사이며 대체 역사입니다.</p>';
  }
  const sig = tab === 'god' ? 'god' + selPower + S.auto : tab + h.length + (tab === 'world' || tab === 'log' ? Math.floor(S.year / 5) : '');
  if (auto && sig === panelSig) return;
  panelSig = sig; body.innerHTML = h;
  for (const a of body.querySelectorAll('[data-n]')) a.onclick = (e) => { e.preventDefault(); const n = S.nations[+a.dataset.n]; R.sel = n.cap; R.paintHL(); R.focus(n.cap, 3); tab = 'sel'; renderPanel(); };
  for (const a of body.querySelectorAll('[data-w]')) a.onclick = (e) => { e.preventDefault(); setTracking(+a.dataset.w); };
  for (const b of body.querySelectorAll('[data-trk]')) b.onclick = () => setTracking(+b.dataset.trk);
  for (const b of body.querySelectorAll('[data-p]')) b.onclick = () => { selPower = selPower === b.dataset.p ? null : b.dataset.p; toast(selPower ? '지도에서 대상 지역을 누르세요' : '취소'); panelSig = ''; renderPanel(); };
  const q = (id) => body.querySelector('#' + id);
  if (q('autoBtn')) q('autoBtn').onclick = () => { S.auto = !S.auto; panelSig = ''; renderPanel(); };
  if (q('bSave')) q('bSave').onclick = () => { save(); toast('저장했습니다'); };
  if (q('bNew')) q('bNew').onclick = () => { running = false; $('start').classList.remove('hide'); };
  if (q('bExp')) q('bExp').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([sim.serialize(S)], { type: 'application/json' })); a.download = 'genesis-atlas-save.json'; a.click(); };
  if (q('bImp')) q('bImp').onclick = () => q('fImp').click();
  if (q('fImp')) q('fImp').onchange = async (e) => { try { localStorage.setItem(SAVE, await pack(await e.target.files[0].text())); $('cont').click(); } catch (x) { toast('불러오기 실패'); } };
  const sp = q('spark'); if (sp) { const c = sp.getContext('2d'), hs = S.hist; c.strokeStyle = '#6db3ff'; c.beginPath(); const mx = Math.max(1, ...hs.map((x) => x.pop)); hs.forEach((x, i) => { const v = x.pop; const X = i / Math.max(1, hs.length - 1) * 300, Y = 58 - v / mx * 54; i ? c.lineTo(X, Y) : c.moveTo(X, Y); }); c.stroke(); }
}
// ---------- 국가 추적 카드 ----------
let trackSig = '';
function setTracking(id) {
  if (id == null || (S.track && S.track.id === id)) S.track = null; else sim.setTrack(S, id);
  R.trackId = S.track ? S.track.id : -1;
  needRefresh = true; trackSig = ''; panelSig = ''; renderTrack(); renderPanel();
  toast(S.track ? S.nations[S.track.id].name + ' 추적 시작' : '추적 해제');
}
function renderTrack() {
  const el = $('track'); if (!S) return;
  const T = S.track;
  if (!T) { el.classList.add('hide'); trackSig = ''; return; }
  const n = S.nations[T.id];
  if (!n) { el.classList.add('hide'); return; }
  el.classList.remove('hide');
  if (T.dead && !T.mourned) { T.mourned = true; toast('추적 중이던 ' + n.name + '이(가) 역사에서 사라졌습니다'); }
  const wars = n.alive ? S.wars.filter((w) => w.A.includes(n.id) || w.D.includes(n.id)) : [];
  const news = []; for (let i = S.log.length - 1; i >= 0 && news.length < 3; i--) if (S.log[i].n === n.id) news.push(S.log[i]);
  const sig = [n.alive, Math.round(n.pop), n.pc, Math.round(n.stab * 100), wars.length, news.length ? news[0].y + news[0].t : '', T.gained, T.lost, T.dead].join('|');
  if (sig === trackSig) return; trackSig = sig;
  let h = `<div class="thead"><i style="color:rgb(${n.rgb})">■</i><b>${n.name}</b><span>${n.gov}</span></div>`;
  if (!n.alive) {
    h += `<div class="tdead">${yearStr(n.died)} 멸망 · 존속 ${Math.max(1, n.died - n.born)}년</div>`;
    h += `<div class="trow">최대 인구 ${numStr(n.peakPop)} · 최대 지방 ${n.peakPc}</div>`;
  } else {
    const dp = T.pop0 > 0 ? Math.round((n.pop / T.pop0 - 1) * 100) : 0;
    h += `<div class="trow">인구 <b>${numStr(n.pop)}</b> <em class="${dp >= 0 ? 'up' : 'down'}">${dp >= 0 ? '+' : ''}${dp}%</em> · 지방 <b>${n.pc}</b> <em>${T.gained || T.lost ? '+' + T.gained + '/-' + T.lost : '±0'}</em></div>`;
    h += `<div class="trow">안정도 ${Math.round(n.stab * 100)}% · ${n.lead.name} · ${n.wins}승 ${n.losses}패</div>`;
    if (wars.length) h += wars.map((w) => { const foe = (w.A.includes(n.id) ? w.D : w.A).map((x) => S.nations[x] && S.nations[x].name).filter(Boolean).join('·'); return `<div class="trow twar">⚔ ${foe}와 전쟁 중 (${S.year - w.start}년째)</div>`; }).join('');
    else h += '<div class="trow tpeace">전쟁 없이 평화 유지 중</div>';
  }
  h += '<canvas id="tspark" width="222" height="40"></canvas>';
  h += `<div class="tfine">${yearStr(T.since)}부터 추적 중</div>`;
  if (news.length) h += '<div class="tnews">' + news.map((l) => `<div>${yearStr(l.y)} · ${l.t}</div>`).join('') + '</div>';
  h += '<div class="tbtns"><button id="tFocus">지도에서 보기</button><button id="tOff">추적 해제</button></div>';
  el.innerHTML = h;
  $('tFocus').onclick = () => { if (n.cap >= 0 && map.provinces[n.cap]) { R.focus(n.cap, 4); R.sel = n.cap; R.paintHL(); needRefresh = true; } };
  $('tOff').onclick = () => setTracking(null);
  const c = $('tspark').getContext('2d'); const hs = T.hist;
  if (hs.length) {
    c.strokeStyle = '#7fd0ff'; c.lineWidth = 1.5; c.beginPath();
    const mx = Math.max(1, ...hs.map((x) => x[1]));
    hs.forEach((x, i) => { const X = i / Math.max(1, hs.length - 1) * 220, Y = 38 - x[1] / mx * 34; i ? c.lineTo(X, Y) : c.moveTo(X, Y); }); c.stroke();
  }
}
{ const q = new URLSearchParams(location.search); if (q.has('map')) $('selMap').value = q.get('map'); if (q.has('mode')) $('selMode').value = q.get('mode'); if (q.has('auto')) { $('go').click(); window.__skip = +q.get('auto') || 0; if (q.has('speed')) window.__speed = +q.get('speed'); } }
