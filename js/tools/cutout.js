'use strict';
/* Kesip çıkar / Arka plan kaldır aracı */
(() => {
  const { U, ui: UI } = App;
  const h = U.h;

  const T = {
    id: 'cutout', name: 'Cut Out', icon: 'cutout', key: 'X', actions: true,
    mode: 'magic', tol: 32, contiguous: true, soft: 2, size: 60, hard: 70, showRemoved: false,
    L: null, orig: null, od: null, mask: null, pv: null, dirty: false, stroke: null,
    hist: [], hpos: 0, // araç içi geri al / yinele (maske adımları)

    cursor() { return T.picking ? App.CURSOR_PIPETTE : (T.mode === 'erase' || T.mode === 'restore') ? 'none' : 'crosshair'; },
    brushSize() { return !T.picking && (T.mode === 'erase' || T.mode === 'restore') ? T.size : 0; },

    async activate() {
      // AI modeli araç açılınca sessizce yüklenmeye başlar; kullanıcı düğmeye basana kadar çoğu zaman hazır olur
      if (T.canPrefetch()) setTimeout(() => T.preloadAI().catch(() => {}), 800);
      const L = await App.pixelLayer(true);
      if (!L) { T.L = null; UI.toast('Select an image layer to remove the background', 'warn'); return; }
      T.begin(L);
    },
    begin(L) {
      T.L = L;
      T.orig = L.canvas;
      T.od = U.getData(T.orig);
      const n = T.orig.width * T.orig.height;
      T.mask = new Uint8ClampedArray(n).fill(255);
      T.pv = U.clone(T.orig);
      T.pvx = T.pv.getContext('2d');
      T.dirty = false;
      T.hist = [T.mask.slice()]; T.hpos = 0;
      App.preview = { layer: L, canvas: T.pv };
      App.requestRender();
    },
    end() {
      if (App.preview && App.preview.layer === T.L) App.preview = null;
      T.L = null; T.orig = null; T.od = null; T.mask = null; T.pv = null;
      T.hist = []; T.hpos = 0;
      App.requestRender();
    },
    isDirty() { return T.dirty; },
    setDirty() { T.dirty = true; UI.setActionsEnabled(true); },

    // Her işlemden sonra maskenin kopyasını sakla
    snap() {
      if (!T.mask) return;
      T.hist.length = T.hpos + 1;
      T.hist.push(T.mask.slice());
      if (T.hist.length > 20) T.hist.splice(1, 1);
      T.hpos = T.hist.length - 1;
      T.dirty = T.mask.some(v => v < 255);
      UI.setActionsEnabled(T.dirty);
    },
    goHist(i) {
      T.hpos = i;
      T.mask.set(T.hist[i]);
      T.update();
      T.dirty = T.mask.some(v => v < 255);
      UI.setActionsEnabled(T.dirty);
    },
    canLocalUndo() { return !!T.mask && T.hpos > 0; },
    canLocalRedo() { return !!T.mask && T.hpos < T.hist.length - 1; },
    localUndo() { if (!T.canLocalUndo()) return false; T.goHist(T.hpos - 1); return true; },
    localRedo() { if (!T.canLocalRedo()) return false; T.goHist(T.hpos + 1); return true; },

    update(x0 = 0, y0 = 0, x1 = null, y1 = null) {
      if (!T.pv) return;
      const W = T.orig.width, H = T.orig.height;
      if (x1 == null) { x1 = W; y1 = H; }
      x0 = U.clamp(Math.floor(x0), 0, W); y0 = U.clamp(Math.floor(y0), 0, H);
      x1 = U.clamp(Math.ceil(x1), 0, W); y1 = U.clamp(Math.ceil(y1), 0, H);
      const rw = x1 - x0, rh = y1 - y0;
      if (rw <= 0 || rh <= 0) return;
      // Tam güncellemede kenar yumuşaklığı da önizlemede gösterilir
      const full = rw === W && rh === H;
      const out = T.pvx.createImageData(rw, rh), o = out.data, s = T.od.data, m = full && T.soft > 0 ? T.softMask() : T.mask;
      const red = T.showRemoved;
      for (let y = 0; y < rh; y++) {
        let j = (y0 + y) * W + x0, i = j * 4, k = y * rw * 4;
        for (let x = 0; x < rw; x++, j++, i += 4, k += 4) {
          const mv = m[j];
          if (red && mv < 255) {
            const a = 1 - mv / 255;
            o[k] = s[i] * (1 - a * 0.6) + 255 * a * 0.6; o[k + 1] = s[i + 1] * (1 - a * 0.6); o[k + 2] = s[i + 2] * (1 - a * 0.6);
            o[k + 3] = s[i + 3];
          } else {
            o[k] = s[i]; o[k + 1] = s[i + 1]; o[k + 2] = s[i + 2];
            o[k + 3] = s[i + 3] * mv / 255;
          }
        }
      }
      T.pvx.putImageData(out, x0, y0);
      App.requestRender();
    },

    // Algısal renk farkı (0..100): gözün renk farkını algılayışına yakın, hızlı "redmean" ölçüsü
    colorDist(i, r, g, b) {
      const s = T.od.data;
      const rm = (s[i] + r) / 2, dr = s[i] - r, dg = s[i + 1] - g, db = s[i + 2] - b;
      return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db) / 7.65;
    },

    // Bölge doldurma: tohumlardan benzer renkleri maske değerine ayarla
    // passClear: saydam pikseller her zaman geçilir (kenar taraması). Değnekte kapalıdır; yoksa resmin
    // saydam kenarlarından dolaşıp kenara değen, uzaktaki benzer renkli şekillere de sızardı.
    flood(seeds, ref, val, contiguous, passClear) {
      const W = T.orig.width, H = T.orig.height, s = T.od.data, m = T.mask;
      const thr = T.tol * 0.55;
      const [r, g, b] = ref;
      const clearSeed = !passClear && seeds.length && s[seeds[0] * 4 + 3] < 5;
      const ok = j => {
        const i = j * 4;
        if (s[i + 3] < 5) return passClear || clearSeed;
        return !clearSeed && T.colorDist(i, r, g, b) <= thr;
      };
      if (!contiguous) {
        for (let j = 0; j < W * H; j++) if (ok(j)) m[j] = val;
        return;
      }
      const seen = new Uint8Array(W * H);
      const stack = [];
      for (const j of seeds) if (!seen[j] && ok(j)) { seen[j] = 1; stack.push(j); }
      while (stack.length) {
        const j = stack.pop();
        m[j] = val;
        const x = j % W;
        if (x > 0 && !seen[j - 1] && ok(j - 1)) { seen[j - 1] = 1; stack.push(j - 1); }
        if (x < W - 1 && !seen[j + 1] && ok(j + 1)) { seen[j + 1] = 1; stack.push(j + 1); }
        if (j >= W && !seen[j - W] && ok(j - W)) { seen[j - W] = 1; stack.push(j - W); }
        if (j < W * (H - 1) && !seen[j + W] && ok(j + W)) { seen[j + W] = 1; stack.push(j + W); }
      }
    },

    localPt(p) { return App.docToLayer(T.L, p.x, p.y); },

    onDown(p, e) {
      if (!T.L) return;
      const q = T.localPt(p);
      const W = T.orig.width, H = T.orig.height;
      if (T.mode === 'magic') {
        const x = Math.floor(q.x), y = Math.floor(q.y);
        if (x < 0 || y < 0 || x >= W || y >= H) return;
        const j = y * W + x, i = j * 4, s = T.od.data;
        const keep = e.shiftKey || e.altKey;
        T.flood([j], [s[i], s[i + 1], s[i + 2]], keep ? 255 : 0, T.contiguous);
        T.update(); T.snap();
        return;
      }
      T.stroke = { last: q, st: {} };
      T.dab(q.x, q.y);
    },
    onMove(p) {
      if (!T.stroke) return;
      const q = T.localPt(p);
      const r = T.size / 2 / App.layerScale(T.L);
      App.interp(T.stroke.last, q, Math.max(1, r * 0.25), (x, y) => T.dab(x, y), T.stroke.st);
      T.stroke.last = q;
    },
    onUp() {
      if (T.stroke) { T.snap(); if (T.soft > 0) T.update(); }
      T.stroke = null;
    },

    dab(cx, cy) {
      const W = T.orig.width, H = T.orig.height, m = T.mask;
      const r = T.size / 2 / App.layerScale(T.L);
      const hard = T.hard / 100;
      const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(W, Math.ceil(cx + r));
      const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(H, Math.ceil(cy + r));
      const restore = T.mode === 'restore';
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r;
        if (d >= 1) continue;
        const a = d < hard ? 1 : 1 - (d - hard) / (1 - hard + 1e-6);
        const j = y * W + x;
        m[j] = restore ? m[j] + (255 - m[j]) * a : m[j] * (1 - a);
      }
      T.update(x0, y0, x1, y1);
      T.setDirty();
    },

    autoBorder() {
      if (!T.L) return;
      const W = T.orig.width, H = T.orig.height, s = T.od.data;
      const seeds = [];
      const step = Math.max(1, Math.floor(Math.max(W, H) / 400));
      for (let x = 0; x < W; x += step) { seeds.push(x, (H - 1) * W + x); }
      for (let y = 0; y < H; y += step) { seeds.push(y * W, y * W + W - 1); }
      // arka plan rengini kenar piksellerinin medyanı ile tahmin et
      const ch = [[], [], []];
      for (const j of seeds) for (let c = 0; c < 3; c++) ch[c].push(s[j * 4 + c]);
      const med = ch.map(a => a.sort((x, y) => x - y)[a.length >> 1]);
      T.flood(seeds, med, 0, true, true);
      T.update(); T.snap();
    },
    /* Renge göre kaldırma: seçilen renge benzeyen her piksel, resmin neresinde olursa olsun silinir
       (ör. yeşil zemin üzerindeki siyah yazıda yeşili seçmek yalnızca yazıyı bırakır).
       Eşiğe yakın renkler yumuşak geçişle kısmen saydamlaşır; böylece kenarlar tırtıklı olmaz. */
    rmColor: '#ffffff', rmTol: 25, picking: false, rmOpen: false,
    removeColor(restore) {
      if (!T.L) return;
      const n = T.orig.width * T.orig.height, m = T.mask;
      const [r, g, b] = U.hex2rgb(T.rmColor);
      const thr = Math.max(0.5, T.rmTol * 0.5), soft = Math.max(2, thr * 0.45);
      for (let j = 0; j < n; j++) {
        const d = T.colorDist(j * 4, r, g, b);
        const a = d <= thr - soft ? 1 : d >= thr ? 0 : (thr - d) / soft;
        if (a <= 0) continue;
        m[j] = restore ? Math.max(m[j], 255 * a) : Math.min(m[j], 255 * (1 - a));
      }
      T.update(); T.snap();
    },
    // AI ön plan maskesi (0..255, 255 = nesne). Aynı katman için bir kez hesaplanır.
    async aiMask() {
      if (T._fg && T._fg.src === T.orig) return T._fg.mask;
      if (!T.aiReady() && !navigator.onLine) { UI.toast('An internet connection is required to download the AI model.', 'warn', 4000); return null; }
      const el = document.getElementById('busy');
      let mask = null;
      await App.busy(T.aiReady() && !T._loading ? 'Analyzing Background…' : 'Preparing AI…', async prog => {
        const msg = el.querySelector('.busy-msg');
        // model henüz yüklenmediyse (ya da arka planda yükleniyorsa) önce o beklenir; ilerleme yüzde olarak görünür
        if (!T.aiReady() || T._loading) {
          T._onPct = pct => { msg.textContent = App.t('Preparing AI… {0}%', pct); prog(pct / 100); };
          try { await T.preloadAI(); } finally { T._onPct = null; }
          msg.textContent = App.t('Analyzing Background…');
        }
        const mod = await T.aiModule();
        const blob = await U.toBlob(U.fit(T.orig, 2048), 'image/png');
        const res = await mod.removeBackground(blob, {
          model: 'isnet_fp16',
          output: { format: 'image/png' },
          progress: (k, cur, tot) => {
            if (tot) { msg.textContent = App.t('Preparing AI…'); prog(cur / tot); } else msg.textContent = App.t('Analyzing Background…');
          },
        });
        msg.textContent = App.t('Applying Mask…');
        const rc = await U.fileToCanvas(res);
        const full = U.canvas(T.orig.width, T.orig.height), fx = full.getContext('2d');
        fx.imageSmoothingQuality = 'high';
        fx.drawImage(rc, 0, 0, full.width, full.height);
        const a = U.getData(full).data;
        mask = new Uint8ClampedArray(full.width * full.height);
        for (let j = 0; j < mask.length; j++) mask[j] = a[j * 4 + 3];
      });
      if (mask) T._fg = { src: T.orig, mask };
      return mask;
    },
    // Damlalık: büyüteçle ekrandan renk alınır (sihirli değnek çalışmaz); Esc iptal eder.
    // Resmin üzerine tıklanırsa katmanın asıl pikseli kullanılır.
    async startPick() {
      if (T.pickBtn) T.pickBtn.classList.add('on');
      const r = await App.eyedropper();
      if (T.pickBtn) T.pickBtn.classList.remove('on');
      if (!r || !T.L) return;
      let col = r.hex;
      const p = App.clientToDoc(r.x, r.y);
      if (p && T.od) {
        const q = T.localPt(p), x = Math.floor(q.x), y = Math.floor(q.y), W = T.orig.width;
        if (x >= 0 && y >= 0 && x < W && y < T.orig.height) { const i = (y * W + x) * 4, s = T.od.data; if (s[i + 3] > 10) col = U.rgb2hex(s[i], s[i + 1], s[i + 2]); }
      }
      T.rmColor = col;
      if (T.rmField) T.rmField.set(col);
    },
    stopPick() { T.picking = false; if (T.pickBtn) T.pickBtn.classList.remove('on'); App.updateCursor(); },
    invert() { if (!T.mask) return; for (let i = 0; i < T.mask.length; i++) T.mask[i] = 255 - T.mask[i]; T.update(); T.snap(); },
    resetMask() { if (!T.mask) return; T.mask.fill(255); T.update(); T.snap(); },

    /* AI modeli (AGPL-3.0 lisanslı açık kaynak arka plan kaldırma kütüphanesi) ilk kullanımda bir kez yüklenir, sonra
       tarayıcının önbelleğinden gelir. Fotoğraf hiçbir yere gönderilmez, işlem tarayıcıda yapılır. */
    aiReady() { try { return localStorage.getItem('pixtape-ai-ready') === '1'; } catch (e) { return false; } },
    async aiModule() {
      try { return await import('https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/+esm'); } catch (e) {
        throw new Error(App.t('The AI module could not be loaded. Check your internet connection or use the Magic wand / Automatic mode.'));
      }
    },
    // Kendiliğinden önceden yükleme yalnızca hızlı ve kotasız görünen bağlantılarda yapılır
    // (mobil veri, veri tasarrufu ya da yavaş bağlantıda model ancak düğmeye basınca yüklenir)
    canPrefetch() {
      if (!navigator.onLine) return false;
      const c = navigator.connection;
      return !(c && (c.saveData || c.type === 'cellular' || /2g|3g/.test(c.effectiveType || '')));
    },
    // Modeli bir kez yükler; aynı anda birden çok çağrı aynı yüklemeyi bekler. İlerleme T._onPct ile izlenir.
    preloadAI() {
      if (T._pre) return T._pre;
      T._loading = true;
      T._pre = (async () => {
        const mod = await T.aiModule();
        const parts = {};
        await mod.preload({
          model: 'isnet_fp16',
          progress: (k, cur, tot) => {
            if (!tot) return;
            parts[k] = [cur, tot];
            let a = 0, b = 0;
            for (const v of Object.values(parts)) { a += v[0]; b += v[1]; }
            if (T._onPct) T._onPct(Math.round(a / b * 100));
          },
        });
        try { localStorage.setItem('pixtape-ai-ready', '1'); } catch (e) { /* */ }
      })();
      T._pre.then(() => { T._loading = false; if (App.tool === T) UI.rebuildPanel(); },
        () => { T._loading = false; T._pre = null; }); // hata olursa bir sonraki denemede yeniden yüklenir
      return T._pre;
    },

    async ai() {
      if (!T.L) return;
      const fg = await T.aiMask();
      if (!fg) return;
      T.mask.set(fg);
      T.update(); T.snap();
      UI.toast('Background removed. You can fine-tune it with the brushes.', 'ok');
    },

    // Maskenin kenar yumuşaklığı uygulanmış kopyası
    softMask() {
      const W = T.orig.width, H = T.orig.height, mask = T.mask;
      if (!(T.soft > 0)) return mask;
      const mc = U.canvas(W, H), mx = mc.getContext('2d'), id = mx.createImageData(W, H);
      for (let j = 0; j < mask.length; j++) id.data[j * 4 + 3] = mask[j];
      mx.putImageData(id, 0, 0);
      const bl = App.IMG.blur(mc, T.soft * Math.max(1, Math.max(W, H) / 1500));
      const bd = U.getData(bl).data;
      const out = new Uint8ClampedArray(W * H);
      for (let j = 0; j < out.length; j++) out[j] = bd[j * 4 + 3];
      return out;
    },
    buildResult() {
      const W = T.orig.width, H = T.orig.height;
      const mask = T.softMask();
      const out = new ImageData(W, H), o = out.data, s = T.od.data;
      o.set(s);
      for (let j = 0; j < mask.length; j++) o[j * 4 + 3] = s[j * 4 + 3] * mask[j] / 255;
      return U.fromData(out);
    },

    async apply() {
      if (!T.L || !T.dirty) return;
      const L = T.L;
      await App.busy('Applying…', () => { L.canvas = T.buildResult(); });
      T.end();
      App.commit('Remove Background');
      T.begin(L);
      UI.setActionsEnabled(false);
    },
    cancel() {
      if (T.picking) T.stopPick();
      if (!T.L) return;
      const L = T.L;
      T.end();
      if (App.tool === T && App.doc && App.doc.layers.includes(L)) T.begin(L);
    },
    deactivate() { T.end(); T.picking = false; },
    refresh() {
      T.end();
      const L = App.activeLayer();
      if (L && L.type === 'raster') T.begin(L);
    },

    // Seçili katmanın altına yeni arka plan ekle
    async backdrop(kind, color) {
      if (T.dirty) await T.apply();
      const L = App.activeLayer();
      if (!L) return;
      const d = App.doc;
      let c;
      if (kind === 'blur') {
        c = App.IMG.blur(App.composite({ layers: [L] }), Math.max(d.w, d.h) * 0.02);
        // saydam bölgeleri orijinal (kesilmemiş) ile doldur
        const base = App.history.stack[0] ? App.composite({ layers: App.history.stack[0].state.layers }) : null;
        if (base) c = App.IMG.blur(base, Math.max(d.w, d.h) * 0.025);
      } else {
        c = U.canvas(d.w, d.h);
        const x = c.getContext('2d');
        if (kind === 'gradient') {
          const g = x.createLinearGradient(0, 0, d.w, d.h);
          g.addColorStop(0, color[0]); g.addColorStop(1, color[1]);
          x.fillStyle = g;
        } else x.fillStyle = color;
        x.fillRect(0, 0, d.w, d.h);
      }
      const idx = d.layers.indexOf(L);
      App.addLayer(App.newLayer(c, { name: 'New Background' }), { index: idx, select: false });
      App.commit('Add Background');
    },

    panel(body) {
      if (T.mode === 'color') T.mode = 'magic';
      const modes = UI.seg({
        options: [['magic', 'Magic Wand', 'wand'], ['erase', 'Delete', 'eraser'], ['restore', 'Restore', 'brush']],
        value: T.mode, onChange: v => { T.mode = v; App.updateCursor(); App.brushCursor = null; App.requestRender(); syncVis(); },
      });
      const tol = UI.slider({ label: 'Tolerance', min: 0, max: 100, value: T.tol, onInput: v => { T.tol = v; } });
      const cont = UI.toggle({ label: 'Connected Area Only', value: T.contiguous, onChange: v => { T.contiguous = v; } });
      const size = UI.slider({ label: 'Brush Size', min: 2, max: App.brushMax(600), value: T.size, onInput: v => { T.size = v; } });
      const hard = UI.slider({ label: 'Hardness', min: 0, max: 100, value: T.hard, onInput: v => { T.hard = v; } });
      const wandBox = h('div', null, tol.el, cont.el, UI.note('Click to remove an area of similar color; Shift + click restores. With "Connected area only" off, similar colors anywhere in the image are selected.'));
      const brushBox = h('div', null, size.el, hard.el, UI.note('Change the brush size with the [ and ] keys.'));
      const syncVis = () => {
        wandBox.style.display = T.mode === 'magic' ? '' : 'none';
        brushBox.style.display = T.mode === 'erase' || T.mode === 'restore' ? '' : 'none';
      };
      T._size = size;
      syncVis();
      // AI düğmesi her zaman çalışır; model hazır değilse ilk basışta yüklenir (ilerleme gösterilir)
      const aiBtn = UI.button('Remove Background with AI', () => T.ai(), { block: true, primary: true, icon: 'smart' });
      const warn = T.aiReady() ? null : UI.note('The first time, about 40 MB is loaded; after that it works instantly.');
      // Renge göre kaldır: AI düğmesinin altında, "Kenarlardan otomatik" ile yan yana; tıklanınca seçenekler açılır
      T.rmField = UI.color({ label: 'Color to Remove', value: T.rmColor, onInput: v => { T.rmColor = v; } });
      T.pickBtn = UI.button('Pick from Image', () => T.startPick(), { small: true, icon: 'pipette', title: 'Eyedropper: click the image to pick a color. Esc cancels.' });
      T.pickBtn.classList.toggle('on', !!T.picking);
      const qc = (c, n) => h('button', { class: 'qc-btn', title: n, style: { background: c }, onclick: () => { T.rmColor = c; T.rmField.set(c); } });
      const rmBox = h('div', { class: 'rm-box' + (T.rmOpen ? ' on' : '') },
        h('div', { class: 'row' }, T.rmField.el, T.pickBtn),
        h('div', { class: 'qc-row' }, h('span', { class: 'note' }, 'Presets:'),
          qc('#ffffff', 'White'), qc('#000000', 'Black'), qc('#00b140', 'Green Screen'), qc('#0047bb', 'Blue Screen'), qc('#808080', 'Gray')),
        UI.slider({ label: 'Color Tolerance', min: 0, max: 100, value: T.rmTol, def: 25, info: 'How similar a shade must be to the selected color to be removed. The color is removed everywhere in the image, not only in the background.', onInput: v => { T.rmTol = v; } }).el,
        h('div', { class: 'btn-row' },
          UI.button('Remove This Color', () => T.removeColor(false), { small: true, primary: true }),
          UI.button('Restore', () => T.removeColor(true), { small: true })));
      const rmBtn = UI.button('By Color', () => { T.rmOpen = !T.rmOpen; rmBox.classList.toggle('on', T.rmOpen); rmBtn.classList.toggle('on', T.rmOpen); }, { small: true, icon: 'droplet', title: 'Removes the chosen color everywhere in the image' });
      rmBtn.classList.toggle('on', T.rmOpen);
      body.appendChild(UI.section('Automatic', [
        aiBtn,
        warn,
        h('div', { class: 'btn-row two' },
          UI.button('Auto from Edges', () => T.autoBorder(), { small: true, icon: 'fit', title: 'Finds and removes the background color at the edges' }),
          rmBtn),
        rmBox,
      ]));
      body.appendChild(UI.section('Tool', [modes.el, wandBox, brushBox]));

      let st;
      body.appendChild(UI.section('Edge', [
        UI.slider({ label: 'Edge Softness', min: 0, max: 20, value: T.soft, onInput: v => { T.soft = v; clearTimeout(st); st = setTimeout(() => T.update(), 120); } }).el,
        UI.note('Softens the cut edges; the effect is visible along the cut edges.'),
        h('div', { class: 'btn-row' },
          UI.button('Invert', () => T.invert(), { small: true }),
          UI.button('Reset', () => T.resetMask(), { small: true })),
      ]));
      const bgc = UI.color({ label: 'Color', value: '#ffffff', onInput: () => {} });
      body.appendChild(UI.section('Add New Background', [
        h('div', { class: 'btn-row wrap' },
          UI.button('White', () => T.backdrop('color', '#ffffff'), { small: true }),
          UI.button('Black', () => T.backdrop('color', '#000000'), { small: true }),
          UI.button('Blurred', () => T.backdrop('blur'), { small: true }),
          UI.button('Gradient', () => T.backdrop('gradient', ['#6c5cff', '#00c2ff']), { small: true })),
        bgc.el,
        UI.button('Add with Selected Color', () => T.backdrop('color', bgc.get()), { small: true, block: true }),
      ], { open: false }));
    },
  };

  // Katmanlar panelinde başka bir katman seçilince araç o katmanla çalışır.
  // Önceki katmanda uygulanmamış değişiklik varsa önce ona uygulanır (kaybolmasın).
  let switching = false;
  App.on('active', async () => {
    if (App.tool !== T || switching) return;
    const A = App.activeLayer();
    if (A === T.L) return;
    switching = true;
    try {
      if (T.L && T.dirty && App.doc.layers.includes(T.L)) {
        const L = T.L;
        L.canvas = T.buildResult();
        T.end();
        App.commit('Remove Background');
        UI.toast(App.t('Changes on "{0}" were applied', L.name), 'ok', 2200);
      } else T.end();
      UI.setActionsEnabled(false);
      if (A) await T.activate();
      UI.rebuildPanel();
    } finally { switching = false; }
  });

  App.registerTool(T);
})();
