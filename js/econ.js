// 지역 자원·교역 경제. DOM/Canvas에 의존하지 않는다.
// 지방마다 자원 매장량이 정해져 있고(지도에서 결정, 저장 불필요), 국가는 생산·소비·비축·국고를 갖는다.
// 남는 물자는 무역선이 실제로 실어 나르고, 도착한 화물이 비축으로 들어가 성장·기술·군사·안정도에 반영된다.
import { valueNoise } from './rng.js?v=100';
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;

export const GOODS = [
  { id: 'grain', name: '곡물', rgb: [236, 200, 88], price: 1.0 },
  { id: 'timber', name: '목재', rgb: [86, 176, 98], price: 1.4 },
  { id: 'iron', name: '철', rgb: [168, 180, 202], price: 2.4 },
  { id: 'spice', name: '향신료', rgb: [232, 96, 60], price: 4.2 },
  { id: 'gold', name: '금', rgb: [255, 216, 64], price: 6.0 },
];
export const NG = GOODS.length;
export const goodCss = (g, a = 1) => `rgba(${GOODS[g].rgb[0]},${GOODS[g].rgb[1]},${GOODS[g].rgb[2]},${a})`;

// ---------- 지도 자원 (지방별 매장량 0..1.6, 곡물은 지력 그대로) ----------
export function resOf(map) {
  if (map._res) return map._res;
  const N = map.provinces.length; const R = new Float32Array(N * NG); const seed = map.seed | 0;
  for (let p = 0; p < N; p++) {
    const o = map.provinces[p]; const b = o.biome;
    R[p * NG] = o.fert;
    const nt = valueNoise(o.x / 26, o.y / 26, seed + 31);
    const tb = b === 4 ? 1 : b === 3 ? 0.85 : b === 8 ? 0.9 : (b === 5 || b === 7) ? 0.25 : b === 11 ? 0.15 : 0;
    R[p * NG + 1] = tb > 0 ? clamp(tb * (0.35 + nt * 1.1) - 0.1, 0, 1.5) : 0;
    R[p * NG + 2] = clamp((o.metal - 0.45) * 2.6, 0, 1.6);
    const ns = valueNoise(o.x / 22, o.y / 22, seed + 11);
    const tropic = o.t > 18 && o.m > 0.38 ? 1 : o.t > 14 && o.m > 0.45 ? 0.45 : 0;
    R[p * NG + 3] = tropic > 0 ? clamp((ns - 0.32) * 2.4 * tropic, 0, 1.5) : 0;
    const ng = valueNoise(o.x / 15, o.y / 15, seed + 5);
    R[p * NG + 4] = clamp((ng - 0.66) * 3.8 * (o.e > 0.22 || b === 6 ? 1 : 0.4), 0, 1.5);
  }
  map._res = R; return R;
}
// 한 지방의 주요 자원 (곡물 제외). 없으면 -1
export function mainRes(map, p) {
  const R = resOf(map); let g = -1, v = 0.22;
  for (let k = 1; k < NG; k++) { const r = R[p * NG + k] * (k === 4 ? 1.35 : k === 3 ? 1.15 : 1); if (r > v) { v = r; g = k; } }
  return g;
}

// ---------- 국가 경제 상태 ----------
export function newEco() {
  return { prod: new Array(NG).fill(0), dem: new Array(NG).fill(0), stock: new Array(NG).fill(0), sat: new Array(NG).fill(1), base: new Array(NG).fill(1),
    imp: new Array(NG).fill(0), exp: new Array(NG).fill(0), wealth: 0, inc: 0, fm: 1, tm: 1, mm: 1, lastLog: -999, fam: 0, partners: {}, age: 0 };
}
export function ensureEco(S) {
  if (!S.trade) S.trade = { deliv: new Array(NG).fill(0), value: 0, voyages: 0, seen: {}, log: 0 };
  const T = S.trade; if (!T.load) { T.load = new Array(NG).fill(0); T.unl = new Array(NG).fill(0); T.lost = new Array(NG).fill(0); T.paid = 0; T.recv = 0; }
  if (T.voyL === undefined) T.voyL = 0;
  for (const n of S.nations) if (!n.eco) n.eco = newEco();
  for (const sh of S.ships || []) if (sh.cargo === undefined) sh.cargo = null;
  for (const cv of S.carr || []) if (cv.cargo === undefined) cv.cargo = null;
}
const TECHF = (t) => 1 + 0.09 * Math.min(t, 6);

// 지방 합산 → 국가별 생산량 (한 해)
function produce(S, map) {
  const P = S.P, N = map.provinces.length, R = resOf(map);
  for (const n of S.nations) if (n.alive && n.eco) { n.eco.prod.fill(0); n.eco._pop = 0; n.eco._sq = 0; }
  for (let p = 0; p < N; p++) {
    const ow = P.owner[p]; if (ow < 0) continue; const n = S.nations[ow]; if (!n.alive) continue;
    const pop = P.pop[p]; if (pop < 8) continue; const e = n.eco, t = P.tech[p];
    e._sq += Math.sqrt(pop) * 0.05 * (0.55 + 0.45 * Math.min(1, t / 3));
    e.prod[0] += pop * 0.00115 * (0.22 + 0.95 * R[p * NG]) * TECHF(t);
    const sq = Math.sqrt(pop) * 0.05 * (0.55 + 0.45 * Math.min(1, t / 3));
    for (let k = 1; k < NG; k++) { const r = R[p * NG + k]; if (r > 0.05 && (k < 3 || t >= (k === 3 ? 1.2 : 1.6) - 0.01 || k === 2)) e.prod[k] += r * sq * (k === 2 && t < 1.0 ? 0.4 : 1); }
  }
}
function demand(n) {
  const e = n.eco, t = n.tech, sq = e._sq || 0, up = 1 + 0.08 * Math.max(0, t - 1);
  e.dem[0] = n.pop * 0.00115 * 0.60 * TECHF(t);
  e.dem[1] = sq * 0.22;
  e.dem[2] = t < 0.8 ? 0 : sq * 0.08 * up;
  e.dem[3] = t < 1.5 ? 0 : sq * 0.055 * up;
  e.dem[4] = t < 2.0 ? 0 : sq * 0.06 * up;
}

// ---------- 매년 갱신 ----------
export function stepEcon(S, map, addLog) {
  ensureEco(S);
  const alive = S.nations.filter((n) => n.alive);
  produce(S, map);
  for (const n of alive) {
    const e = n.eco; demand(n);
    if (!(e.age > 0)) { // 처음 경제를 얻는 국가(새 판·옛 저장 이어하기): 평년 비축과 국고로 시작해 갑작스런 기근을 막는다
      for (let g = 0; g < NG; g++) e.stock[g] = Math.max(e.stock[g], e.dem[g] * 2);
      e.wealth = Math.max(e.wealth, Math.max(0.01, n.gdp) * 8); e.age = 0;
    }
    e.age++;
    const ramp = Math.min(1, e.age / 24);
    let sumLux = 0, cl = 0;
    for (let g = 0; g < NG; g++) {
      const have = e.stock[g] + e.prod[g]; const d = e.dem[g];
      const used = Math.min(d, have);
      e.sat[g] = d > 1e-6 ? clamp(used / d, 0, 1) : 1;
      e.base[g] = d > 1e-6 ? clamp(e.prod[g] / d, 0, 1) : 1; // 교역이 없을 때의 자급률
      let st = have - used; st *= g === 0 ? 0.95 : g === 1 ? 0.985 : 0.995;
      e.stock[g] = Math.min(st, Math.max(d, 1) * 7);
      e.imp[g] *= 0.98; e.exp[g] *= 0.98;
    }
    // 효과는 보수적으로: 곡물 x0.90~1.02, 기술 x0.94~1.05, 군사 x0.86~1.03. 새로 시작한 국가는 24년에 걸쳐 서서히 적용
    const fm0 = 0.90 + 0.12 * e.sat[0], tm0 = 0.94 + 0.03 * e.sat[1] + 0.04 * e.sat[2] + 0.04 * (e.sat[3] + e.sat[4]) / 2, mm0 = 0.86 + 0.10 * e.sat[2] + 0.05 * e.sat[1] + 0.02 * e.sat[4];
    e.fm = 1 + (fm0 - 1) * ramp; e.tm = 1 + (tm0 - 1) * ramp; e.mm = 1 + (mm0 - 1) * ramp;
    // 국고: 세수 + 수출 대금 - 수입 대금(교역 시점에 반영) - 상비 지출
    const gdp = Math.max(0.01, n.gdp);
    e.inc = gdp * 0.1; e.wealth += e.inc - gdp * 0.085 * (1 + 0.5 * (1 - e.sat[0]) * 0);
    e.wealth = clamp(e.wealth, 0, gdp * 70);
    // 기근
    if (e.sat[0] < 0.6 && e.age > 10) {
      e.fam += (1 - e.sat[0]);
      S.foodShort = (S.foodShort || 0) + n.pop * (1 - e.sat[0]); // 식량 부족 압력 지표(인구·년, 사망자 아님)
      if (S.year - e.lastLog > 40 && n.pc >= 2 && e.sat[0] < 0.5 && S.rng.chance(0.12)) { e.lastLog = S.year; addLog(S, `${n.name}에 곡물이 모자라 기근이 번지고 있습니다. (자급률 ${Math.round(e.sat[0] * 100)}%)`, 2, n.cap, n.id); }
    } else e.fam = Math.max(0, e.fam - 0.5);
  }
}

// 국가 이름 가난/부유 가중 안정도 보정 (sim.stepNations에서 사용)
export function stabBonus(n) { const e = n.eco; if (!e) return 0; const g = Math.max(0.05, n.gdp); return 0.05 * clamp(e.wealth / (g * 12) - 0.5, -1, 1) * Math.min(1, (e.age || 0) / 24) + 0.02 * ((e.sat[3] + e.sat[4]) / 2 - 0.5) * (n.tech >= 2 ? 1 : 0); }

// ---------- 무역선 화물 ----------
function surplus(n, g) { const e = n.eco; return Math.max(0, e.stock[g] - e.dem[g] * 1.5); }
function needOf(n, g, inb) { const e = n.eco; return Math.max(0, 10 * Math.max(0, e.dem[g] - e.prod[g]) - e.stock[g] - (inb ? inb[n.id * NG + g] || 0 : 0)); }
export function inbound(S) {
  const m = {};
  for (const sh of S.ships || []) if (sh.cargo) { const k = sh.cargo.to * NG + sh.cargo.g; m[k] = (m[k] || 0) + sh.cargo.amt; }
  for (const cv of S.carr || []) if (cv.cargo) { const k = cv.cargo.to * NG + cv.cargo.g; m[k] = (m[k] || 0) + cv.cargo.amt; }
  return m;
}
export function shipCapacity(n) { return 16 + 16 * Math.min(6, n.tech); }
export function caravanCapacity(n) { return 7 + 7 * Math.min(6, n.tech); } // 대상은 배보다 적게 싣는다
// 입항: 화물 하역·정산 후 반대편에 실을 화물을 고른다.
// 화물을 판매국 비축으로 되돌린다 (항로 소멸·구매국 멸망 등). 판매국도 없으면 유실로 기록한다.
export function refundCargo(S, s) {
  ensureEco(S); const c = s.cargo; if (!c) return; s.cargo = null;
  const seller = S.nations[c.from];
  if (seller && seller.alive && seller.eco) { seller.eco.stock[c.g] += c.amt; S.trade.load[c.g] -= c.amt; } else S.trade.lost[c.g] += c.amt;
}
// 입항: 화물 하역·정산 후 반대편에 실을 화물을 고른다. 대금은 하역 때 한 번만, 구매국 국고에서 판매국 국고로 옮겨진다.
export function dockShip(S, map, s, port, addLog, land = false) {
  ensureEco(S);
  const P = S.P, T = S.trade; const here = P.owner[port] >= 0 ? S.nations[P.owner[port]] : null;
  const otherP = port === s.a ? s.b : s.a; const there = P.owner[otherP] >= 0 ? S.nations[P.owner[otherP]] : null;
  let fx = false;
  if (s.cargo) {
    const c = s.cargo; const buyer = here && here.alive && here.eco ? here : null; const seller = S.nations[c.from];
    if (!buyer || buyer.id === c.from) refundCargo(S, s);
    else {
      s.cargo = null;
      // 항구 주인이 바뀐 경우를 포함해 현재 항구 국가가 사들인다. 국고가 모자라면 살 수 있는 만큼만 받고 나머지는 판매국에 돌려보낸다.
      const pr = c.pr; const can = Math.min(c.amt, buyer.eco.wealth / pr); const part = can < c.amt;
      if (can > 0.01) {
        const val = can * pr; buyer.eco.wealth -= val; T.paid += val;
        const amt = can * (land ? 0.97 : 0.96); const was = buyer.eco.sat[c.g];
        buyer.eco.stock[c.g] += amt; buyer.eco.imp[c.g] += amt; T.unl[c.g] += can; T.lost[c.g] += can - amt; T.deliv[c.g] += amt; T.value += val; if (land) T.voyL = (T.voyL || 0) + 1; else T.voyages++;
        buyer.eco.partners[c.from] = (buyer.eco.partners[c.from] || 0) + val;
        if (seller && seller.alive && seller.eco) { seller.eco.wealth += val; seller.eco.exp[c.g] += can; seller.eco.partners[buyer.id] = (seller.eco.partners[buyer.id] || 0) + val; T.recv += val; }
        else T.recv += val; // 판매국이 이미 사라졌다면 대금은 장부에서만 소멸 (유실 기록)
        fx = c.g;
        const key = c.from + '_' + buyer.id + '_' + c.g;
        if (buyer.pc + (seller ? seller.pc : 0) >= 4) {
          if (c.g === 0 && was < 0.75 && S.year - buyer.eco.lastLog > 25) { buyer.eco.lastLog = S.year; addLog(S, land ? `${seller ? seller.name : '먼 나라'}의 곡물을 실은 대상이 ${buyer.name}에 닿아 굶주림을 덜었습니다.` : `${seller ? seller.name : '먼 나라'}의 곡물선이 ${buyer.name}에 닿아 굶주림을 덜었습니다.`, 2, port, buyer.id, c.from); }
          else if (!T.seen[key] && S.year - T.log > 4 && (c.g >= 2)) { T.seen[key] = 1; T.log = S.year; addLog(S, land ? `${seller ? seller.name : '먼 나라'}의 ${GOODS[c.g].name} 대상이 ${buyer.name}에 처음 닿았습니다.` : `${seller ? seller.name : '먼 나라'}의 ${GOODS[c.g].name} 무역선이 ${buyer.name}의 항구에 처음 닿았습니다.`, c.g >= 3 ? 2 : 1, port, buyer.id, c.from); }
        }
      }
      if (part) { const rest = c.amt - Math.max(0, can); if (seller && seller.alive && seller.eco) { seller.eco.stock[c.g] += rest; T.load[c.g] -= rest; } else T.lost[c.g] += rest; }
    }
  }
  // 적재: 이 항구 국가가 판매자, 반대편 국가가 구매자
  if (!S.noTrade && here && there && here.alive && there.alive && here.eco && there.eco && here.id !== there.id) {
    const inb = inbound(S); let best = -1, bs = 0, bam = 0;
    for (let g = 0; g < NG; g++) {
      const price = GOODS[g].price * (1 + 1.2 * (1 - there.eco.sat[g]));
      const am = Math.min(Math.max(land ? caravanCapacity(here) : shipCapacity(here), 5 * there.eco.dem[g]), surplus(here, g), needOf(there, g, inb), there.eco.wealth / price * 0.9);
      if (am < Math.max(1.2, there.eco.dem[g] * 0.03)) continue;
      const sc = am * price * (1 + (g === 0 ? 0.8 * (1 - there.eco.sat[0]) : 0)); if (sc > bs) { bs = sc; best = g; bam = am; }
    }
    if (best >= 0) {
      bam = Math.round(bam * 10) / 10; if (bam > here.eco.stock[best]) bam = Math.floor(here.eco.stock[best] * 10) / 10;
      if (bam > 0) {
        here.eco.stock[best] -= bam; T.load[best] += bam;
        s.cargo = { g: best, amt: bam, from: here.id, to: there.id, pr: GOODS[best].price * (1 + 1.2 * (1 - there.eco.sat[best])) };
      }
    }
  }
  return fx;
}
// 두 나라가 서로 가진 것과 모자란 것이 얼마나 맞물리는가 (교역로 후보 점수)
export function complement(a, b) {
  if (!a.eco || !b.eco) return 0; let sc = 0;
  for (let g = 0; g < NG; g++) {
    const na = needOf(b, g), nb = needOf(a, g), pa = Math.max(0, a.eco.prod[g] - a.eco.dem[g]) * 10 + surplus(a, g), pb = Math.max(0, b.eco.prod[g] - b.eco.dem[g]) * 10 + surplus(b, g);
    sc += (Math.min(pa, na) / Math.max(1, b.eco.dem[g]) + Math.min(pb, nb) / Math.max(1, a.eco.dem[g])) * GOODS[g].price;
  }
  return sc;
}
