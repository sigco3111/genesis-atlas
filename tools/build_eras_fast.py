#!/usr/bin/env python3
"""최적화 버전: 반해상도(640x256) 히트 래스터를 시대당 한 번 만들고 재사용."""
import json, collections, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from konames import KO
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
earth = json.load(open(f'{ROOT}/data/earth.json'))
provs = earth['provs']; deg=earth['deg']; latTop=earth['latTop']; W,H=earth['W'],earth['H']
RW,RH = W//2, H//2

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

def build_raster(feats):
    grid = collections.defaultdict(list)
    for i,ft in enumerate(feats):
        bx0,by0,bx1,by1=ft['bbox']
        for cx in range(int(bx0//10), int(bx1//10)+1):
            for cy in range(int(by0//10), int(by1//10)+1):
                grid[(cx,cy)].append(i)
    # raster cell -> feature index or ''(unclaimed) or None(no polygon)
    rast = [None]*(RW*RH)
    for ry in range(RH):
        lat = latTop-(ry*2+1)*deg
        for rx in range(RW):
            lon = (rx*2+1)*deg-180
            for i in grid.get((int(lon//10),int(lat//10)),[]):
                if in_feat(lon,lat,feats[i]):
                    rast[ry*RW+rx] = feats[i]['name'] if feats[i]['name'] else ''
                    break
    return rast

ERAS = {
 '1650': ('world_1650','서기 1650년 — 화약 제국의 시대',5.3),
 '1815': ('world_1815','서기 1815년 — 나폴레옹 이후의 세계',6.2),
 '1914': ('world_1914','서기 1914년 — 제1차 세계대전 전야',6.8),
 '1945': ('world_1945','서기 1945년 — 제2차 세계대전 종전',7.2),
}
only = sys.argv[1:] or list(ERAS)
for ys in only:
    fname,label,tech = ERAS[ys]
    year = int(ys)
    feats = load_geoms(f'{ROOT}/tools/geo_snapshots/{fname}.geojson')
    rast = build_raster(feats)
    def cell(x,y):
        rx,ry = min(RW-1,max(0,x//2)), min(RH-1,max(0,y//2))
        return rast[ry*RW+rx]
    owner=[]; stats=collections.Counter()
    for pid in range(len(provs)):
        pxs = prov_px.get(pid,[])
        if not pxs: owner.append(None); continue
        step = max(1, len(pxs)//48)
        tally = collections.Counter(); tot=0; hits=0
        for (x,y) in pxs[::step]:
            v = cell(x,y); tot+=1
            if v is not None: tally[v]+=1; hits+=1
        if hits and tally:
            name,cnt = tally.most_common(1)[0]
            if cnt/max(1,tot) >= 0.4 or (cnt >= 2*(tot-hits) and cnt/max(1,tot) >= 0.25):
                owner.append(name); stats['assigned' if name else 'unclaimed']+=1; continue
        nb = collections.Counter()
        for (x,y) in pxs[::step]:
            for dy in range(-4,5,2):
                for dx in range(-4,5,2):
                    if dx*dx+dy*dy>16: continue
                    v = cell(x+dx,y+dy)
                    if v is not None: nb[v]+=1
        if nb:
            name,cnt = nb.most_common(1)[0]
            if cnt >= max(2, sum(nb.values())*0.5):
                owner.append(name); stats['neighbor' if name else 'neighbor_unclaimed']+=1; continue
        owner.append(None); stats['gap']+=1
    names=[]; idx={}; out=[]
    for o in owner:
        if o is None: out.append(-1); continue
        if o not in idx: idx[o]=len(names); names.append({'ko':KO.get(o,o),'en':o,'pop':None,'tech':tech})
        out.append(idx[o])
    json.dump({'year':year,'label':label,'tech':tech,'countries':names,'owner':out},
              open(f'{ROOT}/data/era/{year}.json','w'), ensure_ascii=False, separators=(',',':'))
    ko=sum(1 for n in names if n['en'] in KO)
    print(f"{year}: polities={len(names)} ko={ko}/{len(names)} {dict(stats)}")
