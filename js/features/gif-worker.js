'use strict';
/* GIF kodlama işçisi: renk paleti, piksel eşleme, değişmeyen pikselleri atlama ve GIF yazımı
   arka planda yapılır; böylece program GIF oluşturulurken donmaz.
   Gelen: { W, H, frames: [ArrayBuffer RGBA], delays, colors, dither, optimize, loop }
   Giden: { p: ilerleme 0-1 } ... sonra { blob, count } */
self.App = {};
importScripts('encoders.js');
const E = self.App.enc;

self.onmessage = e => {
  const { W, H, frames: bufs, delays, colors, dither, optimize, loop } = e.data;
  const datas = bufs.map(b => new Uint8ClampedArray(b));
  const n = datas.length;
  // 1) saydamlık var mı, ortak palet için örnek
  let anyAlpha = false;
  const step = Math.max(1, Math.round(W * H * n / 700000));
  const sample = [];
  for (const d of datas) for (let p = 0; p < d.length; p += 4 * step) { if (d[p + 3] < 128) anyAlpha = true; sample.push(d[p], d[p + 1], d[p + 2], d[p + 3]); }
  const useT = anyAlpha || optimize;
  const q = E.quantize(Uint8ClampedArray.from(sample), useT ? colors - 1 : colors, { alpha: 'binary', refine: 3 });
  const pal = q.palette.slice();
  const tIndex = useT ? pal.length : null;
  if (useT) pal.push([0, 0, 0, 0]);
  self.postMessage({ p: 0.15 });
  // 2) kareleri palete eşle; değişmeyen pikselleri saydam yapıp kareyi değişen bölgeye kırp
  const out = [];
  let prev = null;
  for (let i = 0; i < n; i++) {
    const idx = E.mapPixels(datas[i], pal, { alpha: 'binary', transparentIndex: tIndex, dither: dither ? 0.85 : 0, width: W });
    datas[i] = null;
    if (optimize && !anyAlpha && prev) {
      let x0 = W, y0 = H, x1 = -1, y1 = -1;
      const diff = new Uint8Array(W * H);
      for (let p = 0; p < idx.length; p++) {
        if (idx[p] !== prev[p]) { diff[p] = 1; const px = p % W, py = (p / W) | 0; if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py; }
      }
      if (x1 < 0) { out[out.length - 1].delay += delays[i]; self.postMessage({ p: 0.15 + 0.8 * (i + 1) / n }); continue; }
      const fw = x1 - x0 + 1, fh = y1 - y0 + 1, sub = new Uint8Array(fw * fh);
      for (let yy = 0; yy < fh; yy++) for (let xx = 0; xx < fw; xx++) {
        const p = (y0 + yy) * W + x0 + xx;
        sub[yy * fw + xx] = diff[p] ? idx[p] : tIndex;
      }
      out.push({ index: sub, x: x0, y: y0, w: fw, h: fh, delay: delays[i], transparent: tIndex, dispose: 1 });
    } else {
      out.push({ index: idx, x: 0, y: 0, w: W, h: H, delay: delays[i], transparent: tIndex, dispose: anyAlpha ? 2 : 1 });
    }
    prev = idx;
    self.postMessage({ p: 0.15 + 0.8 * (i + 1) / n });
  }
  const blob = E.gif({ width: W, height: H, palette: pal, frames: out, loop: loop < 0 ? null : loop });
  self.postMessage({ blob, count: out.length });
};
