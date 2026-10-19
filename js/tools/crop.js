'use strict';
/* Kırp aracı: oranlar, hazır boyutlar, düzeltme, döndür/çevir, yeniden boyutlandır */
(() => {
  const { U, ui: UI } = App;
  const h = U.h;

  const RATIOS = [
    ['free', 'Free'], ['orig', 'Original'], ['1:1', '1:1 Square'], ['4:3', '4:3'], ['3:4', '3:4'], ['3:2', '3:2 (35mm)'], ['2:3', '2:3'],
    ['16:9', '16:9 Wide'], ['9:16', '9:16 Story'], ['4:5', '4:5 Portrait'], ['2:1', '2:1'],
  ];
  const PRESETS = [
    ['Social Media', [
      ['Instagram Post', 1080, 1080], ['Instagram Portrait', 1080, 1350], ['Instagram Story / Reels', 1080, 1920], ['Instagram Profile', 320, 320],
      ['Facebook Post', 1200, 630], ['Facebook Cover', 820, 312], ['Facebook Profile', 180, 180], ['Facebook Ad', 1200, 628],
      ['X (Twitter) Post', 1600, 900], ['X (Twitter) Header', 1500, 500], ['X (Twitter) Profile', 400, 400],
      ['YouTube Thumbnail', 1280, 720], ['YouTube Channel Art', 2560, 1440], ['YouTube Profile', 800, 800],
      ['LinkedIn Cover', 1584, 396], ['LinkedIn Post', 1200, 627], ['Pinterest Pin', 1000, 1500], ['TikTok', 1080, 1920],
    ]],
    ['Screen', [
      ['Web Mini 1024×768', 1024, 768], ['Web Small 1280×800', 1280, 800], ['Web Common 1366×768', 1366, 768], ['Web Medium 1440×900', 1440, 900],
      ['Full HD 1920×1080', 1920, 1080], ['2K 2560×1440', 2560, 1440], ['4K UHD 3840×2160', 3840, 2160],
    ]],
    ['Print (300 Dpi)', [
      ['A4', 2480, 3508], ['A5', 1748, 2480], ['A6', 1240, 1748], ['Letter', 2550, 3300], ['10×15 Cm Photo', 1181, 1772], ['13×18 Cm Photo', 1535, 2126], ['ID photo 4.5×6', 531, 709],
    ]],
  ];
  App.SIZE_PRESETS = PRESETS;

  const T = {
    id: 'crop', name: 'Crop', icon: 'crop', key: 'C', actions: true, cursor: 'crosshair',
    rect: null, ratio: 'free', custom: [4, 3], angle: 0, out: null, drag: null,

    activate() {
      T.reset();
      window.addEventListener('keydown', T.altKey, true);
      window.addEventListener('keyup', T.altKey, true);
    },
    // Alt'a fare kıpırdamadan basılıp bırakılınca da alan hemen güncellenir
    altKey(e) {
      const D = T.drag;
      if (e.key !== 'Alt' || !D || !D.last || D.mode === 'move') return;
      e.preventDefault();
      T.onMove(D.last.p, { altKey: e.type === 'keydown', shiftKey: D.last.shiftKey });
    },
    // alanı boyutunu koruyarak fotoğrafın ortasına taşır
    centerArea() {
      const B = T.bounds(), r = T.rect;
      T.rect = { ...r, x: B.x + (B.w - r.w) / 2, y: B.y + (B.h - r.h) / 2 };
      T.sync();
      App.requestRender();
    },
    reset() {
      const d = App.doc;
      T.rect = { x: 0, y: 0, w: d.w, h: d.h };
      T.angle = 0; App.cropAngle = 0; T.out = null;
      App.requestRender();
    },
    isDirty() {
      const d = App.doc, r = T.rect;
      return !!r && (Math.round(r.x) !== 0 || Math.round(r.y) !== 0 || Math.round(r.w) !== d.w || Math.round(r.h) !== d.h || T.angle !== 0 || !!T.out);
    },
    ratioVal() {
      const d = App.doc;
      if (T.ratio === 'free') return null;
      if (T.ratio === 'orig') return d.w / d.h;
      if (T.ratio === 'custom') return T.custom[0] / T.custom[1];
      const [a, b] = T.ratio.split(':').map(Number);
      return a / b;
    },
    setRatio(r) {
      T.ratio = r; T.out = null;
      const k = T.ratioVal();
      if (k) T.fitRatio(k);
      T.sync();
    },
    fitRatio(k) {
      const d = App.doc, b = T.bounds();
      let w = b.w, hh = w / k;
      if (hh > b.h) { hh = b.h; w = hh * k; }
      T.rect = { x: b.x + (b.w - w) / 2, y: b.y + (b.h - hh) / 2, w, h: hh };
      App.requestRender();
    },
    // Düzeltme açısında boşluk kalmayacak en büyük iç dikdörtgen
    bounds() {
      const d = App.doc;
      if (!T.angle) return { x: 0, y: 0, w: d.w, h: d.h };
      const a = Math.abs(T.angle) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
      const k = Math.min(d.w / (d.w * c + d.h * s), d.h / (d.w * s + d.h * c));
      const w = d.w * k, hh = d.h * k;
      return { x: (d.w - w) / 2, y: (d.h - hh) / 2, w, h: hh };
    },
    setAngle(v) {
      T.angle = v; App.cropAngle = v;
      const k = T.ratioVal();
      const b = T.bounds();
      if (k) T.fitRatio(k); else T.rect = { ...b };
      T.sync();
      App.requestRender();
    },

    hitHandle(p) {
      const r = T.rect;
      const a = App.docToScreen(r.x, r.y), b = App.docToScreen(r.x + r.w, r.y + r.h);
      const xs = [a.x, (a.x + b.x) / 2, b.x], ys = [a.y, (a.y + b.y) / 2, b.y];
      for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
        if (i === 1 && j === 1) continue;
        if (Math.abs(p.sx - xs[i]) < 10 && Math.abs(p.sy - ys[j]) < 10) return { hx: i - 1, hy: j - 1 };
      }
      if (p.sx > a.x && p.sx < b.x && p.sy > a.y && p.sy < b.y) return 'move';
      return null;
    },

    onDown(p) {
      const hit = T.hitHandle(p);
      const r = { ...T.rect };
      if (hit === 'move') T.drag = { mode: 'move', p0: p, r0: r };
      else if (hit) T.drag = { mode: 'size', hx: hit.hx, hy: hit.hy, r0: r };
      else T.drag = { mode: 'new', p0: { x: U.clamp(p.x, 0, App.doc.w), y: U.clamp(p.y, 0, App.doc.h) } };
    },
    onMove(p, e) {
      const D = T.drag;
      if (!D) return;
      D.last = { p, shiftKey: e.shiftKey };
      const B = T.bounds();
      const k = T.ratioVal();
      if (D.mode === 'move') {
        const r = D.r0;
        T.rect = { ...r, x: U.clamp(r.x + p.x - D.p0.x, B.x, B.x + B.w - r.w), y: U.clamp(r.y + p.y - D.p0.y, B.y, B.y + B.h - r.h) };
      } else if (e.altKey) {
        // Alt basılıyken merkezden büyür (merkez: alanın ortası; yeni alan çizerken başlangıç noktası)
        if (D.mode === 'new' && Math.abs(p.x - D.p0.x) < 2 && Math.abs(p.y - D.p0.y) < 2) return;
        const r = D.r0, C = D.mode === 'new' ? D.p0 : { x: r.x + r.w / 2, y: r.y + r.h / 2 };
        const side = D.mode === 'size' && !D.hx, top = D.mode === 'size' && !D.hy;
        let hw = side ? r.w / 2 : Math.abs(p.x - C.x), hh = top ? r.h / 2 : Math.abs(p.y - C.y);
        const lock = k || (e.shiftKey && !App.prefs.free ? 1 : null);
        const fit = () => { if (side) hw = hh * lock; else if (top) hh = hw / lock; else if (hw / hh > lock) hw = hh * lock; else hh = hw / lock; };
        if (lock) fit();
        // sınırların içinde tut (merkez yerinde kalır)
        hw = Math.min(hw, C.x - B.x, B.x + B.w - C.x); hh = Math.min(hh, C.y - B.y, B.y + B.h - C.y);
        if (lock) { if (hw / hh > lock) hw = hh * lock; else hh = hw / lock; }
        hw = Math.max(0.5, hw); hh = Math.max(0.5, hh);
        T.rect = { x: C.x - hw, y: C.y - hh, w: hw * 2, h: hh * 2 };
      } else {
        let x0, y0, x1, y1, hx, hy;
        if (D.mode === 'new') {
          x0 = D.p0.x; y0 = D.p0.y; x1 = p.x; y1 = p.y; hx = 1; hy = 1;
          if (Math.abs(x1 - x0) < 2 && Math.abs(y1 - y0) < 2) return;
        } else {
          const r = D.r0; hx = D.hx; hy = D.hy;
          x0 = hx < 0 ? r.x + r.w : r.x; x1 = hx < 0 ? p.x : hx > 0 ? p.x : r.x + r.w;
          y0 = hy < 0 ? r.y + r.h : r.y; y1 = hy < 0 ? p.y : hy > 0 ? p.y : r.y + r.h;
          if (!hx) { x0 = r.x; x1 = r.x + r.w; }
          if (!hy) { y0 = r.y; y1 = r.y + r.h; }
        }
        x1 = U.clamp(x1, B.x, B.x + B.w); y1 = U.clamp(y1, B.y, B.y + B.h);
        let w = Math.abs(x1 - x0), hh = Math.abs(y1 - y0);
        const lock = k || (e.shiftKey && !App.prefs.free ? 1 : null);
        if (lock) {
          if (D.mode === 'size' && !D.hx) w = hh * lock;
          else if (D.mode === 'size' && !D.hy) hh = w / lock;
          else if (w / hh > lock) w = hh * lock; else hh = w / lock;
        }
        const sx = x1 >= x0 ? 1 : -1, sy = y1 >= y0 ? 1 : -1;
        let x = sx > 0 ? x0 : x0 - w, y = sy > 0 ? y0 : y0 - hh;
        if (D.mode === 'size' && !D.hx) x = D.r0.x + (D.r0.w - w) / 2;
        if (D.mode === 'size' && !D.hy) y = D.r0.y + (D.r0.h - hh) / 2;
        // sınırların içinde tut
        x = U.clamp(x, B.x, B.x + B.w - Math.min(w, B.w)); y = U.clamp(y, B.y, B.y + B.h - Math.min(hh, B.h));
        w = Math.min(w, B.x + B.w - x); hh = Math.min(hh, B.y + B.h - y);
        if (lock) { if (w / hh > lock) w = hh * lock; else hh = w / lock; }
        T.rect = { x, y, w: Math.max(1, w), h: Math.max(1, hh) };
      }
      UI.setActionsEnabled(T.isDirty());
      T.syncFields();
      App.requestRender();
    },
    onUp() { T.drag = null; UI.setActionsEnabled(T.isDirty()); },
    onHover(p) {
      const hit = T.hitHandle(p);
      let c = 'crosshair';
      if (hit === 'move') c = 'move';
      else if (hit) c = (hit.hx && hit.hy) ? (hit.hx === hit.hy ? 'nwse-resize' : 'nesw-resize') : hit.hx ? 'ew-resize' : 'ns-resize';
      App.R.stage.style.cursor = c;
    },
    onDblClick() { if (T.isDirty()) App.applyTool(); },

    drawOverlay(ctx) {
      const r = T.rect;
      if (!r) return;
      const R = App.R, a = App.docToScreen(r.x, r.y), b = App.docToScreen(r.x + r.w, r.y + r.h);
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      ctx.beginPath();
      ctx.rect(0, 0, R.cssW, R.cssH);
      ctx.rect(a.x, a.y, b.x - a.x, b.y - a.y);
      ctx.fill('evenodd');
      ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 1; i < 3; i++) {
        const x = a.x + (b.x - a.x) * i / 3, y = a.y + (b.y - a.y) * i / 3;
        ctx.moveTo(x, a.y); ctx.lineTo(x, b.y); ctx.moveTo(a.x, y); ctx.lineTo(b.x, y);
      }
      ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
      ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
      // köşe tutamaçları
      ctx.lineWidth = 4; ctx.lineCap = 'square';
      const L = Math.min(18, (b.x - a.x) / 3, (b.y - a.y) / 3);
      ctx.beginPath();
      for (const [x, y, dx, dy] of [[a.x, a.y, 1, 1], [b.x, a.y, -1, 1], [a.x, b.y, 1, -1], [b.x, b.y, -1, -1]]) {
        ctx.moveTo(x, y + dy * L); ctx.lineTo(x, y); ctx.lineTo(x + dx * L, y);
      }
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      ctx.moveTo(mx - L / 2, a.y); ctx.lineTo(mx + L / 2, a.y); ctx.moveTo(mx - L / 2, b.y); ctx.lineTo(mx + L / 2, b.y);
      ctx.moveTo(a.x, my - L / 2); ctx.lineTo(a.x, my + L / 2); ctx.moveTo(b.x, my - L / 2); ctx.lineTo(b.x, my + L / 2);
      ctx.stroke();
      // boyut etiketi
      const txt = T.out ? `${T.out[0]} × ${T.out[1]}` : `${Math.round(r.w)} × ${Math.round(r.h)}`;
      ctx.font = '600 12px Segoe UI, sans-serif';
      const tw = ctx.measureText(txt).width + 14;
      const ly = b.y + 8 + 22 < R.cssH ? b.y + 8 : b.y - 30;
      ctx.fillStyle = 'rgba(0,0,0,.75)';
      ctx.fillRect(mx - tw / 2, ly, tw, 22);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
      ctx.fillText(txt, mx, ly + 15);
      ctx.restore();
    },

    async apply() {
      if (!T.isDirty()) return;
      const r = T.rect, out = T.out, angle = T.angle;
      await App.busy('Cropping…', () => {
        App.cropAngle = 0;
        App.cropDoc(Math.round(r.x), Math.round(r.y), Math.round(r.w), Math.round(r.h), angle);
        if (out) App.resizeDoc(out[0], out[1]);
      });
      App.commit(out ? 'Crop and Resize' : 'Crop');
      T.reset();
      App.fit();
      UI.rebuildPanel();
    },
    cancel() {
      App.cropAngle = 0;
      if (App.doc) T.reset();
      if (T.f) T.sync();
    },
    deactivate() {
      App.cropAngle = 0; T.drag = null;
      window.removeEventListener('keydown', T.altKey, true);
      window.removeEventListener('keyup', T.altKey, true);
    },
    refresh() { if (App.doc) { T.reset(); UI.rebuildPanel(); } },

    sync() {
      if (!T.f) return;
      T.f.ratio.set(T.ratio);
      T.f.angle.set(T.angle);
      T.syncFields();
      UI.setActionsEnabled(T.isDirty());
    },
    syncFields() {
      if (!T.f) return;
      T.f.w.set(Math.round(T.rect.w)); T.f.h.set(Math.round(T.rect.h));
      T.f.outLbl.textContent = T.out ? App.t('Output: {0} x {1} px', T.out[0], T.out[1]) : '';
    },

    panel(body) {
      T.f = {};
      if (!T.rect) T.reset();
      T.f.ratio = UI.seg({ options: RATIOS.map(([v, t]) => [v, t]), value: T.ratio, wrap: true, onChange: v => T.setRatio(v) });
      body.appendChild(UI.section('Aspect Ratio', [T.f.ratio.el]));

      const presetSel = h('select', {
        onchange: () => {
          const v = presetSel.value;
          if (!v) { T.out = null; T.sync(); App.requestRender(); return; }
          const [w, hh] = v.split('x').map(Number);
          T.ratio = 'custom'; T.custom = [w, hh];
          T.fitRatio(w / hh);
          T.out = [w, hh];
          T.sync();
          App.requestRender();
        },
      }, h('option', { value: '' }, 'Choose a Preset Size'),
      PRESETS.map(([g, list]) => h('optgroup', { label: g }, list.map(([n, w, hh]) => h('option', { value: `${w}x${hh}` }, `${n} (${w}×${hh})`)))));
      T.f.w = UI.number({ label: 'Width', value: 0, min: 1, onChange: v => { const k = T.ratioVal(); const B = T.bounds(); T.rect.w = U.clamp(v, 1, B.w); if (k) T.rect.h = T.rect.w / k; T.rect.x = Math.min(T.rect.x, B.x + B.w - T.rect.w); T.sync(); App.requestRender(); } });
      T.f.h = UI.number({ label: 'Height', value: 0, min: 1, onChange: v => { const k = T.ratioVal(); const B = T.bounds(); T.rect.h = U.clamp(v, 1, B.h); if (k) T.rect.w = T.rect.h * k; T.rect.y = Math.min(T.rect.y, B.y + B.h - T.rect.h); T.sync(); App.requestRender(); } });
      T.f.outLbl = h('div', { class: 'note accent' });
      body.appendChild(UI.section('Size', [h('div', { class: 'field' }, h('label', { class: 'fld-label' }, 'Output Size (preset)'), presetSel), h('div', { class: 'grid2' }, T.f.w.el, T.f.h.el), T.f.outLbl,
        UI.button('Center Area', () => T.centerArea(), { small: true, cls: 'ghost', icon: 'center' }),
        UI.note('Hold Alt to resize the area from its center. Shift keeps the ratio.')]));

      T.f.angle = UI.slider({ label: 'Straighten', min: -45, max: 45, step: 0.5, value: T.angle, onInput: v => T.setAngle(v) });
      const docOp = (label, fn) => {
        if (T.isDirty()) T.cancel();
        fn(); App.commit(label); T.reset(); App.fit(); T.sync();
      };
      body.appendChild(UI.section('Rotate and Flip', [
        T.f.angle.el,
        h('div', { class: 'btn-row' },
          UI.button('', () => docOp('Rotate Left', () => App.rotateDoc(-90)), { icon: 'rotL', title: 'Left 90°' }),
          UI.button('', () => docOp('Rotate Right', () => App.rotateDoc(90)), { icon: 'rotR', title: 'Right 90°' }),
          UI.button('', () => docOp('Flip Horizontal', () => App.flipDoc('h')), { icon: 'flipH', title: 'Flip Horizontal' }),
          UI.button('', () => docOp('Flip Vertical', () => App.flipDoc('v')), { icon: 'flipV', title: 'Flip Vertical' }),
        ),
      ]));

      // Yeniden boyutlandır
      const d = App.doc;
      let lock = true;
      const rw = UI.number({ label: 'Width (px)', value: d.w, min: 1, onChange: v => { if (lock) rh.set(Math.round(v * App.doc.h / App.doc.w)); pct.set(Math.round(v / App.doc.w * 100)); } });
      const rh = UI.number({ label: 'Height (px)', value: d.h, min: 1, onChange: v => { if (lock) rw.set(Math.round(v * App.doc.w / App.doc.h)); pct.set(Math.round(v / App.doc.h * 100)); } });
      const pct = UI.number({ label: 'Percent (%)', value: 100, min: 1, max: 1000, onChange: v => { rw.set(Math.round(App.doc.w * v / 100)); rh.set(Math.round(App.doc.h * v / 100)); } });
      const lk = UI.toggle({ label: 'Keep Ratio', value: true, onChange: v => { lock = v; } });
      body.appendChild(UI.section('Resize Image', [
        h('div', { class: 'grid2' }, rw.el, rh.el), pct.el, lk.el,
        UI.button('Resize', async () => {
          const w = Math.round(rw.get()), hh = Math.round(rh.get());
          if (!(w >= 1 && hh >= 1)) { UI.toast('Invalid size', 'error'); return; }
          if (w > 16384 || hh > 16384) { UI.toast('Too large: each side can be at most 16384 px', 'error'); return; }
          if (T.isDirty()) T.cancel();
          await App.busy('Resizing…', () => App.resizeDoc(w, hh));
          App.commit('Image Size'); T.reset(); App.fit(); UI.rebuildPanel();
        }, { block: true }),
        UI.button('Canvas Size…', () => App.actions.canvasDialog(), { block: true }),
      ], { open: false }));
      T.sync();
    },
  };

  App.registerTool(T);
})();
