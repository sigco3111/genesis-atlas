#!/usr/bin/env python3
"""라벨 교정 + 한국어 명칭 보강 + 출처 메타데이터(SUBJECTO/PARTOF/ABBREVN) 기반 미명명 지역 복원.
- data/era/*.json을 직접 갱신한다(멱등).
- build_eras*.py에도 동일 규칙을 반영해 재빌드 결과와 일치시킨다.
- 소유 변경이 있는 시대(1279, 1650, 1815)는 tools/hyde/pops/*.b64로 인구를 재집계한다."""
import json, base64, struct, collections, sys, os, urllib.request
sys.path.insert(0, os.path.dirname(__file__))
from konames import KO as BASE_KO
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
earth = json.load(open(f'{ROOT}/data/earth.json'))
provs = earth['provs']; deg = earth['deg']; latTop = earth['latTop']; W, H = earth['W'], earth['H']

pimg = Image.open(f'{ROOT}/data/earth_prov.png').convert('RGBA')
prov_px = collections.defaultdict(list)
pix = pimg.load()
for y in range(H):
    for x in range(W):
        r, g, b, a = pix[x, y]
        v = r | (g << 8)
        if v > 0: prov_px[v-1].append((x, y))

# ---------- 1) 연대 부정확 명칭 교정 (era-scoped, en+ko 교체) ----------
RENAMES = {
    # 1000년: 복합 국가 '덴마크-노르웨이'는 미존재 -> 덴마크 왕국(하랄드/스벤 시대).
    1000: {'Denmark-Norway': ('Kingdom of Denmark', '덴마크 왕국')},
    # 1492년: 덴마크-노르웨이 동군연합(1380-1814) 실체가 있으므로 원 명칭 유지(교정 대상 아님).
    # 메티스는 모피무역 이후 정체성 -> 근사 표기로 아니시나베(정확한 15세기 거주 집단 확정 불가).
    1492: {'Michif Piyii (Métis)': ('Anishinaabe', '아니시나베족')},
}

# ---------- 2) 한국어 명칭 (눈에 띄는/리더보드 라벨 중심) ----------
NEW_KO = {
'Japan (USA)':'일본(미군 점령)','Bangladesh':'방글라데시','Germany (USA)':'독일(미국 점령지구)',
'Germany (UK)':'독일(영국 점령지구)','Germany (Soviet)':'독일(소련 점령지구)','Tokugawa shogunate':'도쿠가와 막부',
'Shaskanka':'샤샹카(가우다)','Chalukya Empire':'찰루키아 제국','Kanauj':'커나우지','Chalukyas':'찰루키아',
'Korea (USA)':'조선(미군정)','Korea (USSR)':'조선(소련군정)','Thailand':'태국','Czechoslovakia':'체코슬로바키아',
'Kalinga':'칼링가','Ahmadnagar':'아흐마드나가르','Satavahanihara':'사타바하나','Tonkin':'통킹',
'Pandya state':'판디아 왕국','Chola Empire':'초라 제국','Mexihcah (Triple Alliance)':'멕시카 삼국동맹(아스텍)',
'Bavaria':'바이에른','Golkonda':'골콘다','Netherlands':'네덜란드','Islamic and Hindu states':'이슬람·힌두 국가들',
'Bijapur':'비자푸르','Hanover':'하노버','Bulgaria':'불가리아','Kingdom of the Two Sicilies':'양시칠리아 왕국',
'Greece':'그리스','Mesoamerican city-states and chiefdoms':'메소아메리카 도시국가·족장국',
'England and Ireland':'잉글랜드-아일랜드','Benin':'베냉 왕국','Sri Lanka':'스리랑카','Gondwana':'곤드와나',
'Malaysia':'말레이시아','Taiwan':'타이완','Austria':'오스트리아','Shogun Japan (Kamakura)':'일본(가마쿠라 막부)',
'Rajastan':'라자스탄','English territory':'잉글랜드령','Pallavas':'팔라바','Imperial Japan (Fujiwara)':'일본(후지와라 시대)',
'Ireland':'아일랜드','Cuba':'쿠바','Cambodia':'캄보디아','Kenya':'케냐','Naples':'나폴리 왕국','Iraq':'이라크',
'Cameroon':'카메룬','Castile':'카스티야','Castille':'카스티야','Sicily':'시칠리아','Gold Coast':'골드코스트',
'Ceylon':'실론','Assam':'아삼','Uganda':'우간다','Kashmir and Ladakh':'카슈미르·라다크','Ava':'아바 왕국',
'Burkina Faso':'부르키나파소','Liao':'요(거란)','Syria':'시리아','Seljuk Caliphate':'셀주크 제국',
'Hausa States':'하우사 국가들','Hong Kong':'홍콩','British East Africa':'영령 동아프리카','Kediri':'크디리',
'Palas':'팔라 제국','Bengal':'벵골','Haiti':'아이티','Yamato':'야마토','Sind':'신드','Guatemala':'과테말라',
'Guachichil':'과치칠','Burmese kingdoms':'버마 국가들','Luxembourg':'룩셈부르크','Georgia':'그루지야',
'Laos':'라오스','Sasanian dependencies':'사산조 속국','Rwanda':'르완다','East Java':'동자바','Algiers':'알제',
'Asante':'아산테','Uruguay':'우루과이','Nyasaland':'니아살랜드','Senas':'세나 왕조','Kanem-Bornu':'카넴-보르누',
'El Salvador':'엘살바도르','Buyid Emirate':'부와이흐 왕조','Cappadocia':'카파도키아','Azerbaijan':'아제르바이잔',
'Emberá/Eperara/Épera':'엠베라족','Guinea':'기니','Puerto Rico':'푸에르토리코','Dominican Republic':'도미니카 공화국',
'Senegal':'세네갈','Mataram':'마타람','Mossi States':'모시 국가들','Andean states and chiefdoms':'안데스 국가·족장국',
'Israel':'이스라엘','Lebanon':'레바논','Sierra Leone':'시에라리온','Swiss Confederation':'스위스 동맹',
'Qin':'진나라','Khmer Empire':'크메르 제국','Dutch Republic':'네덜란드 공화국','Togo':'토고',
'Dravidians':'드라비다인','Punjab':'펀자브','Burundi':'부룬디','Abdelouadides':'압드 알와디드 왕조',
'Sukhothai':'수코타이','Thai Kingdoms':'타이 국가들','Jamaica (UK)':'자메이카(영국령)','Magyars':'마자르인',
'Somalia':'소말리아','Dutch Guinea':'네덜란드령 기아나','Shan states':'샨 국가들','Funj':'푼즈 술탄국',
'León':'레온','Honduras':'온두라스','Eritrea':'에리트레아','Zayyanid Caliphate':'자야니드 왕조',
'Central African Republic':'중앙아프리카 공화국','Himyarite Kingdom':'히미야르 왕국',
'Lombard principalities':'롬바르드 공국들','Oromo':'오로모','Wattasid Caliphate':'와타스 왕조','Neustria':'네우스트리아',
'Luba':'루바 왕국','Nkore':'은코레','Albania':'알바니아','Tunis':'튀니스','Alwa':'알와',
'Sinhalese kingdoms':'싱할라 왕국들','Sinhalese kingdom':'싱할라 왕국','Malawi':'말라위','British Somaliland':'영령 소말릴란드',
'Atropatene':'아트로파테네','Maya Yucateco':'마야(유카탄)','Tekohá (Ñandeva - Avá Guaraní)':'과라니족',
'Congo':'콩고','Togoland':'토골란트','Nan Chao':'남조','Kaarta':'카르타','Liberia':'라이베리아',
'Costa Rica':'코스타리카','Lesotho':'레소토','Qataban':'카타반','Nicaragua':'니카라과','Chen-La':'진랍',
'Songhai':'송가이','French Equatorial Africa':'프랑스령 적도 아프리카','Laotian states':'라오 국가들',
'Hejaz':'헤자즈','Champa':'참파','Silla':'신라','Bhutan':'부탄','Avars':'아바르족','Panama':'파나마',
'Tripolitana (UK Lybia)':'트리폴리타니아(영국 점령)','Simhala':'심할라','Kingdom of Sardinia':'사르데냐 왕국',
'Guinea-Bissau (Portugal)':'기니비사우(포르투갈령)','Kazembe':'카젬베','Indus valley civilization':'인더스 문명',
'Lan Na':'란나','Scotland':'스코틀랜드','Italian Somaliland':'이탈리아령 소말릴란드','Crimean Khanate':'크림 칸국',
'Jordan':'요르단','Koguryo':'고구려','Wallmapu (Mapuche)':'마푸체족','Ur':'우르','Burgandy':'부르고뉴',
'Yayoi':'야요이','city-states':'도시국가들','Ainus':'아이누','Ainu':'아이누','Yanomami':'야노마미족',
'Oman':'오만','Darfur':'다르푸르','Gabon':'가봉','Gandhāra':'간다라','Wabanaki (Dawnland Confederacy)':'와바나키 연맹',
'Guyana':'가이아나','Montenegro':'몬테네그로','Sardinia':'사르데냐','Aceh':'아체','Swaziland':'스와질란드',
'Ostrogoths':'동고트','Xixia':'서하','Sikkim (Indian princely state)':'시킴','Boihaenum':'보이하이눔',
'Lithuania':'리투아니아','Cantia':'켄트','Dacia':'다키아','Celtic kingdoms':'켈트 국가들','Gambia, The':'감비아',
'Bell-shaped burials culture':'종형무덤 문화','Portuguese Guinea':'포르투갈령 기니','Nahua':'나와족',
'Empire of Ghana':'가나 제국','Slavs':'슬라브족','Norte Chico':'노르테 치코','Kingdom of Georgia':'그루지아 왕국',
'Late Jomon culture':'조몬 문화 후기','Haripunjaya':'하리푼자야','Pomeranian culture ':'포메라니아 문화',
'Martinique (France)':'마르티니크(프랑스령)','Martinique':'마르티니크','Khazars':'하자르','Suriname':'수리남',
'Malta':'몰타','Equatorial Guinea':'적도 기니','Kamarupa':'카마루파','Mwenemutapa':'므웨네무타파',
'Baltic tribes':'발트 부족들','Lunda':'룬다','Cuba (Spain)':'쿠바(스페인령)','Lumbee':'럼비족',
'Guadeloupe':'과들루프','Boe':'보에','Alans':'알란족','Guanches':'관체스','Frisians':'프리시아인',
'Kuwait':'쿠웨이트','Muscat':'무스카트','Cyprus':'키프로스','Southern Xiongnu':'남흉노',
'Kalinago (Island Carib)':'칼리나고(섬 카리브)','Hispaniola (Spain)':'히스파니올라(스페인령)',
'Netherlands Antilles':'네덜란드령 안틸레스','United Kingdom of Netherlands':'네덜란드 연합왕국',
'Dorset':'도싯 문화','Warao':'와라오','Aónikenk (Tehuelche)':'테우엘체(아오니켄크)',
'Anishinaabe':'아니시나베족','Kingdom of Denmark':'덴마크 왕국','Tunisia':'튀니지아','Brittany':'브르타뉴',
}

# ---------- 3) 출처 메타데이터 폴백으로 미명명 지역 복원 ----------
# 원칙: 픽셀 다수결이 blank이고 그 feature의 SUBJECTO/PARTOF/ABBREVN이 이름을 주는 경우에만
# 해당 이름으로 배정한다(원 파이프라인의 다수결 규칙을 해치지 않음). 이웃 조사는 하지 않는다.
SNAP = {1279: 'world_1279', 1650: 'world_1650', 1815: 'world_1815'}
POPMAP = {1279: ('1200AD', '1300AD', 0.79), 1650: ('1600AD', '1700AD', 0.5), 1815: ('1810AD', '1820AD', 0.5)}
BASE = 'https://raw.githubusercontent.com/aourednik/historical-basemaps/master/geojson/'

def load_geoms(path):
    d = json.load(open(path)); feats = []
    for f in d['features']:
        p = f.get('properties') or {}
        name = p.get('NAME')
        if name is not None and not name.strip(): name = None
        fb = None
        if name is None:
            fb = p.get('SUBJECTO') or p.get('PARTOF') or p.get('ABBREVN')
            if fb == 'Antarctica': fb = None
        g = f['geometry']
        polys = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
        minx = miny = 1e9; maxx = maxy = -1e9
        for poly in polys:
            for ring in poly:
                for x, y in ring:
                    minx = min(minx, x); maxx = max(maxx, x); miny = min(miny, y); maxy = max(maxy, y)
        feats.append({'name': name, 'fb': fb, 'polys': polys, 'bbox': (minx, miny, maxx, maxy)})
    return feats

def in_ring(lon, lat, ring):
    inside = False; j = len(ring)-1
    for i in range(len(ring)):
        xi, yi = ring[i]; xj, yj = ring[j]
        if (yi > lat) != (yj > lat) and lon < (xj-xi)*(lat-yi)/(yj-yi)+xi: inside = not inside
        j = i
    return inside

def in_feat(lon, lat, ft):
    bx0, by0, bx1, by1 = ft['bbox']
    if lon < bx0 or lon > bx1 or lat < by0 or lat > by1: return False
    for poly in ft['polys']:
        if in_ring(lon, lat, poly[0]) and not any(in_ring(lon, lat, r) for r in poly[1:]): return True
    return False

def poparr(era):
    lo, hi, frac = POPMAP[era]
    def ld(y): return struct.unpack('<2048d', base64.b64decode(open(f'{ROOT}/tools/hyde/pops/pop_{y}.b64').read()))
    a = ld(lo)
    if hi:
        b = ld(hi); return [a[i]*(1-frac)+b[i]*frac for i in range(2048)]
    return list(a)

for era, fname in SNAP.items():
    path = f'{ROOT}/data/era/{era}.json'
    d = json.load(open(path))
    os.makedirs(f'{ROOT}/tools/geo_snapshots', exist_ok=True)
    gp = f'{ROOT}/tools/geo_snapshots/{fname}.geojson'
    if not os.path.exists(gp): urllib.request.urlretrieve(BASE + fname + '.geojson', gp)
    feats = load_geoms(gp)
    owner = d['owner']; names = [c['en'] for c in d['countries']]
    reassigned = collections.Counter()
    for p in range(len(owner)):
        if owner[p] != -1 or p not in prov_px: continue
        tally = collections.Counter()
        for (x, y) in prov_px[p]:
            lon = x*deg - 180; lat = latTop - y*deg
            for ft in feats:
                if in_feat(lon, lat, ft):
                    if ft['name']: tally[('N', ft['name'])] += 1
                    elif ft['fb']: tally[('F', ft['fb'])] += 1
                    else: tally[('B',)] += 1
        if not tally: continue
        win, cnt = tally.most_common(1)[0]
        if win[0] != 'F': continue
        name = win[1]
        if name not in names:
            names.append(name)
            d['countries'].append({'ko': NEW_KO.get(name, BASE_KO.get(name, name)), 'en': name, 'pop': None, 'tech': d['tech']})
        owner[p] = names.index(name); reassigned[name] += 1
    arr = poparr(era)
    popsum = collections.Counter()
    for p, o in enumerate(owner):
        if o >= 0: popsum[o] += arr[p]
    for i, c in enumerate(d['countries']):
        v = popsum.get(i, 0)
        c['pop'] = int(round(v)) if v > 0 else None
    json.dump(d, open(path, 'w'), ensure_ascii=False, separators=(',', ':'))
    print(era, 'fallback-restored:', dict(reassigned))

# ---------- 4) 전 시대 라벨 교정 + 한국어 적용 ----------
import glob
for f in glob.glob(f'{ROOT}/data/era/*.json'):
    d = json.load(open(f)); yr = d['year']
    for c in d['countries']:
        en = c.get('en') or ''
        if yr in RENAMES and en in RENAMES[yr]:
            c['en'], c['ko'] = RENAMES[yr][en]; en = c['en']
        if en in NEW_KO: c['ko'] = NEW_KO[en]
        elif en in BASE_KO: c['ko'] = BASE_KO[en]
    json.dump(d, open(f, 'w'), ensure_ascii=False, separators=(',', ':'))

# ---------- 5) konames.py 갱신 ----------
merged = dict(BASE_KO); merged.update(NEW_KO)
with open(f'{ROOT}/tools/konames.py', 'w') as fo:
    fo.write('# historical-basemaps NAME -> 한국어 표기. fix_labels.py가 갱신.\nKO = {\n')
    for k in sorted(merged, key=str.casefold):
        fo.write(f'{k!r}: {merged[k]!r},\n')
    fo.write('}\n')
print('done; KO size', len(merged))
