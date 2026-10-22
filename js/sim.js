// 문명 시뮬레이션 코어 (지방 단위 집계 모델). DOM/Canvas에 의존하지 않는다.
import { RNG } from './rng.js';
import { makeLang, genName, genReligion, genCultureName, hslToRgb, ERA_NAMES, yearStr, numStr } from './names.js';

export const VERSION = 1;
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;

export const POWERS = {
  bless: { name: '풍요의 비', desc: '선택 지역과 인접 지역의 땅이 수십 년간 기름져집니다.' },
  drought: { name: '가뭄', desc: '지역에 대가뭄을 내립니다. 인구와 안정도가 흔들립니다.' },
  plague: { name: '역병', desc: '지역에 역병을 퍼뜨립니다. 이웃으로 번집니다.' },
  quake: { name: '지진', desc: '지역과 도시에 피해를 줍니다.' },
  volcano: { name: '화산 폭발', desc: '큰 피해를 주지만 이후 땅이 비옥해집니다.' },
  meteor: { name: '운석', desc: '지역 전체를 강타합니다. 인접 지역도 큰 피해를 입습니다.' },
  tribe: { name: '새 부족 탄생', desc: '사람이 없는 빈 땅에 새 부족을 내려보냅니다.' },
  prophet: { name: '예언자', desc: '지역에 새 신앙을 일으키고 주변으로 퍼뜨립니다.' },
  hero: { name: '영웅 강림', desc: '해당 국가에 영웅이 나타나 안정도와 학문이 오릅니다.' },
  revolt: { name: '민중 봉기', desc: '지역의 불만을 폭발시켜 독립을 부추깁니다.' },
  peace: { name: '평화의 신탁', desc: '해당 국가가 치르는 모든 전쟁을 끝냅니다.' },
  war: { name: '전쟁의 불씨', desc: '이웃과의 관계를 악화시켜 전쟁을 부추깁니다.' },
};

export function createState(map, opts = {}) {
  const seed = (opts.seed ?? 1) >>> 0;
  const rng = new RNG(seed * 7919 + 13);
  const N = map.provinces.length;
  const S = {
    v: VERSION, seed, mapKind: map.kind, mode: opts.mode || 'emergent', year: 0, rng, techRate: opts.techRate ?? 1,
    P: { pop: new Float32Array(N), tech: new Float32Array(N), owner: new Int16Array(N).fill(-1), cult: new Int16Array(N).fill(-1), rel: new Int16Array(N).fill(-1), unrest: new Float32Array(N), city: new Uint8Array(N), fx: new Float32Array(N).fill(1), km: new Float32Array(N).fill(1), plague: new Uint8Array(N) },
    nations: [], cultures: [], religions: [], wars: [], truce: {}, log: [], hist: [], routes: [], cityName: new Array(N).fill(''), provName: new Array(N).fill(''),
    auto: !!opts.auto, aggr: opts.aggr ?? 1, worldFirst: {}, stats: {}, fr: null, nextWar: 1,
    eventsOn: opts.events !== false, deaths: { war: 0, plague: 0, famine: 0 }, fxQueue: [],
  };
  if (S.mode === 'real') initReal(S, map, opts); else initEmergent(S, map, opts);
  computeFronts(S, map); aggregate(S, map); sampleHistory(S);
  return S;
}

function newCulture(S, rng, parent = -1, nameHint) {
  const lang = parent >= 0 && rng.chance(0.55) ? S.cultures[parent].lang : makeLang(rng);
  const id = S.cultures.length; const base = parent >= 0 ? S.cultures[parent].hue : rng.range(0, 360);
  const hue = (base + (parent >= 0 ? rng.range(-35, 35) : 0) + 360) % 360;
  S.cultures.push({ id, name: nameHint || genCultureName(lang, rng), lang, hue, rgb: hslToRgb(hue, rng.range(45, 70), rng.range(48, 64)), parent });
  return id;
}
function newReligion(S, rng, cult, p, year) {
  const id = S.religions.length; const hue = rng.range(0, 360);
  S.religions.push({ id, name: genReligion(S.cultures[Math.max(0, cult)].lang, rng), rgb: hslToRgb(hue, rng.range(50, 75), rng.range(50, 62)), year, origin: p });
  return id;
}
const JOSA = { '이(가)': ['이', '가'], '을(를)': ['을', '를'], '은(는)': ['은', '는'], '와(과)': ['과', '와'] };
export function josa(t) {
  return t.replace(/(\S)(이\(가\)|을\(를\)|은\(는\)|와\(과\))/g, (m, c, j) => {
    const code = c.charCodeAt(0); let fin;
    if (code >= 0xac00 && code <= 0xd7a3) fin = (code - 0xac00) % 28 !== 0; else fin = '0136780'.includes(c) || 'lmnLMN'.includes(c) && false;
    return c + JOSA[j][fin ? 0 : 1];
  });
}
export function addLog(S, txt, imp = 1, p = -1, n = -1) {
  txt = josa(txt);
  S.log.push({ y: S.year, t: txt, i: imp, p, n });
  if (S.log.length > 900) S.log.splice(0, 150);
}
export function newNation(S, map, p, name, cult, tech = 0) {
  const rng = S.rng; const id = S.nations.length;
  const hue = (id * 137.508 + rng.range(-12, 12)) % 360;
  const lang = S.cultures[Math.max(0, cult)].lang;
  const n = {
    id, name: name || genName(lang, rng, 'nation'), rgb: hslToRgb(hue, rng.range(52, 72), rng.range(50, 60)), cap: p, cult, rel: S.P.rel[p],
    gov: '부족', born: S.year, alive: true, died: null, stab: 0.7, lead: newLeader(S, lang), allies: [], pc: 0, pop: 0, tech: 0, mil: 0, lx: 0, ly: 0,
    peakPop: 0, peakPc: 0, era: 0, relat: {}, exh: 0, gdp: 0, trade: 0, wins: 0, losses: 0,
  };
  S.nations.push(n); return n;
}
function newLeader(S, lang) {
  const rng = S.rng;
  return { name: genName(lang, rng, 'person'), war: rng.range(0.4, 1.6), exp: rng.range(0.4, 1.6), sci: rng.range(0.6, 1.5), trade: rng.range(0.4, 1.6), faith: rng.range(0.3, 1.6), stab: rng.range(-0.05, 0.05), since: S.year };
}
function nameProvince(S, map, p) {
  if (S.provName[p]) return; const cu = S.P.cult[p]; if (cu < 0) return;
  S.provName[p] = genName(S.cultures[cu].lang, S.rng, 'city');
}

// ---------- 초기화: 문명 탄생 ----------
function initEmergent(S, map, opts) {
  const rng = S.rng, N = map.provinces.length, P = S.P;
  S.year = opts.startYear ?? -10000;
  const nStart = opts.hearths ?? 6;
  const cand = []; for (let p = 0; p < N; p++) { const o = map.provinces[p]; if (o.fert > 0.45 && o.a > 6000) cand.push(p); }
  const hearths = []; const minD = Math.max(120, 420 / Math.sqrt(nStart)); let tries = 0;
  while (hearths.length < nStart && tries++ < 4000 && cand.length) {
    const p = rng.pick(cand); const o = map.provinces[p];
    if (hearths.every((q) => Math.hypot(map.provinces[q].x - o.x, map.provinces[q].y - o.y) > minD * Math.max(0.3, 1 - tries / 2500))) hearths.push(p);
  }
  for (const p of hearths) {
    const cu = newCulture(S, rng); const rl = newReligion(S, rng, cu, p, S.year);
    P.pop[p] = rng.range(120, 220); P.tech[p] = 0.1; P.cult[p] = cu; P.rel[p] = rl;
    nameProvince(S, map, p);
    const n = newNation(S, map, p, null, cu, 0.1); P.owner[p] = n.id; n.gov = '부족 연맹';
    S.cityName[p] = genName(S.cultures[cu].lang, rng, 'city');
  }
  addLog(S, `태초의 땅 ${hearths.length}곳에서 부족들이 첫 불을 피웠습니다. 신의 관찰이 시작됩니다.`, 3, hearths[0]);
}

const DEG = 0.28125;
function nearestProv(map, x, y) { for (let r = 1; r < 6; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= map.W || yy >= map.H) continue; const p = map.prov[yy * map.W + xx]; if (p >= 0) return p; } return -1; }
function initReal(S, map, opts) {
  const rng = S.rng, N = map.provinces.length, P = S.P; const C = map.countries;
  S.year = opts.startYear ?? 2026;
  const sovIdx = C.map((c, i) => { if (c.type !== 'Dep') return i; const j = C.findIndex((d) => d.type !== 'Dep' && d.en === c.sov); return j >= 0 ? j : i; });
  const byProv = {}; for (let p = 0; p < N; p++) { const c = map.provinces[p].c; if (c < 0) continue; (byProv[c] ||= []).push(p); }
  const natOf = {}, cultOf = {}, capOf = {};
  const techOf = { '1': 8.5, '2': 8.0, '3': 7.5, '4': 6.7, '5': 5.9, '7': 6.5 };
  const mkCult = (ci) => { const cu = S.cultures.length; const lang = makeLang(rng); const hue = rng.range(0, 360); S.cultures.push({ id: cu, name: C[ci].ko + '인', lang, hue, rgb: hslToRgb(hue, 55, 58), parent: -1 }); return cu; };
  for (const ci of Object.keys(byProv).map(Number)) {
    const s = byProv[sovIdx[ci]] ? sovIdx[ci] : ci;
    if (natOf[s] === undefined) {
      cultOf[s] = mkCult(s); const rl = newReligion(S, rng, cultOf[s], byProv[s][0], S.year);
      const cap = byProv[s].reduce((a, b) => (map.provinces[b].a > map.provinces[a].a ? b : a));
      const tt = C[s].tech ?? techOf[C[s].inc] ?? 6.5; S.P.rel[cap] = rl;
      const n = newNation(S, map, cap, C[s].ko, cultOf[s], tt); n.gov = tt < 7 ? '왕조 국가' : '현대 국가'; n.real = C[s].iso; n.en = C[s].en; n.rel = rl;
      natOf[s] = n.id;
    }
    if (cultOf[ci] === undefined) cultOf[ci] = mkCult(ci);
  }
  for (const ci of Object.keys(byProv).map(Number)) {
    const s = byProv[sovIdx[ci]] ? sovIdx[ci] : ci; const nid = natOf[s]; const provs = byProv[ci];
    const popTot = Math.max(2000, C[ci].pop || 20000); let wsum = 0; const w = provs.map((p) => { const o = map.provinces[p]; const v = o.a * (0.15 + o.fert); wsum += v; return v; });
    let cx = 0, cy = 0, ca = 0; for (const p of provs) { const o = map.provinces[p]; cx += o.x * o.a; cy += o.y * o.a; ca += o.a; } cx /= ca; cy /= ca;
    provs.forEach((p, k) => {
      const o = map.provinces[p]; P.owner[p] = nid; P.cult[p] = cultOf[ci]; P.rel[p] = S.nations[nid].rel; P.pop[p] = popTot * w[k] / wsum;
      P.tech[p] = C[ci].tech ?? techOf[C[ci].inc] ?? 6.5; P.unrest[p] = 0.05; { const K0 = capacity(S, map, p); P.km[p] = Math.max(1, P.pop[p] * 1.2 / Math.max(1, K0)); }
      if (provs.length === 1) S.provName[p] = C[ci].ko; else { const dx = o.x - cx, dy = o.y - cy; const d = Math.hypot(dx, dy); let dir = '중부'; if (d > 18) { const q = Math.round((Math.atan2(dy, dx) + Math.PI) / (Math.PI / 4)) % 8; dir = ['서부', '남서부', '남부', '남동부', '동부', '북동부', '북부', '북서부'][q]; } S.provName[p] = `${C[ci].ko} ${dir}`; }
    });
  }
  if (opts.places) {
    S.cityPop = {};
    for (const pl of opts.places) {
      const x = Math.floor((pl.lon + 180) / DEG), y = Math.floor((84 - pl.lat) / DEG); if (x < 0 || y < 0 || x >= map.W || y >= map.H) continue;
      let p = map.prov[y * map.W + x]; if (p < 0) { p = nearestProv(map, x, y); if (p < 0) continue; }
      const lv = pl.pop > 5e6 ? 3 : pl.pop > 1.5e6 ? 2 : 1;
      if (lv > P.city[p] || (lv === P.city[p] && pl.pop > (S.cityPop[p] || 0))) { P.city[p] = lv; S.cityName[p] = pl.ko || pl.name; S.cityPop[p] = pl.pop; }
      if (pl.cap) { const nid = P.owner[p]; if (nid >= 0 && map.provinces[p].c === map.provinces[S.nations[nid].cap].c) S.nations[nid].cap = p; }
    }
  }
  for (let p = 0; p < N; p++) if (P.city[p] === 0 && P.pop[p] > 800000) { P.city[p] = 1; S.cityName[p] = S.provName[p] + ' 중심'; }
  addLog(S, opts.eraLabel ? `${opts.eraLabel}의 배치에서 시뮬레이션이 시작됩니다. 당시 세계를 근사한 시작 시나리오이며, 이후 전개는 가상의 대체역사입니다.` : '현재 세계의 국가 배치에서 시뮬레이션이 시작됩니다. 국경은 Natural Earth 데이터 기준의 근사이며, 이후 전개는 가상의 대체역사입니다.', 3);
}

// ---------- 집계 ----------
export function capacity(S, map, p) {
  const o = map.provinces[p]; const t = S.P.tech[p];
  return o.a * 0.35 * Math.pow(1.9, Math.min(t, 6) + Math.max(0, t - 6) * 0.3) * o.fert * S.P.fx[p] * S.P.km[p] * (S.P.city[p] ? 1.25 : 1);
}
export function computeFronts(S, map) {
  const fr = new Map(); const ow = S.P.owner;
  for (const [a, b, t] of map.edges) {
    const x = ow[a], y = ow[b]; if (x < 0 || y < 0 || x === y) continue;
    let k = x * 4096 + y; let l = fr.get(k); if (!l) fr.set(k, l = []); l.push([a, b, t]);
    k = y * 4096 + x; l = fr.get(k); if (!l) fr.set(k, l = []); l.push([b, a, t]);
  }
  S.fr = fr;
}
export function aggregate(S, map) {
  const P = S.P, N = map.provinces.length; const prv = map.provinces;
  for (const n of S.nations) { n.pc = 0; n.pop = 0; n._t = 0; n._lx = 0; n._ly = 0; n._w = 0; }
  let world = 0, maxT = 0;
  for (let p = 0; p < N; p++) {
    world += P.pop[p]; if (P.pop[p] > 20 && P.tech[p] > maxT) maxT = P.tech[p];
    const o = P.owner[p]; if (o < 0) continue; const n = S.nations[o]; n.pc++; n.pop += P.pop[p]; n._t += P.tech[p] * P.pop[p];
    const w = P.pop[p] + 50 * prv[p].a / 1e5; n._lx += prv[p].ax * w; n._ly += prv[p].ay * w; n._w += w;
  }
  let alive = 0;
  for (const n of S.nations) {
    if (!n.alive) continue; if (n.pc === 0) { killNation(S, n, '영토를 모두 잃고'); continue; }
    alive++;
    n.tech = n.pop > 0 ? n._t / n.pop : 0; n.peakPop = Math.max(n.peakPop, n.pop); n.peakPc = Math.max(n.peakPc, n.pc);
    n.mil = n.pop * 0.016 * Math.pow(1.75, n.tech) * clamp(0.4 + n.stab, 0.2, 1.3) * (1 - 0.5 * clamp(n.exh, 0, 1));
    n.gdp = n.pop * (0.25 + 0.55 * n.tech) * 0.001 * (1 + n.trade * 0.05);
    const cx = n._lx / n._w, cy = n._ly / n._w; let best = 1e18, bx = cx, by = cy;
    for (let p = 0; p < N; p++) if (P.owner[p] === n.id) { const o = prv[p]; const d = (o.ax - cx) ** 2 + (o.ay - cy) ** 2; if (d < best) { best = d; bx = o.ax; by = o.ay; } }
    n.lx = (cx + bx) / 2; n.ly = (cy + by) / 2;
    if (n.cap < 0 || P.owner[n.cap] !== n.id) {
      let bp = -1, bpop = -1; for (let p = 0; p < N; p++) if (P.owner[p] === n.id && P.pop[p] > bpop) { bpop = P.pop[p]; bp = p; }
      n.cap = bp; n.stab = Math.max(0.05, n.stab - 0.12);
    }
  }
  S.stats = { world, alive, maxT };
  return S.stats;
}
function killNation(S, n, how) {
  n.alive = false; n.died = S.year; n.pc = 0;
  addLog(S, `${n.name}이(가) ${how} 역사에서 사라졌습니다. (존속 ${Math.max(1, S.year - n.born)}년)`, n.peakPc >= 3 ? 3 : 2, n.cap, n.id);
  S.wars = S.wars.filter((w) => { w.A = w.A.filter((x) => x !== n.id); w.D = w.D.filter((x) => x !== n.id); return w.A.length && w.D.length; });
  for (const m of S.nations) m.allies = m.allies.filter((x) => x !== n.id);
}
function sampleHistory(S) {
  const st = S.stats; const top = S.nations.filter((n) => n.alive).sort((a, b) => b.pop - a.pop).slice(0, 5).map((n) => [n.id, Math.round(n.pop)]);
  S.hist.push({ y: S.year, pop: Math.round(st.world), nn: st.alive, tech: +st.maxT.toFixed(2), wars: S.wars.length, top });
  if (S.hist.length > 900) S.hist.splice(0, 1);
}

// ---------- 한 해 진행 ----------
export function step(S, map) {
  S.year++; if (S.mode === 'emergent' && S.year === 0) S.year = 1;
  stepProvinces(S, map);
  if (S.year % 2 === 0 || !S.fr) computeFronts(S, map);
  aggregate(S, map);
  stepNations(S, map);
  stepWars(S, map);
  if (S.eventsOn) stepEvents(S, map);
  if (S.year % 5 === 0) stepDiplomacy(S, map);
  if (S.year % 10 === 0) { stepGov(S, map); sampleHistory(S); if (S.auto) autoGod(S, map); }
  eraCheck(S, map);
}

const LV_YEARS = [5000, 3000, 1500, 1100, 800, 350, 150, 100, 150, 400, 400];
function techCurve(t) { const i = Math.min(9, Math.floor(t)); const f = t - i; const d = LV_YEARS[i] * (1 - f) + LV_YEARS[i + 1] * f; return t >= 9.6 ? 0 : 0.445 / d; }
function stepProvinces(S, map) {
  const rng = S.rng, P = S.P, N = map.provinces.length; const prv = map.provinces;
  for (let p = 0; p < N; p++) {
    const o = prv[p]; let pop = P.pop[p];
    if (P.fx[p] !== 1) { P.fx[p] += (1 - P.fx[p]) * 0.02; if (Math.abs(P.fx[p] - 1) < 0.01) P.fx[p] = 1; }
    if (pop <= 0) continue;
    const t = P.tech[p]; const K = capacity(S, map, p);
    const r = 0.011 + Math.min(0.012, t * 0.0014);
    let dp = K > 0.5 ? pop * r * (1 - pop / K) : -pop * 0.02;
    if (P.plague[p]) dp -= pop * 0.035;
    pop += dp; if (pop < 0.3) pop = 0; P.pop[p] = pop;
    const own = P.owner[p];
    if (pop > 15) {
      const lead = own >= 0 ? S.nations[own].lead.sci : 0.85;
      const cap = own >= 0 && S.nations[own].cap === p ? 1.2 : 1;
      let dt = S.techRate * techCurve(t) * (0.5 + 0.5 * o.fert) * (0.8 + 0.2 * Math.log10(1 + pop / 400)) * lead * cap;
      if (P.city[p]) dt *= 1.1; if (P.plague[p]) dt *= 0.5;
      P.tech[p] = t + dt;
      let mx = 0; const L = o.land; for (let k = 0; k < L.length; k++) { const q = L[k]; if (P.pop[q] > 15 && P.tech[q] > mx) mx = P.tech[q]; }
      if (t >= 1.5 && o.k) { const Sx = o.sea; for (let k = 0; k < Sx.length; k++) { const q = Sx[k]; if (P.pop[q] > 15 && P.tech[q] - 0.4 > mx) mx = P.tech[q] - 0.4; } }
      if (mx > P.tech[p]) P.tech[p] += (mx - P.tech[p]) * (own >= 0 ? 0.004 : 0.002);
    }
    // 이주
    if (pop > K * 0.55 && pop > 200 && rng.next() < 0.18) {
      const L = o.land; const sea = o.k && t >= 1.2 ? o.sea : []; const tot = L.length + (sea.length ? 1 : 0);
      if (tot) {
        const k = rng.int(tot); const viaSea = k >= L.length; const q = viaSea ? sea[rng.int(sea.length)] : L[k];
        const Kq = capacity(S, map, q) || 1;
        if (!(viaSea && rng.next() > 0.12) && P.pop[q] < Kq * 0.35 && prv[q].fert > 0.04) {
          const mv = Math.min(pop * 0.02, Kq * 0.02 + 8); P.pop[p] -= mv;
          const empty = P.pop[q] < 1; P.pop[q] += mv;
          if (empty) {
            let cu = P.cult[p]; if (cu >= 0 && S.cultures.length < 140 && (viaSea || rng.chance(0.03))) cu = newCulture(S, rng, cu);
            P.cult[q] = cu; P.rel[q] = P.rel[p]; nameProvince(S, map, q); P.tech[q] = Math.max(P.tech[q], P.tech[p] * 0.85);
            if (viaSea && own >= 0 && rng.chance(0.5)) P.owner[q] = own;
          }
        }
      }
    }
    // 도시
    const need = 4500 * Math.pow(1.5, t); const lv = P.city[p];
    if (lv < 3 && pop > need * (lv === 0 ? 1 : lv === 1 ? 5 : 22)) {
      P.city[p] = lv + 1;
      if (lv === 0 && !S.cityName[p]) S.cityName[p] = genName(S.cultures[Math.max(0, P.cult[p])].lang, rng, 'city');
      if (lv === 1 && own >= 0 && rng.chance(0.5)) addLog(S, `${S.cityName[p]}이(가) 대도시로 성장했습니다. (${S.nations[own].name})`, 1, p, own);
    } else if (lv > 0 && pop < need * (lv === 1 ? 0.35 : lv === 2 ? 1.5 : 8)) P.city[p] = lv - 1;
    if (rng.next() < 0.004) { const L = o.land; if (L.length) { const q = L[rng.int(L.length)]; if (P.pop[q] > P.pop[p] * 1.5 && P.cult[q] >= 0 && P.cult[q] !== P.cult[p] && P.owner[p] === P.owner[q]) P.cult[p] = P.cult[q]; } }
    if (rng.next() < 0.003) { const L = o.land; if (L.length) { const q = L[rng.int(L.length)]; if (P.rel[q] >= 0 && P.rel[q] !== P.rel[p] && P.pop[q] > P.pop[p]) P.rel[p] = P.rel[q]; } }
    if (pop > 8000 && rng.next() < 0.00035 && S.religions.length < 60) {
      const rl = newReligion(S, rng, P.cult[p], p, S.year); P.rel[p] = rl; addLog(S, `${S.provName[p] || '이름 없는 땅'}에서 새로운 신앙 '${S.religions[rl].name}'이(가) 일어났습니다.`, 2, p, own);
    }
    if (own < 0 && pop > 900 * (1 + t) && P.cult[p] >= 0 && rng.next() < 0.0012 * Math.min(1, t + 0.4) && !o.land.some((q) => P.owner[q] >= 0)) {
      const n = newNation(S, map, p, null, P.cult[p], P.tech[p]); P.owner[p] = n.id; n.gov = '부족 연맹'; n.stab = 0.65; S.cityName[p] ||= genName(S.cultures[P.cult[p]].lang, rng, 'city');
      for (const q of o.land) if (P.owner[q] < 0 && P.pop[q] > 40 && P.cult[q] === P.cult[p]) P.owner[q] = n.id;
      addLog(S, `${S.provName[p] || '한 땅'}에서 새로운 세력 ${n.name}이(가) 일어났습니다.`, 2, p, n.id);
    }
  }
}

function stepNations(S, map) {
  const rng = S.rng, P = S.P, N = map.provinces.length; const prv = map.provinces;
  const wcount = {}; for (const w of S.wars) { for (const a of w.A) wcount[a] = (wcount[a] || 0) + 1; for (const d of w.D) wcount[d] = (wcount[d] || 0) + 1; }
  const alive = S.nations.filter((n) => n.alive);
  for (const n of alive) {
    const wc = wcount[n.id] || 0;
    const over = Math.max(0, n.pc - (5 + n.tech * 4.5));
    const target = clamp(0.80 - over * 0.018 - wc * 0.12 + n.lead.stab + (n.lead.faith - 1) * 0.04, 0.05, 0.95);
    n.stab += (target - n.stab) * 0.06 + (rng.next() - 0.5) * 0.02;
    n.exh = Math.max(0, n.exh - (wc ? 0.004 : 0.04));
    n.stab = clamp(n.stab, 0.02, 1);
    if (rng.next() < 1 / 34) { n.lead = newLeader(S, S.cultures[Math.max(0, n.cult)].lang); if (n.pc >= 3) addLog(S, `${n.name}의 새 지도자 ${n.lead.name}이(가) 즉위했습니다. (${traitText(n.lead)})`, 1, n.cap, n.id); }
    const cap = prv[n.cap];
    for (let p = 0; p < N; p++) {
      if (P.owner[p] !== n.id) continue;
      const o = prv[p]; const d = Math.hypot(o.x - cap.x, o.y - cap.y) / 160;
      let u = P.unrest[p] + (P.cult[p] !== n.cult ? 0.010 : -0.008) + d * 0.0012 + (n.stab < 0.4 ? 0.012 : -0.004) + (P.plague[p] ? 0.01 : 0);
      P.unrest[p] = u = clamp(u, 0, 1);
      if (u > 0.985 && rng.next() < 0.08 && n.pc > 1 && p !== n.cap && P.pop[p] > 30) revolt(S, map, p, n);
    }
    const capN = 6 + n.tech * 5 + (n.lead.exp > 1.2 ? 3 : 0);
    if (n.pc < capN && n.stab > 0.3 && rng.next() < 0.11 * (0.5 + n.lead.exp)) expand(S, map, n);
    if (n.stab < 0.1 && n.pc >= 4 && rng.next() < 0.08) collapse(S, map, n);
    if (n.pop < 3 && n.pc <= 2) { for (let p = 0; p < N; p++) if (P.owner[p] === n.id) P.owner[p] = -1; killNation(S, n, '인구가 끊겨'); continue; }
    if (wc < 1 && n.stab > 0.35 && !(S.mode === 'real' && S.year < 2041) && rng.next() < 0.028 * S.aggr * (0.35 + n.lead.war) / (1 + 3.5 * Math.max(0, n.tech - 5.5)) / (S.mode === 'real' && S.year < 2126 ? 2.5 : 1)) declareWar(S, map, n);
  }
}
export const traitText = (l) => { const t = []; if (l.war > 1.25) t.push('호전적'); if (l.exp > 1.25) t.push('팽창주의'); if (l.sci > 1.25) t.push('학문 장려'); if (l.trade > 1.25) t.push('교역 중시'); if (l.faith > 1.25) t.push('독실함'); if (l.war < 0.7) t.push('온건'); return t.length ? t.join('·') : '평범한 통치'; };

function expand(S, map, n) {
  const rng = S.rng, P = S.P, prv = map.provinces; const cands = [];
  for (let p = 0; p < prv.length; p++) if (P.owner[p] === n.id) {
    for (const q of prv[p].land) if (P.owner[q] < 0 && prv[q].fert > 0.03) cands.push(q);
    if (n.tech >= 2.2 && prv[p].k && rng.next() < 0.1) for (const q of prv[p].sea) if (P.owner[q] < 0 && prv[q].fert > 0.03) cands.push(q);
  }
  if (!cands.length) return;
  let best = -1, bs = -1; for (let i = 0; i < 4; i++) { const q = cands[rng.int(cands.length)]; const s = prv[q].fert * (1 + P.pop[q] / 500) + rng.next() * 0.2; if (s > bs) { bs = s; best = q; } }
  const q = best; P.owner[q] = n.id;
  if (P.pop[q] < 1) {
    let src = n.cap; for (const r of prv[q].land.concat(prv[q].sea)) if (P.owner[r] === n.id && P.pop[r] > P.pop[src] * 0.3) { src = r; break; }
    const mv = Math.min(P.pop[src] * 0.03, 60); P.pop[src] -= mv; P.pop[q] = mv; P.cult[q] = n.cult; P.rel[q] = P.rel[src]; P.tech[q] = Math.max(P.tech[q], P.tech[src] * 0.9); nameProvince(S, map, q);
  } else P.unrest[q] = Math.max(P.unrest[q], 0.25);
}
export function revolt(S, map, p, n) {
  const P = S.P; const cu = P.cult[p];
  const m = newNation(S, map, p, null, cu, P.tech[p]); P.owner[p] = m.id; m.gov = '독립 세력'; m.stab = 0.5; P.unrest[p] = 0.1;
  for (const q of map.provinces[p].land) if (P.owner[q] === n.id && P.cult[q] === cu && P.unrest[q] > 0.55) { P.owner[q] = m.id; P.unrest[q] = 0.15; }
  addLog(S, `${S.provName[p] || '한 지방'}이(가) ${n.name}에 맞서 봉기해 ${m.name}으로 독립했습니다.`, 2, p, m.id);
  n.stab = Math.max(0.05, n.stab - 0.08); m.relat[n.id] = -60; n.relat[m.id] = -60;
}
function collapse(S, map, n) {
  const P = S.P, rng = S.rng; const mine = []; for (let p = 0; p < map.provinces.length; p++) if (P.owner[p] === n.id) mine.push(p);
  const k = Math.min(1 + Math.ceil(mine.length / 5), 4); const seeds = [n.cap]; const others = mine.filter((p) => p !== n.cap).sort(() => rng.next() - 0.5);
  while (seeds.length < k && others.length) { const c = others.pop(); if (seeds.every((s) => Math.hypot(map.provinces[s].x - map.provinces[c].x, map.provinces[s].y - map.provinces[c].y) > 60)) seeds.push(c); }
  if (seeds.length < 2) return;
  const succ = seeds.map((s, i) => { if (i === 0) return n; const m = newNation(S, map, s, null, P.cult[s], P.tech[s]); m.gov = '후계 세력'; return m; });
  for (const p of mine) { let b = 0, bd = 1e9; seeds.forEach((s, i) => { const d = Math.hypot(map.provinces[s].x - map.provinces[p].x, map.provinces[s].y - map.provinces[p].y); if (d < bd) { bd = d; b = i; } }); P.owner[p] = succ[b].id; P.unrest[p] = 0.1; }
  for (const m of succ) { m.stab = 0.45; for (const o of succ) if (o !== m) m.relat[o.id] = -30; }
  addLog(S, `${n.name}이(가) 내전으로 ${succ.length}개 세력으로 갈라졌습니다: ${succ.map((m) => m.name).join(', ')}`, 3, n.cap, n.id);
}

export function neighborsOf(S, n) {
  const out = new Map();
  for (const [k, list] of S.fr) { if (((k / 4096) | 0) !== n.id) continue; const m = k % 4096; if (!S.nations[m].alive) continue; let land = 0; for (const e of list) if (!e[2]) land++; out.set(m, { land, total: list.length }); }
  return out;
}
const tkey = (a, b) => Math.min(a, b) * 4096 + Math.max(a, b);
function declareWar(S, map, n) {
  const rng = S.rng; const nb = neighborsOf(S, n); let best = -1, bs = 0.15;
  for (const [m, info] of nb) {
    const t = S.nations[m]; if (!info.land && n.tech < 2.5) continue; if (S.truce[tkey(n.id, m)] > S.year) continue; if (n.allies.includes(m)) continue;
    const sc = Math.pow((n.mil + 1) / (t.mil + 1), 0.7) - 0.9 + (-(n.relat[m] || 0)) * 0.006 + (t.cult !== n.cult ? 0.08 : -0.05) + rng.next() * 0.25 - (info.land ? 0 : 0.2);
    if (sc > bs) { bs = sc; best = m; }
  }
  if (best >= 0) startWar(S, map, n, S.nations[best]);
}
export function startWar(S, map, a, d, reason) {
  if (S.wars.some((w) => w.A.includes(a.id) && w.D.includes(d.id))) return;
  const w = { id: S.nextWar++, A: [a.id], D: [d.id], a: a.id, d: d.id, start: S.year, exA: 0, exD: 0, sA: 0, sD: 0 };
  for (const x of S.nations) {
    if (!x.alive || x.id === a.id || x.id === d.id) continue;
    const side = a.allies.includes(x.id) ? 'A' : d.allies.includes(x.id) ? 'D' : ''; if (!side) continue;
    if (S.rng.chance(0.55) && !S.wars.some((z) => z.A.includes(x.id) || z.D.includes(x.id))) (side === 'A' ? w.A : w.D).push(x.id);
  }
  S.wars.push(w);
  a.relat[d.id] = Math.min(-40, a.relat[d.id] || 0); d.relat[a.id] = Math.min(-60, d.relat[a.id] || 0);
  const al = (ids) => ids.length > 1 ? `(+동맹 ${ids.length - 1}개국)` : '';
  addLog(S, `${a.name}${al(w.A)}이(가) ${d.name}${al(w.D)}에 전쟁을 선포했습니다.${reason ? ' ' + reason : ''}`, a.pc + d.pc > 8 ? 3 : 2, a.cap, a.id);
}
function stepWars(S, map) {
  const rng = S.rng, P = S.P, prv = map.provinces;
  for (const w of [...S.wars]) {
    const A = w.A.map((i) => S.nations[i]).filter((n) => n.alive), D = w.D.map((i) => S.nations[i]).filter((n) => n.alive);
    if (!A.length || !D.length) { S.wars = S.wars.filter((z) => z !== w); continue; }
    const sA = A.reduce((s, n) => s + n.mil, 0) * (1 - 0.4 * w.exA), sD = D.reduce((s, n) => s + n.mil, 0) * 1.1 * (1 - 0.4 * w.exD); const tot = sA + sD + 1;
    const attempt = (atk, def, sAtk, sDef) => {
      const pairs = []; for (const a of atk) for (const d of def) { const l = S.fr.get(a.id * 4096 + d.id); if (l) for (const e of l) pairs.push(e); }
      if (!pairs.length) return;
      const tries = 1 + Math.floor(Math.sqrt(pairs.length) / 2);
      for (let i = 0; i < tries; i++) {
        const [p, q, ty] = pairs[rng.int(pairs.length)]; if (P.owner[p] === P.owner[q] || P.owner[p] < 0 || P.owner[q] < 0) continue;
        const defn = 1 + 0.45 * prv[q].e + P.city[q] * 0.1 + (ty ? 0.5 : 0);
        const pc = 0.42 / (1 + Math.exp(-(sAtk / (sDef * defn + 1) - 1) * 2.4));
        if (rng.next() < pc) captureProvince(S, map, q, P.owner[q], P.owner[p], w);
      }
    };
    attempt(A, D, sA, sD); attempt(D, A, sD, sA);
    w.exA += 0.010 + 0.03 * sD / tot; w.exD += 0.010 + 0.03 * sA / tot;
    for (const n of A) n.exh = Math.max(n.exh, w.exA); for (const n of D) n.exh = Math.max(n.exh, w.exD);
    for (const [k, list] of S.fr) { const x = (k / 4096) | 0, y = k % 4096; if (w.A.includes(x) && w.D.includes(y)) for (const e of list) { const d1 = P.pop[e[0]] * 0.004, d2 = P.pop[e[1]] * 0.004; P.pop[e[0]] -= d1; P.pop[e[1]] -= d2; S.deaths.war += d1 + d2; } }
    const dur = S.year - w.start;
    const dcap = D.every((n) => P.owner[n.cap] !== n.id) && dur > 1, acap = A.every((n) => P.owner[n.cap] !== n.id) && dur > 1;
    const ex = Math.max(w.exA, w.exD);
    if (dcap || acap || ex > 1 || (dur >= 5 && rng.next() < 0.07 + ex * 0.15) || (dur >= 2 && Math.abs(sA - sD) / tot > 0.7 && rng.next() < 0.2)) endWar(S, map, w, dcap ? 'A' : acap ? 'D' : (w.sA > w.sD ? 'A' : w.sD > w.sA ? 'D' : ''));
  }
}
function captureProvince(S, map, q, from, to, w) {
  const P = S.P; const f = S.nations[from], t = S.nations[to]; if (!f.alive || !t.alive) return;
  const wasCap = f.cap === q;
  P.owner[q] = to; P.pop[q] *= 0.9; P.unrest[q] = 0.45; if (P.city[q] > 1 && S.rng.chance(0.4)) P.city[q]--;
  w[w.A.includes(to) ? 'sA' : 'sD'] += 1 + (P.city[q] ? 1 : 0) + (wasCap ? 3 : 0); S.deaths.war += P.pop[q] * 0.1;
  if (wasCap || P.city[q] >= 2) addLog(S, `${t.name}이(가) ${f.name}의 ${wasCap ? '수도 ' : ''}${S.cityName[q] || S.provName[q] || '도시'}을(를) 점령했습니다.`, wasCap ? 3 : 2, q, to);
  S.fxQueue.push([q, 'war']);
}
export function endWar(S, map, w, winner) {
  S.wars = S.wars.filter((z) => z !== w);
  const A = w.A.map((i) => S.nations[i]), D = w.D.map((i) => S.nations[i]);
  for (const a of w.A) for (const d of w.D) { S.truce[tkey(a, d)] = S.year + 12 + S.rng.int(18); S.nations[a].relat[d] = Math.min(S.nations[a].relat[d] || 0, -20); S.nations[d].relat[a] = Math.min(S.nations[d].relat[a] || 0, -20); }
  const dur = S.year - w.start; const wn = winner === 'A' ? A[0] : winner === 'D' ? D[0] : null;
  if (winner === 'A') { A[0].wins++; D[0].losses++; } else if (winner === 'D') { D[0].wins++; A[0].losses++; }
  if (wn) { const loser = winner === 'A' ? D[0] : A[0]; loser.stab = Math.max(0.05, loser.stab - 0.15); }
  addLog(S, `${A[0].name}와(과) ${D[0].name}의 전쟁이 ${dur}년 만에 끝났습니다.${wn ? ` 승자: ${wn.name}.` : ' 승패 없이 휴전.'}`, A[0].pc + D[0].pc > 8 ? 3 : 2, A[0].cap, A[0].id);
}

function stepDiplomacy(S, map) {
  const rng = S.rng; const alive = S.nations.filter((n) => n.alive); S.routes = [];
  const topCity = (n) => { let b = -1, bp = -1; for (let p = 0; p < map.provinces.length; p++) if (S.P.owner[p] === n.id && S.P.pop[p] * (S.P.city[p] + 1) > bp) { bp = S.P.pop[p] * (S.P.city[p] + 1); b = p; } return b; };
  const cache = {}; for (const n of alive) n.trade = 0;
  for (const n of alive) {
    const nb = neighborsOf(S, n);
    for (const [m, info] of nb) {
      const t = S.nations[m]; if (m < n.id) continue; let r = n.relat[m] || 0;
      r += rng.range(-4, 4) + (t.cult === n.cult ? 2 : -0.5) + (t.rel === n.rel ? 1 : -0.5) + (info.land ? -0.3 : 0); r *= 0.96;
      const warring = S.wars.some((w) => (w.A.includes(n.id) && w.D.includes(m)) || (w.A.includes(m) && w.D.includes(n.id)));
      if (warring) r = Math.min(r, -50);
      r = clamp(r, -100, 100); n.relat[m] = r; t.relat[n.id] = r;
      const allied = n.allies.includes(m);
      if (!allied && r > 55 && n.allies.length < 3 && t.allies.length < 3 && rng.chance(0.25)) { n.allies.push(m); t.allies.push(n.id); addLog(S, `${n.name}와(과) ${t.name}이(가) 동맹을 맺었습니다.`, n.pc + t.pc > 8 ? 2 : 1, n.cap, n.id); }
      else if (allied && (r < 15 || rng.chance(0.01))) { n.allies = n.allies.filter((x) => x !== m); t.allies = t.allies.filter((x) => x !== n.id); addLog(S, `${n.name}와(과) ${t.name}의 동맹이 깨졌습니다.`, 1, n.cap, n.id); }
      if (!warring && r > -10 && n.tech > 1.5 && t.tech > 1.5) { n.trade++; t.trade++; const a = cache[n.id] ?? (cache[n.id] = topCity(n)), b = cache[t.id] ?? (cache[t.id] = topCity(t)); if (a >= 0 && b >= 0 && S.routes.length < 90) S.routes.push([a, b]); }
    }
  }
}
function stepGov(S, map) {
  for (const n of S.nations) {
    if (!n.alive) continue; if (n.real && n.gov === '현대 국가' && S.year < 2100) continue;
    let g; const t = n.tech, pc = n.pc, l = n.lead;
    if (t < 0.8) g = pc < 3 ? '부족' : '부족 연맹';
    else if (t < 2.4) g = pc === 1 ? '도시국가' : pc >= 9 ? '제국' : '왕국';
    else if (t < 5.4) g = pc >= 13 ? '대제국' : l.faith > 1.2 ? '신정국' : pc === 1 ? '도시국가' : '왕국';
    else g = l.trade > 1.05 && n.stab > 0.45 ? '공화국' : pc >= 14 ? '제국' : l.war > 1.2 ? '군사 정권' : '입헌 왕국';
    if (g !== n.gov) { if (n.pc >= 4 && !['독립 세력', '후계 세력'].includes(n.gov) && !n.real) addLog(S, `${n.name}의 정체가 '${n.gov}'에서 '${g}'(으)로 바뀌었습니다.`, 1, n.cap, n.id); n.gov = g; }
  }
}
function eraCheck(S, map) {
  for (const n of S.nations) {
    if (!n.alive || n.pop < 30) continue; const e = Math.min(9, Math.floor(n.tech));
    if (e > n.era) {
      n.era = e;
      if (!S.worldFirst[e]) { S.worldFirst[e] = { n: n.id, y: S.year }; addLog(S, `${n.name}이(가) 세계 최초로 ${ERA_NAMES[e]}에 진입했습니다!`, 3, n.cap, n.id); }
      else if (n.pc >= 3 && e <= 3) addLog(S, `${n.name}이(가) ${ERA_NAMES[e]}에 진입했습니다.`, 1, n.cap, n.id);
    } else if (e < n.era - 1) n.era = e;
  }
}

// ---------- 자연 사건 ----------
function stepEvents(S, map) {
  const rng = S.rng, P = S.P, N = map.provinces.length; const prv = map.provinces;
  for (let p = 0; p < N; p++) if (P.plague[p]) {
    if (rng.next() < 0.14) { const L = prv[p].land; if (L.length) { const r = L[rng.int(L.length)]; if (P.pop[r] > 20 && !P.plague[r]) P.plague[r] = 5 + rng.int(7); } }
    if (rng.next() < 0.03) { const Sx = prv[p].sea; if (Sx.length) { const r = Sx[rng.int(Sx.length)]; if (P.pop[r] > 20 && !P.plague[r]) P.plague[r] = 5 + rng.int(7); } }
    S.deaths.plague += P.pop[p] * 0.035; P.plague[p]--;
  }
  const dense = S.stats.world / 3e8;
  if (rng.next() < 0.004 + 0.01 * Math.min(1, dense)) { const p = pickProvince(S, map, (q) => P.pop[q] > 400 && P.pop[q] / prv[q].a > 0.1); if (p >= 0) startPlague(S, map, p); }
  if (rng.next() < 0.012) disaster(S, map, rng.pick(['drought', 'quake', 'flood', 'volcano']), pickProvince(S, map, (q) => prv[q].a > 3000));
  if (rng.next() < 0.0006) disaster(S, map, 'meteor', pickProvince(S, map, () => true));
}
function pickProvince(S, map, pred) { const N = map.provinces.length; for (let i = 0; i < 40; i++) { const p = S.rng.int(N); if (pred(p)) return p; } return -1; }
export function startPlague(S, map, p) {
  const names = ['붉은 열병', '검은 기침', '잿빛 역병', '떠도는 열', '창백한 병', '하얀 반점병']; S.P.plague[p] = 8 + S.rng.int(6);
  const ow = S.P.owner[p]; addLog(S, `${S.provName[p] || '한 지방'}에서 역병 '${S.rng.pick(names)}'이(가) 퍼지기 시작했습니다.${ow >= 0 ? ' (' + S.nations[ow].name + ')' : ''}`, 2, p, ow);
  S.fxQueue.push([p, 'plague']);
}
export function disaster(S, map, kind, p) {
  if (p < 0) return; const P = S.P, prv = map.provinces; const ow = P.owner[p]; const nm = S.provName[p] || '한 지방'; const nbs = prv[p].land;
  const hit = (q, f) => { const d = P.pop[q] * f; P.pop[q] -= d; S.deaths.famine += d; };
  const info = ow >= 0 ? ` (${S.nations[ow].name})` : '';
  if (kind === 'quake') { hit(p, 0.18); if (P.city[p] > 0 && S.rng.chance(0.5)) P.city[p]--; if (P.pop[p] > 300) addLog(S, `${nm}에 대지진이 일어났습니다.${info}`, 2, p, ow); }
  else if (kind === 'volcano') { hit(p, 0.45); for (const q of nbs) hit(q, 0.1); P.fx[p] = 1.5; if (P.city[p] > 0) P.city[p]--; if (P.pop[p] > 100) addLog(S, `${nm}의 화산이 폭발했습니다.${info}`, 2, p, ow); }
  else if (kind === 'flood') { hit(p, 0.1); for (const q of nbs) if (S.rng.chance(0.5)) hit(q, 0.06); if (P.pop[p] > 800) addLog(S, `${nm} 일대에 대홍수가 났습니다.${info}`, 1, p, ow); }
  else if (kind === 'drought') { P.fx[p] = 0.35; for (const q of nbs) P.fx[q] = Math.min(P.fx[q], 0.55); if (P.pop[p] > 1500) addLog(S, `${nm} 일대에 대가뭄이 들었습니다.${info}`, 2, p, ow); if (ow >= 0) S.nations[ow].stab -= 0.04; }
  else if (kind === 'bless') { P.fx[p] = 1.6; for (const q of nbs) P.fx[q] = Math.max(P.fx[q], 1.35); addLog(S, `신의 풍요가 ${nm} 일대에 내렸습니다.`, 1, p, ow); }
  else if (kind === 'meteor') { hit(p, 0.8); for (const q of nbs) hit(q, 0.3); P.city[p] = 0; P.fx[p] = 0.6; addLog(S, `${nm}에 거대한 운석이 떨어졌습니다!${info}`, 3, p, ow); }
  S.fxQueue.push([p, kind]);
}

// ---------- 신의 권능 ----------
export function applyPower(S, map, type, p) {
  const pw = POWERS[type]; if (!pw) return { ok: false, msg: '알 수 없는 권능' };
  const P = S.P, ow = P.owner[p]; const nm = S.provName[p] || '이 땅'; let ok = true, msg = '';
  const needNation = () => { if (ow < 0) { ok = false; msg = '국가가 있는 땅에서 쓰세요'; return true; } return false; };
  switch (type) {
    case 'bless': case 'drought': case 'quake': case 'volcano': case 'meteor': disaster(S, map, type, p); break;
    case 'plague': if (P.pop[p] < 10) { ok = false; msg = '사람이 살지 않는 곳입니다'; } else startPlague(S, map, p); break;
    case 'tribe': {
      if (P.pop[p] > 5 || map.provinces[p].fert < 0.05) { ok = false; msg = '사람이 없는 비옥한 땅에서만 쓸 수 있습니다'; break; }
      const cu = newCulture(S, S.rng); const rl = newReligion(S, S.rng, cu, p, S.year); P.pop[p] = 150; P.tech[p] = Math.max(0.1, S.stats.maxT * 0.2); P.cult[p] = cu; P.rel[p] = rl; nameProvince(S, map, p);
      const n = newNation(S, map, p, null, cu, P.tech[p]); P.owner[p] = n.id; n.gov = '부족 연맹'; S.cityName[p] = genName(S.cultures[cu].lang, S.rng, 'city');
      addLog(S, `신이 ${nm}에 새 부족 ${n.name}을(를) 내려보냈습니다.`, 2, p, n.id); break; }
    case 'prophet': { if (P.pop[p] < 10) { ok = false; msg = '사람이 없는 곳입니다'; break; } const rl = newReligion(S, S.rng, P.cult[p], p, S.year); P.rel[p] = rl; for (const q of map.provinces[p].land) if (P.pop[q] > 5) P.rel[q] = rl; addLog(S, `예언자가 나타나 ${nm}에 '${S.religions[rl].name}'을(를) 전했습니다.`, 2, p, ow); break; }
    case 'hero': { if (needNation()) break; const n = S.nations[ow]; n.stab = Math.min(1, n.stab + 0.3); n.lead.sci *= 1.25; for (let q = 0; q < P.owner.length; q++) if (P.owner[q] === ow) { P.unrest[q] *= 0.5; P.tech[q] += 0.05; } addLog(S, `신의 뜻으로 ${n.name}에 영웅이 강림했습니다.`, 2, p, ow); break; }
    case 'revolt': { if (needNation()) break; const n = S.nations[ow]; if (n.pc < 2 || n.cap === p) { ok = false; msg = '수도나 단일 지방 국가에는 쓸 수 없습니다'; break; } revolt(S, map, p, n); break; }
    case 'peace': { if (needNation()) break; const ws = S.wars.filter((w) => w.A.includes(ow) || w.D.includes(ow)); if (!ws.length) { ok = false; msg = '전쟁 중이 아닙니다'; break; } for (const w of ws) endWar(S, map, w, ''); addLog(S, `평화의 신탁이 내려 ${S.nations[ow].name}의 전쟁이 멈췄습니다.`, 2, p, ow); break; }
    case 'war': { if (needNation()) break; const n = S.nations[ow]; const nb = [...neighborsOf(S, n).keys()]; if (!nb.length) { ok = false; msg = '이웃 국가가 없습니다'; break; } const m = S.nations[S.rng.pick(nb)]; n.relat[m.id] = -90; m.relat[n.id] = -90; delete S.truce[tkey(n.id, m.id)]; startWar(S, map, n, m, '(신의 속삭임)'); break; }
  }
  return { ok, msg };
}

export function autoGod(S, map) {
  const rng = S.rng, P = S.P; const alive = S.nations.filter((n) => n.alive); const total = S.stats.world || 1;
  const say = (t) => addLog(S, `[자동 신] ${t}`, 1);
  if (alive.length < 3 && total > 100) { const p = pickProvince(S, map, (q) => P.pop[q] < 2 && map.provinces[q].fert > 0.4 && map.provinces[q].a > 8000); if (p >= 0 && applyPower(S, map, 'tribe', p).ok) { say('문명이 너무 줄어 새 부족을 일으켰습니다.'); return; } }
  const big = [...alive].sort((a, b) => b.pop - a.pop)[0];
  if (big && big.pop / total > 0.38 && big.pc > 8 && rng.chance(0.5)) { let p = -1, bp = 0; for (let q = 0; q < P.owner.length; q++) if (P.owner[q] === big.id && q !== big.cap && P.unrest[q] > bp) { bp = P.unrest[q]; p = q; } if (p >= 0 && applyPower(S, map, 'revolt', p).ok) { say(`${big.name}의 독주를 견제하려 봉기를 부추겼습니다.`); return; } }
  const weak = alive.filter((n) => n.pc >= 2 && n.stab < 0.3 && n.pop > 5000);
  if (weak.length && rng.chance(0.4)) { const n = rng.pick(weak); if (applyPower(S, map, 'hero', n.cap).ok) { say(`위기에 빠진 ${n.name}에 영웅을 보냈습니다.`); return; } }
  if (S.wars.length > Math.max(3, alive.length * 0.35) && rng.chance(0.4)) { const w = rng.pick(S.wars); if (applyPower(S, map, 'peace', S.nations[w.a].cap).ok) say('너무 많은 전쟁을 멈추게 했습니다.'); }
}

// ---------- 저장/복원 ----------
const TYPED = { pop: Float32Array, tech: Float32Array, owner: Int16Array, cult: Int16Array, rel: Int16Array, unrest: Float32Array, city: Uint8Array, fx: Float32Array, km: Float32Array, plague: Uint8Array };
export function serialize(S) {
  const P = {}; for (const k of Object.keys(TYPED)) P[k] = Array.from(S.P[k], (v) => (Number.isInteger(v) ? v : Math.round(v * 1000) / 1000));
  const nations = S.nations.map((n) => { if (!n.alive) return { ...n, relat: {}, allies: [], lead: { ...n.lead } }; const r = {}; for (const k in n.relat) if (S.nations[k] && S.nations[k].alive) r[k] = Math.round(n.relat[k]); return { ...n, relat: r }; });
  const truce = {}; for (const k in S.truce) if (S.truce[k] > S.year) truce[k] = S.truce[k];
  return JSON.stringify({ ...S, P, nations, truce, rng: S.rng.s, fr: null, fxQueue: null });
}
export function restore(json) {
  const S = typeof json === 'string' ? JSON.parse(json) : json;
  if (!S.P.km) S.P.km = new Array(S.P.pop.length).fill(1);
  for (const k of Object.keys(TYPED)) S.P[k] = TYPED[k].from(S.P[k]);
  const r = new RNG(1); r.s = S.rng; S.rng = r; S.fr = null; S.fxQueue = []; S.techRate = S.techRate ?? 1;
  return S;
}
export { yearStr, numStr };
