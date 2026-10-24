// 렌더러: 지형 사전 렌더(2배 해상도) + 정치/문화 등 오버레이 + 라벨/도시/효과
import { W, H, BIOMES } from './world.js';
import { planLabels, nationBudget, cityBudget, planArmyLabels } from './labels.js';
import { visibleCaps, capAlpha } from './warwatch.js';
import { pathPos } from './sim.js';
import { GOODS, NG, resOf, mainRes, goodCss } from './econ.js';
const S2 = 2, TW = W * S2, TH = H * S2;
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const BCOL = [null, '#e8eef1', '#b4bfad', '#5b7d5a', '#6c9856', '#a8b45e', '#d6c086', '#b8b061', '#3e7d48', '#8a8377', '#f3f5f7', '#b2ad73'].map((c) => c && hex(c));

export function makeCanvas(w, h) { if (typeof OffscreenCanvas !== 'undefined' && false) return new OffscreenCanvas(w, h); const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

export function bakeTerrain(map, season = 0) {
  const cv = makeCanvas(TW, TH); const ctx = cv.getContext('2d'); const img = ctx.createImageData(TW, TH); const d = img.data;
  const { land, elev, biome, toSea, toLand } = map;
  // 바다 색 (깊이: 육지로부터 거리)
  const sample = (arr, fx, fy) => {
    const x0 = Math.max(0, Math.min(W - 2, Math.floor(fx))), y0 = Math.max(0, Math.min(H - 2, Math.floor(fy)));
    const tx = fx - x0, ty = fy - y0; const i = y0 * W + x0;
    return (arr[i] * (1 - tx) + arr[i + 1] * tx) * (1 - ty) + (arr[i + W] * (1 - tx) + arr[i + W + 1] * tx) * ty;
  };
  for (let Y = 0; Y < TH; Y++) {
    const fy = (Y + 0.5) / S2 - 0.5;
    for (let X = 0; X < TW; X++) {
      const fx = (X + 0.5) / S2 - 0.5;
      const cx = Math.max(0, Math.min(W - 1, Math.round(fx))), cy = Math.max(0, Math.min(H - 1, Math.round(fy)));
      const ci = cy * W + cx;
      const lf = sample(land, fx, fy);
      const o = (Y * TW + X) * 4;
      // 바다
      const dep = Math.min(1, sample(toLand, fx, fy) / 38);
      const lat = Math.abs(84 - (Y / S2) * 0.28125);
      const dq = Math.pow(1 - dep, 3); let or = 18 + dq * 50, og = 52 + dq * 80, ob = 92 + dq * 70;
      // 극지 얼음 바다
      if (lat > 72) { const k = Math.min(1, (lat - 72) / 10); or += (210 - or) * k * 0.7; og += (225 - og) * k * 0.7; ob += (235 - ob) * k * 0.7; }
      // 해안 하이라이트
      const shore = Math.max(0, 1 - sample(toLand, fx, fy) / 2.2) * 0.35;
      or += shore * 90; og += shore * 110; ob += shore * 100;
      let r = or, g = og, b = ob;
      if (lf > 0.02) {
        const bc = BCOL[biome[ci]] || BCOL[4];
        const e = sample(elev, fx, fy);
        // 언덕 음영 (북서쪽 광원)
        const ex = sample(elev, fx + 1.2, fy + 1.2) - sample(elev, fx - 1.2, fy - 1.2);
        let sh = 1 + Math.max(-0.35, Math.min(0.35, -ex * 5.5)) + (e - 0.2) * 0.35;
        // 해안선 근처 약간 밝게
        const edge = Math.min(1, sample(toSea, fx, fy) / 6);
        sh *= 0.9 + 0.1 * edge;
        let lr = bc[0] * sh, lg = bc[1] * sh, lb = bc[2] * sh;
        const a = Math.min(1, Math.max(0, (lf - 0.3) / 0.4));
        r = or + (lr - or) * a; g = og + (lg - og) * a; b = ob + (lb - ob) * a;
        // 육지 가장자리에 어두운 윤곽
        const rim = Math.max(0, 1 - Math.abs(lf - 0.5) * 3.2) * 0.35;
        r *= 1 - rim; g *= 1 - rim; b *= 1 - rim * 0.8;
      }
      d[o] = r > 255 ? 255 : r; d[o + 1] = g > 255 ? 255 : g; d[o + 2] = b > 255 ? 255 : b; d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

// 지방별 셀 목록(오버레이 갱신용)
export function buildCellIndex(map) {
  const N = map.provinces.length; const cnt = new Int32Array(N + 1);
  for (let i = 0; i < W * H; i++) { const p = map.prov[i]; if (p >= 0) cnt[p + 1]++; }
  for (let p = 0; p < N; p++) cnt[p + 1] += cnt[p];
  const idx = new Int32Array(cnt[N]); const fill = cnt.slice(0, N);
  for (let i = 0; i < W * H; i++) { const p = map.prov[i]; if (p >= 0) idx[fill[p]++] = i; }
  return { start: cnt, idx };
}

export class Renderer {
  constructor(canvas, map) {
    this.cv = canvas; this.ctx = canvas.getContext('2d'); this.map = map;
    this.terrain = bakeTerrain(map);
    this.ov = makeCanvas(TW, TH); this.ovCtx = this.ov.getContext('2d'); this.ovImg = this.ovCtx.createImageData(TW, TH);
    this.hl = makeCanvas(TW, TH); this.hlCtx = this.hl.getContext('2d');
    this.pvCv = makeCanvas(TW, TH); this.pvCtx = this.pvCv.getContext('2d'); this.pvOn = false; this.pvCenter = null; this.pvColor = '#ffd24a';
    this.cells = buildCellIndex(map);
    // 지방 경계 마스크 (셀 단위로 이웃과 다른 지방)
    this.cam = { x: W / 2, y: H / 2, z: 1 }; this.minZ = 0.5;
    this.mode = 'political'; this.dirty = true; this.sel = -1; this.hover = -1; this.trackId = -1; this.followId = -1; this.effects = []; this.time = 0; this.capAge = 3;
    this.provColor = new Uint32Array(map.provinces.length); this.ownerKey = new Int32Array(map.provinces.length).fill(-1);
    this.warPts = [];
    this.histWar = null;
    this.labels = []; this.showTrade = true; this.showLabels = true; this.warPairs = new Set();
    this.resize();
  }
  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = this.cv.getBoundingClientRect(); this.cssW = r.width; this.cssH = r.height;
    this.cv.width = Math.round(r.width * dpr); this.cv.height = Math.round(r.height * dpr); this.dpr = dpr;
    this.minZ = Math.max(r.width / W, r.height / H) * 0.98; if (this.cam.z < this.minZ) this.cam.z = this.minZ; this.clamp(); this.fresh = true;
  }
  fit() { this.cam.z = this.minZ * 1.0; this.cam.x = W / 2; this.cam.y = H / 2; this.clamp(); }
  clamp() {
    const c = this.cam, vw = this.cssW / c.z, vh = this.cssH / c.z;
    c.x = vw >= W ? W / 2 : Math.max(vw / 2, Math.min(W - vw / 2, c.x));
    c.y = vh >= H ? H / 2 : Math.max(vh / 2, Math.min(H - vh / 2, c.y));
  }
  toWorld(sx, sy) { const c = this.cam; return [c.x + (sx - this.cssW / 2) / c.z, c.y + (sy - this.cssH / 2) / c.z]; }
  zoomAt(sx, sy, f) {
    const [wx, wy] = this.toWorld(sx, sy); const c = this.cam;
    c.z = Math.max(this.minZ, Math.min(24, c.z * f));
    c.x = wx - (sx - this.cssW / 2) / c.z; c.y = wy - (sy - this.cssH / 2) / c.z; this.clamp();
  }
  pan(dx, dy) { this.cam.x -= dx / this.cam.z; this.cam.y -= dy / this.cam.z; this.clamp(); }
  focus(p, z) { const o = this.map.provinces[p]; this.cam.x = o.ax; this.cam.y = o.ay; if (z) this.cam.z = Math.max(this.cam.z, z); this.clamp(); }
  focusWorld(x, y, z) { this.cam.x = x; this.cam.y = y; if (z) this.cam.z = Math.max(this.cam.z, z); this.clamp(); }
  provAt(sx, sy) { const [wx, wy] = this.toWorld(sx, sy); const x = Math.floor(wx), y = Math.floor(wy); if (x < 0 || y < 0 || x >= W || y >= H) return -1; return this.map.prov[y * W + x]; }

  // 모드별 색 계산
  computeColors(S) {
    const map = this.map, N = map.provinces.length, col = this.provColor, key = this.ownerKey; const mode = this.mode;
    const rgba = (r, g, b, a) => ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
    this.warPairs.clear();
    for (const w of S.wars) { for (const a of w.A) for (const b of w.D) { this.warPairs.add(a * 4096 + b); this.warPairs.add(b * 4096 + a); } }
    this.sc = { pl: 0, ph: 3, tl: 0, th: 9 };
    if (mode === 'pop' || mode === 'tech') {
      const d = [], tt = []; for (let p = 0; p < N; p++) if (S.P.pop[p] > 1) { d.push(Math.log10(1 + S.P.pop[p] / Math.max(1, map.provinces[p].a) * 40)); tt.push(S.P.tech[p]); }
      d.sort((a, b) => a - b); tt.sort((a, b) => a - b); const q = (a, f) => a.length ? a[Math.min(a.length - 1, Math.floor(a.length * f))] : 0;
      this.sc = { pl: q(d, 0.05), ph: q(d, 0.97), tl: q(tt, 0.05), th: q(tt, 0.97) };
    }
    for (let p = 0; p < N; p++) {
      const ow = S.P.owner[p]; key[p] = mode === 'political' || mode === 'terrain' ? ow : (mode === 'culture' ? S.P.cult[p] : mode === 'religion' ? S.P.rel[p] : ow);
      let c = 0;
      if (mode === 'political') { if (ow >= 0) { const n = S.nations[ow]; c = rgba(n.rgb[0], n.rgb[1], n.rgb[2], 168); } else if (S.P.pop[p] > 5) c = rgba(255, 255, 255, 30); }
      else if (mode === 'culture') { const cu = S.P.cult[p]; if (cu >= 0 && S.P.pop[p] > 1) { const k = S.cultures[cu].rgb; c = rgba(k[0], k[1], k[2], 185); } }
      else if (mode === 'religion') { const r = S.P.rel[p]; if (r >= 0 && S.P.pop[p] > 1) { const k = S.religions[r].rgb; c = rgba(k[0], k[1], k[2], 185); } }
      else if (mode === 'pop') { const o = map.provinces[p]; const dn = S.P.pop[p] / Math.max(1, o.a); const t = Math.max(0, Math.min(1, (Math.log10(1 + dn * 40) - this.sc.pl) / Math.max(0.3, this.sc.ph - this.sc.pl))); if (S.P.pop[p] > 1) c = ramp(t, [[40, 40, 80], [200, 80, 60], [255, 230, 120]], 200); }
      else if (mode === 'tech') { if (S.P.pop[p] > 1) { const t = Math.max(0, Math.min(1, (S.P.tech[p] - this.sc.tl) / Math.max(0.4, this.sc.th - this.sc.tl))); c = ramp(t, [[60, 60, 100], [60, 160, 200], [240, 220, 100], [255, 120, 80]], 200); } }
      else if (mode === 'res') { if (map.land && map.provinces[p]) { const g = mainRes(map, p); const rr = resOf(map); if (g > 0) { const k = GOODS[g].rgb, v = Math.min(1, rr[p * NG + g] / 1.1); c = rgba(k[0], k[1], k[2], Math.round(55 + v * 85)); } else if (ow >= 0 || S.P.pop[p] > 1) c = rgba(14, 30, 48, 90); } }
      else if (mode === 'unrest') { if (ow >= 0) { c = ramp(Math.min(1, S.P.unrest[p]), [[50, 130, 70], [230, 200, 70], [220, 50, 50]], 190); } }
      col[p] = c;
    }
    this.labels = this.computeLabels(S);
  }
  computeLabels(S) {
    const out = []; const map = this.map;
    const mode = this.mode;
    if (mode === 'political' || mode === 'terrain' || mode === 'pop' || mode === 'tech' || mode === 'unrest' || mode === 'res') {
      for (const n of S.nations) {
        if (!n.alive || !n.pc) continue;
        out.push({ t: (S.track && S.track.id === n.id ? '\u2605 ' : '') + n.name, x: n.lx, y: n.ly, s: Math.sqrt(n.pc), n: n.id, big: n.pc });
      }
    }
    out.sort((a, b) => b.big - a.big); return out;
  }
  paintOverlay() {
    const map = this.map; const d = this.ovImg.data; const u32 = new Uint32Array(d.buffer);
    const { prov, land } = map; const col = this.provColor, key = this.ownerKey; const mode = this.mode;
    const bord = this.bordersOn !== false;
    const trk = (mode === 'political' || mode === 'terrain') ? this.trackId : -1;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x, p = prov[i];
        // 2x2 블록 채움
        let c = 0, bR = 0, bD = 0;
        if (p >= 0) {
          c = col[p];
          const k = key[p];
          if (x < W - 1) { const q = prov[i + 1]; if (q >= 0 && q !== p && key[q] !== k) bR = 1; else if (q >= 0 && q !== p && mode !== 'political') bR = 2; }
          if (y < H - 1) { const q = prov[i + W]; if (q >= 0 && q !== p && key[q] !== k) bD = 1; else if (q >= 0 && q !== p && mode !== 'political') bD = 2; }
          if (x < W - 1 && prov[i + 1] >= 0 && key[prov[i + 1]] !== k && this._war(this.S, p, prov[i + 1])) bR = 3;
          if (y < H - 1 && prov[i + W] >= 0 && key[prov[i + W]] !== k && this._war(this.S, p, prov[i + W])) bD = 3;
          if (trk >= 0) {
            const ownP = this.S.P.owner[p] === trk;
            if (x < W - 1 && prov[i + 1] >= 0 && (this.S.P.owner[prov[i + 1]] === trk) !== ownP) bR = 4;
            if (y < H - 1 && prov[i + W] >= 0 && (this.S.P.owner[prov[i + W]] === trk) !== ownP) bD = 4;
          }
        }
        const o0 = (y * 2) * TW + x * 2, o1 = o0 + TW;
        u32[o0] = c; u32[o0 + 1] = bR ? this._bc(bR, c) : c; u32[o1] = bD ? this._bc(bD, c) : c; u32[o1 + 1] = (bR || bD) ? this._bc(bR || bD, c) : c;
      }
    }
    this.ovCtx.putImageData(this.ovImg, 0, 0);
  }
  _bc(t, c) { if (t === 4) return 0xff4ad2ff; if (t === 3) return 0xff2828d8; if (t === 2) return 0x40000000 | (c & 0xffffff) >>> 1 & 0x7f7f7f | 0x40000000; return 0xe0201a18; }
  _war(S, p, q) { const a = S.P.owner[p], b = S.P.owner[q]; if (a < 0 || b < 0) return false; return this.warPairs.has(a * 4096 + b); }
  computeWarPts(S) {
    const out = []; const prv = this.map.provinces;
    const trk = S.track ? S.track.id : -1;
    for (const w of S.wars) {
      const pts = [];
      for (const a of w.A) {
        for (const d of w.D) {
          const l = S.fr && S.fr.get(a * 4096 + d); if (!l || !l.length) continue;
          const k = Math.min(4, l.length);
          for (let i = 0; i < k; i++) {
            const e = l[Math.min(l.length - 1, Math.floor((i + 0.5) * l.length / k))];
            pts.push([(prv[e[0]].ax + prv[e[1]].ax) / 2, (prv[e[0]].ay + prv[e[1]].ay) / 2]);
          }
          if (pts.length >= 8) break;
        }
        if (pts.length >= 8) break;
      }
      if (pts.length) out.push({ id: w.id, pts: pts.slice(0, 8), trk: trk >= 0 && (w.A.includes(trk) || w.D.includes(trk)) });
    }
    this.warPts = out;
  }
  refresh(S) { this.S = S; this.computeColors(S); this.paintOverlay(); this.dirty = false; this.paintHL(); this.computeWarPts(S); }
  paintHL() {
    const ctx = this.hlCtx; ctx.clearRect(0, 0, TW, TH);
    const p = this.sel; if (p < 0) return;
    const { start, idx } = this.cells; ctx.fillStyle = 'rgba(255,255,255,0.28)';
    for (let k = start[p]; k < start[p + 1]; k++) { const i = idx[k]; const x = i % W, y = (i / W) | 0; ctx.fillRect(x * 2, y * 2, 2, 2); }
  }
  setPowerPreview(pv) {
    const ctx = this.pvCtx; ctx.clearRect(0, 0, TW, TH);
    this.pvOn = false; this.pvCenter = null;
    if (!pv || !pv.provs || !pv.provs.length) return;
    this.pvOn = true; this.pvColor = pv.color || '#ffd24a';
    const { start, idx } = this.cells; const [r, g, b] = hex(pv.color || '#ffd24a');
    for (const p of pv.provs) {
      const strong = p === pv.center;
      ctx.fillStyle = `rgba(${r},${g},${b},${strong ? 0.5 : 0.28})`;
      for (let k = start[p]; k < start[p + 1]; k++) { const i = idx[k]; const x = i % W, y = (i / W) | 0; ctx.fillRect(x * 2, y * 2, 2, 2); }
    }
    const o = this.map.provinces[pv.center];
    this.pvCenter = o ? [o.ax, o.ay] : null;
  }
  addEffect(p, kind, color) { const o = this.map.provinces[p]; this.effects.push({ x: o.ax, y: o.ay, kind, color: color || '#fff', t: 0 }); if (kind === "war" && this.effects.length > 14) return; if (this.effects.length > 30) this.effects.shift(); }
  draw(dt, S) {
    this.time += dt; this.lastDt = Math.min(dt, 0.05); const ctx = this.ctx, c = this.cam, dpr = this.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0b2540'; ctx.fillRect(0, 0, this.cssW, this.cssH);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    const sc = c.z / S2;
    const ox = this.cssW / 2 - c.x * c.z, oy = this.cssH / 2 - c.y * c.z;
    ctx.setTransform(dpr * sc, 0, 0, dpr * sc, dpr * ox, dpr * oy);
    ctx.drawImage(this.terrain, 0, 0);
    if (this.mode !== 'terrain' || true) ctx.drawImage(this.ov, 0, 0);
    if (this.sel >= 0) ctx.drawImage(this.hl, 0, 0);
    if (this.pvOn) { ctx.globalAlpha = 0.62 + 0.3 * Math.sin(this.time * 5); ctx.drawImage(this.pvCv, 0, 0); ctx.globalAlpha = 1; }
    // 물결 광택
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawOverlayVec(ctx, S);
  }
  // 자원 지도: 지방마다 주요 자원 메달 (크기 = 매장량). 확대할수록 작은 매장지도 보인다.
  drawResGlyphs(ctx, S) {
    const map = this.map, z = this.cam.z, R = resOf(map); const prv = map.provinces; const N = prv.length;
    const thr = z < 1.4 ? 0.95 : z < 2.4 ? 0.6 : 0.3; const base = Math.max(5, Math.min(15, 3 + z * 2.4));
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (let p = 0; p < N; p++) {
      const o = prv[p]; const [x, y] = this.w2s(o.ax, o.ay); if (x < -20 || y < -20 || x > this.cssW + 20 || y > this.cssH + 20) continue;
      for (let g = 1, drawn = 0; g < NG; g++) {
        const r = R[p * NG + g]; if (r < thr) continue;
        const s = base * (0.62 + 0.38 * Math.min(1.4, r)); const dx = drawn ? s * 1.9 * drawn : 0; drawn++; if (drawn > 2) break;
        drawGlyph(ctx, x + dx, y, s, g, GOODS[g].rgb, this.time + p);
      }
    }
  }
  w2s(x, y) { const c = this.cam; return [(x - c.x) * c.z + this.cssW / 2, (y - c.y) * c.z + this.cssH / 2]; }
  drawOverlayVec(ctx, S) {
    const c = this.cam, z = c.z; const map = this.map;
    if (this.mode === 'res') this.drawResGlyphs(ctx, S);
    // 교역로 (육상: 금색 점선, 해상: 하늘색 점선) + 무역선
    if (this.showTrade && S.routes) {
      ctx.lineWidth = Math.max(1, z * 0.35); ctx.setLineDash([z * 1.2, z * 1.6]); ctx.lineDashOffset = -this.time * 12;
      const rpaths = new Map(), lpaths = new Map();
      for (const r of S.routes) {
        const a = map.provinces[r[0]], b = map.provinces[r[1]];
        if (r[2]) { // 해상: 검증된 수역 경유지 폴리라인
          if (!r[3] || r[3].length < 2) continue;
          rpaths.set(r[0] + '_' + r[1], r[3]);
          ctx.strokeStyle = 'rgba(140,205,255,0.5)';
          ctx.beginPath();
          for (let i = 0; i < r[3].length; i++) { const [sx, sy] = this.w2s(r[3][i][0], r[3][i][1]); if (i) ctx.lineTo(sx, sy); else ctx.moveTo(sx, sy); }
          ctx.stroke(); continue;
        }
        if (r[3] && r[3].length >= 2) { // 육로: 검증된 지상 경유지 폴리라인
          lpaths.set(r[0] + '_' + r[1], r[3]);
          ctx.strokeStyle = 'rgba(255,225,140,0.55)';
          ctx.beginPath();
          for (let i = 0; i < r[3].length; i++) { const [sx, sy] = this.w2s(r[3][i][0], r[3][i][1]); if (i) ctx.lineTo(sx, sy); else ctx.moveTo(sx, sy); }
          ctx.stroke(); continue;
        }
        // 경유지 없는 육로는 그리지 않는다 (바다 위를 지나는 가짜 직선 방지)
      }
      ctx.setLineDash([]);
      // 무역선: 수역 항로를 따라 왕복하는 돛단배
      if (S.ships && S.ships.length) {
        const ss = Math.max(4, Math.min(10, 3.0 * Math.sqrt(z)));
        for (const sh of S.ships) {
          const wp = rpaths.get(sh.a + '_' + sh.b); if (!wp) continue;
          const [wx, wy, ang] = pathPos(wp, sh.t);
          const [px, py] = this.w2s(wx, wy);
          if (px < -20 || py < -20 || px > this.cssW + 20 || py > this.cssH + 20) continue;
          const nn = S.nations[sh.nat];
          ctx.globalAlpha = Math.min(1, 0.3 + 3 * Math.min(sh.t, 1 - sh.t));
          drawShip(ctx, px, py, ang, ss, nn && nn.alive ? `rgb(${nn.rgb[0]},${nn.rgb[1]},${nn.rgb[2]})` : null, '#f2ead8', sh.cargo ? sh.cargo.g : -1);
          ctx.globalAlpha = 1;
          if (sh.cargo && z >= 3.5) { ctx.font = '600 10px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(5,15,28,.85)'; const tx = GOODS[sh.cargo.g].name + ' ' + Math.round(sh.cargo.amt); ctx.strokeText(tx, px, py + ss * 1.9); ctx.fillStyle = goodCss(sh.cargo.g); ctx.fillText(tx, px, py + ss * 1.9); }
        }
      }
      // 대상: 육로를 따라 왕복하는 짐짐이 행렬
      if (S.carr && S.carr.length) {
        const ss = Math.max(3.6, Math.min(8, 2.6 * Math.sqrt(z)));
        for (const sh of S.carr) {
          const wp = lpaths.get(sh.a + '_' + sh.b); if (!wp) continue;
          const [wx, wy, ang] = pathPos(wp, sh.t);
          const [px, py] = this.w2s(wx, wy);
          if (px < -20 || py < -20 || px > this.cssW + 20 || py > this.cssH + 20) continue;
          const nn = S.nations[sh.nat];
          ctx.globalAlpha = Math.min(1, 0.3 + 3 * Math.min(sh.t, 1 - sh.t));
          drawCaravan(ctx, px, py, ang, ss, nn && nn.alive ? `rgb(${nn.rgb[0]},${nn.rgb[1]},${nn.rgb[2]})` : null, sh.cargo ? sh.cargo.g : -1, this.time + sh.a * 0.7);
          ctx.globalAlpha = 1;
          if (sh.cargo && z >= 3.5) { ctx.font = '600 10px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(5,15,28,.85)'; const tx = GOODS[sh.cargo.g].name + ' ' + Math.round(sh.cargo.amt); ctx.strokeText(tx, px, py - ss * 1.7); ctx.fillStyle = goodCss(sh.cargo.g); ctx.fillText(tx, px, py - ss * 1.7); }
        }
      }
    }
    // 탐험선: 항해 경로 + 깃발을 단 배 (교역로 표시와 무관하게 항상 표시)
    if (S.exped && S.exped.length) {
      const ss = Math.max(5.5, Math.min(13, 4.0 * Math.sqrt(z)));
      for (const e of S.exped) {
        const nn = S.nations[e.n]; if (!nn || !e.pts) continue;
        const col = `rgb(${nn.rgb[0]},${nn.rgb[1]},${nn.rgb[2]})`;
        if (e.pts.length < 2) continue;
        const [x2, y2] = this.w2s(e.pts[e.pts.length - 1][0], e.pts[e.pts.length - 1][1]);
        const tt = Math.min(0.9999, Math.max(0, e.t));
        const [wx, wy, ang] = pathPos(e.pts, tt);
        const [px, py] = this.w2s(wx, wy);
        // 계획 항로 전체를 옅은 점선으로 (검증된 수역 경유지)
        ctx.globalAlpha = 0.4; ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, z * 0.35);
        ctx.setLineDash([Math.max(2, z), Math.max(3, z * 1.4)]); ctx.lineDashOffset = -this.time * 8;
        ctx.beginPath();
        for (let i = 0; i < e.pts.length; i++) { const [sx, sy] = this.w2s(e.pts[i][0], e.pts[i][1]); if (i) ctx.lineTo(sx, sy); else ctx.moveTo(sx, sy); }
        ctx.stroke();
        ctx.setLineDash([]); ctx.globalAlpha = 1;
        // 목적지 펄스 표시
        const pu = 0.5 + 0.5 * Math.sin(this.time * 3.5);
        ctx.globalAlpha = 0.35 + 0.3 * pu; ctx.strokeStyle = col; ctx.lineWidth = Math.max(1.2, z * 0.3);
        ctx.setLineDash([4, 4]); ctx.lineDashOffset = -this.time * 6;
        ctx.beginPath(); ctx.arc(x2, y2, Math.max(6, Math.min(14, z * 2.2)) * (1 + pu * 0.25), 0, 7); ctx.stroke(); ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        if (px < -30 || py < -30 || px > this.cssW + 30 || py > this.cssH + 30) continue;
        drawShip(ctx, px, py, ang, ss * 1.25, col, '#fff6e0');
      }
    }
    // 전쟁 시각화: 최근 점령(진격 화살표·점령 링) + 교전 지역 마커
    const keep = this.capAge == null ? 3 : this.capAge;
    const caps = visibleCaps(S.recentCaps, S.year, keep);
    for (const cp of caps) {
      const age = S.year - cp.y;
      const a1 = capAlpha(age, keep);
      const nn = S.nations[cp.t]; const col = nn && nn.alive ? `rgb(${nn.rgb[0]},${nn.rgb[1]},${nn.rgb[2]})` : '#cfd6dd';
      const o1 = map.provinces[cp.p], o2 = map.provinces[cp.q]; if (!o1 || !o2) continue;
      const [x1, y1] = this.w2s(o1.ax, o1.ay), [x2, y2] = this.w2s(o2.ax, o2.ay);
      ctx.globalAlpha = a1 * 0.9; ctx.strokeStyle = col; ctx.fillStyle = col;
      ctx.lineWidth = Math.max(1.6, Math.min(4, z * 0.7));
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      const ang = Math.atan2(y2 - y1, x2 - x1); const hs = Math.max(5, Math.min(11, z * 1.6));
      ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 - hs * Math.cos(ang - 0.45), y2 - hs * Math.sin(ang - 0.45)); ctx.lineTo(x2 - hs * Math.cos(ang + 0.45), y2 - hs * Math.sin(ang + 0.45)); ctx.closePath(); ctx.fill();
      const rr = (cp.big ? 11 : 7.5) * Math.min(2, 0.6 + z * 0.22);
      ctx.setLineDash([5, 4]); ctx.lineDashOffset = -this.time * 10;
      ctx.lineWidth = Math.max(1.4, Math.min(3, z * 0.5));
      ctx.beginPath(); ctx.arc(x2, y2, rr, 0, 7); ctx.stroke(); ctx.setLineDash([]);
      if (cp.big) { ctx.globalAlpha = a1 * 0.55; ctx.beginPath(); ctx.arc(x2, y2, rr * 1.6, 0, 7); ctx.stroke(); }
    }
    ctx.globalAlpha = 1;
    for (let wi = 0; wi < this.warPts.length; wi++) {
      const wf = this.warPts[wi];
      const pu = 0.7 + 0.3 * Math.sin(this.time * 4 + wi * 1.7);
      const base = wf.trk ? 1.6 : 1;
      for (const [wx, wy] of wf.pts) {
        const [x, y] = this.w2s(wx, wy); if (x < -30 || y < -30 || x > this.cssW + 30 || y > this.cssH + 30) continue;
        const r = Math.max(6, Math.min(15, 4.5 * Math.sqrt(z))) * base;
        ctx.globalAlpha = 0.14 + 0.26 * pu;
        ctx.fillStyle = wf.trk ? '#ffd24a' : '#ff4a3a';
        ctx.beginPath(); ctx.arc(x, y, r * 1.7, 0, 7); ctx.fill();
        ctx.globalAlpha = 0.95;
        const L = r * 0.9 * (0.85 + 0.15 * pu);
        ctx.lineCap = 'round';
        ctx.lineWidth = Math.max(2, r * 0.3); ctx.strokeStyle = 'rgba(10,10,14,0.85)';
        ctx.beginPath(); ctx.moveTo(x - L, y - L); ctx.lineTo(x + L, y + L); ctx.moveTo(x + L, y - L); ctx.lineTo(x - L, y + L); ctx.stroke();
        ctx.lineWidth = Math.max(1.2, r * 0.16); ctx.strokeStyle = wf.trk ? '#ffe9a8' : '#ffd9d2';
        ctx.beginPath(); ctx.moveTo(x - L, y - L); ctx.lineTo(x + L, y + L); ctx.moveTo(x + L, y - L); ctx.lineTo(x - L, y + L); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1; ctx.lineCap = 'butt';
    // 끝난 전쟁 기록 보기: 현재 지도를 살짝 눌러 과거 점령 지점만 밝게 (현재 전선 표시와 구분)
    if (this.histWar && this.histWar.pts && this.histWar.pts.length) {
      const hw = this.histWar;
      ctx.fillStyle = 'rgba(8,12,20,0.34)'; ctx.fillRect(0, 0, this.cssW, this.cssH);
      const seq = hw.pts.slice().sort((a, b) => a.yr - b.yr);
      if (seq.length > 1) {
        ctx.globalAlpha = 0.55; ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 1.6;
        ctx.setLineDash([7, 7]); ctx.lineDashOffset = -this.time * 10;
        ctx.beginPath();
        for (let i = 0; i < seq.length; i++) { const [sx, sy] = this.w2s(seq[i].x, seq[i].y); i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy); }
        ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
      }
      for (let i = 0; i < hw.pts.length; i++) {
        const p = hw.pts[i];
        const [x, y] = this.w2s(p.x, p.y); if (x < -40 || y < -40 || x > this.cssW + 40 || y > this.cssH + 40) continue;
        const pu = 0.75 + 0.25 * Math.sin(this.time * 3 + i * 1.3);
        const col = `rgb(${p.rgb[0]},${p.rgb[1]},${p.rgb[2]})`;
        const r = Math.max(7, Math.min(15, 5 * Math.sqrt(z)));
        ctx.globalAlpha = 0.45 + 0.3 * pu;
        ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]); ctx.lineDashOffset = -this.time * 12;
        ctx.beginPath(); ctx.arc(x, y, r * 1.55, 0, 7); ctx.stroke(); ctx.setLineDash([]);
        ctx.globalAlpha = 0.96;
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r * 0.82, 0, 7); ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(10,10,14,0.9)'; ctx.stroke();
        if (z > 2.1) {
          const fs = Math.max(10, Math.min(13, 9 + z * 0.5));
          ctx.font = `700 ${fs}px "Noto Sans KR", system-ui, sans-serif`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(8,12,20,0.85)'; ctx.fillStyle = '#ffe9a8';
          const lab = (p.place ? p.place + ' ' : '') + p.ylab;
          const tw = ctx.measureText(lab).width, m = 4;
          const lx = Math.max(m + tw / 2, Math.min(this.cssW - m - tw / 2, x));
          let ly = y + r * 1.55 + fs * 0.9;
          if (ly + fs / 2 + m > this.cssH) ly = y - r * 1.55 - fs * 0.9; // 아래가 잘리면 마커 위로
          ly = Math.max(m + fs / 2, Math.min(this.cssH - m - fs / 2, ly));
          ctx.strokeText(lab, lx, ly); ctx.fillText(lab, lx, ly);
        }
      }
      ctx.globalAlpha = 1;
    }
    // 권능 미리보기 조준 표시
    if (this.pvOn && this.pvCenter) {
      const [x, y] = this.w2s(this.pvCenter[0], this.pvCenter[1]);
      const pu = 0.6 + 0.4 * Math.sin(this.time * 5);
      const rr = Math.max(9, Math.min(20, 6 * Math.sqrt(z)));
      ctx.globalAlpha = 0.9; ctx.strokeStyle = this.pvColor; ctx.lineWidth = Math.max(1.6, z * 0.3);
      ctx.beginPath(); ctx.arc(x, y, rr * (0.9 + 0.15 * pu), 0, 7); ctx.stroke();
      ctx.lineWidth = Math.max(1.2, z * 0.2);
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        ctx.beginPath(); ctx.moveTo(x + dx * rr * 1.15, y + dy * rr * 1.15); ctx.lineTo(x + dx * rr * 1.5, y + dy * rr * 1.5); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    // 도시: 점은 줌 단계별 등급으로, 이름은 수도 우선 + 개수 제한 + 충돌 회피
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const rel = z / this.minZ;
    const cityMin = z > 3 ? 1 : z > 2 ? 2 : z > 1.3 ? 3 : 4;
    const cityCands = [];
    // 밀집 전장 가독성: 부대 칩 주변의 도시 이름은 숨긴다 (국가 라벨과 같은 규칙)
    const apPre = [];
    if (S.armies && S.armies.length && this.showArmies !== false) {
      for (const a of S.armies) {
        const smA = this.armySm && this.armySm.get(a.id);
        const [ax, ay] = this.w2s(smA && smA.rx != null ? smA.rx : a.x, smA && smA.ry != null ? smA.ry : a.y);
        if (ax > -40 && ay > -40 && ax < this.cssW + 40 && ay < this.cssH + 40) apPre.push(ax, ay);
      }
    }
    for (let p = 0; p < map.provinces.length; p++) {
      const lv = S.P.city[p]; if (lv < cityMin) continue; const o = map.provinces[p];
      const [x, y] = this.w2s(o.ax, o.ay); if (x < -20 || y < -20 || x > this.cssW + 20 || y > this.cssH + 20) continue;
      const cap = S.P.owner[p] >= 0 && S.nations[S.P.owner[p]].cap === p; const r = (1.4 + lv * 0.9 + (cap ? 1.4 : 0)) * Math.min(2.2, 0.7 + z * 0.22);
      ctx.fillStyle = '#1b1612'; ctx.beginPath(); ctx.arc(x, y, r + 1.2, 0, 7); ctx.fill();
      ctx.fillStyle = cap ? '#ffd24a' : '#fff6e0'; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
      if (this.showLabels !== false && S.cityName[p] && ((cap && lv >= 2 && z > 2.6) || z > 5)) {
        const fz = cap ? Math.min(15, 10 + z * 0.55) : Math.min(14, 9 + z * 0.5);
        let nearA = false;
        for (let i = 0; i < apPre.length; i += 2) { if (Math.abs(apPre[i] - x) < 34 && Math.abs(apPre[i + 1] - (y + r + 9)) < 26) { nearA = true; break; } }
        if (!nearA) {
          ctx.font = `600 ${fz}px "Noto Sans KR", system-ui, sans-serif`;
          cityCands.push({ t: S.cityName[p], x, y: y + r + 9, size: fz, w: ctx.measureText(S.cityName[p]).width, big: cap ? 1000 + lv : lv, gold: cap });
        }
      }
    }
    const placedCity = planLabels(cityCands, cityBudget(rel));
    this._clBoxes = placedCity.map((q) => [q.x - q.w / 2 - 2, q.y - q.size / 2 - 1, q.x + q.w / 2 + 2, q.y + q.size / 2 + 1]); // 부대 라벨이 피할 도시 라벨 상자
    for (const q of placedCity) {
      ctx.font = `600 ${q.size}px "Noto Sans KR", system-ui, sans-serif`;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.fillStyle = q.gold ? '#ffe9a8' : '#fff';
      ctx.strokeText(q.t, q.x, q.y); ctx.fillText(q.t, q.x, q.y);
    }
    // 전장 흔적: 격전지에 그을린 땅과 꽂힌 칼이 오래 남아 서서히 사라진다
    if (S.fields && S.fields.length && this.showArmies !== false && z >= 1.2) {
      for (const f of S.fields) {
        const age = S.year - f.y0; if (age < 0 || age > 35) continue;
        const [fx, fy] = this.w2s(f.x, f.y); if (fx < -30 || fy < -30 || fx > this.cssW + 30 || fy > this.cssH + 30) continue;
        const al = 1 - age / 35, rr = Math.max(7, Math.min(16, 3 * Math.sqrt(z))) * (0.8 + 0.2 * f.k);
        ctx.save(); ctx.translate(fx, fy);
        ctx.globalAlpha = 0.5 * al; ctx.fillStyle = '#1a1210'; ctx.beginPath(); ctx.ellipse(0, 0, rr * 1.25, rr * 0.8, 0, 0, 7); ctx.fill();
        ctx.globalAlpha = 0.85 * al; ctx.strokeStyle = '#d9d2c4'; ctx.lineWidth = Math.max(1.2, rr * 0.13); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-rr * 0.55, -rr * 0.65); ctx.lineTo(rr * 0.55, rr * 0.45); ctx.moveTo(rr * 0.55, -rr * 0.65); ctx.lineTo(-rr * 0.55, rr * 0.45); ctx.stroke();
        if (f.k >= 2) { ctx.fillStyle = '#d9d2c4'; ctx.beginPath(); ctx.arc(0, rr * 0.62, rr * 0.16, 0, 7); ctx.fill(); }
        if (f.k >= 3) { ctx.fillStyle = '#c0392b'; ctx.fillRect(-rr * 0.05, -rr * 1.2, rr * 0.55, rr * 0.3); ctx.fillStyle = '#d9d2c4'; ctx.fillRect(-rr * 0.12, -rr * 1.2, rr * 0.07, rr * 0.9); }
        ctx.restore();
      }
    }
    // 자율 부대: 깃발 칩 + 병력 수. 고속 진행에서는 숨긴다 (main.js가 showArmies로 제어)
    this._ap = [];
    if (S.armies && S.armies.length && this.showArmies !== false) {
      // 모바일처럼 줌이 낮아도 읽히도록 최소 크기를 키우고, 같은 지점에 겹친 부대는 원형으로 벌린다
      const ss = Math.max(7.5, Math.min(12, 3.4 * Math.sqrt(z)));
      // 부대 위치는 1년(한 틱)마다 갱신된다. 틱 사이를 틱 경과율(tickPhase)로 보간해
      // 무역선처럼 행군이 연속적으로 움직이는 모습으로 보이게 한다
      if (this.armySmS !== S) { this.armySm = new Map(); this.armySmS = S; this.armySmWarm = 1; } // 로드 직후 첫 패스는 저장 위치에서 시드(되감기 방지)
      const ph = this.tickPhase == null ? 1 : Math.min(1, Math.max(0, this.tickPhase));
      const smSeen = new Set();
      const groups = new Map();
      for (const a of S.armies) {
        smSeen.add(a.id);
        let sm = this.armySm.get(a.id);
        if (!sm) {
          sm = { x: a.x, y: a.y, px: a.x, py: a.y, prog: a.prog || 0, pprog: a.prog || 0, path: a.path || null, yr: S.year };
          if (!this.armySmWarm && a.path && a.path.length > 1) { // 갓 편성된 부대: 편성지(경로 시작)에서 현재 진행까지 이번 틱에 걸쳐 보여 준다
            sm.px = a.path[0][0]; sm.py = a.path[0][1]; sm.pprog = 0;
          }
          this.armySm.set(a.id, sm);
        }
        if (a.x !== sm.x || a.y !== sm.y || (a.prog || 0) !== sm.prog || (a.path || null) !== sm.path) {
          // 새 시뮬 틱이 반영됐다: 직전 틱 상태를 보관하고 이번 틱 상태로 갱신한다
          sm.px = sm.x; sm.py = sm.y; sm.pprog = sm.prog;
          sm.x = a.x; sm.y = a.y; sm.prog = a.prog || 0;
          if ((a.path || null) !== sm.path) { sm.path = a.path || null; sm.pprog = 0; } // 경로 교체: 새 경로의 시작점이 이전 위치라 연속
          else if (sm.prog < sm.pprog) sm.pprog = sm.prog; // 진행 리셋 보호
          if (Math.hypot(sm.x - sm.px, sm.y - sm.py) > 260) { sm.px = sm.x; sm.py = sm.y; sm.pprog = sm.prog; } // 진짜 순간이동(두 틱 이상의 거리)만 바로 맞춘다
          sm.yr = S.year;
        } else if (sm.yr !== S.year) { sm.yr = S.year; sm.px = sm.x; sm.py = sm.y; sm.pprog = sm.prog; } // 변화 없이 새 틱이 시작되면 보간 원점을 현재 위치로 맞춘다 (매 틱 되감기 스터터 방지)
        // 렌더 위치: 행군·후퇴 중이면 경로 위를 호장 비율로, 아니면 직선으로 틱 사이를 보간한다
        let rx, ry;
        if (a.path && a.path === sm.path && a.dlen > 0 && sm.prog > sm.pprog) { // 편성 틱에 이미 'siege'가 된 단거리 행군도 경로를 따라 보이게 한다
          const pp = pathPos(a.path, (sm.pprog + (sm.prog - sm.pprog) * ph) / a.dlen); rx = pp[0]; ry = pp[1];
        } else { rx = sm.px + (sm.x - sm.px) * ph; ry = sm.py + (sm.y - sm.py) * ph; }
        sm.rx = rx; sm.ry = ry;
        const k = Math.round(rx / 1.2) + ':' + Math.round(ry / 1.2); if (!groups.has(k)) groups.set(k, []); groups.get(k).push([a, sm]);
      }
      if (this.armySm.size > smSeen.size + 40) { for (const id of this.armySm.keys()) if (!smSeen.has(id)) this.armySm.delete(id); }
      this.armySmWarm = 0;
      // 사상자 숫자 연출 게이트: 시뮬 피해는 즉시 적용되지만, 숫자는 칩이 시각적으로 접촉한 뒤에만 띄운다.
      // 도착 틱의 활강 중이면 합산해 두고, 접촉 시 합산 표시, 접촉 전 종료되면 칩 위에 마무리 표시. 위치는 항상 렌더 칩 기준.
      for (const a of S.armies) {
        const sm = this.armySm.get(a.id); if (!sm || sm.rx == null) continue;
        const inCombat = a.st === 'battle' || a.st === 'siege';
        let contact = false;
        if (inCombat) {
          if (a.st === 'battle') {
            for (const b of S.armies) {
              if (b === a || b.st !== 'battle' || b.nat === a.nat) continue;
              const bm = this.armySm.get(b.id); if (!bm || bm.rx == null) continue;
              if (Math.hypot(bm.rx - sm.rx, bm.ry - sm.ry) <= 20) { contact = true; break; }
            }
          } else contact = Math.hypot(sm.rx - a.x, sm.ry - a.y) <= 6; // 포위: 칩이 시뮬 도착점까지 활강 완료
        }
        sm.noContact = inCombat && !contact;
        const drop = sm.men != null && a.men < sm.men - 40 && inCombat ? Math.round(sm.men - a.men) : 0;
        if (sm.noContact) { if (drop) sm.pendDmg = (sm.pendDmg || 0) + drop; }
        else {
          const tot = (sm.pendDmg || 0) + drop;
          if (tot > 0) { (this.fl = this.fl || []).push({ wx: sm.rx, wy: sm.ry, txt: '-' + tot, t: 0, dx: ((this.flN = (this.flN || 0) + 1) % 5 - 2) * 0.9, big: tot > a.men0 * 0.08 }); if (this.fl.length > 40) this.fl.shift(); }
          sm.pendDmg = 0;
        }
        sm.men = a.men;
      }
      // 행군 경로: 남은 길을 국가 색 점선으로 보여 줘 어디로 치고 가는지 읽히게 한다
      if (z >= 1.4) {
        for (const a of S.armies) {
          if (a.st !== 'march' && a.st !== 'retreat') continue; if (!a.path || a.path.length < 2 || a.prog >= a.dlen) continue;
          const nn = S.nations[a.nat]; if (!nn) continue; const sm = this.armySm.get(a.id) || a;
          ctx.save(); ctx.strokeStyle = `rgba(${nn.rgb[0]},${nn.rgb[1]},${nn.rgb[2]},.75)`; ctx.lineWidth = Math.max(1.4, ss * 0.16); ctx.setLineDash([ss * 0.55, ss * 0.45]); ctx.lineDashOffset = -this.time * ss * 2; ctx.lineCap = 'round';
          ctx.beginPath(); const [sx, sy] = this.w2s(sm.rx != null ? sm.rx : sm.x, sm.ry != null ? sm.ry : sm.y); ctx.moveTo(sx, sy);
          let acc = 0, started = false;
          for (let i = 1; i < a.path.length; i++) {
            const l = Math.hypot(a.path[i][0] - a.path[i - 1][0], a.path[i][1] - a.path[i - 1][1]); acc += l;
            if (acc >= a.prog) { const [qx, qy] = this.w2s(a.path[i][0], a.path[i][1]); ctx.lineTo(qx, qy); started = true; }
          }
          if (started) { ctx.save(); ctx.strokeStyle = 'rgba(10,10,14,.6)'; ctx.lineWidth = Math.max(3.2, ss * 0.34); ctx.setLineDash([]); ctx.stroke(); ctx.restore(); ctx.strokeStyle = '#ffffff'; ctx.globalAlpha = 0.9; ctx.stroke(); ctx.globalAlpha = 1; ctx.strokeStyle = `rgb(${nn.rgb[0]},${nn.rgb[1]},${nn.rgb[2]})`; ctx.lineWidth = Math.max(1.6, ss * 0.2); ctx.stroke(); }
          ctx.setLineDash([]);
          const e = a.path[a.path.length - 1]; const [ex, ey] = this.w2s(e[0], e[1]);
          ctx.fillStyle = a.st === 'retreat' ? 'rgba(180,180,180,.8)' : `rgba(${nn.rgb[0]},${nn.rgb[1]},${nn.rgb[2]},.9)`; ctx.strokeStyle = 'rgba(10,10,10,.8)'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(ex, ey - ss * 0.55); ctx.lineTo(ex + ss * 0.42, ey); ctx.lineTo(ex, ey + ss * 0.55); ctx.lineTo(ex - ss * 0.42, ey); ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.restore();
        }
      }
      const items = [];
      for (const arr of groups.values()) {
        for (let gi = 0; gi < arr.length; gi++) {
          const [a, sm] = arr[gi]; const nn = S.nations[a.nat]; if (!nn) continue;
          let ox = 0, oy = 0;
          if (arr.length > 1) { const ang = (gi / arr.length) * Math.PI * 2 - Math.PI / 2; const rr = ss * 1.1; ox = Math.cos(ang) * rr; oy = Math.sin(ang) * rr; }
          const [bx, by] = this.w2s(sm.rx != null ? sm.rx : sm.x, sm.ry != null ? sm.ry : sm.y);
          const px = bx + ox, py = by + oy;
          if (px < -30 || py < -30 || px > this.cssW + 30 || py > this.cssH + 30) continue;
          items.push({ a, nn, px, py, sm });
        }
      }
      // 가까이 겹친 칩은 서로 밀어내 읽히게 하고, 교전 중인 적대 부대는 점선으로 잇고 가운데에 충돌 불꽃을 그린다
      const bw = ss * 2.9, bh = ss * 4.1; // 칩+막대+병력 숫자가 차지하는 상자
      for (let it2 = 0; it2 < 4; it2++) for (let i1 = 0; i1 < items.length; i1++) for (let i2 = i1 + 1; i2 < items.length; i2++) {
        const A1 = items[i1], B1 = items[i2]; let dx = B1.px - A1.px, dy = B1.py - A1.py;
        const ox = bw - Math.abs(dx), oy = bh - Math.abs(dy); if (ox <= 0 || oy <= 0) continue;
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) dx = A1.a.id % 2 ? 1 : -1;
        if (ox < oy) { const p = ox / 2 * Math.sign(dx || 1); A1.px -= p; B1.px += p; } else { const p = oy / 2 * Math.sign(dy || 1); A1.py -= p; B1.py += p; }
      }
      const clashes = [];
      for (const it of items) {
        if (it.a.st !== 'battle') continue;
        let best = null, bd = 1e9;
        for (const o of items) { if (o === it || o.a.st !== 'battle' || o.a.nat === it.a.nat) continue; const d = Math.hypot(o.px - it.px, o.py - it.py); if (d < bd) { bd = d; best = o; } }
        if (best && bd <= 20 * z && it.a.id < best.a.id) clashes.push([it.px, it.py, best.px, best.py, it.a.id]);
      }
      if (this.fl && this.fl.length) {
        const dt = this.lastDt || 1 / 60; ctx.textAlign = 'center';
        const crowdFl = items.length >= 3, flCap = items.length >= 6 ? 1 : 2; let flDrawn = 0; // 붐비면 사상자 숫자는 큰 것 위주로만 (아주 붐비면 1개)
        for (let i = this.fl.length - 1; i >= 0; i--) {
          const f = this.fl[i]; f.t += dt; if (f.t > 1.7) { this.fl.splice(i, 1); continue; }
          if (crowdFl && (!f.big || flDrawn >= flCap)) continue; flDrawn++;
          const [fx, fy] = this.w2s(f.wx, f.wy); const rise = f.t * ss * 1.8, al = Math.min(1, (1.7 - f.t) / 0.9);
          ctx.globalAlpha = al; ctx.font = '800 ' + Math.round(ss * (f.big ? 1.45 : 1.15)) + 'px system-ui,sans-serif';
          ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(30,0,0,.9)'; ctx.fillStyle = f.big ? '#ff6b5e' : '#ffb199';
          ctx.strokeText(f.txt, fx + f.dx * ss, fy - ss * 1.6 - rise); ctx.fillText(f.txt, fx + f.dx * ss, fy - ss * 1.6 - rise);
        }
        ctx.globalAlpha = 1;
      }
      for (const c of clashes) drawClash(ctx, c[0], c[1], c[2], c[3], ss, this.time + c[4] * 0.7);
      // 밀집 전장 표시 정리: 병력 라벨은 칩 상자를 피해 놓고, 붐비면 큰 부대 5개 + 추적 부대만 남긴다
      const followIt = this.followId >= 0 ? items.find((it) => it.a.id === this.followId) || null : null;
      const fsL = Math.max(9.5, ss);
      const labPlaced = new Map();
      if (z >= 1.1) {
        ctx.font = '700 ' + fsL + 'px system-ui,sans-serif';
        const litems = [];
        for (const it of items) {
          const { a, px, py } = it;
          const cnt = a.men >= 1000 ? (a.men / 1000).toFixed(1) + 'k' : String(Math.round(a.men));
          const nm = a.cmd && z >= (this.cssW > 700 ? 2.6 : 3.4) ? a.cmd.n + ' ' : '';
          const tx = nm + cnt;
          litems.push({ id: a.id, x: px, y: py, w: ctx.measureText(tx).width, size: fsL, men: a.men, follow: it === followIt, tx });
        }
        const budget = litems.length > 6 ? 5 : Infinity;
        for (const q of planArmyLabels(litems, { chipW: bw, chipUp: ss * 1.8, chipDown: ss * 1.1, downY: ss * 2.0 + fsL * 0.35, upY: ss * 2.5, gapY: fsL * 1.05, budget, extraBoxes: this._clBoxes })) labPlaced.set(q.id, q);
      }
      items.sort((p, q) => q.a.men - p.a.men);
      for (const it of items) {
        const { a, nn, px, py } = it;
        const col = `rgb(${nn.rgb[0]},${nn.rgb[1]},${nn.rgb[2]})`;
        (this._ap || (this._ap = [])).push(px, py);
        drawArmy(ctx, px, py, ss, col, this.time + a.id * 0.9, it.sm && it.sm.noContact ? 'garrison' : a.st, Math.min(9, Math.max(0, Math.floor(nn.tech || 0))), a);
        if (it === followIt) { // 추적 중인 부대: 금색 링으로 어느 밀집 전장에서도 눈에 띄게
          const pu = 0.5 + 0.5 * Math.sin(this.time * 4);
          ctx.save(); ctx.strokeStyle = `rgba(255,210,74,${0.7 + 0.3 * pu})`; ctx.lineWidth = Math.max(2, ss * 0.2);
          ctx.beginPath(); ctx.arc(px, py, ss * (1.6 + 0.15 * pu), 0, 7); ctx.stroke(); ctx.restore();
        }
        const q = labPlaced.get(a.id);
        if (q) {
          ctx.font = '700 ' + fsL + 'px system-ui,sans-serif'; ctx.textAlign = 'center';
          ctx.lineWidth = 3.5; ctx.strokeStyle = q.follow ? 'rgba(30,22,4,.9)' : 'rgba(5,15,28,.9)';
          ctx.strokeText(q.tx, q.x, q.y); ctx.fillStyle = q.follow ? '#ffd24a' : '#fff'; ctx.fillText(q.tx, q.x, q.y);
        }
      }
    }
    // 국가 라벨: 줌 단계별 개수 제한 + 충돌 회피, 추적 국가는 항상 우선 배치·금색 강조
    if (this.showLabels !== false) {
      const fs = (l) => Math.max(0, Math.min(34, (6 + Math.sqrt(l.big) * 3.6) * Math.min(1.6, z * 0.9)));
      const trkId = S.track ? S.track.id : -1;
      const cands = [];
      for (const l of this.labels) {
        const size = fs(l); if (size < 9) continue;
        const [x, y] = this.w2s(l.x, l.y); if (x < -80 || y < -40 || x > this.cssW + 80 || y > this.cssH + 40) continue;
        ctx.font = `700 ${size}px "Noto Sans KR", system-ui, sans-serif`;
        const w0 = ctx.measureText(l.t).width, ap = this._ap || [];
        if (l.n !== trkId) { let hit = false; for (let i = 0; i < ap.length; i += 2) { if (Math.abs(ap[i] - x) < w0 / 2 + 26 && Math.abs(ap[i + 1] - y) < size / 2 + 26) { hit = true; break; } } if (hit) continue; } // 부대 칩 주변 국가 라벨은 숨겨 전투 가독성 확보
        cands.push({ t: l.t, x, y, size, w: w0, big: l.big, force: l.n === trkId });
      }
      for (const q of planLabels(cands, nationBudget(rel))) {
        ctx.font = `700 ${q.size}px "Noto Sans KR", system-ui, sans-serif`;
        ctx.lineWidth = Math.max(2, q.size / 6); ctx.lineJoin = 'round';
        if (q.force) {
          ctx.shadowColor = 'rgba(255,210,74,0.9)'; ctx.shadowBlur = q.size * 0.5;
          ctx.strokeStyle = 'rgba(30,22,4,.88)'; ctx.fillStyle = '#ffd24a';
        } else {
          ctx.strokeStyle = 'rgba(8,12,20,.78)'; ctx.fillStyle = '#fff';
        }
        ctx.strokeText(q.t, q.x, q.y); ctx.fillText(q.t, q.x, q.y);
        ctx.shadowBlur = 0;
      }
    }
    // 효과
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i]; e.t += this.lastDt || 1 / 60; if (e.t > 2.4) { this.effects.splice(i, 1); continue; }
      const [x, y] = this.w2s(e.x, e.y);
      drawFx(ctx, e, x, y, z, this.time);
    }
    // 비네트
    const g = ctx.createRadialGradient(this.cssW / 2, this.cssH / 2, Math.min(this.cssW, this.cssH) * 0.45, this.cssW / 2, this.cssH / 2, Math.max(this.cssW, this.cssH) * 0.8);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,8,20,.42)'); ctx.fillStyle = g; ctx.fillRect(0, 0, this.cssW, this.cssH);
  }
}
// 돛단배: 선체 + 돛 + 국가색 깃발. ang은 진행 방향(라디안).
function drawGlyph(ctx, x, y, s, g, rgb, tm) {
  const col = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
  ctx.save(); ctx.translate(x, y);
  const gl = ctx.createRadialGradient(0, 0, s * 0.2, 0, 0, s * 1.5); gl.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},.38)`); gl.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
  ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(0, 0, s * 1.5, 0, 7); ctx.fill();
  ctx.fillStyle = 'rgba(8,20,34,.84)'; ctx.strokeStyle = col; ctx.lineWidth = Math.max(1.2, s * 0.14);
  ctx.beginPath(); ctx.arc(0, 0, s * 0.82, 0, 7); ctx.fill(); ctx.stroke();
  ctx.fillStyle = col; ctx.strokeStyle = col; const u = s * 0.5;
  if (g === 1) { ctx.beginPath(); ctx.moveTo(0, -u * 1.05); ctx.lineTo(u * 0.8, -u * 0.05); ctx.lineTo(-u * 0.8, -u * 0.05); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.moveTo(0, -u * 0.5); ctx.lineTo(u * 1.0, u * 0.65); ctx.lineTo(-u * 1.0, u * 0.65); ctx.closePath(); ctx.fill(); ctx.fillRect(-u * 0.12, u * 0.6, u * 0.24, u * 0.45); }
  else if (g === 2) { ctx.beginPath(); ctx.moveTo(-u * 0.5, -u * 0.75); ctx.lineTo(u * 0.5, -u * 0.75); ctx.lineTo(u * 1.0, u * 0.1); ctx.lineTo(-u * 1.0, u * 0.1); ctx.closePath(); ctx.fill(); ctx.fillRect(-u * 1.05, u * 0.22, u * 2.1, u * 0.7); ctx.fillStyle = 'rgba(8,20,34,.7)'; ctx.fillRect(-u * 0.55, -u * 0.5, u * 0.5, u * 0.18); }
  else if (g === 3) { ctx.beginPath(); ctx.moveTo(0, -u * 1.05); ctx.quadraticCurveTo(u * 1.0, -u * 0.1, 0, u * 0.95); ctx.quadraticCurveTo(-u * 1.0, -u * 0.1, 0, -u * 1.05); ctx.fill(); ctx.strokeStyle = 'rgba(8,20,34,.85)'; ctx.lineWidth = Math.max(1, s * 0.1); ctx.beginPath(); ctx.moveTo(0, -u * 0.6); ctx.lineTo(0, u * 0.7); ctx.stroke(); }
  else if (g === 4) { ctx.beginPath(); ctx.moveTo(0, -u * 1.0); ctx.lineTo(u * 0.95, 0); ctx.lineTo(0, u * 1.0); ctx.lineTo(-u * 0.95, 0); ctx.closePath(); ctx.fill(); const tw = 0.5 + 0.5 * Math.sin(tm * 3); ctx.globalAlpha = 0.5 + 0.5 * tw; ctx.fillStyle = '#fff'; ctx.fillRect(-u * 0.12, -u * 0.55, u * 0.24, u * 0.24); }
  ctx.restore();
}
// 자율 부대: 깃발이 달린 칩. st: march/siege/battle/garrison/retreat
// 시대별 병종 아이콘: 기술 수준(0-9)에 따라 부대 칩 안의 표식이 바뀐다
function drawUnitGlyph(ctx, s, era) {
  ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = Math.max(1.1, s * 0.13); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const u = s * 0.42; // 아이콘 기본 크기
  ctx.beginPath();
  if (era <= 0) { // 돌도끼: 몽둥이
    ctx.moveTo(-u * 0.7, u * 0.7); ctx.lineTo(u * 0.35, -u * 0.35); ctx.stroke();
    ctx.beginPath(); ctx.arc(u * 0.5, -u * 0.5, u * 0.34, 0, 7); ctx.fill();
  } else if (era === 1) { // 창: 창대 + 삼각 창날
    ctx.moveTo(0, u * 0.85); ctx.lineTo(0, -u * 0.35); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -u); ctx.lineTo(-u * 0.3, -u * 0.3); ctx.lineTo(u * 0.3, -u * 0.3); ctx.closePath(); ctx.fill();
  } else if (era === 2) { // 검: 검신 + 가로 손잡이
    ctx.moveTo(0, u * 0.8); ctx.lineTo(0, -u * 0.9); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-u * 0.42, u * 0.28); ctx.lineTo(u * 0.42, u * 0.28); ctx.stroke();
  } else if (era === 3) { // 방패: 장방형 스쿠툼 + 중심선
    ctx.roundRect(-u * 0.55, -u * 0.85, u * 1.1, u * 1.7, u * 0.45); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -u * 0.85); ctx.lineTo(0, u * 0.85); ctx.stroke();
  } else if (era === 4) { // 기병: 기수의 투창 + 작은 페넌트
    ctx.moveTo(-u * 0.75, u * 0.75); ctx.lineTo(u * 0.6, -u * 0.6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(u * 0.6, -u * 0.6); ctx.lineTo(u * 0.1, -u * 0.55); ctx.lineTo(u * 0.5, -u * 0.15); ctx.closePath(); ctx.fill();
  } else if (era === 5) { // 총: 총열 + 개머리
    ctx.moveTo(-u * 0.9, 0); ctx.lineTo(u * 0.9, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-u * 0.9, 0); ctx.lineTo(-u * 0.55, u * 0.6); ctx.stroke();
  } else if (era === 6) { // 대포: 포신 + 바퀴
    ctx.moveTo(-u * 0.15, u * 0.35); ctx.lineTo(u * 0.85, -u * 0.55); ctx.stroke();
    ctx.beginPath(); ctx.arc(-u * 0.4, u * 0.45, u * 0.42, 0, 7); ctx.stroke();
  } else if (era === 7) { // 탱크: 차체 + 포신
    ctx.roundRect(-u * 0.8, -u * 0.25, u * 1.35, u * 0.75, u * 0.2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(u * 0.3, -u * 0.05); ctx.lineTo(u * 1.05, -u * 0.05); ctx.stroke();
    ctx.beginPath(); ctx.roundRect(-u * 0.4, -u * 0.6, u * 0.65, u * 0.4, u * 0.15); ctx.fill();
  } else if (era === 8) { // 드론: X 프레임 + 로터 4개
    ctx.moveTo(-u * 0.7, -u * 0.7); ctx.lineTo(u * 0.7, u * 0.7); ctx.moveTo(u * 0.7, -u * 0.7); ctx.lineTo(-u * 0.7, u * 0.7); ctx.stroke();
    for (const [dx, dy] of [[-0.85, -0.85], [0.85, -0.85], [-0.85, 0.85], [0.85, 0.85]]) { ctx.beginPath(); ctx.arc(dx * u, dy * u, u * 0.22, 0, 7); ctx.fill(); }
  } else { // 궤도: 별 + 궤도 고리
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * u, Math.sin(a) * u); }
    ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, 0, u * 1.05, u * 0.42, -0.5, 0, 7); ctx.stroke();
  }
}

// 교전 중인 두 부대 사이: 붉은 점선 연결 + 중간에서 번쩍이는 충돌 불꽃
function drawClash(ctx, x1, y1, x2, y2, s, tm) {
  const x = (x1 + x2) / 2, y = (y1 + y2) / 2, pu = 0.65 + 0.35 * Math.sin(tm * 11);
  ctx.save();
  ctx.strokeStyle = `rgba(255,70,50,${0.55 + 0.3 * pu})`; ctx.lineWidth = Math.max(1.6, s * 0.2); ctx.setLineDash([s * 0.7, s * 0.5]); ctx.lineDashOffset = -tm * s * 3;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.setLineDash([]);
  ctx.translate(x, y);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, s * 1.8); g.addColorStop(0, `rgba(255,240,180,${0.9 * pu})`); g.addColorStop(0.45, `rgba(255,120,40,${0.5 * pu})`); g.addColorStop(1, 'rgba(255,60,20,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, s * 1.8, 0, 7); ctx.fill();
  ctx.strokeStyle = '#fff6d0'; ctx.lineWidth = Math.max(1.4, s * 0.16); ctx.lineCap = 'round';
  ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + tm * 1.3, r0 = s * 0.3, r1 = s * (i % 2 ? 0.75 : 1.15) * (0.8 + 0.2 * pu); ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); } ctx.stroke();
  ctx.restore();
}
function drawArmy(ctx, x, y, s, col, tm, st, era = 0, a = null) {
  ctx.save(); ctx.translate(x, y);
  const bob = st === 'march' || st === 'retreat' ? Math.abs(Math.sin(tm * 7)) * s * 0.12 : 0;
  ctx.translate(0, -bob);
  // 그림자
  ctx.globalAlpha = 0.25; ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.ellipse(0, s * 0.62 + bob, s * 0.7, s * 0.22, 0, 0, 7); ctx.fill();
  ctx.globalAlpha = 1;
  // 몸체 칩 (진한 테두리 + 국가색)
  ctx.fillStyle = 'rgba(18,16,14,0.92)';
  ctx.beginPath(); ctx.roundRect(-s * 0.78, -s * 0.5, s * 1.56, s * 1.05, s * 0.28); ctx.fill();
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.roundRect(-s * 0.62, -s * 0.34, s * 1.24, s * 0.73, s * 0.2); ctx.fill();
  // 시대별 병종 표식
  drawUnitGlyph(ctx, s, era);
  if (a) { // 병력·사기 막대, 경험 별, 포위 진행 호
    const f = Math.max(0, Math.min(1, a.men / Math.max(1, a.men0))), mo = a.mor == null ? 1 : a.mor, bw = s * 1.56, bh = Math.max(2.2, s * 0.2), by = s * 0.62;
    ctx.fillStyle = 'rgba(8,8,8,.88)'; ctx.fillRect(-bw / 2 - 0.8, by - 0.8, bw + 1.6, bh * 2 + 2.4);
    ctx.fillStyle = f > 0.6 ? '#5ad36b' : f > 0.35 ? '#ffd24a' : '#ff5148'; ctx.fillRect(-bw / 2, by, bw * f, bh);
    ctx.fillStyle = mo > 0.55 ? '#6cc7ff' : mo > 0.3 ? '#c9a8ff' : '#ff8fb0'; ctx.fillRect(-bw / 2, by + bh + 0.8, bw * mo, bh * 0.8);
    const stars = Math.min(3, Math.floor((a.xp || 0) * 3.4));
    ctx.fillStyle = '#ffd24a'; ctx.strokeStyle = 'rgba(40,24,0,.9)'; ctx.lineWidth = 0.8;
    for (let i = 0; i < stars; i++) { const sx = -s * 0.62 + i * s * 0.36, sy = -s * 0.74, r = s * 0.17; ctx.beginPath(); for (let k = 0; k < 10; k++) { const ang = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.45 : r; ctx.lineTo(sx + Math.cos(ang) * rr, sy + Math.sin(ang) * rr); } ctx.closePath(); ctx.fill(); ctx.stroke(); }
    if (st === 'siege' && a.sg > 0.35) { // 성벽이 무너져 가는 중: 불꽃과 연기
      for (let i = 0; i < 5; i++) { const ph = (tm * 1.6 + i * 0.41) % 1; ctx.globalAlpha = (1 - ph) * 0.9; ctx.fillStyle = i % 2 ? '#ff7a2f' : '#ffd24a'; ctx.beginPath(); ctx.arc((i - 2) * s * 0.32, -s * 0.5 - ph * s * 1.5, Math.max(1, s * 0.17 * (1 - ph * 0.5)), 0, 7); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
    if (st === 'siege' && a.sg > 0) { ctx.strokeStyle = '#ffe08a'; ctx.lineWidth = Math.max(2, s * 0.2); ctx.beginPath(); ctx.arc(0, 0, s * 1.35, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, a.sg)); ctx.stroke(); }
  }
  // 깃발
  ctx.strokeStyle = '#2b2119'; ctx.lineWidth = Math.max(1, s * 0.1); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(s * 0.5, -s * 0.4); ctx.lineTo(s * 0.5, -s * 1.5); ctx.stroke();
  ctx.fillStyle = col; ctx.fillRect(s * 0.5, -s * 1.5, s * 0.72, s * 0.42);
  ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = Math.max(0.6, s * 0.05); ctx.strokeRect(s * 0.5, -s * 1.5, s * 0.72, s * 0.42);
  // 상태 표시
  if (st === 'battle') { // 교전 불꽃: 칩 둘레로 튀는 불티
    for (let i = 0; i < 7; i++) { const ph = (tm * 2.4 + i * 0.37) % 1, ang = i * 2.4 + tm * 0.5, rr = s * (0.8 + ph * 1.1); ctx.globalAlpha = (1 - ph) * 0.95; ctx.fillStyle = i % 2 ? '#fff3b0' : '#ff9f43'; ctx.beginPath(); ctx.arc(Math.cos(ang) * rr, Math.sin(ang) * rr * 0.8, Math.max(1, s * 0.11 * (1 - ph)), 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
  if (st === 'battle') { // 교전: 붉은 교차 검 플래시
    const pu = 0.6 + 0.4 * Math.sin(tm * 9);
    ctx.globalAlpha = pu; ctx.strokeStyle = '#ff3b30'; ctx.lineWidth = Math.max(1.4, s * 0.16);
    const u = s * 0.62;
    ctx.beginPath();
    ctx.moveTo(-u, -s * 1.7); ctx.lineTo(-u * 0.2, -s * 1.7 - u * 0.8); ctx.moveTo(-u * 0.2, -s * 1.7); ctx.lineTo(-u, -s * 1.7 - u * 0.8);
    ctx.moveTo(-u * 0.72, -s * 1.7 - u * 0.28); ctx.lineTo(-u * 0.5, -s * 1.7 - u * 0.06); ctx.moveTo(-u * 0.5, -s * 1.7 - u * 0.74); ctx.lineTo(-u * 0.72, -s * 1.7 - u * 0.52);
    ctx.stroke(); ctx.globalAlpha = 1;
  } else if (st === 'siege') { // 포위: 주황 점선 링
    ctx.strokeStyle = '#ff9f43'; ctx.lineWidth = Math.max(1.2, s * 0.12);
    ctx.setLineDash([4, 3]); ctx.lineDashOffset = -tm * 14;
    ctx.beginPath(); ctx.arc(0, 0, s * 1.35, 0, 7); ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.restore();
}
function drawShip(ctx, x, y, ang, s, flag, sail, cargo = -1) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  // 물살 자국
  ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = Math.max(1, s * 0.14); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-s * 1.1, -s * 0.22); ctx.lineTo(-s * 2.0, -s * 0.5); ctx.moveTo(-s * 1.1, s * 0.22); ctx.lineTo(-s * 2.0, s * 0.5); ctx.stroke();
  // 선체
  ctx.fillStyle = '#4a3826';
  ctx.beginPath(); ctx.moveTo(-s, -s * 0.28); ctx.lineTo(s * 0.8, -s * 0.28); ctx.lineTo(s, 0); ctx.lineTo(s * 0.8, s * 0.28); ctx.lineTo(-s, s * 0.28); ctx.quadraticCurveTo(-s * 1.25, 0, -s, -s * 0.28); ctx.closePath(); ctx.fill();
  // 돛
  ctx.fillStyle = sail || '#f2ead8';
  ctx.beginPath(); ctx.moveTo(s * 0.05, -s * 0.1); ctx.lineTo(s * 0.05, -s * 1.35); ctx.lineTo(s * 0.85, -s * 0.15); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-s * 0.08, -s * 0.1); ctx.lineTo(-s * 0.08, -s * 1.1); ctx.lineTo(-s * 0.62, -s * 0.14); ctx.closePath(); ctx.fill();
  // 깃발
  if (flag) { ctx.fillStyle = flag; ctx.fillRect(s * 0.05, -s * 1.62, s * 0.55, s * 0.3); }
  // 화물: 갑판 위 자원색 상자
  if (cargo >= 0) { const c = GOODS[cargo].rgb; ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = Math.max(0.6, s * 0.06); for (let i = 0; i < 3; i++) { const bx = -s * 0.7 + i * s * 0.42, by = -s * 0.2 - (i === 1 ? s * 0.22 : 0); ctx.fillRect(bx, by, s * 0.34, s * 0.3); ctx.strokeRect(bx, by, s * 0.34, s * 0.3); } }
  ctx.restore();
}
// 짐짐이 대상: 진행 방향으로 걷는 짐승, 등에 국가색 안장과 자원색 짐
function drawCaravan(ctx, x, y, ang, s, trim, cargo = -1, tm = 0) {
  ctx.save(); ctx.translate(x, y);
  const flip = Math.cos(ang) < 0; // 왼쪽으로 갈 때는 뒤집어 넘어지지 않게
  ctx.rotate(flip ? ang - Math.PI : ang); if (flip) ctx.scale(1, -1);
  const ph = tm * 9; const st = Math.sin(ph) * s * 0.1;
  ctx.translate(0, -Math.abs(Math.cos(ph)) * s * 0.05); // 걸을 때 살짝 통통
  // 다리
  ctx.strokeStyle = '#33261a'; ctx.lineWidth = Math.max(1, s * 0.13); ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-s * 0.5, s * 0.08); ctx.lineTo(-s * 0.5 + st, s * 0.6);
  ctx.moveTo(-s * 0.16, s * 0.1); ctx.lineTo(-s * 0.16 - st, s * 0.6);
  ctx.moveTo(s * 0.2, s * 0.1); ctx.lineTo(s * 0.2 + st, s * 0.6);
  ctx.moveTo(s * 0.5, s * 0.08); ctx.lineTo(s * 0.5 - st, s * 0.6);
  ctx.stroke();
  // 꼬리
  ctx.beginPath(); ctx.moveTo(-s * 0.68, -s * 0.12); ctx.quadraticCurveTo(-s * 1.0, 0, -s * 0.92, s * 0.34); ctx.lineWidth = Math.max(0.8, s * 0.09); ctx.strokeStyle = '#4a3826'; ctx.stroke();
  // 몸통
  ctx.fillStyle = '#7a5a36';
  ctx.beginPath(); ctx.ellipse(0, -s * 0.08, s * 0.72, s * 0.4, 0, 0, 7); ctx.fill();
  // 목·머리·귀
  ctx.strokeStyle = '#7a5a36'; ctx.lineWidth = Math.max(1.2, s * 0.2);
  ctx.beginPath(); ctx.moveTo(s * 0.5, -s * 0.22); ctx.quadraticCurveTo(s * 0.85, -s * 0.5, s * 1.0, -s * 0.72); ctx.stroke();
  ctx.fillStyle = '#7a5a36'; ctx.beginPath(); ctx.arc(s * 1.02, -s * 0.74, s * 0.19, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.moveTo(s * 0.95, -s * 0.88); ctx.lineTo(s * 1.03, -s * 1.04); ctx.lineWidth = Math.max(0.7, s * 0.07); ctx.stroke();
  // 안장(국가색)
  ctx.fillStyle = trim || '#8a2f2f'; ctx.fillRect(-s * 0.4, -s * 0.5, s * 0.8, s * 0.28);
  // 짐: 자원색 상자
  if (cargo >= 0) { const c = GOODS[cargo].rgb; ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = Math.max(0.6, s * 0.06); for (let i = 0; i < 2; i++) { const bx = -s * 0.32 + i * s * 0.38, by = -s * 0.86; ctx.fillRect(bx, by, s * 0.3, s * 0.36); ctx.strokeRect(bx, by, s * 0.3, s * 0.36); } }
  ctx.restore();
}
// 권능·재해 발동 효과: 종류별로 구분되는 모양으로 그린다.
const FX_STYLE = {
  bless: { c: '#7fd4ff' }, drought: { c: '#e8b04b' }, plague: { c: '#9be26a' },
  quake: { c: '#241c12', dust: '#d8cdb4' }, volcano: { c: '#ff7a3c' }, meteor: { c: '#ffd27a' },
  flood: { c: '#6fb7ff' }, tribe: { c: '#b8e986' }, prophet: { c: '#ffd76a' },
  hero: { c: '#ffd24a' }, revolt: { c: '#ff6a3c' }, peace: { c: '#bfe3ff' },
  war: { c: '#ff5050' }, warshout: { c: '#ff3b30' }, goldenage: { c: '#ffcf4d' }, migrate: { c: '#a8d8ff' }, warshield: { c: '#7ab8ff' }, warheal: { c: '#8ff0a4' }, mobilize: { c: '#ff9f43' }, settle: { c: '#7fe0c3' },
};
function drawFx(ctx, e, x, y, z, time) {
  const k = e.t / 2.4, a = 1 - k;
  const u = Math.min(2, 0.6 + z * 0.3);
  const st = FX_STYLE[e.kind] || { c: e.color || '#fff' };
  const rnd = (n) => { const v = Math.sin(e.x * 12.9898 + e.y * 78.233 + n * 37.719) * 43758.5453; return v - Math.floor(v); };
  const ring = (r, w, col) => { ctx.globalAlpha = a; ctx.strokeStyle = col || st.c; ctx.lineWidth = Math.max(1, w); ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke(); };
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  switch (e.kind) {
    case 'bless': { // 비줄기가 내려 땅을 적심
      ring((6 + k * 34) * u, 2.5 * a + 0.5);
      ctx.strokeStyle = st.c; ctx.lineWidth = Math.max(1, 1.6 * u);
      for (let n = 0; n < 16; n++) {
        const sx = x + (rnd(n) - 0.5) * 64 * u;
        const sy = y - 44 * u + ((k * 1.6 + rnd(n + 31)) % 1) * 60 * u;
        ctx.globalAlpha = a * (0.5 + rnd(n + 13) * 0.5);
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx, sy + 7 * u); ctx.stroke();
      }
      break;
    }
    case 'drought': { // 넓게 퍼지는 누런 아지랑이
      ctx.globalAlpha = a * 0.5; ring((14 + k * 95) * u, 3); ring((6 + k * 55) * u, 2);
      ctx.fillStyle = st.c;
      for (let n = 0; n < 10; n++) {
        const ang = rnd(n) * 6.283, rr = (20 + rnd(n + 5) * 55 + k * 30) * u;
        ctx.globalAlpha = a * 0.35;
        ctx.beginPath(); ctx.arc(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr * 0.6, (2 + rnd(n + 9) * 2.5) * u, 0, 7); ctx.fill();
      }
      break;
    }
    case 'plague': { // 피어오르는 녹색 입자
      ring((5 + k * 26) * u, 2 * a + 0.5);
      ctx.fillStyle = st.c;
      for (let n = 0; n < 12; n++) {
        const bx = x + (rnd(n) - 0.5) * 46 * u;
        const by = y + 16 * u - ((k * 1.3 + rnd(n + 7)) % 1) * 52 * u;
        ctx.globalAlpha = a * (0.4 + rnd(n + 3) * 0.5);
        ctx.beginPath(); ctx.arc(bx, by, (1.6 + rnd(n + 11) * 2.2) * u, 0, 7); ctx.fill();
      }
      break;
    }
    case 'quake': { // 지면 균열 + 먼지 파동
      const g = Math.min(1, k * 2.2);
      for (let n = 0; n < 6; n++) {
        let cx = x, cy = y, ang = rnd(n) * 6.283;
        const pts = [[cx, cy]];
        const segs = 3 + (n % 2);
        for (let sg = 0; sg < segs; sg++) {
          ang += (rnd(n * 7 + sg) - 0.5) * 1.15;
          const L = (13 + rnd(n + sg * 3) * 13) * u * (0.4 + g * 0.6);
          cx += Math.cos(ang) * L; cy += Math.sin(ang) * L; pts.push([cx, cy]);
        }
        ctx.globalAlpha = a * 0.4; ctx.strokeStyle = st.dust; ctx.lineWidth = Math.max(3, 6 * u);
        ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (const q of pts) ctx.lineTo(q[0], q[1]); ctx.stroke();
        ctx.globalAlpha = Math.min(1, a * 1.5); ctx.strokeStyle = st.c; ctx.lineWidth = Math.max(1.8, 3.2 * u);
        ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (const q of pts) ctx.lineTo(q[0], q[1]); ctx.stroke();
      }
      ctx.globalAlpha = a * 0.6; ctx.strokeStyle = st.dust; ctx.lineWidth = Math.max(1, 2 * u * a);
      ctx.beginPath(); ctx.arc(x, y, (5 + Math.min(1, k * 2.5) * 34) * u, 0, 7); ctx.stroke();
      break;
    }
    case 'volcano': { // 분출 기둥 + 불꽃 입자
      const hgt = 70 * u * (0.5 + k * 0.5);
      const gr = ctx.createLinearGradient(0, y - hgt, 0, y);
      gr.addColorStop(0, 'rgba(255,180,80,0)'); gr.addColorStop(1, 'rgba(255,110,50,' + (0.85 * a) + ')');
      ctx.globalAlpha = 1; ctx.fillStyle = gr;
      ctx.beginPath(); ctx.moveTo(x - 11 * u * (1 - k * 0.5), y); ctx.lineTo(x - 2 * u, y - hgt); ctx.lineTo(x + 2 * u, y - hgt); ctx.lineTo(x + 11 * u * (1 - k * 0.5), y); ctx.closePath(); ctx.fill();
      ctx.fillStyle = st.c;
      for (let n = 0; n < 10; n++) {
        const ex = x + (rnd(n) - 0.5) * 30 * u;
        const ey = y - ((k * 1.5 + rnd(n + 4)) % 1) * 66 * u;
        ctx.globalAlpha = a * 0.9;
        ctx.beginPath(); ctx.arc(ex, ey, (1.4 + rnd(n + 8) * 1.8) * u, 0, 7); ctx.fill();
      }
      ring((8 + k * 40) * u, 2.5 * a + 0.5);
      break;
    }
    case 'meteor': { // 낙하 궤적 → 섬광 + 큰 충격파
      if (k < 0.28) {
        const t2 = k / 0.28;
        ctx.save(); ctx.shadowColor = '#ffe9a8'; ctx.shadowBlur = 12 * u;
        ctx.globalAlpha = 1; ctx.strokeStyle = '#fff3c4'; ctx.lineWidth = Math.max(1.5, 3 * u);
        ctx.beginPath(); ctx.moveTo(x - 60 * u * (1 - t2), y - 74 * u * (1 - t2)); ctx.lineTo(x, y); ctx.stroke();
        ctx.restore();
        ctx.globalAlpha = Math.min(1, t2 * 2) * 0.9; ctx.fillStyle = st.c;
        ctx.beginPath(); ctx.arc(x, y, (3 + t2 * 8) * u, 0, 7); ctx.fill();
      } else {
        const t2 = (k - 0.28) / 0.72;
        ctx.globalAlpha = (1 - t2) * 0.85; ctx.fillStyle = st.c;
        ctx.beginPath(); ctx.arc(x, y, (10 + t2 * 26) * u, 0, 7); ctx.fill();
        ring((12 + t2 * 95) * u, 3.5 * (1 - t2) + 0.5); ring((6 + t2 * 55) * u, 2);
      }
      break;
    }
    case 'flood': { // 물결선
      ring((6 + k * 45) * u, 2.5 * a + 0.5);
      ctx.strokeStyle = st.c; ctx.lineWidth = Math.max(1, 1.5 * u);
      for (let n = 0; n < 3; n++) {
        const wy = y - 10 * u + n * 10 * u + Math.sin(time * 6 + n) * 2 * u;
        ctx.globalAlpha = a * 0.7;
        ctx.beginPath();
        for (let sg = 0; sg <= 8; sg++) { const wx = x - 28 * u + sg * 7 * u; const yy = wy + Math.sin(sg * 1.3 + time * 8 + n) * 2.5 * u; sg ? ctx.lineTo(wx, yy) : ctx.moveTo(wx, yy); }
        ctx.stroke();
      }
      break;
    }
    case 'tribe': { // 솟아오르는 오두막 + 불꽃빛
      const s2 = Math.min(1, k * 2.2);
      ctx.globalAlpha = Math.min(1, a * 1.6); ctx.fillStyle = st.c;
      ctx.beginPath(); ctx.moveTo(x, y - 14 * u * s2); ctx.lineTo(x - 9 * u * s2, y); ctx.lineTo(x + 9 * u * s2, y); ctx.closePath(); ctx.fill();
      for (let n = 0; n < 8; n++) {
        const ang = rnd(n) * 6.283, rr = (6 + ((k + rnd(n + 2)) % 1) * 30) * u;
        ctx.globalAlpha = a * 0.85;
        ctx.beginPath(); ctx.arc(x + Math.cos(ang) * rr, y - Math.abs(Math.sin(ang)) * rr, 1.8 * u, 0, 7); ctx.fill();
      }
      ring((5 + k * 30) * u, 2);
      break;
    }
    case 'prophet': { // 위로 오르는 황금 광주
      const ph = 72 * u * (0.4 + k * 0.6);
      const gr2 = ctx.createLinearGradient(0, y - ph, 0, y);
      gr2.addColorStop(0, 'rgba(255,215,106,0)'); gr2.addColorStop(1, 'rgba(255,215,106,' + (0.8 * a) + ')');
      ctx.globalAlpha = 1; ctx.fillStyle = gr2; ctx.fillRect(x - 7 * u, y - ph, 14 * u, ph);
      ctx.fillStyle = st.c;
      for (let n = 0; n < 8; n++) {
        const mx = x + (rnd(n) - 0.5) * 22 * u;
        const my = y - ((k * 1.2 + rnd(n + 6)) % 1) * 60 * u;
        ctx.globalAlpha = a * 0.9; ctx.beginPath(); ctx.arc(mx, my, 1.6 * u, 0, 7); ctx.fill();
      }
      break;
    }
    case 'hero': { // 금색 별 폭발
      const ss = (0.4 + k * 1.1) * u * 18;
      ctx.globalAlpha = Math.min(1, a * 1.5); ctx.fillStyle = st.c;
      ctx.save(); ctx.translate(x, y - 6 * u); ctx.rotate(Math.sin(time * 2) * 0.08);
      ctx.beginPath();
      for (let d = 0; d < 4; d++) {
        const a0 = d * Math.PI / 2;
        ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a0 - 0.24) * ss * 0.36, Math.sin(a0 - 0.24) * ss * 0.36); ctx.lineTo(Math.cos(a0) * ss, Math.sin(a0) * ss); ctx.lineTo(Math.cos(a0 + 0.24) * ss * 0.36, Math.sin(a0 + 0.24) * ss * 0.36); ctx.closePath();
      }
      ctx.fill(); ctx.restore();
      ring((6 + k * 34) * u, 2);
      break;
    }
    case 'revolt': { // 타오르는 불꽃 기둥
      ctx.fillStyle = st.c;
      for (let n = 0; n < 3; n++) {
        const fx = x + (n - 1) * 9 * u;
        const fl = 0.75 + 0.25 * Math.sin(time * 18 + n * 2.1);
        const hh = (14 + n * 4) * u * fl * (0.5 + k * 0.7);
        ctx.globalAlpha = a * (0.85 - n * 0.15);
        ctx.beginPath();
        ctx.moveTo(fx - 5 * u, y); ctx.quadraticCurveTo(fx - 5 * u, y - hh * 0.6, fx, y - hh); ctx.quadraticCurveTo(fx + 5 * u, y - hh * 0.6, fx + 5 * u, y); ctx.closePath(); ctx.fill();
      }
      ring((5 + k * 28) * u, 2);
      break;
    }
    case 'peace': { // 부드럽게 퍼지는 하늘색 파동 3겹
      for (let n = 0; n < 3; n++) {
        const ph2 = (k * 1.25 + n / 3) % 1;
        ctx.globalAlpha = (1 - ph2) * 0.65;
        ring((8 + ph2 * 46) * u, 3.5 * (1 - ph2) + 0.8);
      }
      break;
    }
    case 'warshout': { // 전쟁의 불씨: 붉은 교차 검 플래시
      const sw = (10 + k * 16) * u;
      ctx.save(); ctx.shadowColor = st.c; ctx.shadowBlur = 8 * u;
      ctx.globalAlpha = a; ctx.strokeStyle = st.c; ctx.lineWidth = Math.max(2, 3.2 * u);
      ctx.beginPath(); ctx.moveTo(x - sw, y - sw); ctx.lineTo(x + sw, y + sw); ctx.moveTo(x + sw, y - sw); ctx.lineTo(x - sw, y + sw); ctx.stroke();
      ctx.restore();
      ring((6 + k * 30) * u, 2);
      break;
    }
    case 'goldenage': { // 찬란한 태양 광륜: 퍼지는 광선 + 솟는 불똥
      ring((8 + k * 40) * u, 3 * a + 0.5);
      ring((4 + k * 22) * u, 1.5 * a + 0.3, '#fff2c0');
      ctx.strokeStyle = st.c; ctx.lineWidth = Math.max(1, 1.8 * u);
      for (let n = 0; n < 12; n++) {
        const ang = (n / 12) * Math.PI * 2 + k * 0.6;
        const r0 = (10 + k * 18) * u, r1 = (18 + k * 44) * u;
        ctx.globalAlpha = a * 0.9;
        ctx.beginPath(); ctx.moveTo(x + Math.cos(ang) * r0, y + Math.sin(ang) * r0); ctx.lineTo(x + Math.cos(ang) * r1, y + Math.sin(ang) * r1); ctx.stroke();
      }
      ctx.fillStyle = '#fff2c0';
      for (let n = 0; n < 10; n++) {
        const ang = rnd(n + 5) * Math.PI * 2, rr = rnd(n + 17) * 26 * u;
        const fy = y - ((k * 1.3 + rnd(n + 40)) % 1) * 40 * u;
        ctx.globalAlpha = a * 0.8;
        ctx.beginPath(); ctx.arc(x + Math.cos(ang) * rr, fy, 1.6 * u, 0, 7); ctx.fill();
      }
      break; }
    case 'migrate': { // 바깥으로 퍼져 나가는 이주 행렬
      ring((5 + k * 20) * u, 1.5 * a + 0.3);
      ctx.strokeStyle = st.c; ctx.lineWidth = Math.max(1, 1.6 * u); ctx.fillStyle = st.c;
      for (let n = 0; n < 8; n++) {
        const ang = (n / 8) * Math.PI * 2 + rnd(n) * 0.5;
        const r0 = (6 + k * 30 + rnd(n + 9) * 8) * u, r1 = r0 + 9 * u;
        ctx.globalAlpha = a * 0.9;
        ctx.beginPath(); ctx.moveTo(x + Math.cos(ang) * r0, y + Math.sin(ang) * r0); ctx.lineTo(x + Math.cos(ang) * r1, y + Math.sin(ang) * r1); ctx.stroke();
        ctx.beginPath(); ctx.arc(x + Math.cos(ang) * r1, y + Math.sin(ang) * r1, 1.8 * u, 0, 7); ctx.fill();
      }
      break; }
    case 'warshield': { // 하늘에서 내려오는 반투명 방패 돔
      ring((6 + k * 26) * u, 2 * a + 0.4);
      ctx.strokeStyle = st.c; ctx.lineWidth = Math.max(1.2, 2.4 * u * a + 0.4);
      const rr = (16 + k * 10) * u;
      ctx.globalAlpha = a * 0.9;
      ctx.beginPath(); ctx.arc(x, y + rr * 0.35, rr, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
      ctx.globalAlpha = a * 0.5;
      ctx.beginPath(); ctx.arc(x, y + rr * 0.35, rr * 0.7, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
      ctx.fillStyle = '#dff0ff';
      for (let n = 0; n < 5; n++) {
        const ang = Math.PI * (1.2 + n * 0.15), gx = x + Math.cos(ang) * rr, gy = y + rr * 0.35 + Math.sin(ang) * rr;
        ctx.globalAlpha = a * (0.4 + 0.6 * rnd(n + 3));
        ctx.beginPath(); ctx.arc(gx, gy, 1.4 * u, 0, 7); ctx.fill();
      }
      break; }
    case 'warheal': { // 피어오르는 치유의 십자
      ring((5 + k * 22) * u, 1.5 * a + 0.3);
      ctx.strokeStyle = st.c; ctx.lineWidth = Math.max(1, 1.8 * u);
      for (let n = 0; n < 6; n++) {
        const cx = x + (rnd(n) - 0.5) * 40 * u;
        const cy = y + 8 * u - ((k * 1.2 + rnd(n + 21)) % 1) * 46 * u;
        const sz = (2.2 + rnd(n + 9) * 1.6) * u;
        ctx.globalAlpha = a * 0.9;
        ctx.beginPath(); ctx.moveTo(cx - sz, cy); ctx.lineTo(cx + sz, cy); ctx.moveTo(cx, cy - sz); ctx.lineTo(cx, cy + sz); ctx.stroke();
      }
      break; }
    case 'mobilize': { // 솟아오르는 전진 셰브론
      ring((5 + k * 24) * u, 2 * a + 0.4);
      ctx.strokeStyle = st.c; ctx.lineWidth = Math.max(1.2, 2 * u);
      for (let n = 0; n < 4; n++) {
        const cy = y + 6 * u - ((k * 1.4 + n * 0.25) % 1) * 44 * u;
        const wdt = (7 - n) * u;
        ctx.globalAlpha = a * (0.55 + n * 0.12);
        ctx.beginPath(); ctx.moveTo(x - wdt, cy + 3 * u); ctx.lineTo(x, cy - 3 * u); ctx.lineTo(x + wdt, cy + 3 * u); ctx.stroke();
      }
      break; }
    case 'trade': { // 하역: 자원색 상자가 뭍으로 오르고 금화가 튄다
      ring((4 + k * 24) * u, 2.2 * a + 0.5, e.color);
      for (let n = 0; n < 8; n++) {
        const sx = x + (rnd(n) - 0.5) * 30 * u, sy = y - ((k * 1.3 + rnd(n + 9)) % 1) * 34 * u;
        ctx.globalAlpha = a * (0.55 + rnd(n + 3) * 0.45); ctx.fillStyle = e.color || st.c; const q = (2 + rnd(n + 14) * 2) * u; ctx.fillRect(sx - q / 2, sy - q / 2, q, q);
      }
      for (let n = 0; n < 4; n++) { const ang = rnd(n + 40) * 6.283, rr = (6 + k * 20) * u; ctx.globalAlpha = a; ctx.fillStyle = '#ffd84a'; ctx.beginPath(); ctx.arc(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr * 0.7 - k * 8 * u, 1.6 * u, 0, 7); ctx.fill(); }
      break;
    }
    case 'settle': { // 정착: 파도를 밀고 올라오는 청록 불빛 + 링
      ring((5 + k * 30) * u, 2.5 * a + 0.5); ring((2 + k * 16) * u, 1.5);
      ctx.fillStyle = st.c;
      for (let n = 0; n < 10; n++) {
        const sx = x + (rnd(n) - 0.5) * 34 * u;
        const sy = y + 10 * u - ((k * 1.4 + rnd(n + 17)) % 1) * 38 * u;
        ctx.globalAlpha = a * (0.5 + rnd(n + 5) * 0.5);
        ctx.beginPath(); ctx.arc(sx, sy, (1.4 + rnd(n + 23) * 1.8) * u, 0, 7); ctx.fill();
      }
      break;
    }
    default: { // 기존 공통 이중 링 (전쟁 점령 등)
      ring(6 + k * 46 * u, 3 * a + 1, e.color);
      ring(3 + k * 20, 2 * a + 0.5, e.color);
    }
  }
  ctx.globalAlpha = 1;
}
function ramp(t, stops, a) {
  const n = stops.length - 1; const f = Math.min(n - 1e-6, Math.max(0, t * n)); const i = Math.floor(f), u = f - i; const A = stops[i], B = stops[i + 1];
  const r = (A[0] + (B[0] - A[0]) * u) | 0, g = (A[1] + (B[1] - A[1]) * u) | 0, b = (A[2] + (B[2] - A[2]) * u) | 0;
  return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
}
