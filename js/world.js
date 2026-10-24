// 지도 데이터: 실제 지구(Natural Earth 기반 사전 처리) 또는 절차 생성 지도 + 기후/생물군계
import { RNG, fbm, valueNoise } from './rng.js?v=100';

export const W = 1280, H = 512, LAT_TOP = 84, DEG = 0.28125;
export const latOf = (y) => LAT_TOP - (y + 0.5) * DEG;
const rowArea = new Float64Array(H);
for (let y = 0; y < H; y++) rowArea[y] = (DEG * 111.32 * Math.cos(latOf(y) * Math.PI / 180)) * (DEG * 110.57);

export const MAP_KINDS = [
  { id: 'earth', name: '현실 지구', desc: '실제 대륙·해안선·국가 위치. 기본 지도입니다.' },
  { id: 'pangaea', name: '초대륙', desc: '하나의 거대한 대륙. 모든 문명이 맞닿아 있습니다.' },
  { id: 'twin', name: '쌍둥이 대륙', desc: '바다로 갈라진 두 대륙. 늦은 접촉과 해양 침공.' },
  { id: 'archipelago', name: '군도', desc: '수많은 섬. 항해 기술이 문명의 운명을 가릅니다.' },
  { id: 'inland', name: '내해 세계', desc: '거대한 내해를 둘러싼 대륙. 교역의 바다.' },
  { id: 'fractured', name: '조각난 대륙', desc: '크고 작은 땅덩이가 흩어진 세계.' },
  { id: 'random', name: '무작위 세계', desc: '시드마다 전혀 다른 지형.' },
];

// ---------- 공통: 지형 후처리 ----------
function finishMap(map) {
  const { land } = map;
  // 바다까지 거리(깊이 대용) - chamfer
  const dist = new Float32Array(W * H).fill(9999);
  for (let i = 0; i < W * H; i++) if (land[i]) dist[i] = 0;
  const dm = (a, b) => a < b ? a : b;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; let d = dist[i];
    if (!land[i]) continue; // 육지에서 바다까지: 바다 셀에서 시작
  }
  // 바다→육지 거리와 육지→바다 거리 둘 다 계산
  const toLand = new Float32Array(W * H), toSea = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) { toLand[i] = land[i] ? 0 : 9999; toSea[i] = land[i] ? 9999 : 0; }
  const pass = (arr) => {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; let d = arr[i];
      if (x > 0) d = dm(d, arr[i - 1] + 1);
      if (y > 0) { d = dm(d, arr[i - W] + 1); if (x > 0) d = dm(d, arr[i - W - 1] + 1.414); if (x < W - 1) d = dm(d, arr[i - W + 1] + 1.414); }
      arr[i] = d;
    }
    for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x; let d = arr[i];
      if (x < W - 1) d = dm(d, arr[i + 1] + 1);
      if (y < H - 1) { d = dm(d, arr[i + W] + 1); if (x < W - 1) d = dm(d, arr[i + W + 1] + 1.414); if (x > 0) d = dm(d, arr[i + W - 1] + 1.414); }
      arr[i] = d;
    }
  };
  pass(toLand); pass(toSea);
  map.toSea = toSea; map.toLand = toLand;
  // 기후
  const seed = map.seed | 0;
  const temp = new Float32Array(W * H), moist = new Float32Array(W * H), biome = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    const lat = Math.abs(latOf(y));
    const mlat = 0.40 + 0.34 * Math.cos(lat * Math.PI / 30) * (1 - smooth(38, 70, lat)) + 0.16 * smooth(25, 50, lat) * (1 - smooth(55, 80, lat)) - 0.2 * smooth(60, 85, lat);
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!land[i]) continue;
      const e = map.elev[i];
      let t = 29 - 0.58 * lat - e * 24 + (fbm(x / 120, y / 120, seed + 5, 3) - 0.5) * 6;
      let m = mlat - Math.min(0.34, toSea[i] / 380) + (fbm(x / 90, y / 90, seed + 9, 4) - 0.5) * 0.45 + (toSea[i] < 14 ? 0.08 : 0);
      if (e > 0.55) m -= (e - 0.55) * 0.3;
      temp[i] = t; moist[i] = Math.max(0, Math.min(1, m));
      biome[i] = biomeOf(t, moist[i], e);
    }
  }
  map.temp = temp; map.moist = moist; map.biome = biome;
  return map;
}
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const BIOMES = [
  { id: 0, name: '바다' }, { id: 1, name: '빙원', fert: 0.0 }, { id: 2, name: '툰드라', fert: 0.12 }, { id: 3, name: '침엽수림', fert: 0.35 },
  { id: 4, name: '온대림', fert: 0.8 }, { id: 5, name: '초원', fert: 0.65 }, { id: 6, name: '사막', fert: 0.06 }, { id: 7, name: '사바나', fert: 0.5 },
  { id: 8, name: '열대우림', fert: 0.6 }, { id: 9, name: '산악', fert: 0.22 }, { id: 10, name: '만년설', fert: 0.0 }, { id: 11, name: '관목지', fert: 0.3 },
];
function biomeOf(t, m, e) {
  if (e > 0.82 && t < 2) return 10;
  if (t < -9) return 1;
  if (e > 0.6) return 9;
  if (t < 0) return 2;
  if (m < 0.2) return t > 8 ? 6 : 11;
  if (t < 7) return 3;
  if (t > 21) return m > 0.55 ? 8 : (m > 0.32 ? 7 : 6);
  if (m < 0.34) return 11;
  if (m < 0.46) return 5;
  return 4;
}

// ---------- 지구 ----------
export function buildEarth(elevRGBA, provRGBA, meta) {
  const land = new Uint8Array(W * H), elev = new Float32Array(W * H), prov = new Int16Array(W * H).fill(-1);
  for (let i = 0; i < W * H; i++) {
    const r = elevRGBA[i * 4];
    if (r > 1) { land[i] = 1; elev[i] = (r - 2) / 253; }
    const v = provRGBA[i * 4] | (provRGBA[i * 4 + 1] << 8);
    if (v > 0) prov[i] = v - 1;
  }
  const map = { kind: 'earth', seed: 4242, W, H, land, elev, prov, provinces: meta.provs.map((p) => ({ ...p })), edges: meta.edges, countries: meta.countries };
  return finishProvinces(finishMap(map), false);
}

// ---------- 절차 지도 ----------
export function generateMap(kind, seed) {
  const rng = new RNG(seed ^ 0x9e3779b9);
  if (kind === 'random') kind = rng.pick(['pangaea', 'twin', 'archipelago', 'inland', 'fractured']);
  const land = new Uint8Array(W * H), elev = new Float32Array(W * H);
  const raw = new Float32Array(W * H);
  const sx = rng.range(-50, 50);
  const frac = { pangaea: 0.30, twin: 0.27, archipelago: 0.17, inland: 0.30, fractured: 0.26 }[kind];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const nx = x / W, ny = y / H;
    const warp = (fbm(nx * 3 + 11, ny * 3, seed + 3, 3) - 0.5) * 0.28;
    const wx = nx + warp * 0.6, wy = ny + (fbm(nx * 3, ny * 3 + 7, seed + 4, 3) - 0.5) * 0.28 * 0.6;
    let m = 0;
    const lat = Math.abs(ny - 0.5) * 2;
    if (kind === 'pangaea') {
      const d = Math.hypot((wx - 0.5) * 1.5, (wy - 0.5) * 2.1); m = 1 - d * 1.35;
      m += (fbm(nx * 6, ny * 6, seed, 5) - 0.5) * 0.9;
    } else if (kind === 'twin') {
      const d1 = Math.hypot((wx - 0.26) * 1.7, (wy - 0.5) * 2.2), d2 = Math.hypot((wx - 0.74) * 1.7, (wy - 0.52) * 2.2);
      m = 1 - Math.min(d1, d2) * 1.55; m += (fbm(nx * 6, ny * 6, seed, 5) - 0.5) * 0.9;
    } else if (kind === 'archipelago') {
      m = (fbm(nx * 11, ny * 11, seed, 5) - 0.5) * 1.6 + (fbm(nx * 3, ny * 3, seed + 1, 3) - 0.5) * 0.6;
      m -= Math.max(0, lat - 0.8) * 1.5;
    } else if (kind === 'inland') {
      const d = Math.hypot((wx - 0.5) * 1.35, (wy - 0.5) * 2.0);
      m = 0.9 - Math.abs(d - 0.52) * 3.0 + (fbm(nx * 7, ny * 7, seed, 5) - 0.5) * 0.9 + 0.15;
    } else {
      m = (fbm(nx * 4.5, ny * 4.5, seed, 6) - 0.5) * 1.8; m -= Math.max(0, lat - 0.85) * 1.4;
    }
    raw[y * W + x] = m;
  }
  const sorted = Float32Array.from(raw).sort();
  const sea = sorted[Math.floor((1 - frac) * sorted.length)];
  for (let i = 0; i < W * H; i++) {
    const x = i % W, y = (i / W) | 0;
    const above = raw[i] - sea;
    if (above > 0 && y > 4 && y < H - 4 && x > 3 && x < W - 4) {
      land[i] = 1;
      const rid = 1 - Math.abs(fbm(x / 160, y / 160, seed + 50, 4) * 2 - 1);
      elev[i] = Math.max(0.03, Math.min(1, above * 1.6 + Math.pow(rid, 3) * 0.55 * Math.min(1, above * 3) + 0.04));
    }
  }
  removeTiny(land, 10);
  for (let i = 0; i < W * H; i++) if (!land[i]) elev[i] = 0;
  const map = { kind, seed, W, H, land, elev, prov: new Int16Array(W * H).fill(-1), provinces: [], edges: [], countries: null };
  finishMap(map);
  makeProvinces(map, rng, 880);
  return finishProvinces(map, true);
}
function removeTiny(land, minSize) {
  const seen = new Uint8Array(W * H), stack = [];
  for (let s = 0; s < W * H; s++) {
    if (!land[s] || seen[s]) continue;
    const comp = []; stack.push(s); seen[s] = 1;
    while (stack.length) {
      const i = stack.pop(); comp.push(i);
      const x = i % W, y = (i / W) | 0;
      if (x > 0 && land[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; stack.push(i - 1); }
      if (x < W - 1 && land[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; stack.push(i + 1); }
      if (y > 0 && land[i - W] && !seen[i - W]) { seen[i - W] = 1; stack.push(i - W); }
      if (y < H - 1 && land[i + W] && !seen[i + W]) { seen[i + W] = 1; stack.push(i + W); }
    }
    if (comp.length < minSize) for (const i of comp) land[i] = 0;
  }
}
function makeProvinces(map, rng, target) {
  const { land, prov } = map;
  let landN = 0; for (let i = 0; i < W * H; i++) landN += land[i];
  const step = Math.max(6, Math.round(Math.sqrt(landN / target)));
  const seeds = [];
  for (let gy = 0; gy < H; gy += step) for (let gx = 0; gx < W; gx += step) {
    for (let t = 0; t < 6; t++) {
      const x = Math.min(W - 1, gx + rng.int(step)), y = Math.min(H - 1, gy + rng.int(step));
      if (land[y * W + x]) { seeds.push(y * W + x); break; }
    }
  }
  const qa = new Int32Array(W * H), cnt = { n: 0 };
  let qh = 0, qt = 0;
  const q = qa;
  const grow = () => {
    while (qh < qt) {
      const i = q[qh++]; const p = prov[i]; const x = i % W, y = (i / W) | 0;
      const nb = [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1];
      for (const j of nb) if (j >= 0 && land[j] && prov[j] < 0) { prov[j] = p; q[qt++] = j; }
    }
  };
  let pc = 0;
  for (const s of seeds) if (prov[s] < 0) { prov[s] = pc++; q[qt++] = s; }
  grow();
  for (let i = 0; i < W * H; i++) if (land[i] && prov[i] < 0) { prov[i] = pc++; q[qt++] = i; grow(); }
  map.provinces = Array.from({ length: pc }, () => ({}));
}
// 공통 후처리: 통계, 인접, 기후 집계
function finishProvinces(map, computeEdges) {
  const { prov, land, elev } = map; const N = map.provinces.length;
  const sx = new Float64Array(N), sy = new Float64Array(N), cn = new Int32Array(N), ar = new Float64Array(N), se = new Float64Array(N);
  const coast = new Uint8Array(N), biomeCnt = new Float32Array(N * 12), st = new Float64Array(N), sm = new Float64Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, p = prov[i]; if (p < 0) continue;
    sx[p] += x; sy[p] += y; cn[p]++; ar[p] += rowArea[y]; se[p] += elev[i]; st[p] += map.temp[i]; sm[p] += map.moist[i];
    biomeCnt[p * 12 + map.biome[i]]++;
    if (map.toSea[i] <= 1.01) coast[p] = 1;
  }
  const prv = map.provinces;
  for (let p = 0; p < N; p++) {
    const o = prv[p]; const n = Math.max(1, cn[p]);
    o.x = sx[p] / n; o.y = sy[p] / n; o.n = cn[p]; o.a = ar[p]; o.e = se[p] / n; o.k = coast[p];
    o.t = st[p] / n; o.m = sm[p] / n;
    let f = 0; for (let b = 1; b < 12; b++) f += (biomeCnt[p * 12 + b] / n) * (BIOMES[b].fert || 0);
    o.fert = f * (coast[p] ? 1.12 : 1);
    let best = 0, bb = 1; for (let b = 1; b < 12; b++) if (biomeCnt[p * 12 + b] > best) { best = biomeCnt[p * 12 + b]; bb = b; }
    o.biome = bb;
    o.id = p; o.land = []; o.sea = [];
  }
  // 앵커(대표 셀): 중심에 가장 가까운 자기 영역 셀
  const bestD = new Float64Array(N).fill(1e18), ax = new Float64Array(N), ay = new Float64Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = prov[y * W + x]; if (p < 0) continue;
    const d = (x - prv[p].x) ** 2 + (y - prv[p].y) ** 2;
    if (d < bestD[p]) { bestD[p] = d; ax[p] = x; ay[p] = y; }
  }
  for (let p = 0; p < N; p++) { prv[p].ax = ax[p]; prv[p].ay = ay[p]; }
  // 인접
  if (computeEdges) {
    const edges = new Map();
    const add = (a, b, t) => { if (a < 0 || b < 0 || a === b) return; const k = a < b ? a * 65536 + b : b * 65536 + a; const o = edges.get(k); if (o === undefined || t < o) edges.set(k, t); };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const a = prov[y * W + x]; if (a < 0) continue;
      if (x < W - 1) add(a, prov[y * W + x + 1], 0);
      if (y < H - 1) add(a, prov[(y + 1) * W + x], 0);
    }
    const R = 7;
    for (let dy = 0; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      if (dy === 0 && dx <= 0) continue; if (dx * dx + dy * dy > R * R) continue;
      for (let y = 0; y < H - dy; y++) for (let x = Math.max(0, -dx); x < Math.min(W, W - dx); x++) {
        const a = prov[y * W + x]; if (a < 0) continue; const b = prov[(y + dy) * W + x + dx]; if (b < 0 || a === b) continue; add(a, b, 1);
      }
    }
    map.edges = [...edges.entries()].map(([k, t]) => [Math.floor(k / 65536), k % 65536, t]);
    const deg = new Int32Array(N); for (const [a, b] of map.edges) { deg[a]++; deg[b]++; }
    for (let p = 0; p < N; p++) if (!deg[p]) { // 고립: 가장 가까운 두 곳에 해상 연결
      const ds = []; for (let q = 0; q < N; q++) if (q !== p) ds.push([(prv[p].x - prv[q].x) ** 2 + (prv[p].y - prv[q].y) ** 2, q]);
      ds.sort((u, v) => u[0] - v[0]); for (const [, q] of ds.slice(0, 2)) map.edges.push([p, q, 1]);
    }
  }
  for (const [a, b, t] of map.edges) { (t ? prv[a].sea : prv[a].land).push(b); (t ? prv[b].sea : prv[b].land).push(a); }
  // 광물/자원 (고도·시드 기반)
  for (let p = 0; p < N; p++) { const o = prv[p]; o.metal = Math.min(1, Math.max(0, o.e * 1.1 + (valueNoise(o.x / 30, o.y / 30, map.seed + 77) - 0.5) * 0.8)); }
  return map;
}
