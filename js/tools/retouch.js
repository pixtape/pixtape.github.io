'use strict';
/* Rötuş aracı: leke/nesne kaldırma, cilt, bulanıklaştırma, aydınlat/karart, kırmızı göz, sansür */
(() => {
  const { U, ui: UI, IMG } = App;
  const h = U.h;
  const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

  /* ------------------------------------------------ iyileştirme (inpaint) çekirdeği
     Maske bölgesini, sınır çevresine en iyi uyan komşu yamayla doldurur ve
     sınır farkını içeri yayarak (Poisson benzeri) dikişsiz karıştırır. */
  function heal(canvas, maskCanvas) {
    const W = canvas.width, H = canvas.height;
    const md = U.getData(maskCanvas).data;
    let bx0 = W, by0 = H, bx1 = -1, by1 = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (md[(y * W + x) * 4 + 3] > 20) { if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; }
    }
    if (bx1 < 0) return false;
    const bw = bx1 - bx0 + 1, bh = by1 - by0 + 1;
    const pad = Math.max(4, Math.round(Math.max(bw, bh) * 0.25));
    const rx0 = Math.max(0, bx0 - pad), ry0 = Math.max(0, by0 - pad), rx1 = Math.min(W, bx1 + pad + 1), ry1 = Math.min(H, by1 + pad + 1);
    const rw = rx1 - rx0, rh = ry1 - ry0;
    const ctx = canvas.getContext('2d');
    const full = ctx.getImageData(0, 0, W, H), I = full.data;
    // maske (bölge içinde)
    const M = new Uint8Array(rw * rh), A = new Float32Array(rw * rh);
    for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
      const a = md[((y + ry0) * W + x + rx0) * 4 + 3];
      A[y * rw + x] = a / 255;
      if (a > 20) M[y * rw + x] = 1;
    }
    // çevre bandı
    const band = [];
    for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
      const j = y * rw + x;
      if (M[j]) continue;
      let near = false;
      for (let dy = -3; dy <= 3 && !near; dy += 3) for (let dx = -3; dx <= 3; dx += 3) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < rw && yy < rh && M[yy * rw + xx]) { near = true; break; }
      }
      if (near) band.push(j);
    }
    // aday ofsetler
    const S = Math.max(bw, bh);
    let best = null, bestScore = Infinity;
    const bandStep = Math.max(1, Math.floor(band.length / 1500));
    for (const dist of [1.1, 1.5, 2.2, 3]) {
      for (let k = 0; k < 16; k++) {
        const a = k / 16 * Math.PI * 2;
        const ox = Math.round(Math.cos(a) * S * dist), oy = Math.round(Math.sin(a) * S * dist);
        if (rx0 + ox < 0 || ry0 + oy < 0 || rx1 + ox > W || ry1 + oy > H) continue;
        let sc = 0, n = 0;
        for (let b = 0; b < band.length; b += bandStep) {
          const j = band[b], x = j % rw + rx0, y = (j / rw | 0) + ry0;
          const i1 = (y * W + x) * 4, i2 = ((y + oy) * W + x + ox) * 4;
          const dr = I[i1] - I[i2], dg = I[i1 + 1] - I[i2 + 1], db = I[i1 + 2] - I[i2 + 2];
          sc += dr * dr + dg * dg + db * db; n++;
        }
        // kaynak bölgede maske olmamalı (kendini kopyalamasın)
        let overlap = 0;
        for (let y = 0; y < rh; y += 3) for (let x = 0; x < rw; x += 3) {
          if (!M[y * rw + x]) continue;
          const sx = x + ox, sy = y + oy;
          if (sx >= 0 && sy >= 0 && sx < rw && sy < rh && M[sy * rw + sx]) overlap++;
        }
        sc = sc / Math.max(1, n) * (1 + overlap * 0.05) * (1 + (dist - 1) * 0.15);
        if (sc < bestScore) { bestScore = sc; best = [ox, oy]; }
      }
    }
    // Yama + sınır farkı difüzyonu
    const R = new Float32Array(rw * rh * 3);
    for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
      const j = y * rw + x, gx = x + rx0, gy = y + ry0;
      let i = (gy * W + gx) * 4;
      if (M[j] && best) i = ((gy + best[1]) * W + gx + best[0]) * 4;
      R[j * 3] = I[i]; R[j * 3 + 1] = I[i + 1]; R[j * 3 + 2] = I[i + 2];
    }
    if (best) {
      // fark alanı: sınırda (hedef - kaynak), içeride yay
      const D = new Float32Array(rw * rh * 3), fixed = new Uint8Array(rw * rh);
      for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
        const j = y * rw + x;
        if (M[j]) continue;
        fixed[j] = 1;
        const gx = x + rx0, gy = y + ry0, i1 = (gy * W + gx) * 4, i2 = ((gy + best[1]) * W + gx + best[0]) * 4;
        D[j * 3] = I[i1] - I[i2]; D[j * 3 + 1] = I[i1 + 1] - I[i2 + 1]; D[j * 3 + 2] = I[i1 + 2] - I[i2 + 2];
      }
      // çok çözünürlüklü yerine basit Jacobi; ilk değeri sınır ortalaması ile başlat
      const mean = [0, 0, 0];
      for (const j of band) for (let c = 0; c < 3; c++) mean[c] += D[j * 3 + c] / Math.max(1, band.length);
      for (let j = 0; j < rw * rh; j++) if (!fixed[j]) for (let c = 0; c < 3; c++) D[j * 3 + c] = mean[c];
      const iters = Math.min(400, 40 + Math.round(Math.max(bw, bh) * 1.2));
      const tmp = new Float32Array(D.length);
      for (let it = 0; it < iters; it++) {
        tmp.set(D);
        for (let y = 1; y < rh - 1; y++) for (let x = 1; x < rw - 1; x++) {
          const j = y * rw + x;
          if (fixed[j]) continue;
          for (let c = 0; c < 3; c++) {
            D[j * 3 + c] = (tmp[(j - 1) * 3 + c] + tmp[(j + 1) * 3 + c] + tmp[(j - rw) * 3 + c] + tmp[(j + rw) * 3 + c]) * 0.25;
          }
        }
      }
      for (let j = 0; j < rw * rh; j++) if (M[j]) { R[j * 3] += D[j * 3]; R[j * 3 + 1] += D[j * 3 + 1]; R[j * 3 + 2] += D[j * 3 + 2]; }
    } else {
      // uygun yama yoksa yalnızca difüzyonla doldur
      for (let it = 0; it < 300; it++) for (let y = 1; y < rh - 1; y++) for (let x = 1; x < rw - 1; x++) {
        const j = y * rw + x;
        if (!M[j]) continue;
        for (let c = 0; c < 3; c++) R[j * 3 + c] = (R[(j - 1) * 3 + c] + R[(j + 1) * 3 + c] + R[(j - rw) * 3 + c] + R[(j + rw) * 3 + c]) * 0.25;
      }
    }
    // yumuşak kenarla geri yaz
    const out = ctx.getImageData(rx0, ry0, rw, rh), o = out.data;
    for (let j = 0; j < rw * rh; j++) {
      const a = Math.min(1, A[j] * 1.4);
      if (a <= 0) continue;
      o[j * 4] += (R[j * 3] - o[j * 4]) * a;
      o[j * 4 + 1] += (R[j * 3 + 1] - o[j * 4 + 1]) * a;
      o[j * 4 + 2] += (R[j * 3 + 2] - o[j * 4 + 2]) * a;
    }
    ctx.putImageData(out, rx0, ry0);
    return true;
  }
  App.heal = heal;

  const MODES = [
    ['spot', 'Blemish', 'retouch', 'Remove spots and blemishes by clicking or painting over them.'],
    ['object', 'Erase Object', 'wand', 'Paint over the object you want to remove.'],
    ['clone', 'Clone', 'stamp', 'First click the spot to copy from (source). Then it is copied wherever you paint. Alt + click to change the source.'],
    ['skin', 'Skin', 'sun', 'Smooths skin where you paint.'],
    ['blur', 'Blurred', 'droplet', 'Blurs the area you paint.'],
    ['dodge', 'Lighten', 'sun', 'Lightens the area you paint.'],
    ['burn', 'Darken', 'moon', 'Darkens the area you paint.'],
    ['redeye', 'Red Eye', 'eye', 'Click on the red eyes.'],
    ['censor', 'Censor', 'grid', 'Hides the area you paint by pixelating it.'],
  ];

  const T = {
    id: 'retouch', name: 'Retouch', icon: 'retouch', key: 'R', cursor: 'none',
    mode: 'spot', size: 40, strength: 50, hard: 50, range: 'mid',
    L: null, stroke: null,
    brushSize() { return T.size; },

    src: null, off: null, srcLayer: null, // klon damgası kaynağı (katman koordinatı) ve sabit kayma
    async activate() {
      T.L = await App.pixelLayer(true);
      if (!T.L) UI.toast('Select an image layer to retouch', 'warn');
    },
    deactivate() { T.stroke = null; App.strokePreview = null; },
    refresh() { const L = App.activeLayer(); T.L = L && L.type === 'raster' ? L : null; },
    setMode(m) { T.mode = m; if (T.seg) T.seg.set(m); T.updHint(); if (m === 'object' && T.size < 40) T.setSize(60); if (T.cloneRow) T.cloneRow.style.display = m === 'clone' ? '' : 'none'; App.requestRender(); },
    setSize(v) { T.size = v; if (T.sizeSl) T.sizeSl.set(v); },
    lr() { return T.size / 2 / App.layerScale(T.L); },
    resetSource() { T.src = null; T.off = null; App.requestRender(); },

    onDown(p, e) {
      if (!T.L) return;
      const q = App.docToLayer(T.L, p.x, p.y);
      if (T.mode === 'clone') {
        // kaynak seçimi: ilk tıklama ya da Alt + tıklama
        if (!T.src || T.srcLayer !== T.L.id || (e && e.altKey)) {
          T.src = q; T.off = null; T.srcLayer = T.L.id;
          UI.toast('Source point set. Now paint where you want to copy it.', 'ok', 2200);
          App.requestRender();
          return;
        }
        if (!T.off) T.off = { x: T.src.x - q.x, y: T.src.y - q.y };
      }
      App.beginPixelEdit(T.L);
      const c = T.L.canvas;
      T.ctx = c.getContext('2d');
      T.stroke = { last: q, st: {}, start: q };
      if (T.mode === 'clone') { T.snap = U.clone(c); T.cloneDab(q.x, q.y); App.requestRender(); return; }
      if (T.mode === 'spot' || T.mode === 'object') {
        // maskeyi topla, bırakınca iyileştir
        T.mask = U.canvas(c.width, c.height);
        T.mctx = T.mask.getContext('2d');
        T.mctx.fillStyle = 'rgba(255,40,80,1)';
        App.strokePreview = { layer: T.L, canvas: T.mask, alpha: 0.45, op: 'source-over' };
        T.maskDab(q.x, q.y);
        return;
      }
      if (T.mode === 'redeye') { T.redEye(q.x, q.y); App.requestRender(); return; }
      T.fx = null;
      T.dab(q.x, q.y);
    },
    onMove(p) {
      if (!T.stroke) return;
      const q = App.docToLayer(T.L, p.x, p.y);
      const r = T.lr();
      const sp = Math.max(1, r * 0.25);
      if (T.mode === 'clone') App.interp(T.stroke.last, q, Math.max(1, r * 0.2), (x, y) => T.cloneDab(x, y), T.stroke.st);
      else if (T.mode === 'spot' || T.mode === 'object') App.interp(T.stroke.last, q, Math.max(1, r * 0.2), (x, y) => T.maskDab(x, y), T.stroke.st);
      else if (T.mode !== 'redeye') App.interp(T.stroke.last, q, sp, (x, y) => T.dab(x, y), T.stroke.st);
      T.stroke.last = q;
      App.requestRender();
    },
    async onUp() {
      if (!T.stroke) return;
      T.stroke = null;
      if (T.mode === 'spot' || T.mode === 'object') {
        App.strokePreview = null;
        const L = T.L, mask = T.mask;
        await App.busy(T.mode === 'object' ? 'Removing Object…' : 'Fixing…', () => { heal(L.canvas, mask); });
        T.mask = null;
      }
      T.snap = null; T.fx = null;
      App.commit({ spot: 'Spot Heal', object: 'Remove Object', clone: 'Clone Stamp', blur: 'Blur', dodge: 'Lighten', burn: 'Darken', skin: 'Smooth Skin', redeye: 'Red Eye', censor: 'Censor' }[T.mode]);
    },

    // Klon: kaynaktaki (darbe başındaki görüntüden) yuvarlak, yumuşak kenarlı parçayı buraya kopyala
    cloneDab(x, y) {
      const r = T.lr(), s = Math.ceil(r * 2) + 2, o = T.off;
      const tmp = U.canvas(s, s), t = tmp.getContext('2d');
      t.drawImage(T.snap, x + o.x - s / 2, y + o.y - s / 2, s, s, 0, 0, s, s);
      const g = t.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, r);
      g.addColorStop(0, '#000'); g.addColorStop(0.6, '#000'); g.addColorStop(1, 'rgba(0,0,0,0)');
      t.globalCompositeOperation = 'destination-in';
      t.fillStyle = g; t.fillRect(0, 0, s, s);
      T.ctx.globalAlpha = U.clamp(T.strength / 50, 0.05, 1); // Güç 50 ve üstü: tam kopya
      T.ctx.drawImage(tmp, x - s / 2, y - s / 2);
      T.ctx.globalAlpha = 1;
    },
    drawOverlay(ctx) {
      if (T.mode !== 'clone' || !T.L || !T.src || T.srcLayer !== T.L.id) return;
      const cur = T.stroke && T.off ? { x: T.stroke.last.x + T.off.x, y: T.stroke.last.y + T.off.y } : T.src;
      const d = App.layerToDoc(T.L, cur.x, cur.y), s = App.docToScreen(d.x, d.y);
      const r = Math.max(4, T.size / 2 * App.view.zoom);
      ctx.save();
      ctx.lineWidth = 1.5;
      for (const [col, w] of [['rgba(0,0,0,.6)', 3], ['#fff', 1.5]]) {
        ctx.strokeStyle = col; ctx.lineWidth = w;
        ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
        ctx.moveTo(s.x - 7, s.y); ctx.lineTo(s.x + 7, s.y); ctx.moveTo(s.x, s.y - 7); ctx.lineTo(s.x, s.y + 7);
        ctx.stroke();
      }
      ctx.restore();
    },

    maskDab(x, y) {
      const r = T.lr(), g = T.mctx;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    },

    /* Bulanık / cilt / sansür: efekt görüntüsü darbe başındaki hâlden, yalnızca fırçanın değdiği
       256 px'lik parçalar için bir kez hesaplanır; her damga bu hazır görüntüden yumuşak kenarlı
       bir daireyi GPU ile karıştırır (her damgada piksel piksel hesap yapılmaz, takılma olmaz). */
    fxStart() {
      const c = T.L.canvas, r = T.lr(), mode = T.mode;
      const s = Math.ceil(r * 2) + 2;
      T.fx = {
        mode, r, snap: U.clone(c), canvas: U.canvas(c.width, c.height), done: new Set(), tile: 256,
        rad: mode === 'skin' ? Math.max(1.5, r * 0.18) : Math.max(1, r * 0.12),
        cell: Math.max(4, Math.round(r * 0.3)),
        tmp: U.canvas(s, s),
        alpha: mode === 'censor' ? 1 : U.clamp(T.strength / 100 * 0.6, 0.02, 1),
      };
    },
    fxTile(tx, ty) {
      const F = T.fx, S = F.tile, c = F.snap, W = c.width, H = c.height;
      const rx = tx * S, ry = ty * S, rw = Math.min(S, W - rx), rh = Math.min(S, H - ry);
      if (rw <= 0 || rh <= 0) return;
      const out = F.canvas.getContext('2d');
      if (F.mode === 'censor') {
        // tuval ızgarasına hizalı kareler: hücre ortalaması küçültüp keskin büyütmeyle alınır
        const cell = F.cell, ax = Math.floor(rx / cell) * cell, ay = Math.floor(ry / cell) * cell;
        const aw = Math.ceil((rx + rw - ax) / cell), ah = Math.ceil((ry + rh - ay) / cell);
        const sm = U.canvas(aw, ah), sx = sm.getContext('2d');
        sx.imageSmoothingQuality = 'high';
        sx.drawImage(c, ax, ay, aw * cell, ah * cell, 0, 0, aw, ah);
        out.save(); out.beginPath(); out.rect(rx, ry, rw, rh); out.clip();
        out.imageSmoothingEnabled = false;
        out.drawImage(sm, ax, ay, aw * cell, ah * cell);
        out.restore();
        return;
      }
      const m = Math.ceil(F.rad * 3) + 2;
      const t = U.canvas(rw + m * 2, rh + m * 2), x = t.getContext('2d');
      x.filter = `blur(${F.rad}px)`;
      x.drawImage(c, rx - m, ry - m, rw + m * 2, rh + m * 2, 0, 0, rw + m * 2, rh + m * 2);
      x.filter = 'none';
      if (F.mode === 'skin') {
        // kenarları koru: bulanık hâlle çok farklı (kenar, göz, kaş) pikseller az değişir
        const b = x.getImageData(m, m, rw, rh), bd = b.data;
        const o = c.getContext('2d').getImageData(rx, ry, rw, rh).data;
        for (let i = 0; i < bd.length; i += 4) {
          const diff = lum(o[i], o[i + 1], o[i + 2]) - lum(bd[i], bd[i + 1], bd[i + 2]);
          const w = Math.exp(-(diff * diff) / 600);
          bd[i] = o[i] + (bd[i] - o[i]) * w; bd[i + 1] = o[i + 1] + (bd[i + 1] - o[i + 1]) * w; bd[i + 2] = o[i + 2] + (bd[i + 2] - o[i + 2]) * w;
          bd[i + 3] = o[i + 3];
        }
        out.putImageData(b, rx, ry);
      } else out.drawImage(t, m, m, rw, rh, rx, ry, rw, rh);
    },
    fxDab(cx, cy) {
      const F = T.fx, r = F.r, S = F.tile;
      const W = F.canvas.width, H = F.canvas.height;
      const tx0 = Math.max(0, Math.floor((cx - r) / S)), ty0 = Math.max(0, Math.floor((cy - r) / S));
      const tx1 = Math.min(Math.ceil(W / S) - 1, Math.floor((cx + r) / S)), ty1 = Math.min(Math.ceil(H / S) - 1, Math.floor((cy + r) / S));
      for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
        const key = tx + ',' + ty;
        if (!F.done.has(key)) { F.done.add(key); T.fxTile(tx, ty); }
      }
      const t = F.tmp, s = t.width, x = t.getContext('2d'), hard = T.hard / 100;
      x.globalCompositeOperation = 'copy';
      x.drawImage(F.canvas, cx - s / 2, cy - s / 2, s, s, 0, 0, s, s);
      const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, r);
      g.addColorStop(0, `rgba(0,0,0,${F.alpha})`); g.addColorStop(hard, `rgba(0,0,0,${F.alpha})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.globalCompositeOperation = 'destination-in';
      x.fillStyle = g; x.fillRect(0, 0, s, s);
      x.globalCompositeOperation = 'source-over';
      T.ctx.drawImage(t, cx - s / 2, cy - s / 2);
      App.requestRender();
    },

    // ortak: yarıçap içindeki ağırlıklarla bir işlemi karıştır
    dab(cx, cy) {
      const mode = T.mode;
      if (mode === 'blur' || mode === 'skin' || mode === 'censor') {
        if (!T.fx || T.fx.mode !== mode) T.fxStart();
        T.fxDab(cx, cy);
        return;
      }
      const c = T.L.canvas, W = c.width, H = c.height, r = T.lr();
      const x0 = Math.max(0, Math.floor(cx - r)), y0 = Math.max(0, Math.floor(cy - r));
      const x1 = Math.min(W, Math.ceil(cx + r)), y1 = Math.min(H, Math.ceil(cy + r));
      const rw = x1 - x0, rh = y1 - y0;
      if (rw <= 0 || rh <= 0) return;
      const ctx = T.ctx, img = ctx.getImageData(x0, y0, rw, rh), d = img.data;
      const k = T.strength / 100, hard = T.hard / 100;
      const rng = T.range;
      for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
        const dd = Math.hypot(x0 + x + 0.5 - cx, y0 + y + 0.5 - cy) / r;
        if (dd >= 1) continue;
        const w = dd < hard ? 1 : 1 - (dd - hard) / (1 - hard + 1e-6);
        const i = (y * rw + x) * 4;
        if (mode === 'dodge' || mode === 'burn') {
          const L = lum(d[i], d[i + 1], d[i + 2]) / 255;
          const tw = rng === 'shadow' ? (1 - L) * (1 - L) : rng === 'high' ? L * L : 1 - Math.abs(L - 0.5) * 2;
          const a = w * k * 0.08 * (0.3 + tw);
          for (let ch = 0; ch < 3; ch++) {
            if (mode === 'dodge') d[i + ch] += (255 - d[i + ch]) * a;
            else d[i + ch] -= d[i + ch] * a;
          }
        }
      }
      ctx.putImageData(img, x0, y0);
      App.requestRender();
    },

    redEye(cx, cy) {
      const c = T.L.canvas, r = T.lr();
      const x0 = Math.max(0, Math.floor(cx - r)), y0 = Math.max(0, Math.floor(cy - r));
      const rw = Math.min(c.width, Math.ceil(cx + r)) - x0, rh = Math.min(c.height, Math.ceil(cy + r)) - y0;
      if (rw <= 0 || rh <= 0) return;
      const img = T.ctx.getImageData(x0, y0, rw, rh), d = img.data;
      for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
        const dd = Math.hypot(x0 + x - cx, y0 + y - cy) / r;
        if (dd >= 1) continue;
        const i = (y * rw + x) * 4, R = d[i], G = d[i + 1], B = d[i + 2];
        const red = R / ((G + B) / 2 + 1);
        if (red > 1.5 && R > 60) {
          const w = Math.min(1, (red - 1.5) * 1.5) * (dd < 0.7 ? 1 : (1 - dd) / 0.3);
          const nv = (G + B) / 2 * 0.8;
          d[i] = R + (nv - R) * w;
        }
      }
      T.ctx.putImageData(img, x0, y0);
    },

    updHint() { if (T.hintEl) T.hintEl.textContent = (MODES.find(m => m[0] === T.mode) || [])[3] || ''; },

    panel(body) {
      if (!MODES.some(m => m[0] === T.mode)) T.mode = 'spot';
      T.seg = UI.seg({ options: MODES.map(m => [m[0], m[1], m[2]]), value: T.mode, wrap: true, onChange: v => T.setMode(v) });
      T.hintEl = UI.note('');
      T.cloneRow = h('div', { class: 'btn-row' }, UI.button('Pick Source Again', () => T.resetSource(), { small: true, icon: 'target' }));
      T.cloneRow.style.display = T.mode === 'clone' ? '' : 'none';
      body.appendChild(UI.section('Tool', [T.seg.el, T.hintEl, T.cloneRow]));
      T.sizeSl = UI.slider({ label: 'Brush Size', min: 2, max: App.brushMax(500), value: T.size, onInput: v => { T.size = v; } });
      body.appendChild(UI.section('Brush', [
        T.sizeSl.el,
        UI.slider({ label: 'Strength', min: 1, max: 100, value: T.strength, onInput: v => { T.strength = v; } }).el,
      ]));
      body.appendChild(UI.note('Tip: change the brush size with the [ ] keys or Alt + wheel.'));
      T.updHint();
    },
  };

  App.on('active', () => { if (App.tool === T) T.refresh(); });
  App.registerTool(T);
})();
