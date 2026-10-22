#!/usr/bin/env python3
"""시대별 시나리오 데이터 빌드: historical-basemaps(GPL-3.0) 스냅샷 -> data/era/<year>.json
배정 규칙: 주(state) 토지 픽셀 다수결 -> 미배정(0히트) 주는 최대 4셀 이웃 조사 -> 그래도 없으면 -1(미확인/무주)
인구(pop)는 HYDE 연동 전까지 null. 인구 없는 배포는 하지 않는다."""
import json, collections, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from konames import KO
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
earth = json.load(open(f'{ROOT}/data/earth.json'))
provs = earth['provs']; deg=earth['deg']; latTop=earth['latTop']; W,H=earth['W'],earth['H']

pimg = Image.open(f'{ROOT}/data/earth_prov.png').convert('RGBA')
prov_px = collections.defaultdict(list)
pix = pimg.load()
for y in range(H):
    for x in range(W):
        r,g,b,a = pix[x,y]
        v = r | (g<<8)
        if v>0: prov_px[v-1].append((x,y))

def load_geoms(path):
    d = json.load(open(path))
    feats = []
    for f in d['features']:
        props = f['properties'] or {}
        name = props.get('NAME')
        if name is not None and not name.strip(): name = None
        g = f['geometry']
        polys = g['coordinates'] if g['type']=='MultiPolygon' else [g['coordinates']]
        minx=miny=1e9; maxx=maxy=-1e9
        for poly in polys:
            for ring in poly:
                for x,y in ring:
                    minx=min(minx,x); maxx=max(maxx,x); miny=min(miny,y); maxy=max(maxy,y)
        feats.append({'name':name,'polys':polys,'bbox':(minx,miny,maxx,maxy)})
    return feats

def in_ring(lon,lat,ring):
    inside=False; j=len(ring)-1
    for i in range(len(ring)):
        xi,yi=ring[i]; xj,yj=ring[j]
        if (yi>lat)!=(yj>lat) and lon < (xj-xi)*(lat-yi)/(yj-yi)+xi: inside=not inside
        j=i
    return inside

def in_feat(lon,lat,ft):
    bx0,by0,bx1,by1=ft['bbox']
    if lon<bx0 or lon>bx1 or lat<by0 or lat>by1: return False
    for poly in ft['polys']:
        if in_ring(lon,lat,poly[0]) and not any(in_ring(lon,lat,r) for r in poly[1:]): return True
    return False

ERAS = [
 (-10000,'world_bc10000','기원전 10000년 — 신석기의 새벽',0.3),
 (-3000,'world_bc3000','기원전 3000년 — 최초의 문명',1.1),
 (-500,'world_bc500','기원전 500년 — 고전 문명의 시대',2.6),
 (-323,'world_bc323','기원전 323년 — 알렉산드로스의 시대',2.9),
 (100,'world_100','서기 100년 — 로마와 한의 전성기',3.3),
 (600,'world_600','서기 600년 — 고대 제국들의 세계',3.8),
 (1000,'world_1000','서기 1000년 — 송과 바이킹의 시대',4.2),
 (1279,'world_1279','서기 1279년 — 몽골 제국의 전성기',4.6),
 (1492,'world_1492','서기 1492년 — 콜럼버스의 항해',4.9),
 (1650,'world_1650','서기 1650년 — 화약 제국의 시대',5.3),
 (1815,'world_1815','서기 1815년 — 나폴레옹 이후의 세계',6.2),
 (1914,'world_1914','서기 1914년 — 제1차 세계대전 전야',6.8),
 (1945,'world_1945','서기 1945년 — 제2차 세계대전 종전',7.2),
]

def assign(feats):
    grid = collections.defaultdict(list)
    for ft in feats:
        bx0,by0,bx1,by1=ft['bbox']
        for cx in range(int(bx0//20), int(bx1//20)+1):
            for cy in range(int(by0//20), int(by1//20)+1):
                grid[(cx,cy)].append(ft)
    def hit_at(lon,lat):
        for ft in grid.get((int(lon//20),int(lat//20)),[]):
            if in_feat(lon,lat,ft): return ft
        return None
    owner=[]; stats=collections.Counter()
    for pid in range(len(provs)):
        pxs = prov_px.get(pid,[])
        if not pxs: owner.append(None); continue
        step = max(1, len(pxs)//48)
        tally = collections.Counter(); tot=0; hits=0
        for (x,y) in pxs[::step]:
            lon,lat = x*deg-180, latTop-y*deg
            ft = hit_at(lon,lat)
            tot+=1
            if ft: tally[ft['name'] if ft['name'] else ''] += 1; hits+=1
        if hits and tally:
            name,cnt = tally.most_common(1)[0]
            if cnt/max(1,tot) >= 0.4 or (cnt >= 2*(tot-hits) and cnt/max(1,tot) >= 0.25):
                owner.append(name); stats['assigned' if name else 'unclaimed']+=1; continue
        # 0히트/불명확: 최대 4셀 이웃 픽셀 조사
        nb = collections.Counter()
        for (x,y) in pxs[::step]:
            for dy in range(-4,5):
                for dx in range(-4,5):
                    if dx*dx+dy*dy>16: continue
                    ft = hit_at((x+dx)*deg-180, latTop-(y+dy)*deg)
                    if ft: nb[ft['name'] if ft['name'] else ''] += 1
        if nb:
            name,cnt = nb.most_common(1)[0]
            if cnt >= max(2, sum(nb.values())*0.5):
                owner.append(name); stats['neighbor' if name else 'neighbor_unclaimed']+=1; continue
        owner.append(None); stats['gap']+=1
    return owner, stats


import urllib.request
def ensure_snapshots():
    os.makedirs(f'{ROOT}/tools/geo_snapshots', exist_ok=True)
    base = 'https://raw.githubusercontent.com/aourednik/historical-basemaps/master/geojson/'
    for _, fname, _, _ in ERAS:
        p = f'{ROOT}/tools/geo_snapshots/{fname}.geojson'
        if not os.path.exists(p):
            print('downloading', fname); urllib.request.urlretrieve(base + fname + '.geojson', p)

ensure_snapshots()
report = {}
for year, fname, label, tech in ERAS:
    feats = load_geoms(f'{ROOT}/tools/geo_snapshots/{fname}.geojson')
    owner, stats = assign(feats)
    names = []
    idx = {}
    out_owner = []
    for o in owner:
        if o is None: out_owner.append(-1); continue
        if o not in idx:
            idx[o] = len(names); names.append({'ko': KO.get(o, o), 'en': o, 'pop': None, 'tech': tech})
        out_owner.append(idx[o])
    data = {'year': year, 'label': label, 'tech': tech, 'countries': names, 'owner': out_owner}
    with open(f'{ROOT}/data/era/{year}.json','w') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',',':'))
    ko_cov = sum(1 for n in names if n['en'] in KO)
    report[year] = {'polities': len(names), 'ko': ko_cov, 'gap_provs': stats['gap'], 'stats': dict(stats)}
    print(f"{year}: polities={len(names)} ko_names={ko_cov}/{len(names)} gap={stats['gap']} {dict(stats)}")
json.dump(report, open(f'{ROOT}/tools/era_report.json','w'), ensure_ascii=False, indent=1)
