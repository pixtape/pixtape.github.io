'use strict';
/* Kodlayıcılar: renk azaltma (palet), GIF, PNG (indeksli / kayıpsız), ZIP, SSIM kalite ölçümü
   GIF oluşturucu ve resim sıkıştırıcı tarafından kullanılır. */
(() => {
  const E = App.enc = {};

  /* ------------------------------------------------ CRC32 / Adler */
  const CRC = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c >>> 0; }
  E.crc32 = (buf, crc = 0) => {
    crc = ~crc >>> 0;
    for (let i = 0; i < buf.length; i++) crc = CRC[(crc ^ buf[i]) & 255] ^ (crc >>> 8);
    return ~crc >>> 0;
  };

  /* ------------------------------------------------ renk azaltma
     Medyan kesme + ağırlıklı k-ortalama iyileştirmesi; isteğe bağlı Floyd-Steinberg titreşimi.
     Saydamlık da (alfa) dikkate alınır: PNG için yarı saydam renkler korunur. */
  // pixels: Uint8ClampedArray RGBA; döndürür { palette: [[r,g,b,a]...], index: Uint8Array }
  E.quantize = (pixels, maxColors = 256, o = {}) => {
    const n = pixels.length / 4;
    const alphaMode = o.alpha || 'full'; // 'full' | 'binary' (GIF) | 'none'
    // 1) histogram (5 bit renk, 4 bit alfa)
    const bins = new Map();
    for (let i = 0; i < n; i++) {
      const p = i * 4;
      let a = pixels[p + 3];
      if (alphaMode === 'binary' || alphaMode === 'none') { if (a < 128) { if (alphaMode === 'binary') continue; } a = 255; }
      if (a === 0) continue;
      const key = ((pixels[p] >> 3) << 14) | ((pixels[p + 1] >> 3) << 9) | ((pixels[p + 2] >> 3) << 4) | (a >> 4);
      let b = bins.get(key);
      if (!b) { b = [0, 0, 0, 0, 0]; bins.set(key, b); }
      b[0] += pixels[p]; b[1] += pixels[p + 1]; b[2] += pixels[p + 2]; b[3] += a; b[4]++;
    }
    const pts = [];
    for (const b of bins.values()) pts.push([b[0] / b[4], b[1] / b[4], b[2] / b[4], b[3] / b[4], b[4]]);
    let pal;
    if (pts.length <= maxColors) pal = pts.map(p => [p[0], p[1], p[2], p[3]]);
    else {
      // 2) medyan kesme: en büyük (ağırlıklı varyans) kutuyu böl
      const boxStat = list => {
        let w = 0; const m = [0, 0, 0, 0];
        for (const p of list) { w += p[4]; for (let c = 0; c < 4; c++) m[c] += p[c] * p[4]; }
        for (let c = 0; c < 4; c++) m[c] /= w;
        const v = [0, 0, 0, 0];
        for (const p of list) for (let c = 0; c < 4; c++) v[c] += (p[c] - m[c]) ** 2 * p[4];
        // insan gözü yeşile daha duyarlı
        v[0] *= 0.9; v[1] *= 1.2; v[2] *= 0.7; v[3] *= 1.5;
        let ax = 0; for (let c = 1; c < 4; c++) if (v[c] > v[ax]) ax = c;
        return { list, w, m, score: v[ax], ax };
      };
      const boxes = [boxStat(pts)];
      while (boxes.length < maxColors) {
        let bi = -1, best = 0;
        for (let i = 0; i < boxes.length; i++) if (boxes[i].list.length > 1 && boxes[i].score > best) { best = boxes[i].score; bi = i; }
        if (bi < 0) break;
        const B = boxes[bi], ax = B.ax;
        B.list.sort((a, b) => a[ax] - b[ax]);
        let acc = 0, cut = 1;
        for (let i = 0; i < B.list.length; i++) { acc += B.list[i][4]; if (acc >= B.w / 2) { cut = Math.max(1, Math.min(B.list.length - 1, i)); break; } }
        boxes.splice(bi, 1, boxStat(B.list.slice(0, cut)), boxStat(B.list.slice(cut)));
      }
      pal = boxes.map(b => b.m.slice());
      // 3) k-ortalama iyileştirmesi (histogram üzerinde, hızlı)
      for (let it = 0; it < (o.refine == null ? 4 : o.refine); it++) {
        const acc = pal.map(() => [0, 0, 0, 0, 0]);
        for (const p of pts) {
          let bi = 0, bd = Infinity;
          for (let j = 0; j < pal.length; j++) {
            const q = pal[j], d = (p[0] - q[0]) ** 2 * 0.9 + (p[1] - q[1]) ** 2 * 1.2 + (p[2] - q[2]) ** 2 * 0.7 + (p[3] - q[3]) ** 2 * 1.5;
            if (d < bd) { bd = d; bi = j; }
          }
          const a = acc[bi];
          for (let c = 0; c < 4; c++) a[c] += p[c] * p[4];
          a[4] += p[4];
        }
        acc.forEach((a, j) => { if (a[4]) pal[j] = [a[0] / a[4], a[1] / a[4], a[2] / a[4], a[3] / a[4]]; });
      }
    }
    pal = pal.map(c => c.map(v => Math.max(0, Math.min(255, Math.round(v)))));
    if (alphaMode === 'binary') pal.forEach(c => { c[3] = 255; });
    return { palette: pal, index: E.mapPixels(pixels, pal, o) };
  };

  // Pikselleri palete eşle (önbellekli en yakın renk; isteğe bağlı titreşim)
  E.mapPixels = (pixels, pal, o = {}) => {
    const n = pixels.length / 4, w = o.width || n, h = Math.ceil(n / w);
    const out = new Uint8Array(n);
    const alphaMode = o.alpha || 'full', tIndex = o.transparentIndex;
    const cache = new Map();
    const P = pal.map(c => c.slice());
    const nearest = (r, g, b, a) => {
      const key = ((r >> 2) << 18) | ((g >> 2) << 12) | ((b >> 2) << 6) | (a >> 2);
      let v = cache.get(key);
      if (v !== undefined) return v;
      let bd = Infinity;
      for (let j = 0; j < P.length; j++) {
        if (j === tIndex) continue;
        const q = P[j], d = (r - q[0]) ** 2 * 0.9 + (g - q[1]) ** 2 * 1.2 + (b - q[2]) ** 2 * 0.7 + (a - q[3]) ** 2 * 1.5;
        if (d < bd) { bd = d; v = j; }
      }
      cache.set(key, v);
      return v;
    };
    const dither = o.dither ? Math.min(1, o.dither) : 0;
    if (!dither) {
      for (let i = 0; i < n; i++) {
        const p = i * 4;
        let a = pixels[p + 3];
        if (alphaMode !== 'full') { if (a < 128 && tIndex != null) { out[i] = tIndex; continue; } a = 255; }
        out[i] = nearest(pixels[p], pixels[p + 1], pixels[p + 2], a);
      }
      return out;
    }
    // Floyd-Steinberg (yılan yönlü), hata satır tamponlarında
    let cur = new Float32Array((w + 2) * 4), nxt = new Float32Array((w + 2) * 4);
    for (let y = 0; y < h; y++) {
      const rev = y & 1;
      for (let xx = 0; xx < w; xx++) {
        const x = rev ? w - 1 - xx : xx, i = y * w + x;
        if (i >= n) break;
        const p = i * 4, e = (x + 1) * 4;
        let a = pixels[p + 3];
        if (alphaMode !== 'full') { if (a < 128 && tIndex != null) { out[i] = tIndex; continue; } a = 255; }
        const r = Math.max(0, Math.min(255, pixels[p] + cur[e])), g = Math.max(0, Math.min(255, pixels[p + 1] + cur[e + 1])),
          b = Math.max(0, Math.min(255, pixels[p + 2] + cur[e + 2])), al = alphaMode === 'full' ? Math.max(0, Math.min(255, a + cur[e + 3])) : 255;
        const j = nearest(r | 0, g | 0, b | 0, al | 0);
        out[i] = j;
        const q = P[j], er = [(r - q[0]) * dither, (g - q[1]) * dither, (b - q[2]) * dither, alphaMode === 'full' ? (al - q[3]) * dither : 0];
        const d1 = rev ? -4 : 4;
        for (let c = 0; c < 4; c++) {
          cur[e + d1 + c] += er[c] * 7 / 16;
          nxt[e - d1 + c] += er[c] * 3 / 16;
          nxt[e + c] += er[c] * 5 / 16;
          nxt[e + d1 + c] += er[c] / 16;
        }
      }
      const t = cur; cur = nxt; nxt = t; nxt.fill(0);
    }
    return out;
  };

  /* ------------------------------------------------ bayt yazıcı */
  class Bytes {
    constructor(size = 1 << 16) { this.a = new Uint8Array(size); this.n = 0; }
    grow(k) { if (this.n + k <= this.a.length) return; let s = this.a.length * 2; while (s < this.n + k) s *= 2; const b = new Uint8Array(s); b.set(this.a.subarray(0, this.n)); this.a = b; }
    u8(v) { this.grow(1); this.a[this.n++] = v & 255; }
    u16le(v) { this.u8(v); this.u8(v >> 8); }
    u32be(v) { this.u8(v >>> 24); this.u8(v >>> 16); this.u8(v >>> 8); this.u8(v); }
    u32le(v) { this.u8(v); this.u8(v >>> 8); this.u8(v >>> 16); this.u8(v >>> 24); }
    bytes(b) { this.grow(b.length); this.a.set(b, this.n); this.n += b.length; }
    str(s) { for (let i = 0; i < s.length; i++) this.u8(s.charCodeAt(i)); }
    out() { return this.a.slice(0, this.n); }
  }
  E.Bytes = Bytes;

  /* ------------------------------------------------ GIF */
  const lzw = (W, idx, minCode) => {
    const clear = 1 << minCode, eoi = clear + 1;
    let size = minCode + 1, next = eoi + 1;
    const dict = new Map();
    let cur = 0, bits = 0;
    const block = new Uint8Array(255); let bn = 0;
    const flushByte = v => { block[bn++] = v; if (bn === 255) { W.u8(255); W.bytes(block); bn = 0; } };
    const write = code => {
      cur |= code << bits; bits += size;
      while (bits >= 8) { flushByte(cur & 255); cur >>>= 8; bits -= 8; }
    };
    W.u8(minCode);
    write(clear);
    let prefix = idx[0];
    for (let i = 1; i < idx.length; i++) {
      const k = idx[i], key = (prefix << 8) | k, v = dict.get(key);
      if (v !== undefined) { prefix = v; continue; }
      write(prefix);
      if (next < 4096) {
        if (next >= (1 << size) && size < 12) size++;
        dict.set(key, next++);
      } else {
        write(clear);
        dict.clear(); next = eoi + 1; size = minCode + 1;
      }
      prefix = k;
    }
    write(prefix);
    if (next >= (1 << size) && size < 12) size++;
    write(eoi);
    if (bits > 0) flushByte(cur & 255);
    if (bn) { W.u8(bn); W.bytes(block.subarray(0, bn)); }
    W.u8(0);
  };

  // frames: [{ index: Uint8Array, x, y, w, h, delay (ms), transparent (indeks|null), dispose, palette? }]
  E.gif = ({ width, height, palette, frames, loop = 0 }) => {
    const W = new Bytes(1 << 20);
    const palBits = p => Math.max(1, Math.ceil(Math.log2(Math.max(2, p.length))));
    W.str('GIF89a');
    W.u16le(width); W.u16le(height);
    const gb = palette ? palBits(palette) : 0;
    W.u8(palette ? 0x80 | ((gb - 1) << 4) | (gb - 1) : 0);
    W.u8(0); W.u8(0);
    const table = (p, b) => { for (let i = 0; i < (1 << b); i++) { const c = p[i] || [0, 0, 0]; W.u8(c[0]); W.u8(c[1]); W.u8(c[2]); } };
    if (palette) table(palette, gb);
    if (loop !== null && loop !== undefined && loop >= 0) {
      W.u8(0x21); W.u8(0xff); W.u8(11); W.str('NETSCAPE2.0'); W.u8(3); W.u8(1); W.u16le(loop); W.u8(0);
    }
    for (const f of frames) {
      W.u8(0x21); W.u8(0xf9); W.u8(4);
      const tr = f.transparent != null;
      W.u8(((f.dispose || 0) << 2) | (tr ? 1 : 0));
      W.u16le(Math.round((f.delay || 100) / 10)); W.u8(tr ? f.transparent : 0); W.u8(0);
      W.u8(0x2c); W.u16le(f.x || 0); W.u16le(f.y || 0); W.u16le(f.w); W.u16le(f.h);
      const lp = f.palette, lb = lp ? palBits(lp) : gb;
      W.u8(lp ? 0x80 | (lb - 1) : 0);
      if (lp) table(lp, lb);
      lzw(W, f.index, Math.max(2, lb));
    }
    W.u8(0x3b);
    return new Blob([W.out()], { type: 'image/gif' });
  };

  /* ------------------------------------------------ zlib (tarayıcının yerleşik sıkıştırıcısı) */
  E.deflate = async data => new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());

  /* ------------------------------------------------ PNG */
  const chunk = (W, type, data) => {
    W.u32be(data.length);
    const t = new Uint8Array(4 + data.length);
    for (let i = 0; i < 4; i++) t[i] = type.charCodeAt(i);
    t.set(data, 4);
    W.bytes(t);
    W.u32be(E.crc32(t));
  };
  const ihdr = (w, h, depth, ctype) => {
    const b = new Bytes(13); b.u32be(w); b.u32be(h); b.u8(depth); b.u8(ctype); b.u8(0); b.u8(0); b.u8(0);
    return b.out();
  };
  const pngFile = async (w, h, depth, ctype, raw, extra) => {
    const W = new Bytes(raw.length / 2 + 1024);
    W.bytes([137, 80, 78, 71, 13, 10, 26, 10]);
    chunk(W, 'IHDR', ihdr(w, h, depth, ctype));
    if (extra) extra(W);
    chunk(W, 'IDAT', await E.deflate(raw));
    chunk(W, 'IEND', new Uint8Array(0));
    return new Blob([W.out()], { type: 'image/png' });
  };
  E.pngChunk = chunk;

  // İndeksli PNG (palet ≤ 256 renk; az renkte 1/2/4 bit)
  E.pngIndexed = async (w, h, palette, index) => {
    const n = palette.length, depth = n <= 2 ? 1 : n <= 4 ? 2 : n <= 16 ? 4 : 8;
    const rowBytes = Math.ceil(w * depth / 8), raw = new Uint8Array((rowBytes + 1) * h);
    const per = 8 / depth;
    for (let y = 0; y < h; y++) {
      const o = y * (rowBytes + 1);
      raw[o] = 0;
      if (depth === 8) raw.set(index.subarray(y * w, y * w + w), o + 1);
      else for (let x = 0; x < w; x++) raw[o + 1 + ((x / per) | 0)] |= index[y * w + x] << ((per - 1 - (x % per)) * depth);
    }
    const hasA = palette.some(c => c[3] < 255);
    return pngFile(w, h, depth, 3, raw, W => {
      const p = new Uint8Array(n * 3);
      palette.forEach((c, i) => { p[i * 3] = c[0]; p[i * 3 + 1] = c[1]; p[i * 3 + 2] = c[2]; });
      chunk(W, 'PLTE', p);
      if (hasA) {
        let last = n - 1; while (last > 0 && palette[last][3] === 255) last--;
        chunk(W, 'tRNS', Uint8Array.from(palette.slice(0, last + 1).map(c => c[3])));
      }
    });
  };

  // Kayıpsız PNG (RGB veya RGBA) - satır başına en iyi süzgeç seçilir
  E.pngLossless = async (img, w, h) => {
    const d = img;
    let alpha = false;
    for (let i = 3; i < d.length; i += 4) if (d[i] < 255) { alpha = true; break; }
    const bpp = alpha ? 4 : 3, stride = w * bpp;
    const rows = new Uint8Array(stride * h);
    for (let i = 0, j = 0; i < d.length; i += 4) { rows[j++] = d[i]; rows[j++] = d[i + 1]; rows[j++] = d[i + 2]; if (alpha) rows[j++] = d[i + 3]; }
    const raw = new Uint8Array((stride + 1) * h);
    const cand = [0, 1, 2, 3, 4].map(() => new Uint8Array(stride));
    for (let y = 0; y < h; y++) {
      const cur = rows.subarray(y * stride, y * stride + stride), up = y ? rows.subarray((y - 1) * stride, y * stride) : null;
      let best = 0, bestS = Infinity;
      for (let f = 0; f < 5; f++) {
        const o = cand[f]; let s = 0;
        for (let i = 0; i < stride; i++) {
          const a = i >= bpp ? cur[i - bpp] : 0, b = up ? up[i] : 0, c = up && i >= bpp ? up[i - bpp] : 0;
          let pr;
          if (f === 0) pr = 0; else if (f === 1) pr = a; else if (f === 2) pr = b; else if (f === 3) pr = (a + b) >> 1;
          else { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
          const v = (cur[i] - pr) & 255;
          o[i] = v; s += v < 128 ? v : 256 - v;
          if (s >= bestS) break;
        }
        if (s < bestS) { bestS = s; best = f; }
      }
      raw[y * (stride + 1)] = best;
      raw.set(cand[best], y * (stride + 1) + 1);
    }
    return pngFile(w, h, 8, alpha ? 6 : 2, raw);
  };

  /* ------------------------------------------------ ZIP (sıkıştırmasız; resimler zaten sıkıştırılmış) */
  E.zip = async files => {
    const W = new Bytes(1 << 20), central = [], enc = new TextEncoder();
    const dt = new Date(), dosT = (dt.getHours() << 11) | (dt.getMinutes() << 5) | (dt.getSeconds() >> 1), dosD = ((dt.getFullYear() - 1980) << 9) | ((dt.getMonth() + 1) << 5) | dt.getDate();
    for (const f of files) {
      const data = new Uint8Array(await f.blob.arrayBuffer()), name = enc.encode(f.name), crc = E.crc32(data), off = W.n;
      W.u32le(0x04034b50); W.u16le(20); W.u16le(0x0800); W.u16le(0); W.u16le(dosT); W.u16le(dosD);
      W.u32le(crc); W.u32le(data.length); W.u32le(data.length); W.u16le(name.length); W.u16le(0);
      W.bytes(name); W.bytes(data);
      central.push({ name, crc, size: data.length, off });
    }
    const cStart = W.n;
    for (const c of central) {
      W.u32le(0x02014b50); W.u16le(20); W.u16le(20); W.u16le(0x0800); W.u16le(0); W.u16le(dosT); W.u16le(dosD);
      W.u32le(c.crc); W.u32le(c.size); W.u32le(c.size); W.u16le(c.name.length); W.u16le(0); W.u16le(0); W.u16le(0); W.u16le(0); W.u32le(0); W.u32le(c.off);
      W.bytes(c.name);
    }
    const cSize = W.n - cStart;
    W.u32le(0x06054b50); W.u16le(0); W.u16le(0); W.u16le(central.length); W.u16le(central.length); W.u32le(cSize); W.u32le(cStart); W.u16le(0);
    return new Blob([W.out()], { type: 'application/zip' });
  };

  /* ------------------------------------------------ SSIM (görsel benzerlik, 1 = aynı) */
  // Kanal: y (parlaklık), cb / cr (renk farkı); renk kaybını da yakalamak için
  const chanOf = (c, max, ch) => {
    const k = Math.min(1, max / Math.max(c.width, c.height));
    const w = Math.max(8, Math.round(c.width * k)), h = Math.max(8, Math.round(c.height * k));
    const t = App.U.canvas(w, h), x = t.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, w, h);
    x.drawImage(c, 0, 0, w, h);
    const d = x.getImageData(0, 0, w, h).data, L = new Float32Array(w * h);
    for (let i = 0; i < L.length; i++) {
      const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
      L[i] = ch === 'cb' ? 128 - 0.1687 * r - 0.3313 * g + 0.5 * b : ch === 'cr' ? 128 + 0.5 * r - 0.4187 * g - 0.0813 * b : r * 0.299 + g * 0.587 + b * 0.114;
    }
    return { L, w, h };
  };
  // Parlaklık ve renk kanallarının en kötüsü
  E.ssimColor = (a, b, max = 512) => Math.min(E.ssim(a, b, max), E.ssim(a, b, max / 2, 'cb'), E.ssim(a, b, max / 2, 'cr'));
  E.ssim = (a, b, max = 640, ch = 'y') => {
    const A = chanOf(a, max, ch), B = chanOf(b, max, ch);
    const w = Math.min(A.w, B.w), h = Math.min(A.h, B.h), S = 8;
    const C1 = (0.01 * 255) ** 2, C2 = (0.03 * 255) ** 2;
    let sum = 0, cnt = 0, worst = 1;
    for (let y = 0; y + S <= h; y += 4) for (let x = 0; x + S <= w; x += 4) {
      let ma = 0, mb = 0;
      for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) { ma += A.L[(y + j) * A.w + x + i]; mb += B.L[(y + j) * B.w + x + i]; }
      ma /= S * S; mb /= S * S;
      let va = 0, vb = 0, cv = 0;
      for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
        const da = A.L[(y + j) * A.w + x + i] - ma, db = B.L[(y + j) * B.w + x + i] - mb;
        va += da * da; vb += db * db; cv += da * db;
      }
      va /= S * S - 1; vb /= S * S - 1; cv /= S * S - 1;
      const s = ((2 * ma * mb + C1) * (2 * cv + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2));
      sum += s; cnt++;
      if (s < worst) worst = s;
    }
    return cnt ? sum / cnt : 1;
  };
  E.blobToCanvas = async blob => App.U.fileToCanvas(blob);
})();
