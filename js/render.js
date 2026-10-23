// 렌더러: 지형 사전 렌더(2배 해상도) + 정치/문화 등 오버레이 + 라벨/도시/효과
import { W, H, BIOMES } from './world.js';
import { planLabels, nationBudget, cityBudget } from './labels.js';
import { visibleCaps, capAlpha } from './warwatch.js';
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
    this.mode = 'political'; this.dirty = true; this.sel = -1; this.hover = -1; this.trackId = -1; this.effects = []; this.time = 0; this.capAge = 3;
    this.provColor = new Uint32Array(map.provinces.length); this.ownerKey = new Int32Array(map.provinces.length).fill(-1);
    this.warPts = [];
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
      else if (mode === 'unrest') { if (ow >= 0) { c = ramp(Math.min(1, S.P.unrest[p]), [[50, 130, 70], [230, 200, 70], [220, 50, 50]], 190); } }
      col[p] = c;
    }
    this.labels = this.computeLabels(S);
  }
  computeLabels(S) {
    const out = []; const map = this.map;
    const mode = this.mode;
    if (mode === 'political' || mode === 'terrain' || mode === 'pop' || mode === 'tech' || mode === 'unrest') {
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
  w2s(x, y) { const c = this.cam; return [(x - c.x) * c.z + this.cssW / 2, (y - c.y) * c.z + this.cssH / 2]; }
  drawOverlayVec(ctx, S) {
    const c = this.cam, z = c.z; const map = this.map;
    // 교역로
    if (this.showTrade && S.routes) {
      ctx.lineWidth = Math.max(1, z * 0.35); ctx.setLineDash([z * 1.2, z * 1.6]); ctx.lineDashOffset = -this.time * 12;
      ctx.strokeStyle = 'rgba(255,225,140,0.55)';
      for (const r of S.routes) {
        const a = map.provinces[r[0]], b = map.provinces[r[1]]; const [x1, y1] = this.w2s(a.ax, a.ay), [x2, y2] = this.w2s(b.ax, b.ay);
        if (Math.abs(x1 - x2) > this.cssW * 1.2) continue;
        ctx.beginPath(); ctx.moveTo(x1, y1); const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 - Math.hypot(x2 - x1, y2 - y1) * 0.12; ctx.quadraticCurveTo(mx, my, x2, y2); ctx.stroke();
      }
      ctx.setLineDash([]);
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
    for (let p = 0; p < map.provinces.length; p++) {
      const lv = S.P.city[p]; if (lv < cityMin) continue; const o = map.provinces[p];
      const [x, y] = this.w2s(o.ax, o.ay); if (x < -20 || y < -20 || x > this.cssW + 20 || y > this.cssH + 20) continue;
      const cap = S.P.owner[p] >= 0 && S.nations[S.P.owner[p]].cap === p; const r = (1.4 + lv * 0.9 + (cap ? 1.4 : 0)) * Math.min(2.2, 0.7 + z * 0.22);
      ctx.fillStyle = '#1b1612'; ctx.beginPath(); ctx.arc(x, y, r + 1.2, 0, 7); ctx.fill();
      ctx.fillStyle = cap ? '#ffd24a' : '#fff6e0'; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
      if (this.showLabels !== false && S.cityName[p] && ((cap && lv >= 2 && z > 2.6) || z > 5)) {
        const fz = cap ? Math.min(15, 10 + z * 0.55) : Math.min(14, 9 + z * 0.5);
        ctx.font = `600 ${fz}px "Noto Sans KR", system-ui, sans-serif`;
        cityCands.push({ t: S.cityName[p], x, y: y + r + 9, size: fz, w: ctx.measureText(S.cityName[p]).width, big: cap ? 1000 + lv : lv, gold: cap });
      }
    }
    for (const q of planLabels(cityCands, cityBudget(rel))) {
      ctx.font = `600 ${q.size}px "Noto Sans KR", system-ui, sans-serif`;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.fillStyle = q.gold ? '#ffe9a8' : '#fff';
      ctx.strokeText(q.t, q.x, q.y); ctx.fillText(q.t, q.x, q.y);
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
        cands.push({ t: l.t, x, y, size, w: ctx.measureText(l.t).width, big: l.big, force: l.n === trkId });
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
      const [x, y] = this.w2s(e.x, e.y); const k = e.t / 2.4;
      ctx.globalAlpha = 1 - k; ctx.strokeStyle = e.color; ctx.lineWidth = 3 * (1 - k) + 1; ctx.beginPath(); ctx.arc(x, y, 6 + k * 46 * Math.min(2, 0.6 + z * 0.3), 0, 7); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, 3 + k * 20, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
    }
    // 비네트
    const g = ctx.createRadialGradient(this.cssW / 2, this.cssH / 2, Math.min(this.cssW, this.cssH) * 0.45, this.cssW / 2, this.cssH / 2, Math.max(this.cssW, this.cssH) * 0.8);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,8,20,.42)'); ctx.fillStyle = g; ctx.fillRect(0, 0, this.cssW, this.cssH);
  }
}
function ramp(t, stops, a) {
  const n = stops.length - 1; const f = Math.min(n - 1e-6, Math.max(0, t * n)); const i = Math.floor(f), u = f - i; const A = stops[i], B = stops[i + 1];
  const r = (A[0] + (B[0] - A[0]) * u) | 0, g = (A[1] + (B[1] - A[1]) * u) | 0, b = (A[2] + (B[2] - A[2]) * u) | 0;
  return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
}
