'use strict';
/* Ayarlama aracı: ışık, renk, detay, sahne, eğriler, renk karışımı (HSL), histogram + hızlı düzeltmeler
   Kalabalık olmasın diye yalnızca "Işık" bölümü açık başlar; diğerleri tıklayınca açılır. */
(() => {
  const { U, ui: UI, IMG } = App;
  const h = U.h;

  const GROUPS = [
    ['Lighting', [['exposure', 'Exposure'], ['brightness', 'Brightness'], ['contrast', 'Contrast'], ['highlights', 'Highlights'], ['shadows', 'Shadows'], ['whites', 'Whites'], ['blacks', 'Blacks']]],
    ['Color', [['saturation', 'Saturation'], ['vibrance', 'Vibrance'], ['temperature', 'Temperature'], ['hue', 'Hue Shift', -180, 180]]],
    ['Detail', [['sharpen', 'Sharpness', 0, 100], ['clarity', 'Clarity'], ['dehaze', 'Dehaze'], ['denoise', 'Reduce Grain', 0, 100], ['blur', 'Blur', 0, 100]]],
    ['Scene', [['vignette', 'Vignette'], ['vigSize', 'Vignette Size', 0, 100, 50], ['fade', 'Fade', 0, 100], ['grain', 'Film Grain', 0, 100]]],
  ];

  // Anlamı ilk bakışta belli olmayan ayarların açıklamaları (yanındaki "i" simgesinde görünür)
  const INFO = {
    vibrance: 'Boosts dull colors more and already vivid colors less. Makes colors livelier without spoiling skin tones.',
    hue: 'Rotates all colors of the photo around the color wheel, for example blue to green.',
    clarity: 'Brings out detail and texture in the midtones. A negative value softens faces.',
    dehaze: 'Restores contrast and color in foggy or hazy photos. A negative value adds haze.',
    denoise: 'Smooths the colored and gray specks of grain in photos taken in the dark or at high ISO.',
    fade: 'Lifts the dark tones and lowers contrast for a faded, old photo look.',
    grain: 'Adds fine grain like on film photos.',
  };
  const T = {
    id: 'adjust', name: 'Adjust', icon: 'adjust', key: 'A', actions: true,
    params: {}, sess: null, sliders: {},

    async activate() {
      T.params = {};
      const L = await App.pixelLayer(true);
      T.sess = L ? new App.PreviewSession(L) : null;
      if (!L) UI.toast('Select an image layer to adjust', 'warn');
      T.hist.reset();
      T.drawHistSoon();
    },
    deactivate() { if (T.sess) T.sess.clear(); T.sess = null; T.picking = false; },
    isDirty() { return !!T.sess && !IMG.isNeutral(T.params); },
    changed() {
      if (!T.sess) return;
      const p = JSON.parse(JSON.stringify(T.params));
      if (IMG.isNeutral(p)) T.sess.clear();
      else T.sess.update((c, s) => IMG.adjust(c, p, s));
      UI.setActionsEnabled(T.isDirty());
      T.drawHistSoon();
    },
    set(k, v) { T.params[k] = v; T.changed(); },
    // Panel denetimlerini T.params ile eşitle
    syncSliders() {
      for (const k in T.sliders) T.sliders[k].set(T.params[k] == null ? (T.sliders[k].def || 0) : T.params[k]);
      if (T.curve) T.curve.load(T.params.curves);
      if (T.hslSync) T.hslSync();
      if (T.toneSync) T.toneSync();
    },

    // Araç içi geri al / yinele: her kaydırıcı bırakılışı ve hızlı düğme bir adımdır
    setState(st) { T.params = JSON.parse(JSON.stringify(st)); T.syncSliders(); T.changed(); },
    canLocalUndo: () => T.hist.canUndo(),
    canLocalRedo: () => T.hist.canRedo(),
    localUndo: () => T.hist.undo(),
    localRedo: () => T.hist.redo(),
    pendingState() { return JSON.parse(JSON.stringify(T.params)); },
    restorePending(st) { T.setState(st); },

    async apply() {
      if (!T.isDirty()) return;
      await T.sess.apply('Adjust');
      T.params = {};
      T.sess = new App.PreviewSession(T.sess.layer);
      T.hist.reset();
      UI.rebuildPanel();
    },
    cancel() {
      if (T.sess) T.sess.clear();
      T.params = {};
      T.syncSliders();
      T.hist.reset();
      T.drawHistSoon();
    },
    refresh() {
      const L = App.activeLayer();
      T.params = {};
      if (T.sess) T.sess.clear();
      T.sess = L && L.type === 'raster' ? new App.PreviewSession(L) : null;
      T.hist.reset();
      UI.rebuildPanel();
    },

    quick(kind) {
      if (!T.sess) return;
      const base = kind === 'auto' ? IMG.autoParams(T.sess.layer.canvas)
        : kind === 'bw' ? { saturation: -100, contrast: 10 }
          : kind === 'pop' ? { contrast: 18, vibrance: 40, clarity: 25, saturation: 8, shadows: 10 }
            : kind === 'warm' ? { temperature: 25, vibrance: 10 }
              : kind === 'cool' ? { temperature: -25, vibrance: 10 } : {};
      T.params = { ...base };
      T.syncSliders();
      T.changed();
      T.hist.push();
    },
    // Sıfırla da geri alınabilir bir adımdır
    reset() { T.params = {}; T.syncSliders(); T.changed(); T.hist.push(); },

    // HSL damlalığı: büyüteçle seçilen rengin tonu "özel renk" olur (resmin üzerindeyse katmanın asıl pikseli kullanılır)
    picking: false,
    async pickHSL() {
      if (!T.sess) return;
      const r = await App.eyedropper();
      if (!r || !T.sess) return;
      let d = U.hex2rgb(r.hex);
      const L = T.sess.layer, p = App.clientToDoc(r.x, r.y);
      if (p) {
        const q = App.docToLayer(L, p.x, p.y), x = Math.floor(q.x), y = Math.floor(q.y);
        if (x >= 0 && y >= 0 && x < L.canvas.width && y < L.canvas.height) {
          const px = L.canvas.getContext('2d').getImageData(x, y, 1, 1).data;
          if (px[3] > 10) d = [px[0], px[1], px[2]];
        }
      }
      const [hue, sat] = U.rgb2hsl(d[0], d[1], d[2]);
      if (sat < 0.06) { UI.toast('This spot is almost gray; click a colorful area', 'warn', 2600); return; }
      T.params.hsl = T.params.hsl || {};
      const old = T.params.hsl.custom || {};
      T.params.hsl.custom = { h: old.h || 0, hd: old.hd || 0, s: old.s || 0, l: old.l || 0, hue: Math.round(hue), col: U.rgb2hex(d[0], d[1], d[2]) };
      T.hslCur = 'custom';
      T.hslSync && T.hslSync();
      T.changed();
      T.hist.push();
    },

    /* histogram */
    drawHistSoon() { clearTimeout(T._ht); T._ht = setTimeout(() => T.drawHist(), 120); },
    drawHist() {
      const c = T.histCanvas;
      if (!c || !App.prefs.showHist || !document.body.contains(c)) return;
      const x = c.getContext('2d'), W = c.width, H = c.height;
      x.clearRect(0, 0, W, H);
      const src = App.preview && T.sess && App.preview.layer === T.sess.layer ? App.preview.canvas : T.sess ? T.sess.proxy : null;
      if (!src) return;
      const hs = IMG.histogram(src);
      let mx = 1;
      for (let i = 2; i < 254; i++) mx = Math.max(mx, hs.r[i], hs.g[i], hs.b[i]);
      x.globalCompositeOperation = 'lighter';
      for (const [k, col] of [['r', 'rgba(255,70,70,.75)'], ['g', 'rgba(70,220,90,.7)'], ['b', 'rgba(70,130,255,.8)']]) {
        x.fillStyle = col;
        x.beginPath(); x.moveTo(0, H);
        for (let i = 0; i < 256; i++) x.lineTo(i / 255 * W, H - Math.min(1, hs[k][i] / mx) * H);
        x.lineTo(W, H); x.closePath(); x.fill();
      }
      x.globalCompositeOperation = 'source-over';
    },

    panel(body) {
      T.sliders = {};
      T.histCanvas = h('canvas', { class: 'hist', width: 256, height: 64, title: 'Histogram: shadows on the left, highlights on the right' });
      // Önce/sonra ve sıfırla kaydırırken üstte görünür kalır. Histogram çoğu kişiye bir şey ifade etmediği için
      // varsayılan olarak gizlidir; küçük düğmeyle açılır (tercih hatırlanır).
      const histWrap = h('div', { class: 'hist-wrap' }, T.histCanvas);
      const histVis = () => { histWrap.style.display = App.prefs.showHist ? '' : 'none'; histBtn.classList.toggle('on', !!App.prefs.showHist); if (App.prefs.showHist) T.drawHistSoon(); };
      const histBtn = UI.iconBtn('histogram', 'Histogram', () => { App.setPref('showHist', !App.prefs.showHist); histVis(); }, 'sm');
      body.appendChild(h('div', { class: 'fx-head' }, histWrap,
        h('div', { class: 'fx-head-row' }, UI.peekBtn(), h('span', { style: { flex: 1 } }), histBtn, UI.button('Reset', () => T.reset(), { small: true, icon: 'reset', cls: 'ghost' }))));
      histVis();
      body.appendChild(h('div', { class: 'quick-row' },
        UI.button('Automatic', () => T.quick('auto'), { small: true, icon: 'wand', title: 'Auto Enhance' }),
        UI.button('Vivid', () => T.quick('pop'), { small: true }),
        UI.button('B&W', () => T.quick('bw'), { small: true, title: 'Black & White' })));
      body.appendChild(h('div', { class: 'quick-row' },
        UI.button('Warm', () => T.quick('warm'), { small: true }),
        UI.button('Cool', () => T.quick('cool'), { small: true })));
      for (const [g, list] of GROUPS) {
        const kids = list.map(([k, label, min = -100, max = 100, def]) => {
          const d = def == null ? (IMG.ADJ_DEFAULT[k] || 0) : def;
          const s = UI.slider({ label, min, max, value: T.params[k] == null ? d : T.params[k], def: d, info: INFO[k], onInput: v => T.set(k, v), onChange: () => T.hist.push() });
          s.def = d;
          T.sliders[k] = s;
          return s.el;
        });
        body.appendChild(UI.section(g, kids, { open: g === 'Lighting' }));
        if (g === 'Color') {
          // Tonlama: fotoğrafa seçilen rengin tonunu verir
          const tn = () => (T.params.tone = T.params.tone || { color: '#ff9a3c', amt: 0 });
          let ct = 0;
          const tcol = UI.color({ label: 'Color', value: (T.params.tone && T.params.tone.color) || '#ff9a3c', onInput: v => { tn().color = v; T.changed(); clearTimeout(ct); ct = setTimeout(() => T.hist.push(), 400); } });
          const tamt = UI.slider({ label: 'Strength', min: 0, max: 100, value: (T.params.tone && T.params.tone.amt) || 0, def: 0, onInput: v => { tn().amt = v; T.changed(); }, onChange: () => T.hist.push() });
          T.toneSync = () => { const q = T.params.tone || {}; tcol.set(q.color || '#ff9a3c'); tamt.set(q.amt || 0); };
          body.appendChild(UI.section('Toning', [tcol.el, tamt.el], { open: false, info: 'Gives the photo a tint of the color you choose, such as warm orange or cinematic blue. Brightness does not change.' }));
        }
      }

      // Eğriler
      T.curve = curveEditor(cv => { T.params.curves = cv; T.changed(); }, () => T.hist.push());
      if (T.params.curves) T.curve.load(T.params.curves);
      body.appendChild(UI.section('Curves', [T.curve.el], { open: false }));

      // Renk karışımı (HSL): her renk için ton, doygunluk, parlaklık; damlalıkla fotoğraftan da renk seçilebilir
      T.hslCur = T.hslCur || 'red';
      // Ton derece cinsinden: seçilen renk çemberin tamamında başka bir renge çevrilebilir.
      // Eski kayıtlardaki h (±100 = ±30°) ilk dokunuşta dereceye çevrilir.
      const hueOf = v => Math.round((v.hd || 0) + (v.h || 0) * 0.3);
      const hsSet = (ch, v) => {
        const cur = T.hslCur;
        T.params.hsl = T.params.hsl || {};
        const q = T.params.hsl[cur] = T.params.hsl[cur] || {};
        if (ch === 'hd') delete q.h;
        q[ch] = v;
        T.changed();
        hslPreview();
      };
      const push = () => T.hist.push();
      const sH = UI.slider({ label: 'Hue', min: -180, max: 180, onInput: v => hsSet('hd', v), onChange: push });
      const sS = UI.slider({ label: 'Saturation', onInput: v => hsSet('s', v), onChange: push });
      const sL = UI.slider({ label: 'Brightness', onInput: v => hsSet('l', v), onChange: push });
      // seçili renk → değiştirilmiş hali
      const pvA = h('span', { class: 'hsl-sw' }), pvB = h('span', { class: 'hsl-sw' });
      const pvRow = h('div', { class: 'hsl-pv' }, pvA, h('span', { class: 'hsl-arrow', html: App.icon('right', 14) }), pvB);
      const baseCol = () => {
        if (T.hslCur === 'custom') { const cu = T.params.hsl && T.params.hsl.custom; return cu && cu.col; }
        const c = IMG.HSL_COLORS.find(q => q[0] === T.hslCur);
        return c && c[4];
      };
      function hslPreview() {
        const col = baseCol();
        pvRow.style.display = col ? '' : 'none';
        if (!col) return;
        const v = (T.params.hsl && T.params.hsl[T.hslCur]) || {};
        const [r, g, b] = U.hex2rgb(col), [H, S, Lh] = U.rgb2hsl(r, g, b);
        const ns = U.clamp(S * (1 + (v.s || 0) / 100), 0, 1), dl = (v.l || 0) / 100;
        const nl = U.clamp(Lh + dl * 0.35 * Math.min(1, S * 3) * (dl > 0 ? 1 - Lh : Lh) * 2, 0, 1);
        const out = U.hsl2rgb(H + hueOf(v), ns, nl);
        pvA.style.background = col; pvB.style.background = U.rgb2hex(...out.map(Math.round));
      }
      T.hslSync = () => {
        const v = (T.params.hsl && T.params.hsl[T.hslCur]) || {};
        sH.set(hueOf(v)); sS.set(v.s || 0); sL.set(v.l || 0);
        hslPreview();
        dots.querySelectorAll('.hsl-dot').forEach(x => x.classList.toggle('on', x.dataset.k === T.hslCur));
        const cu = T.params.hsl && T.params.hsl.custom;
        pickDot.style.background = cu && cu.col ? cu.col : '';
        pickDot.classList.toggle('has', !!(cu && cu.col));
      };
      const dots = h('div', { class: 'hsl-dots' }, IMG.HSL_COLORS.map(([k, label, , , col]) => {
        const b = h('button', { class: 'hsl-dot', title: label, style: { background: col }, onclick: () => { T.hslCur = k; T.hslSync(); } });
        b.dataset.k = k;
        return b;
      }));
      const pickDot = h('button', {
        class: 'hsl-dot pick', title: 'Pick a Color from the Photo', html: App.icon('pipette', 14),
        onclick: () => T.pickHSL(),
      });
      pickDot.dataset.k = 'custom';
      dots.appendChild(pickDot);
      T.hslSync();
      body.appendChild(UI.section('Color Mixer (HSL)', [UI.note('Changes only the color you choose, such as the blue of the sky. Use the eyedropper to pick any color from the photo.'), dots, pvRow, sH.el, sS.el, sL.el], { open: !!T.picking || T.hslCur === 'custom' }));
      body.appendChild(UI.note('Double-click a slider\'s name to reset it. Ctrl+Z undoes each step. Changes become permanent with "Apply".'));
      T.drawHistSoon();
    },
  };

  /* -------------------------------------------------- eğri düzenleyici */
  function curveEditor(onChange, onCommit) {
    // Tuval, ekrandaki boyutu ve ekran ölçeği kadar piksel ile çizilir (bulanık / pikselli görünmesin)
    let S = 220, dpr = 1;
    const cv = h('canvas', { class: 'curve', width: S, height: S });
    const fit = () => {
      const w = Math.round(cv.clientWidth) || S;
      dpr = window.devicePixelRatio || 1;
      const px = Math.round(w * dpr);
      if (cv.width !== px) { cv.width = px; cv.height = px; }
      S = w;
    };
    const ln = v => Math.round(v) + 0.5;
    const def = () => ({ rgb: [[0, 0], [255, 255]], r: [[0, 0], [255, 255]], g: [[0, 0], [255, 255]], b: [[0, 0], [255, 255]] });
    let curves = def(), ch = 'rgb', drag = -1;
    const x = cv.getContext('2d');
    const COL = { rgb: '#ffffff', r: '#ff5a5a', g: '#4ade80', b: '#60a5fa' };
    const draw = () => {
      fit();
      x.setTransform(dpr, 0, 0, dpr, 0, 0);
      x.clearRect(0, 0, S, S);
      x.lineCap = 'round'; x.lineJoin = 'round';
      x.strokeStyle = 'rgba(255,255,255,.08)'; x.lineWidth = 1 / dpr;
      x.beginPath();
      for (let i = 1; i < 4; i++) { const g = ln(i * S / 4 * dpr) / dpr; x.moveTo(g, 0); x.lineTo(g, S); x.moveTo(0, g); x.lineTo(S, g); }
      x.stroke();
      x.strokeStyle = 'rgba(255,255,255,.18)'; x.beginPath(); x.moveTo(0, S); x.lineTo(S, 0); x.stroke();
      for (const k of ['r', 'g', 'b', 'rgb']) {
        if (k !== ch && JSON.stringify(curves[k]) === '[[0,0],[255,255]]') continue;
        const lut = IMG.curveLUT(curves[k]);
        x.strokeStyle = COL[k]; x.globalAlpha = k === ch ? 1 : 0.35; x.lineWidth = k === ch ? 2 : 1.2;
        x.beginPath();
        for (let i = 0; i < 256; i += 0.5) { const v = lut[Math.floor(i)] + (lut[Math.min(255, Math.ceil(i))] - lut[Math.floor(i)]) * (i % 1), px = i / 255 * S, py = S - v / 255 * S; i ? x.lineTo(px, py) : x.moveTo(px, py); }
        x.stroke();
      }
      x.globalAlpha = 1;
      for (const [px, py] of curves[ch]) {
        x.fillStyle = '#111'; x.strokeStyle = COL[ch]; x.lineWidth = 2;
        x.beginPath(); x.arc(px / 255 * S, S - py / 255 * S, 5, 0, Math.PI * 2); x.fill(); x.stroke();
      }
    };
    const pos = e => { const r = cv.getBoundingClientRect(); return [U.clamp((e.clientX - r.left) / r.width * 255, 0, 255), U.clamp(255 - (e.clientY - r.top) / r.height * 255, 0, 255)]; };
    const emit = () => onChange(JSON.parse(JSON.stringify(curves)));
    cv.addEventListener('pointerdown', e => {
      cv.setPointerCapture(e.pointerId);
      const [px, py] = pos(e), pts = curves[ch];
      drag = pts.findIndex(([a, b]) => Math.hypot(a - px, b - py) < 12);
      if (e.button === 2 || e.ctrlKey) { if (drag > 0 && drag < pts.length - 1) { pts.splice(drag, 1); draw(); emit(); onCommit(); } drag = -1; return; }
      if (drag < 0) { pts.push([px, py]); pts.sort((a, b) => a[0] - b[0]); drag = pts.findIndex(q => q[0] === px); emit(); }
      draw();
    });
    cv.addEventListener('pointermove', e => {
      if (drag < 0) return;
      const pts = curves[ch];
      let [px, py] = pos(e);
      const lo = drag > 0 ? pts[drag - 1][0] + 2 : 0, hi = drag < pts.length - 1 ? pts[drag + 1][0] - 2 : 255;
      if (drag === 0) px = Math.min(px, hi); else if (drag === pts.length - 1) px = Math.max(px, lo); else px = U.clamp(px, lo, hi);
      pts[drag] = [Math.round(px), Math.round(py)];
      draw(); emit();
    });
    cv.addEventListener('pointerup', () => { if (drag >= 0) onCommit(); drag = -1; });
    cv.addEventListener('dblclick', e => {
      const [px, py] = pos(e), pts = curves[ch];
      const i = pts.findIndex(([a, b]) => Math.hypot(a - px, b - py) < 12);
      if (i > 0 && i < pts.length - 1) { pts.splice(i, 1); draw(); emit(); onCommit(); }
    });
    cv.addEventListener('contextmenu', e => e.preventDefault());
    const seg = UI.seg({ options: [['rgb', 'RGB'], ['r', 'K'], ['g', 'Y'], ['b', 'M']], value: 'rgb', onChange: v => { ch = v; draw(); } });
    seg.el.querySelectorAll('.seg-btn').forEach((b, i) => { b.title = ['All', 'Red', 'Green', 'Blue'][i]; });
    const el = h('div', { class: 'curve-wrap' }, seg.el, cv,
      h('div', { class: 'row between' }, h('span', { class: 'note' }, 'Add point: click · Delete: double-click'),
        UI.button('Reset', () => { curves[ch] = [[0, 0], [255, 255]]; draw(); emit(); onCommit(); }, { small: true })));
    draw();
    // panel genişliği değişince yeniden çiz
    try { new ResizeObserver(() => { if (cv.isConnected) draw(); }).observe(cv); } catch (e) { /* */ }
    return {
      el,
      reset() { curves = def(); draw(); },
      load(c) { curves = c ? JSON.parse(JSON.stringify({ ...def(), ...c })) : def(); draw(); },
    };
  }

  T.hist = UI.localHist(() => JSON.parse(JSON.stringify(T.params)), st => T.setState(st));
  App.on('history', () => { if (App.tool === T && T.sess && App.activeLayer() !== T.sess.layer) T.refresh(); });
  App.on('active', () => { if (App.tool === T) T.refresh(); });
  App.registerTool(T);
})();
