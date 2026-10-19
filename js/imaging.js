'use strict';
/* Pixtape - görüntü işleme motoru */
(() => {
  const { U } = App;
  const IMG = App.IMG = {};
  const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

  IMG.ADJ_DEFAULT = {
    exposure: 0, brightness: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0,
    temperature: 0, tint: 0, saturation: 0, vibrance: 0, hue: 0,
    sharpen: 0, clarity: 0, blur: 0, denoise: 0, grain: 0, dehaze: 0,
    vignette: 0, vigSize: 50, fade: 0,
    curves: null, hsl: null, tone: null,
  };

  /* ------------------------------------------------------------ temel işlemler */
  IMG.padded = (src, p) => {
    const w = src.width, h = src.height;
    const c = U.canvas(w + 2 * p, h + 2 * p), x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    x.drawImage(src, p, p);
    x.drawImage(src, 0, 0, w, 1, p, 0, w, p);
    x.drawImage(src, 0, h - 1, w, 1, p, h + p, w, p);
    x.drawImage(src, 0, 0, 1, h, 0, p, p, h);
    x.drawImage(src, w - 1, 0, 1, h, w + p, p, p, h);
    x.drawImage(src, 0, 0, 1, 1, 0, 0, p, p);
    x.drawImage(src, w - 1, 0, 1, 1, w + p, 0, p, p);
    x.drawImage(src, 0, h - 1, 1, 1, 0, h + p, p, p);
    x.drawImage(src, w - 1, h - 1, 1, 1, w + p, h + p, p, p);
    return c;
  };

  // Gauss bulanıklığı (GPU filtreli, kenar uzatmalı; büyük yarıçapta küçült-bulanıklaştır-büyüt)
  IMG.blur = (src, r, opts = {}) => {
    const w = src.width, h = src.height;
    if (!(r > 0.25)) return U.clone(src);
    if (r > 24 && !opts.exact) {
      const k = 12 / r;
      const sw = Math.max(1, Math.round(w * k)), sh = Math.max(1, Math.round(h * k));
      const small = U.scaled(src, sw, sh);
      const b = IMG.blur(small, 12, { exact: true });
      const out = U.canvas(w, h), o = out.getContext('2d');
      o.imageSmoothingQuality = 'high';
      o.drawImage(b, 0, 0, w, h);
      return out;
    }
    const p = Math.ceil(r * 3) + 1;
    const pad = opts.noPad ? null : IMG.padded(src, p);
    const out = U.canvas(w, h), o = out.getContext('2d');
    o.filter = `blur(${r}px)`;
    if (pad) o.drawImage(pad, -p, -p); else o.drawImage(src, 0, 0);
    o.filter = 'none';
    if (pad && !opts.keepAlpha) {
      // saydamlığı korumak için orijinal alfa ile sınırla değil - bulanık alfa doğal kalsın
    }
    return out;
  };

  IMG.unsharp = (src, r, amount, threshold = 0) => {
    const b = U.getData(IMG.blur(src, r)).data;
    const img = U.getData(src), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      for (let k = 0; k < 3; k++) {
        const diff = d[i + k] - b[i + k];
        if (Math.abs(diff) >= threshold) d[i + k] = d[i + k] + diff * amount;
      }
    }
    return U.fromData(img);
  };

  IMG.curveLUT = pts => {
    const lut = new Float32Array(256);
    const p = (pts || []).slice().sort((a, b) => a[0] - b[0]);
    const n = p.length;
    if (n < 2) { for (let i = 0; i < 256; i++) lut[i] = i; return lut; }
    const xs = p.map(q => q[0]), ys = p.map(q => q[1]), d = [], m = [];
    for (let i = 0; i < n - 1; i++) d[i] = (ys[i + 1] - ys[i]) / ((xs[i + 1] - xs[i]) || 1);
    m[0] = d[0]; m[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
      const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
      if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
    }
    let k = 0;
    for (let x = 0; x < 256; x++) {
      if (x <= xs[0]) { lut[x] = ys[0]; continue; }
      if (x >= xs[n - 1]) { lut[x] = ys[n - 1]; continue; }
      while (k < n - 2 && x > xs[k + 1]) k++;
      const hh = xs[k + 1] - xs[k], t = (x - xs[k]) / hh, t2 = t * t, t3 = t2 * t;
      lut[x] = (2 * t3 - 3 * t2 + 1) * ys[k] + (t3 - 2 * t2 + t) * hh * m[k] + (-2 * t3 + 3 * t2) * ys[k + 1] + (t3 - t2) * hh * m[k + 1];
    }
    for (let x = 0; x < 256; x++) lut[x] = U.clamp(lut[x], 0, 255);
    return lut;
  };

  IMG.toneLUT = p => {
    const lut = new Float32Array(256);
    const ex = Math.pow(2, (p.exposure || 0) / 100 * 2);
    const lo = (p.blacks || 0) / 100 * 0.15, hi = 1 + (p.whites || 0) / 100 * 0.15;
    const sh = (p.shadows || 0) / 100, hl = (p.highlights || 0) / 100;
    const br = (p.brightness || 0) / 100, ct = (p.contrast || 0) / 100;
    // negatif kontrast doğrusal azalır: -100'de tüm tonlar orta griye iner
    const k = ct > 0 ? 1 + ct * 1.4 : 1 + ct;
    const dh = (p.dehaze || 0) / 100, fade = (p.fade || 0) / 100;
    for (let i = 0; i < 256; i++) {
      let x = i / 255;
      x *= ex;
      x = lo + x * (hi - lo);
      x = U.clamp(x, 0, 1);
      if (sh) x += sh * 0.6 * x * (1 - x) * (1 - x) * 3.4;
      if (hl) x += hl * 0.6 * x * x * (1 - x) * 3.4;
      x = U.clamp(x, 0, 1);
      if (br) x = Math.pow(x, Math.pow(2, -br * 0.9));
      if (ct) {
        if (ct > 0) {
          const lin = (x - 0.5) * k + 0.5;
          const s = x < 0.5 ? 0.5 * Math.pow(2 * x, k) : 1 - 0.5 * Math.pow(2 * (1 - x), k);
          x = (lin + s) / 2;
        } else x = (x - 0.5) * k + 0.5;
      }
      if (dh > 0) x = (x - dh * 0.12) / (1 - dh * 0.12);
      else if (dh < 0) x = x * (1 + dh * 0.3) - dh * 0.3 * 0.85;
      if (fade) x = fade * 0.22 + x * (1 - fade * 0.32);
      lut[i] = U.clamp(x, 0, 1) * 255;
    }
    return lut;
  };

  const hueMatrix = deg => {
    const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    return [
      0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
      0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.140, 0.072 - c * 0.072 - s * 0.283,
      0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072,
    ];
  };

  IMG.HSL_COLORS = [
    ['red', 'Red', 0, 30, '#ff3b3b'], ['orange', 'Orange', 30, 25, '#ff9a2e'], ['yellow', 'Yellow', 60, 30, '#ffe23b'],
    ['green', 'Green', 120, 55, '#3bd16f'], ['aqua', 'Aqua', 180, 45, '#3be3e3'], ['blue', 'Blue', 225, 45, '#3b7bff'],
    ['purple', 'Purple', 275, 40, '#9b4dff'], ['magenta', 'Magenta', 320, 40, '#ff3bd0'],
  ];

  const gradLUT = stops => {
    const cols = stops.map(U.hex2rgb), n = cols.length, lut = new Uint8ClampedArray(256 * 3);
    for (let i = 0; i < 256; i++) {
      const t = i / 255 * (n - 1), k = Math.min(n - 2, Math.floor(t)), f = t - k;
      for (let c = 0; c < 3; c++) lut[i * 3 + c] = cols[k][c] + (cols[k + 1][c] - cols[k][c]) * f;
    }
    return lut;
  };

  const needsPixel = p => {
    for (const k of ['exposure', 'brightness', 'contrast', 'highlights', 'shadows', 'whites', 'blacks', 'temperature', 'tint', 'saturation', 'vibrance', 'hue', 'grain', 'dehaze', 'vignette', 'fade'])
      if (p[k]) return true;
    if (p.curves && Object.values(p.curves).some(c => c && JSON.stringify(c) !== '[[0,0],[255,255]]')) return true;
    if (p.mix || p.split || p.gradMap || p.posterize || p.invert || p.gray || p.solarize != null || p.threshold != null || p.sepia) return true;
    if (p.hsl && Object.values(p.hsl).some(v => v && (v.h || v.hd || v.s || v.l))) return true;
    if (p.tone && p.tone.amt) return true;
    return false;
  };

  const hue2 = (p, q, t) => {
    if (t < 0) t += 1; else if (t > 1) t -= 1;
    return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
  };
  IMG.pixelPass = (src, p) => {
    const w = src.width, h = src.height;
    const img = U.getData(src), d = img.data;
    const tone = IMG.toneLUT(p);
    let LR = tone, LG = tone, LB = tone;
    if (p.curves) {
      const cv = p.curves, cr = IMG.curveLUT(cv.rgb), r = IMG.curveLUT(cv.r), g = IMG.curveLUT(cv.g), b = IMG.curveLUT(cv.b);
      LR = new Float32Array(256); LG = new Float32Array(256); LB = new Float32Array(256);
      for (let i = 0; i < 256; i++) {
        const t = cr[Math.round(tone[i])];
        LR[i] = r[Math.round(t)]; LG[i] = g[Math.round(t)]; LB[i] = b[Math.round(t)];
      }
    }
    const temp = (p.temperature || 0) / 100, tint = (p.tint || 0) / 100;
    const wb = temp || tint;
    const rm = 1 + temp * 0.22 + tint * 0.08, gm = 1 - tint * 0.2, bm = 1 - temp * 0.22 + tint * 0.08;
    const dh = (p.dehaze || 0) / 100;
    const sat = 1 + (p.saturation || 0) / 100 + (dh > 0 ? dh * 0.25 : dh * 0.3);
    const vib = (p.vibrance || 0) / 100;
    const hm = p.hue ? hueMatrix(p.hue) : null;
    const mix = p.mix, mixA = p.mixAmt == null ? 1 : p.mixAmt;
    const sepia = p.sepia || 0;
    const gray = p.gray || 0;
    let hsl = null;
    if (p.hsl) {
      // Ton kaydırma: hd derece cinsindendir (-180..180, renk çemberinin tamamı). Eski projelerde ve hazır
      // efektlerde h (-100..100 = ±30°) kullanılır; ikisi toplanır.
      const shift = v => (v.h || 0) / 100 * 30 + (v.hd || 0);
      hsl = IMG.HSL_COLORS.map(([k, , c, wdt]) => {
        const v = p.hsl[k] || {};
        return [c, wdt, shift(v), (v.s || 0) / 100, (v.l || 0) / 100];
      }).filter(x => x[2] || x[3] || x[4]);
      // fotoğraftan seçilen özel renk (merkez tonu kullanıcı belirler)
      const cu = p.hsl.custom;
      if (cu && cu.hue != null && (cu.h || cu.hd || cu.s || cu.l)) hsl.push([cu.hue, 26, shift(cu), (cu.s || 0) / 100, (cu.l || 0) / 100]);
      if (!hsl.length) hsl = null;
    }
    let split = null;
    if (p.split && p.split.amt) {
      split = { s: U.hex2rgb(p.split.sh), hh: U.hex2rgb(p.split.hi), a: p.split.amt / 100, bal: (p.split.bal || 0) / 100 };
    }
    // Tonlama: seçilen rengin tonu fotoğrafa eklenir (parlaklık korunur, en çok orta tonlarda)
    let toning = null;
    if (p.tone && p.tone.amt) {
      const tc = U.hex2rgb(p.tone.color || '#ff9a3c'), tl = lum(tc[0], tc[1], tc[2]);
      toning = { d: tc.map(v => v - tl), a: p.tone.amt / 100 };
    }
    const gm2 = p.gradMap ? gradLUT(p.gradMap.stops) : null, gmA = p.gradMap ? (p.gradMap.amt == null ? 1 : p.gradMap.amt) : 0;
    const post = p.posterize ? Math.max(2, p.posterize) : 0;
    const vig = (p.vignette || 0) / 100, vigIn = 0.15 + ((p.vigSize == null ? 50 : p.vigSize) / 100) * 0.7;
    const grain = (p.grain || 0) / 100 * 60;
    let rs = 1234;
    const cx = w / 2, cy = h / 2;
    const sol = p.solarize, thr = p.threshold;
    for (let y = 0, i = 0; y < h; y++) {
      const dy = (y - cy) / cy;
      for (let x = 0; x < w; x++, i += 4) {
        let r = LR[d[i]], g = LG[d[i + 1]], b = LB[d[i + 2]];
        if (wb) { r *= rm; g *= gm; b *= bm; }
        if (mix) {
          const nr = mix[0] * r + mix[1] * g + mix[2] * b, ng = mix[3] * r + mix[4] * g + mix[5] * b, nb = mix[6] * r + mix[7] * g + mix[8] * b;
          r += (nr - r) * mixA; g += (ng - g) * mixA; b += (nb - b) * mixA;
        }
        if (sepia) {
          const nr = 0.393 * r + 0.769 * g + 0.189 * b, ng = 0.349 * r + 0.686 * g + 0.168 * b, nb = 0.272 * r + 0.534 * g + 0.131 * b;
          r += (nr - r) * sepia; g += (ng - g) * sepia; b += (nb - b) * sepia;
        }
        if (sat !== 1 || vib) {
          const L = lum(r, g, b);
          let s = sat;
          if (vib) {
            const mx = Math.max(r, g, b), mn = Math.min(r, g, b), cs = (mx - mn) / 255;
            s += vib * (1 - cs) * (vib > 0 ? 1.1 : 1);
          }
          r = L + (r - L) * s; g = L + (g - L) * s; b = L + (b - L) * s;
        }
        if (hm) {
          const nr = hm[0] * r + hm[1] * g + hm[2] * b, ng = hm[3] * r + hm[4] * g + hm[5] * b, nb = hm[6] * r + hm[7] * g + hm[8] * b;
          r = nr; g = ng; b = nb;
        }
        if (hsl) {
          // RGB → HSL satır içinde (her piksel için dizi oluşturup fonksiyon çağırmak çok yavaştı)
          const cr = r < 0 ? 0 : r > 255 ? 1 : r / 255, cg = g < 0 ? 0 : g > 255 ? 1 : g / 255, cb = b < 0 ? 0 : b > 255 ? 1 : b / 255;
          const mx = cr > cg ? (cr > cb ? cr : cb) : (cg > cb ? cg : cb), mn = cr < cg ? (cr < cb ? cr : cb) : (cg < cb ? cg : cb);
          const dl = mx - mn, Lh = (mx + mn) / 2;
          const S = dl ? (Lh > 0.5 ? dl / (2 - mx - mn) : dl / (mx + mn)) : 0;
          if (S > 0.02) {
            let H = mx === cr ? (cg - cb) / dl + (cg < cb ? 6 : 0) : mx === cg ? (cb - cr) / dl + 2 : (cr - cg) / dl + 4;
            H *= 60;
            let dH = 0, dS = 0, dL = 0;
            for (let k = 0; k < hsl.length; k++) {
              const q = hsl[k];
              let dd = H - q[0]; if (dd < 0) dd = -dd; if (dd > 180) dd = 360 - dd;
              if (dd < q[1]) { const wgt = 1 - dd / q[1]; dH += q[2] * wgt; dS += q[3] * wgt; dL += q[4] * wgt; }
            }
            if (dH || dS || dL) {
              const sw = S * 3 < 1 ? S * 3 : 1;
              let ns = S * (1 + dS); ns = ns < 0 ? 0 : ns > 1 ? 1 : ns;
              let nl = Lh + dL * 0.35 * sw * (dL > 0 ? 1 - Lh : Lh) * 2; nl = nl < 0 ? 0 : nl > 1 ? 1 : nl;
              let hh = (H + dH) % 360; if (hh < 0) hh += 360; hh /= 360;
              const qq = nl < 0.5 ? nl * (1 + ns) : nl + ns - nl * ns, pp = 2 * nl - qq;
              r = hue2(pp, qq, hh + 1 / 3) * 255; g = hue2(pp, qq, hh) * 255; b = hue2(pp, qq, hh - 1 / 3) * 255;
            }
          }
        }
        if (split) {
          const L = U.clamp(lum(r, g, b) / 255, 0, 1);
          const ws = Math.max(0, 1 - L * (1 + split.bal)) * split.a, wh = Math.max(0, L * (1 - split.bal) * 1) * split.a;
          r += (split.s[0] - 128) * ws * 0.45 + (split.hh[0] - 128) * wh * 0.45;
          g += (split.s[1] - 128) * ws * 0.45 + (split.hh[1] - 128) * wh * 0.45;
          b += (split.s[2] - 128) * ws * 0.45 + (split.hh[2] - 128) * wh * 0.45;
        }
        if (toning) {
          const L = U.clamp(lum(r, g, b) / 255, 0, 1), f = toning.a * (0.3 + 0.7 * 4 * L * (1 - L));
          r += toning.d[0] * f; g += toning.d[1] * f; b += toning.d[2] * f;
        }
        if (gray) {
          const L = lum(r, g, b);
          r += (L - r) * gray; g += (L - g) * gray; b += (L - b) * gray;
        }
        if (gm2) {
          const L = U.clamp(Math.round(lum(r, g, b)), 0, 255) * 3;
          r += (gm2[L] - r) * gmA; g += (gm2[L + 1] - g) * gmA; b += (gm2[L + 2] - b) * gmA;
        }
        if (post) {
          const st = 255 / (post - 1);
          r = Math.round(r / st) * st; g = Math.round(g / st) * st; b = Math.round(b / st) * st;
        }
        if (sol != null) {
          if (r > sol) r = 255 - r; if (g > sol) g = 255 - g; if (b > sol) b = 255 - b;
        }
        if (thr != null) { const v = lum(r, g, b) > thr ? 255 : 0; r = g = b = v; }
        if (p.invert) { r = 255 - r; g = 255 - g; b = 255 - b; }
        if (vig) {
          const dx = (x - cx) / cx;
          const dist = Math.sqrt((dx * dx + dy * dy) / 2);
          const t = U.smooth(vigIn, 1.1, dist);
          if (t > 0) {
            if (vig < 0) { const f = 1 + vig * t; r *= f; g *= f; b *= f; }
            else { const f = vig * t; r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
          }
        }
        if (grain) {
          // tek bir rastgele sayının iki yarısı toplanır (üçgen dağılımlı gren); her piksel için iki ayrı
          // rastgele sayı üretmekten ve fonksiyon çağırmaktan çok daha hızlı
          rs = (rs + 0x6D2B79F5) | 0;
          let t = Math.imul(rs ^ (rs >>> 15), 1 | rs);
          t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
          t = (t ^ (t >>> 14)) >>> 0;
          const n = ((t & 0xffff) + (t >>> 16) - 65535) / 65535 * grain;
          r += n; g += n; b += n;
        }
        d[i] = r; d[i + 1] = g; d[i + 2] = b;
      }
    }
    return U.fromData(img);
  };

  IMG.denoise = (src, amount) => {
    const w = src.width, h = src.height;
    const r = Math.max(1, Math.min(w, h) * 0.0018 * (0.6 + amount / 100 * 1.6));
    const bd = U.getData(IMG.blur(src, r)).data;
    const img = U.getData(src), d = img.data;
    const a = amount / 100, sig = 8 + amount * 0.45, s2 = 2 * sig * sig;
    // Ağırlık yalnızca parlaklık farkına bağlı: her piksel için exp hesaplamak yerine 1/4 adımlı tablo
    const W = new Float32Array(1024);
    for (let k = 0; k < 1024; k++) { const df = k / 4; W[k] = a * Math.exp(-(df * df) / s2); }
    for (let i = 0; i < d.length; i += 4) {
      const r0 = d[i], g0 = d[i + 1], b0 = d[i + 2], r1 = bd[i], g1 = bd[i + 1], b1 = bd[i + 2];
      let df = 0.2126 * (r0 - r1) + 0.7152 * (g0 - g1) + 0.0722 * (b0 - b1);
      if (df < 0) df = -df;
      const wgt = W[(df * 4) | 0];
      if (wgt < 1e-4) continue;
      d[i] = r0 + (r1 - r0) * wgt; d[i + 1] = g0 + (g1 - g0) * wgt; d[i + 2] = b0 + (b1 - b0) * wgt;
    }
    return U.fromData(img);
  };

  IMG.clarity = (src, amount) => {
    if (!amount) return src;
    const w = src.width, h = src.height;
    const bd = U.getData(IMG.blur(src, Math.max(2, Math.min(w, h) * 0.012))).data;
    const img = U.getData(src), d = img.data, k = amount / 100 * 1.1;
    for (let i = 0; i < d.length; i += 4) {
      const L = lum(d[i], d[i + 1], d[i + 2]) / 255;
      const wm = 1 - (2 * L - 1) * (2 * L - 1);
      const f = k * (0.35 + 0.65 * wm);
      d[i] += (d[i] - bd[i]) * f; d[i + 1] += (d[i + 1] - bd[i + 1]) * f; d[i + 2] += (d[i + 2] - bd[i + 2]) * f;
    }
    return U.fromData(img);
  };

  // Ana ayar fonksiyonu
  /* Ağır ön adımların (gren azaltma, netlik) sonucu kaynak tuval başına saklanır: canlı önizlemede başka bir
     kaydırıcı oynatılırken (ör. Pus giderme) bu adımlar yeniden hesaplanmaz, yalnızca piksel geçişi çalışır.
     Kaynak tuvalin içeriği değişmez (önizleme vekili sabittir); Uygula'da tam boyutlu yeni bir kaynakla gelinir. */
  const stageCache = new WeakMap();
  let stageGen = 0;
  App.on('history', () => { stageGen++; }); // belge değişince (ör. katmana çizilince) saklananlar geçersiz
  IMG.adjust = (src, params, scale = 1) => {
    const p = { ...IMG.ADJ_DEFAULT, ...params };
    let c = src;
    let sc = stageCache.get(src);
    if (!sc || sc.gen !== stageGen) stageCache.set(src, sc = { gen: stageGen });
    if (p.denoise > 0) {
      if (sc.dn !== p.denoise) { sc.dn = p.denoise; sc.dnOut = IMG.denoise(src, p.denoise); sc.cl = null; }
      c = sc.dnOut;
    }
    if (p.clarity) {
      const key = p.clarity + '|' + (p.denoise > 0 ? p.denoise : 0);
      if (sc.cl !== key) { sc.cl = key; sc.clOut = IMG.clarity(c, p.clarity); }
      c = sc.clOut;
    }
    if (needsPixel(p)) c = IMG.pixelPass(c, p);
    if (p.sharpen > 0) c = IMG.unsharp(c, Math.max(0.7, 1.5 * Math.sqrt(scale)), p.sharpen / 100 * 1.8);
    if (p.blur > 0) c = IMG.blur(c, p.blur / 100 * 0.012 * Math.min(c.width, c.height));
    // saklanan ara sonuç dışarı verilmez (kullanan değiştirirse önbellek bozulmasın)
    return c === src || c === sc.dnOut || c === sc.clOut ? U.clone(c) : c;
  };

  IMG.isNeutral = p => {
    const q = { ...IMG.ADJ_DEFAULT, ...p };
    if (q.sharpen || q.blur || q.denoise || q.clarity) return false;
    return !needsPixel(q);
  };

  /* ------------------------------------------------------------ analiz */
  IMG.histogram = src => {
    const c = U.fit(src, 360), d = U.getData(c).data;
    const H = { r: new Uint32Array(256), g: new Uint32Array(256), b: new Uint32Array(256), l: new Uint32Array(256), n: 0 };
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 8) continue;
      H.r[d[i]]++; H.g[d[i + 1]]++; H.b[d[i + 2]]++;
      H.l[Math.round(lum(d[i], d[i + 1], d[i + 2]))]++;
      H.n++;
    }
    return H;
  };

  IMG.autoParams = src => {
    const H = IMG.histogram(src);
    if (!H.n) return {};
    const pct = (arr, q) => {
      let s = 0; const t = H.n * q;
      for (let i = 0; i < 256; i++) { s += arr[i]; if (s >= t) return i; }
      return 255;
    };
    const ch = k => {
      let lo = pct(H[k], 0.004), hi = pct(H[k], 0.996);
      lo = Math.min(lo, 70); hi = Math.max(hi, 185);
      if (hi - lo < 40) { lo = 0; hi = 255; }
      return [[lo, 0], [hi, 255]];
    };
    let mean = 0;
    for (let i = 0; i < 256; i++) mean += H.l[i] * i;
    mean /= H.n;
    return {
      curves: { rgb: [[0, 0], [255, 255]], r: ch('r'), g: ch('g'), b: ch('b') },
      vibrance: 14, contrast: 6,
      shadows: mean < 90 ? 22 : 8, highlights: mean > 170 ? -18 : -6,
      brightness: mean < 95 ? 10 : 0,
    };
  };

  /* ------------------------------------------------------------ kanallar */
  IMG.channel = (src, color, tx = 0, ty = 0, scale = 1) => {
    const w = src.width, h = src.height;
    const c = U.canvas(w, h), x = c.getContext('2d');
    x.save();
    x.translate(w / 2 + tx, h / 2 + ty); x.scale(scale, scale); x.translate(-w / 2, -h / 2);
    x.drawImage(src, 0, 0);
    x.restore();
    x.globalCompositeOperation = 'multiply';
    x.fillStyle = color; x.fillRect(0, 0, w, h);
    x.globalCompositeOperation = 'destination-in';
    x.drawImage(src, 0, 0);
    x.globalCompositeOperation = 'source-over'; // sonuca sonradan çizen işlemler normal kipte çizsin
    return c;
  };
  IMG.rgbShift = (src, rOff, bOff, rScale = 1, bScale = 1) => {
    const w = src.width, h = src.height;
    const out = U.canvas(w, h), o = out.getContext('2d');
    o.fillStyle = '#000'; o.fillRect(0, 0, w, h);
    o.globalCompositeOperation = 'lighter';
    o.drawImage(IMG.channel(src, '#ff0000', rOff[0], rOff[1], rScale), 0, 0);
    o.drawImage(IMG.channel(src, '#00ff00'), 0, 0);
    o.drawImage(IMG.channel(src, '#0000ff', bOff[0], bOff[1], bScale), 0, 0);
    o.globalCompositeOperation = 'destination-in';
    o.drawImage(src, 0, 0);
    o.globalCompositeOperation = 'source-over'; // sonucun üzerine sonradan çizilenler normal kipte çizilsin
    return out;
  };

  IMG.mixWith = (src, fx, amt) => {
    if (amt >= 0.999) return fx;
    const out = U.clone(src), o = out.getContext('2d');
    o.globalAlpha = amt;
    o.drawImage(fx, 0, 0);
    return out;
  };

  /* ------------------------------------------------------------ sanatsal efektler */
  IMG.sketch = (src, strength = 60, color = false) => {
    const w = src.width, h = src.height;
    const gray = U.canvas(w, h), g = gray.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
    g.filter = 'grayscale(1)'; g.drawImage(src, 0, 0); g.filter = 'none';
    const inv = U.canvas(w, h), ix = inv.getContext('2d');
    ix.filter = 'invert(1)'; ix.drawImage(gray, 0, 0); ix.filter = 'none';
    const r = Math.max(1, Math.min(w, h) * 0.003 * (0.5 + strength / 100 * 2));
    const bi = IMG.blur(inv, r);
    const out = U.clone(gray), o = out.getContext('2d');
    o.globalCompositeOperation = 'color-dodge';
    o.drawImage(bi, 0, 0);
    const dark = U.clone(out);
    o.globalCompositeOperation = 'multiply';
    o.globalAlpha = 0.3 + strength / 100 * 0.7;
    o.drawImage(dark, 0, 0);
    if (color) {
      o.globalCompositeOperation = 'color';
      o.globalAlpha = 0.85;
      o.drawImage(src, 0, 0);
    }
    o.globalAlpha = 1;
    o.globalCompositeOperation = 'destination-in';
    o.drawImage(src, 0, 0);
    o.globalCompositeOperation = 'source-over'; // sonucun üzerine sonradan çizilenler normal kipte çizilsin
    return out;
  };

  IMG.pixelate = (src, cell, mode = 'square') => {
    const w = src.width, h = src.height;
    cell = Math.max(2, Math.round(cell));
    const sw = Math.max(1, Math.ceil(w / cell)), sh = Math.max(1, Math.ceil(h / cell));
    // Her karenin rengi yalnızca resmin içinde kalan piksellerin ortalamasıdır
    // (kenardaki yarım kareler saydamlaşmaz)
    const sd = U.getData(src).data, n = sw * sh, acc = new Float64Array(n * 5);
    for (let y = 0; y < h; y++) {
      const row = ((y / cell) | 0) * sw;
      for (let x = 0, i = y * w * 4; x < w; x++, i += 4) {
        const k = (row + ((x / cell) | 0)) * 5, a = sd[i + 3];
        acc[k] += sd[i] * a; acc[k + 1] += sd[i + 1] * a; acc[k + 2] += sd[i + 2] * a; acc[k + 3] += a; acc[k + 4]++;
      }
    }
    const small = U.canvas(sw, sh), sid = new ImageData(sw, sh), q = sid.data;
    for (let j = 0; j < n; j++) {
      const k = j * 5, a = acc[k + 3];
      if (a) { q[j * 4] = acc[k] / a; q[j * 4 + 1] = acc[k + 1] / a; q[j * 4 + 2] = acc[k + 2] / a; }
      q[j * 4 + 3] = acc[k + 4] ? a / acc[k + 4] : 0;
    }
    small.getContext('2d').putImageData(sid, 0, 0);
    const out = U.canvas(w, h), o = out.getContext('2d');
    if (mode === 'square' || mode === 'tiles') {
      o.imageSmoothingEnabled = false;
      o.drawImage(small, 0, 0, sw * cell, sh * cell);
      if (mode === 'tiles') {
        o.strokeStyle = 'rgba(0,0,0,.25)'; o.lineWidth = Math.max(1, cell * 0.08);
        o.beginPath();
        for (let x = 0; x <= w; x += cell) { o.moveTo(x, 0); o.lineTo(x, h); }
        for (let y = 0; y <= h; y += cell) { o.moveTo(0, y); o.lineTo(w, y); }
        o.stroke();
      }
    } else {
      const d = U.getData(small).data;
      for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
        const i = (y * sw + x) * 4;
        if (d[i + 3] < 10) continue;
        o.fillStyle = `rgba(${d[i]},${d[i + 1]},${d[i + 2]},${d[i + 3] / 255})`;
        o.beginPath(); o.arc(x * cell + cell / 2, y * cell + cell / 2, cell * 0.46, 0, Math.PI * 2); o.fill();
      }
    }
    return out;
  };

  IMG.halftone = (src, cell, angle = 45, mode = 'mono') => {
    const w = src.width, h = src.height;
    cell = Math.max(3, cell);
    const k = 2 / cell;
    const sw = Math.max(1, Math.round(w * k)), sh = Math.max(1, Math.round(h * k));
    const small = U.scaled(src, sw, sh), sd = U.getData(small).data;
    const out = U.canvas(w, h), o = out.getContext('2d');
    o.fillStyle = '#fff'; o.fillRect(0, 0, w, h);
    const a = angle * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
    const diag = Math.hypot(w, h), cx = w / 2, cy = h / 2;
    if (mode === 'mono') { o.fillStyle = '#111'; o.beginPath(); }
    for (let v = -diag / 2; v < diag / 2; v += cell) {
      for (let u = -diag / 2; u < diag / 2; u += cell) {
        const x = cx + u * ca - v * sa, y = cy + u * sa + v * ca;
        if (x < -cell || y < -cell || x > w + cell || y > h + cell) continue;
        const px = U.clamp(Math.floor(x * k), 0, sw - 1), py = U.clamp(Math.floor(y * k), 0, sh - 1);
        const i = (py * sw + px) * 4;
        const L = lum(sd[i], sd[i + 1], sd[i + 2]) / 255;
        const rad = cell * 0.5 * Math.sqrt(1 - L) * 1.35;
        if (rad < 0.3) continue;
        if (mode === 'mono') { o.moveTo(x + rad, y); o.arc(x, y, rad, 0, Math.PI * 2); }
        else {
          o.fillStyle = `rgb(${sd[i]},${sd[i + 1]},${sd[i + 2]})`;
          const rr = mode === 'color' ? cell * 0.5 * Math.sqrt(Math.max(0.15, 1 - L * 0.8)) * 1.25 : rad;
          o.beginPath(); o.arc(x, y, rr, 0, Math.PI * 2); o.fill();
        }
      }
    }
    if (mode === 'mono') o.fill();
    o.globalCompositeOperation = 'destination-in';
    o.drawImage(src, 0, 0);
    o.globalCompositeOperation = 'source-over'; // sonucun üzerine sonradan çizilenler normal kipte çizilsin
    return out;
  };

  // Kuwahara (yağlı boya) - toplam alan tabloları ile
  IMG.kuwahara = (src, radius) => {
    let w = src.width, h = src.height, s = src, k = 1;
    const lim = 1.6e6;
    if (w * h > lim) { k = Math.sqrt(lim / (w * h)); s = U.scaled(src, w * k, h * k); }
    const W = s.width, H = s.height, r = Math.max(1, Math.round(radius * k));
    const img = U.getData(s), d = img.data;
    const W1 = W + 1, N = W1 * (H + 1);
    const sR = new Float64Array(N), sG = new Float64Array(N), sB = new Float64Array(N), sL = new Float64Array(N), sL2 = new Float64Array(N);
    for (let y = 0; y < H; y++) {
      let aR = 0, aG = 0, aB = 0, aL = 0, aL2 = 0;
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4, L = lum(d[i], d[i + 1], d[i + 2]);
        aR += d[i]; aG += d[i + 1]; aB += d[i + 2]; aL += L; aL2 += L * L;
        const j = (y + 1) * W1 + x + 1, u = y * W1 + x + 1;
        sR[j] = sR[u] + aR; sG[j] = sG[u] + aG; sB[j] = sB[u] + aB; sL[j] = sL[u] + aL; sL2[j] = sL2[u] + aL2;
      }
    }
    const out = new ImageData(W, H), o = out.data;
    const box = (T, x0, y0, x1, y1) => T[y1 * W1 + x1] - T[y0 * W1 + x1] - T[y1 * W1 + x0] + T[y0 * W1 + x0];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let best = Infinity, br = 0, bg = 0, bb = 0;
      for (let q = 0; q < 4; q++) {
        const x0 = Math.max(0, q & 1 ? x : x - r), x1 = Math.min(W, (q & 1 ? x + r : x) + 1);
        const y0 = Math.max(0, q & 2 ? y : y - r), y1 = Math.min(H, (q & 2 ? y + r : y) + 1);
        const n = (x1 - x0) * (y1 - y0);
        const mL = box(sL, x0, y0, x1, y1) / n, v = box(sL2, x0, y0, x1, y1) / n - mL * mL;
        if (v < best) { best = v; br = box(sR, x0, y0, x1, y1) / n; bg = box(sG, x0, y0, x1, y1) / n; bb = box(sB, x0, y0, x1, y1) / n; }
      }
      const i = (y * W + x) * 4;
      o[i] = br; o[i + 1] = bg; o[i + 2] = bb; o[i + 3] = d[i + 3];
    }
    const res = U.fromData(out);
    return k < 1 ? U.scaled(res, w, h) : res;
  };

  IMG.sobel = src => {
    const w = src.width, h = src.height, d = U.getData(src).data;
    const L = new Float32Array(w * h);
    for (let i = 0, j = 0; j < L.length; i += 4, j++) L[j] = lum(d[i], d[i + 1], d[i + 2]);
    const gx = new Float32Array(w * h), gy = new Float32Array(w * h);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const a = L[i - w - 1], b = L[i - w], c = L[i - w + 1], dd = L[i - 1], f = L[i + 1], g = L[i + w - 1], hh = L[i + w], k = L[i + w + 1];
      gx[i] = -a - 2 * dd - g + c + 2 * f + k;
      gy[i] = -a - 2 * b - c + g + 2 * hh + k;
    }
    return { gx, gy, L, w, h, d };
  };

  IMG.emboss = (src, strength = 50, color = true) => {
    const w = src.width, h = src.height, s = IMG.sobel(src);
    const img = U.getData(src), d = img.data, k = strength / 100 * 1.2;
    for (let j = 0, i = 0; j < w * h; j++, i += 4) {
      const e = (s.gx[j] + s.gy[j]) * 0.25 * k;
      if (color) { d[i] += e; d[i + 1] += e; d[i + 2] += e; }
      else { const v = 128 + e * 2; d[i] = d[i + 1] = d[i + 2] = v; }
    }
    return U.fromData(img);
  };

  IMG.neonEdges = (src, strength = 60, mode = 'color') => {
    const w = src.width, h = src.height, s = IMG.sobel(src);
    const out = new ImageData(w, h), o = out.data, k = 0.5 + strength / 100 * 2.5;
    for (let j = 0, i = 0; j < w * h; j++, i += 4) {
      const m = Math.min(1, Math.hypot(s.gx[j], s.gy[j]) / 255 * k);
      let r, g, b;
      if (mode === 'rainbow') { [r, g, b] = U.hsl2rgb(Math.atan2(s.gy[j], s.gx[j]) * 180 / Math.PI + 180, 1, 0.55); }
      else if (mode === 'white') { r = g = b = 255; }
      else { r = s.d[i]; g = s.d[i + 1]; b = s.d[i + 2]; const mx = Math.max(r, g, b, 1); r = r / mx * 255; g = g / mx * 255; b = b / mx * 255; }
      o[i] = r * m; o[i + 1] = g * m; o[i + 2] = b * m; o[i + 3] = s.d[i + 3];
    }
    const edges = U.fromData(out);
    const glow = IMG.blur(edges, Math.max(2, Math.min(w, h) * 0.006));
    const x = edges.getContext('2d');
    x.globalCompositeOperation = 'screen';
    x.drawImage(glow, 0, 0); x.drawImage(glow, 0, 0);
    return edges;
  };

  /* Ayarlardan bağımsız ağır adımlar (iki kez yumuşatma, kenar şiddeti) aynı görüntü için bir kez hesaplanır;
     sürgü oynatılırken yalnızca renk azaltma ve çizgi eşiği yeniden uygulanır. Sonuç aynıdır. */
  const toonCache = new WeakMap();
  let toonGen = 0, toonHook = false;
  IMG.cartoon = (src, levels = 6, edge = 50) => {
    // katman pikselleri değiştiyse (yeni geçmiş adımı) önbellek geçersiz olur
    if (!toonHook && App.on) { App.on('history', () => { toonGen++; }); toonHook = true; }
    const w = src.width, h = src.height;
    let C = toonCache.get(src);
    if (!C || C.w !== w || C.h !== h || C.gen !== toonGen) {
      const s = IMG.sobel(IMG.blur(src, Math.max(0.8, Math.min(w, h) * 0.0012)));
      const mag = new Float32Array(w * h);
      for (let j = 0; j < mag.length; j++) mag[j] = Math.hypot(s.gx[j], s.gy[j]);
      C = { w, h, gen: toonGen, smooth: IMG.denoise(IMG.denoise(src, 100), 100), mag, post: null, levels: null };
      toonCache.set(src, C);
    }
    if (C.levels !== levels) { C.post = U.getData(IMG.pixelPass(C.smooth, { posterize: levels, saturation: 25 })); C.levels = levels; }
    const img = new ImageData(new Uint8ClampedArray(C.post.data), w, h), d = img.data, t = 200 - edge * 1.5, mg = C.mag;
    for (let j = 0, i = 0; j < w * h; j++, i += 4) {
      const m = mg[j];
      if (m > t) { const f = Math.max(0, 1 - (m - t) / 60); d[i] *= f * 0.3; d[i + 1] *= f * 0.3; d[i + 2] *= f * 0.3; }
    }
    return U.fromData(img);
  };

  IMG.motionBlur = (src, angle, dist) => {
    const w = src.width, h = src.height;
    if (dist < 1) return U.clone(src);
    const n = Math.min(40, Math.max(3, Math.round(dist / 1.5)));
    const pad = Math.ceil(dist) + 2, P = IMG.padded(src, pad);
    const out = U.canvas(w, h), o = out.getContext('2d');
    const a = angle * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
    for (let i = 0; i < n; i++) {
      const t = (i / (n - 1) - 0.5) * dist;
      o.globalAlpha = 1 / (i + 1);
      o.drawImage(P, -pad + ca * t, -pad + sa * t);
    }
    return out;
  };

  IMG.zoomBlur = (src, cx, cy, amount) => {
    const w = src.width, h = src.height, n = 24;
    const out = U.clone(src), o = out.getContext('2d');
    for (let i = 1; i < n; i++) {
      const s = 1 + amount / 100 * 0.25 * i / n;
      o.globalAlpha = 1 / (i + 1);
      o.setTransform(s, 0, 0, s, cx * w * (1 - s), cy * h * (1 - s));
      o.drawImage(src, 0, 0);
    }
    o.setTransform(1, 0, 0, 1, 0, 0);
    return out;
  };

  /* Işık parlaması: fotoğrafın parlak noktaları objektif bulanıklığındaki gibi yuvarlak ışık toplarına dönüşür.
     Küçültülmüş parlak noktalar bir disk boyunca dağıtılır (disk bulanıklığı), sonra bulanık resmin üstüne ekran karışımıyla eklenir. */
  const bokehGlow = (src, blurred, r, k) => {
    const w = src.width, h = src.height, s = Math.min(1, 480 / Math.max(w, h));
    const sw = Math.max(1, Math.round(w * s)), sh = Math.max(1, Math.round(h * s));
    const hi = U.canvas(sw, sh), hx = hi.getContext('2d');
    hx.drawImage(src, 0, 0, sw, sh);
    const img = hx.getImageData(0, 0, sw, sh), d = img.data, t0 = 0.8 - 0.22 * k;
    for (let i = 0; i < d.length; i += 4) {
      let t = (lum(d[i], d[i + 1], d[i + 2]) / 255 - t0) / (1 - t0);
      // parlaklık saydamlığa yazılır: karanlık yerler tamamen saydam kalır, şeffaf katmanlar bozulmaz
      d[i + 3] = t <= 0 ? 0 : t * t * d[i + 3];
    }
    hx.putImageData(img, 0, 0);
    // disk: iç içe halkalar, dış halka biraz daha güçlü (ışık toplarının belirgin kenarı)
    const R = Math.max(2, r * s * 1.8), rings = Math.min(6, Math.max(2, Math.round(R / 1.5)));
    const pts = [[0, 0, 1]];
    for (let j = 1; j <= rings; j++) {
      const rr = R * j / rings, n = Math.max(6, Math.round(rr * 4.5));
      for (let i = 0; i < n; i++) { const a = (i + j * 0.5) / n * Math.PI * 2; pts.push([Math.cos(a) * rr, Math.sin(a) * rr, j === rings ? 1.6 : 1]); }
    }
    let wsum = 0;
    for (const p of pts) wsum += p[2];
    const glow = U.canvas(sw, sh), gx = glow.getContext('2d');
    gx.globalCompositeOperation = 'lighter';
    const gain = 3 + 14 * k;
    for (const [x, y, wt] of pts) { gx.globalAlpha = Math.min(1, wt / wsum * gain); gx.drawImage(hi, x, y); }
    const bx = blurred.getContext('2d');
    bx.save();
    bx.globalCompositeOperation = 'screen'; bx.globalAlpha = Math.min(1, 0.35 + k);
    bx.imageSmoothingQuality = 'high';
    bx.drawImage(glow, 0, 0, w, h);
    bx.restore();
  };

  IMG.focus = (src, o) => {
    const w = src.width, h = src.height, M = Math.max(w, h);
    const r = Math.max(0.5, (o.blur || 50) / 100 * 0.025 * M);
    const blurred = IMG.blur(src, r);
    if (o.bokeh) bokehGlow(src, blurred, r, o.bokeh / 100);
    const mask = U.canvas(w, h), m = mask.getContext('2d');
    const cx = (o.cx == null ? 0.5 : o.cx) * w, cy = (o.cy == null ? 0.5 : o.cy) * h;
    const half = (o.size == null ? 0.25 : o.size) * M * 0.5, fe = (o.feather == null ? 0.3 : o.feather) * M * 0.5 + 1;
    const A = o.invert ? 0 : 1, B = o.invert ? 1 : 0;
    const col = a => `rgba(0,0,0,${a})`;
    if (o.type === 'radial') {
      const g = m.createRadialGradient(cx, cy, half, cx, cy, half + fe);
      g.addColorStop(0, col(B)); g.addColorStop(1, col(A));
      m.fillStyle = g; m.fillRect(0, 0, w, h);
      if (!o.invert) { m.fillStyle = col(B); }
    } else {
      const a = ((o.angle || 0) + 90) * Math.PI / 180, nx = Math.cos(a), ny = Math.sin(a), T = half + fe;
      const g = m.createLinearGradient(cx - nx * T, cy - ny * T, cx + nx * T, cy + ny * T);
      const t1 = fe / (2 * T), t2 = (fe + 2 * half) / (2 * T);
      g.addColorStop(0, col(A)); g.addColorStop(t1, col(B)); g.addColorStop(Math.max(t1, t2), col(B)); g.addColorStop(1, col(A));
      m.fillStyle = g; m.fillRect(0, 0, w, h);
    }
    const bx = blurred.getContext('2d');
    bx.globalCompositeOperation = 'destination-in';
    bx.drawImage(mask, 0, 0);
    const out = U.clone(src), ox = out.getContext('2d');
    // net kısmı bulanığın üstünde değil, bulanığı net üstüne koy
    ox.drawImage(blurred, 0, 0);
    return out;
  };

  IMG.hdr = (src, amount = 50) => {
    const w = src.width, h = src.height, a = amount / 100;
    const bd = U.getData(IMG.blur(src, Math.max(2, Math.min(w, h) * 0.025))).data;
    const img = U.getData(src), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const L = lum(d[i], d[i + 1], d[i + 2]), Lb = lum(bd[i], bd[i + 1], bd[i + 2]);
      const base = 128 + (Lb - 128) * (1 - 0.55 * a);
      const nL = base + (L - Lb) * (1 + 2.2 * a);
      const ratio = (Math.max(0, nL) + 1) / (L + 1);
      let r = d[i] * ratio, g = d[i + 1] * ratio, b = d[i + 2] * ratio;
      const L2 = lum(r, g, b), s = 1 + 0.35 * a;
      d[i] = L2 + (r - L2) * s; d[i + 1] = L2 + (g - L2) * s; d[i + 2] = L2 + (b - L2) * s;
    }
    return U.fromData(img);
  };

  IMG.mirror = (src, mode) => {
    const w = src.width, h = src.height;
    const out = U.clone(src);
    const step = (c, m) => {
      const r = U.clone(c), o = r.getContext('2d');
      o.save(); o.beginPath();
      if (m === 'left') { o.rect(w / 2, 0, w / 2, h); o.clip(); o.clearRect(0, 0, w, h); o.translate(w, 0); o.scale(-1, 1); }
      if (m === 'right') { o.rect(0, 0, w / 2, h); o.clip(); o.clearRect(0, 0, w, h); o.translate(w, 0); o.scale(-1, 1); }
      if (m === 'top') { o.rect(0, h / 2, w, h / 2); o.clip(); o.clearRect(0, 0, w, h); o.translate(0, h); o.scale(1, -1); }
      if (m === 'bottom') { o.rect(0, 0, w, h / 2); o.clip(); o.clearRect(0, 0, w, h); o.translate(0, h); o.scale(1, -1); }
      o.drawImage(c, 0, 0);
      o.restore();
      return r;
    };
    if (mode === 'quad') return step(step(out, 'left'), 'top');
    return step(out, mode);
  };

  IMG.GLITCH_PRESETS = {
    GL1: { shift: 35, slices: 30, blocks: 15, scan: 20, noise: 10, color: 10 },
    GL2: { shift: 80, slices: 10, blocks: 0, scan: 0, noise: 0, color: 35 },
    GL3: { shift: 20, slices: 75, blocks: 40, scan: 45, noise: 25, color: 0 },
    GL4: { shift: 55, slices: 50, blocks: 70, scan: 65, noise: 45, color: 55 },
    RST: { shift: 0, slices: 0, blocks: 0, scan: 0, noise: 0, color: 0 },
  };

  IMG.glitch = (src, o) => {
    let w = src.width, h = src.height;
    let base = src;
    if (o.vertical) {
      const t = U.canvas(h, w), x = t.getContext('2d');
      x.translate(h, 0); x.rotate(Math.PI / 2); x.drawImage(src, 0, 0);
      base = t; [w, h] = [h, w];
    }
    const rel = Math.min(w, h) / 100, rnd = U.rng(o.seed || 7);
    const sh = (o.shift || 0) / 100, sl = (o.slices || 0) / 100, bl = (o.blocks || 0) / 100;
    // Renk kayması: kırmızı ve mavi kanal zıt yönlere kayar (en çok kısa kenarın %12'si; belirgin görünsün)
    const so = sh * rel * 12;
    let out = sh ? IMG.rgbShift(base, [so, so * 0.12], [-so, -so * 0.12]) : U.clone(base);
    // Kaymış şeritlerde kanallar daha da ayrışır; gerçek görüntü bozulmasına benzer
    const strong = (sl || bl) ? IMG.rgbShift(base, [rel * (1.5 + sh * 9), 0], [-rel * (1.5 + sh * 9), 0]) : null;
    const wrapDraw = (x, from, y, hh, dx) => {
      x.drawImage(from, 0, y, w, hh, dx, y, w, hh);
      if (dx > 0) x.drawImage(from, w - dx, y, dx, hh, 0, y, dx, hh);
      else if (dx < 0) x.drawImage(from, 0, y, -dx, hh, w + dx, y, -dx, hh);
    };
    if (sl) {
      const srcC = U.clone(out), x = out.getContext('2d');
      const n = Math.round(sl * 30) + 2;
      for (let i = 0; i < n; i++) {
        // ince ve kalın şeritler karışık; bazıları kanal ayrışmalı
        const thin = rnd() < 0.6;
        const y = rnd() * h, hh = rel * (thin ? 0.3 + rnd() * 1.5 : 2 + rnd() * 9);
        const dx = (rnd() - 0.5) * sl * rel * (thin ? 60 : 35);
        x.clearRect(0, y, w, hh);
        wrapDraw(x, rnd() < 0.45 ? strong : srcC, y, hh, dx);
      }
    }
    if (bl) {
      // Bozuk bloklar: görüntünün başka yerlerinden kopmuş küçük dikdörtgenler
      const srcC = U.clone(out), x = out.getContext('2d');
      const n = Math.round(bl * 40) + 1;
      for (let i = 0; i < n; i++) {
        const bw = rel * (4 + rnd() * 26), bh = rel * (0.8 + rnd() * 5);
        const tx = rnd() * (w - bw), ty = rnd() * (h - bh);
        const sx = Math.min(w - bw, Math.max(0, tx + (rnd() - 0.5) * rel * 40)), sy = Math.min(h - bh, Math.max(0, ty + (rnd() - 0.5) * rel * 6));
        x.drawImage(rnd() < 0.5 ? strong : srcC, sx, sy, bw, bh, tx, ty, bw, bh);
      }
    }
    if (o.color) {
      const x = out.getContext('2d');
      const n = Math.round(o.color / 100 * 8) + 1;
      x.globalCompositeOperation = 'difference';
      for (let i = 0; i < n; i++) {
        x.globalAlpha = 0.25 + rnd() * 0.5 * o.color / 100;
        x.fillStyle = `hsl(${Math.round(rnd() * 360)},100%,50%)`;
        x.fillRect(0, rnd() * h, w, rel * (1 + rnd() * 10));
      }
      x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
    }
    if (o.noise) {
      const ns = U.canvas(Math.ceil(w / 2), Math.ceil(h / 2)), nx = ns.getContext('2d');
      const id = nx.createImageData(ns.width, ns.height);
      for (let i = 0; i < id.data.length; i += 4) { const v = rnd() * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
      nx.putImageData(id, 0, 0);
      const x = out.getContext('2d');
      x.globalCompositeOperation = 'overlay'; x.globalAlpha = o.noise / 100 * 0.6;
      x.imageSmoothingEnabled = false;
      x.drawImage(ns, 0, 0, w, h);
      x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
    }
    if (o.scan) {
      const x = out.getContext('2d'), step = Math.max(2, Math.round(rel * 0.45));
      x.fillStyle = `rgba(0,0,0,${o.scan / 100 * 0.55})`;
      for (let y = 0; y < h; y += step * 2) x.fillRect(0, y, w, step);
    }
    {
      // Orijinalin saydamlığını koru; efektin boş bıraktığı yerlerde orijinal görünsün (fotoğraf kaybolmasın)
      const fin = U.clone(base), x = fin.getContext('2d');
      x.globalCompositeOperation = 'source-atop';
      x.drawImage(out, 0, 0);
      out = fin;
    }
    if (o.vertical) {
      const t = U.canvas(h, w), x = t.getContext('2d');
      x.translate(0, w); x.rotate(-Math.PI / 2); x.drawImage(out, 0, 0);
      out = t;
    }
    return out;
  };

  IMG.dispersion = (src, o) => {
    const w = src.width, h = src.height, rel = Math.min(w, h) / 100, rnd = U.rng(o.seed || 3);
    const a = (o.angle || 0) * Math.PI / 180, dx = Math.cos(a), dy = Math.sin(a);
    const amt = (o.amount == null ? 60 : o.amount) / 100, start = (o.start == null ? 40 : o.start) / 100;
    const size = Math.max(2, rel * (0.4 + (o.size == null ? 30 : o.size) / 100 * 3.5));
    const pmin = Math.min(0, w * dx) + Math.min(0, h * dy), pmax = Math.max(0, w * dx) + Math.max(0, h * dy);
    const out = U.clone(src), x = out.getContext('2d');
    const N = Math.min(70000, Math.round((w * h) / (size * size) * 1.4 * amt));
    const maxD = Math.max(w, h) * 0.35 * amt;
    const parts = [];
    for (let i = 0; i < N; i++) {
      const px = rnd() * w, py = rnd() * h;
      const t = ((px * dx + py * dy) - pmin) / (pmax - pmin || 1);
      const p = U.smooth(start, 1, t);
      if (rnd() > p) continue;
      const s = size * (0.4 + rnd() * 0.9);
      parts.push([px, py, s, rnd() * maxD * (0.3 + t)]);
    }
    for (const [px, py, s] of parts) x.clearRect(px, py, s, s);
    for (const [px, py, s, dd] of parts) {
      const j = (rnd() - 0.5) * dd * 0.35;
      x.drawImage(src, px, py, s, s, px + dx * dd - dy * j, py + dy * dd + dx * j, s, s);
    }
    return out;
  };

  IMG.LEAKS = [
    ['#ff6a00', '#ff0080'], ['#ffd000', '#ff5e00'], ['#00e1ff', '#7a00ff'],
    ['#ff3d3d', '#ffb347'], ['#ff00cc', '#3333ff'], ['#fff1a8', '#ff8c42'],
  ];
  IMG.lightLeak = (src, style = 0, amt = 70, pos = 0) => {
    const w = src.width, h = src.height, M = Math.max(w, h);
    const cols = IMG.LEAKS[style % IMG.LEAKS.length];
    const out = U.clone(src), o = out.getContext('2d');
    const a = pos * Math.PI / 180;
    const ex = w / 2 + Math.cos(a) * w * 0.55, ey = h / 2 + Math.sin(a) * h * 0.55;
    o.globalCompositeOperation = 'screen';
    o.globalAlpha = amt / 100;
    const blob = (x, y, r, c) => {
      const g = o.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, c); g.addColorStop(0.45, U.rgba(c, 0.55)); g.addColorStop(1, U.rgba(c, 0));
      o.fillStyle = g; o.fillRect(0, 0, w, h);
    };
    blob(ex, ey, M * 0.65, cols[0]);
    blob(ex + Math.cos(a + 1.2) * M * 0.25, ey + Math.sin(a + 1.2) * M * 0.25, M * 0.45, cols[1]);
    o.globalAlpha = amt / 100 * 0.35;
    blob(w - ex, h - ey, M * 0.3, cols[1]);
    o.globalAlpha = 1;
    o.globalCompositeOperation = 'destination-in';
    o.drawImage(src, 0, 0);
    o.globalCompositeOperation = 'source-over'; // sonucun üzerine sonradan çizilenler normal kipte çizilsin
    return out;
  };

  IMG.colorSplash = (src, hue, range = 30, soft = 20) => {
    const img = U.getData(src), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const [H, S] = U.rgb2hsl(d[i], d[i + 1], d[i + 2]);
      let dd = Math.abs(H - hue); if (dd > 180) dd = 360 - dd;
      const keep = (1 - U.smooth(range, range + soft + 0.01, dd)) * U.smooth(0.08, 0.2, S);
      const L = lum(d[i], d[i + 1], d[i + 2]);
      d[i] = L + (d[i] - L) * keep; d[i + 1] = L + (d[i + 1] - L) * keep; d[i + 2] = L + (d[i + 2] - L) * keep;
    }
    return U.fromData(img);
  };

  IMG.chromatic = (src, amt = 30) => {
    const k = amt / 100 * 0.02;
    return IMG.rgbShift(src, [0, 0], [0, 0], 1 + k, 1 - k);
  };

  IMG.upscale = (src, f) => {
    const w = Math.round(src.width * f), h = Math.round(src.height * f);
    const out = U.canvas(w, h), o = out.getContext('2d');
    o.imageSmoothingQuality = 'high';
    o.drawImage(src, 0, 0, w, h);
    return IMG.unsharp(IMG.denoise(out, 18), 0.8 * f, 0.7, 2);
  };

  IMG.skinSmooth = (src, amount = 60) => {
    const w = src.width, h = src.height;
    const bd = U.getData(IMG.blur(src, Math.max(1.5, Math.min(w, h) * 0.006))).data;
    const img = U.getData(src), d = img.data, a = amount / 100;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      // ten rengi olasılığı (YCbCr tabanlı)
      const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b, cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
      const skin = (1 - U.smooth(8, 22, Math.abs(cb - 110))) * (1 - U.smooth(10, 26, Math.abs(cr - 150)));
      const diff = Math.abs(lum(r, g, b) - lum(bd[i], bd[i + 1], bd[i + 2]));
      const wgt = a * skin * Math.exp(-(diff * diff) / 900);
      d[i] += (bd[i] - r) * wgt; d[i + 1] += (bd[i + 1] - g) * wgt; d[i + 2] += (bd[i + 2] - b) * wgt;
    }
    return U.fromData(img);
  };

  /* ------------------------------------------------------------ hazır efektler */
  IMG.EFFECTS = [
    // Temel
    { cat: 'Basic', name: 'Vivid', adj: { vibrance: 45, saturation: 10, contrast: 12, clarity: 10 } },
    { cat: 'Basic', name: 'Bright', adj: { exposure: 12, shadows: 25, highlights: -10, vibrance: 15 } },
    { cat: 'Basic', name: 'Soft', adj: { contrast: -18, fade: 30, highlights: -15, saturation: -8 } },
    { cat: 'Basic', name: 'Crisp', adj: { clarity: 40, sharpen: 35, contrast: 10 } },
    { cat: 'Basic', name: 'Matte', adj: { fade: 55, contrast: -10, saturation: -12 } },
    { cat: 'Basic', name: 'Drama', adj: { contrast: 35, clarity: 45, highlights: -30, shadows: -10, vignette: -40, saturation: -15 } },
    { cat: 'Basic', name: 'Natural', adj: { vibrance: 20, shadows: 15, highlights: -12, temperature: 5 } },
    { cat: 'Basic', name: 'Pastel', adj: { fade: 40, saturation: -25, brightness: 15, tint: 8 } },
    // Vintage
    { cat: 'Vintage', name: 'Retro 70s', adj: { temperature: 30, fade: 35, saturation: -15, split: { sh: '#2a5d8a', hi: '#ffb35a', amt: 45 }, grain: 18 } },
    { cat: 'Vintage', name: 'Instant Film', adj: { fade: 45, temperature: 12, tint: 10, contrast: -8, vignette: -25, split: { sh: '#3a6b8f', hi: '#fff0c0', amt: 35 } } },
    { cat: 'Vintage', name: 'Warm Film', adj: { temperature: 22, contrast: 15, saturation: 12, highlights: -12, split: { sh: '#46325a', hi: '#ffd28a', amt: 30 } } },
    { cat: 'Vintage', name: 'Sepia', adj: { sepia: 1, contrast: 8, fade: 15, vignette: -25 } },
    { cat: 'Vintage', name: 'Faded', adj: { fade: 60, saturation: -35, temperature: 10 } },
    { cat: 'Vintage', name: 'Toy Camera', adj: { contrast: 40, saturation: 30, vignette: -75, vigSize: 30, split: { sh: '#003a6e', hi: '#ffe066', amt: 30 } } },
    { cat: 'Vintage', name: 'Old Film', adj: { sepia: 0.55, fade: 35, grain: 45, vignette: -45, contrast: 10 } },
    { cat: 'Vintage', name: 'Cross Process', adj: { curves: { rgb: [[0, 0], [255, 255]], r: [[0, 0], [70, 40], [190, 220], [255, 255]], g: [[0, 0], [70, 60], [190, 210], [255, 255]], b: [[0, 40], [255, 200]] }, saturation: 15 } },
    // S&B
    { cat: 'B&W', name: 'Classic', adj: { gray: 1, contrast: 12 } },
    { cat: 'B&W', name: 'High Contrast', adj: { gray: 1, contrast: 55, clarity: 30, blacks: -25 } },
    { cat: 'B&W', name: 'Noir', adj: { gray: 1, contrast: 45, vignette: -70, shadows: -25, grain: 15 } },
    { cat: 'B&W', name: 'Silver', adj: { gray: 1, fade: 25, brightness: 12, contrast: -5 } },
    { cat: 'B&W', name: 'Selenium', adj: { gray: 1, contrast: 15, split: { sh: '#4a2c5e', hi: '#e8d9c4', amt: 55 } } },
    { cat: 'B&W', name: 'Cool B&W', adj: { gray: 1, contrast: 18, split: { sh: '#1f3d6b', hi: '#d8ecff', amt: 50 } } },
    { cat: 'B&W', name: 'Grain', adj: { gray: 1, contrast: 25, grain: 55 } },
    // Sinematik
    { cat: 'Cinematic', name: 'Teal & Orange', adj: { split: { sh: '#00727a', hi: '#ff9a3c', amt: 70 }, contrast: 18, saturation: 5 } },
    { cat: 'Cinematic', name: 'Cinema', adj: { split: { sh: '#0d4d6b', hi: '#ffb070', amt: 55 }, contrast: 30, clarity: 25, vignette: -30 } },
    { cat: 'Cinematic', name: 'Digital Green', adj: { mix: [0.8, 0.2, 0, 0.1, 1, 0.1, 0, 0.3, 0.6], tint: -30, contrast: 20, saturation: -20 } },
    { cat: 'Cinematic', name: 'Bleach Bypass', adj: { saturation: -55, contrast: 45, clarity: 25, highlights: -15 } },
    { cat: 'Cinematic', name: 'Night', adj: { temperature: -45, exposure: -25, contrast: 15, saturation: -20, vignette: -40 } },
    { cat: 'Cinematic', name: 'Desert', adj: { temperature: 50, tint: 8, contrast: 15, fade: 15, saturation: -10 } },
    { cat: 'Cinematic', name: 'Neo Noir', adj: { split: { sh: '#2b0f4a', hi: '#ff3d8b', amt: 55 }, contrast: 30, saturation: -20 } },
    { cat: 'Cinematic', name: 'Anamorphic', adj: { split: { sh: '#132f5c', hi: '#f2c48d', amt: 45 }, fade: 20, vignette: -35, contrast: 12 } },
    // Sıcak & Soğuk
    { cat: 'Warm/Cool', name: 'Sunset', adj: { temperature: 45, tint: 15, saturation: 15, split: { sh: '#6b2a5c', hi: '#ffb347', amt: 40 } } },
    { cat: 'Warm/Cool', name: 'Golden Hour', adj: { temperature: 35, exposure: 8, highlights: -15, vibrance: 25 } },
    { cat: 'Warm/Cool', name: 'Winter', adj: { temperature: -45, saturation: -20, brightness: 12, fade: 15 } },
    { cat: 'Warm/Cool', name: 'Ocean', adj: { temperature: -30, tint: -10, vibrance: 30, split: { sh: '#003b5c', hi: '#b5f2ff', amt: 35 } } },
    { cat: 'Warm/Cool', name: 'Lavender', adj: { tint: 30, temperature: -10, fade: 20, saturation: -10 } },
    { cat: 'Warm/Cool', name: 'Pink', adj: { tint: 25, temperature: 12, brightness: 10, fade: 15 } },
    { cat: 'Warm/Cool', name: 'Forest', adj: { hsl: { green: { h: -20, s: 25, l: -10 }, yellow: { h: -15, s: 10 } }, temperature: -10, contrast: 12 } },
    // Sanatsal
    { cat: 'Artistic', name: 'Pop Art', adj: { posterize: 5, saturation: 70, contrast: 30 } },
    { cat: 'Artistic', name: 'Pencil Sketch', fx: (c) => IMG.sketch(c, 60, false) },
    { cat: 'Artistic', name: 'Color Pencil', fx: (c) => IMG.sketch(c, 45, true) },
    { cat: 'Artistic', name: 'Cartoon', fx: (c) => IMG.cartoon(c, 6, 50) },
    { cat: 'Artistic', name: 'Thermal', adj: { gradMap: { stops: ['#000033', '#3b00a3', '#d4006a', '#ff6a00', '#ffd200', '#ffffff'] } } },
    { cat: 'Artistic', name: 'Infrared', adj: { mix: [0.1, 1.1, -0.2, 0.1, 0.9, 0, -0.1, 0.4, 0.7], hue: 180, contrast: 15, saturation: -20 } },
    { cat: 'Artistic', name: 'Negative', adj: { invert: true } },
    { cat: 'Artistic', name: 'Night Vision', adj: { gradMap: { stops: ['#001a00', '#00ff40', '#d6ffd6'] }, grain: 30, vignette: -60 } },
    { cat: 'Artistic', name: 'Cyanotype', adj: { gradMap: { stops: ['#04204a', '#1f5ea8', '#e6f2ff'] } } },
    { cat: 'Artistic', name: 'Purple Orange', adj: { gradMap: { stops: ['#3a0ca3', '#f72585', '#ffba08'] } } },
    { cat: 'Artistic', name: 'Neon Edges', fx: (c) => IMG.neonEdges(c, 60, 'color') },
    { cat: 'Artistic', name: 'Oil Paint', fx: (c, s) => IMG.kuwahara(c, Math.max(2, Math.min(c.width, c.height) * 0.006)) },
  ];

  IMG.applyEffect = (src, def, intensity = 1, scale = 1) => {
    let out = def.adj ? IMG.adjust(src, def.adj, scale) : src;
    if (def.fx) out = def.fx(out, scale);
    if (out === src) out = U.clone(src);
    return IMG.mixWith(src, out, intensity);
  };
})();
