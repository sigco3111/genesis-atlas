import fs from 'node:fs'; import zlib from 'node:zlib';
export function decodePNG(path) {
  const b = fs.readFileSync(path); let o = 8; let W, H, ct, bd; const idat = [];
  while (o < b.length) { const len = b.readUInt32BE(o); const type = b.toString('ascii', o + 4, o + 8); const d = b.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') { W = d.readUInt32BE(0); H = d.readUInt32BE(4); bd = d[8]; ct = d[9]; } else if (type === 'IDAT') idat.push(d); o += 12 + len; }
  const raw = zlib.inflateSync(Buffer.concat(idat)); const bpp = ct === 2 ? 3 : ct === 6 ? 4 : 1; const stride = W * bpp; const out = Buffer.alloc(W * H * 4);
  let prev = Buffer.alloc(stride), pos = 0;
  for (let y = 0; y < H; y++) { const f = raw[pos++]; const line = Buffer.from(raw.subarray(pos, pos + stride)); pos += stride;
    for (let i = 0; i < stride; i++) { const a = i >= bpp ? line[i - bpp] : 0, c = i >= bpp ? prev[i - bpp] : 0, up = prev[i];
      let v = line[i]; if (f === 1) v += a; else if (f === 2) v += up; else if (f === 3) v += (a + up) >> 1; else if (f === 4) { const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? up : c; } line[i] = v & 255; }
    for (let x = 0; x < W; x++) { const j = (y * W + x) * 4; if (bpp >= 3) { out[j] = line[x * bpp]; out[j + 1] = line[x * bpp + 1]; out[j + 2] = line[x * bpp + 2]; out[j + 3] = 255; } else { out[j] = out[j + 1] = out[j + 2] = line[x]; out[j + 3] = 255; } }
    prev = line; }
  return out;
}
export async function loadEarthNode(dir) {
  const { buildEarth } = await import('../js/world.js');
  const meta = JSON.parse(fs.readFileSync(dir + '/earth.json', 'utf8'));
  return buildEarth(decodePNG(dir + '/earth_elev.png'), decodePNG(dir + '/earth_prov.png'), meta);
}
