// 문화별 가상 언어: 국가/도시/종교 이름 생성
const ONSET = ['카','르','미','타','로','하','사','벨','누','아','이','젤','코','마','델','파','시','바','돈','란','에','오','우','그','크','트','브','나','라','무','소','자','제','세','네','도','고','보','레','페','헤','디','키','리','피','비','투','쿠','수','루','모','노','호','조','초','엘','안','알','오르','에르','하르','카르','바르','테르','살','칼','발','달','말','할','잔','칸','단','만','한','탄','간','밤','람','남','감','람','신','진','킨','린','딘','빈','민','힌','틴','긴'];
const END = ['니아','리아','스탄','랜드','가르','덴','란트','시아','르','스','온','드','나','타','라','안','엔','아','우르','이아','가드','부르크','하임','카','마','라크','샤르','도르','벨','칸'];
const CITY_END = ['','','','시','폴','항','성','부르','도','빌','포트','벨','아','온','스','르','나'];
const REL_END = ['교','신앙','도','의 길','의 가르침','신교'];
const COLORS = [];
export function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360; s /= 100; l /= 100;
  const f = (n) => { const k = (n + h * 12) % 12; const a = s * Math.min(l, 1 - l); return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
  return [f(0), f(8), f(4)];
}
export function makeLang(rng) {
  const pick = (arr, n) => { const out = []; while (out.length < n) { const x = rng.pick(arr); if (!out.includes(x)) out.push(x); } return out; };
  return { on: pick(ONSET, 9 + rng.int(4)), en: pick(END, 3 + rng.int(2)), ce: pick(CITY_END, 4) };
}
export function genName(lang, rng, kind = 'nation') {
  const n = kind === 'nation' ? 1 + rng.int(2) : 1 + rng.int(2);
  let s = ''; for (let i = 0; i < n; i++) s += rng.pick(lang.on);
  if (kind === 'nation') s += rng.pick(lang.en);
  else if (kind === 'city') s += rng.pick(lang.ce);
  else if (kind === 'person') { s += rng.pick(lang.on); }
  else s += rng.pick(lang.en);
  return s;
}
export function genReligion(lang, rng) { return genName(lang, rng, 'city').replace(/(시|폴|항|성|부르|도|빌|포트)$/, '') + rng.pick(REL_END); }
export function genCultureName(lang, rng) { return genName(lang, rng, 'nation').replace(/(랜드|하임|부르크|가드)$/, '') + '인'; }
export const ERA_NAMES = ['석기 시대', '청동기 시대', '철기 시대', '고전 시대', '중세', '근세', '산업 시대', '현대', '정보화 시대', '우주 시대'];
export const ERA_SHORT = ['석기', '청동기', '철기', '고전', '중세', '근세', '산업', '현대', '정보', '우주'];
export function yearStr(y) { y = Math.round(y); return y <= 0 ? `기원전 ${(1 - y).toLocaleString('ko-KR')}년` : `서기 ${y.toLocaleString('ko-KR')}년`; }
export function numStr(n) { n = Math.round(n); if (n >= 1e8) return (n / 1e8).toFixed(n >= 1e9 ? 1 : 2) + '억'; if (n >= 1e4) return (n / 1e4).toFixed(n >= 1e6 ? 0 : 1) + '만'; return n.toLocaleString('ko-KR'); }
