'use strict';
/* Filtre aracı: HDR, odak, çift ton, ayna, dağılım, glitch, piksel, yarım ton ve daha fazlası */
(() => {
  const { U, ui: UI, IMG } = App;
  const h = U.h;
  const ms = c => Math.min(c.width, c.height);

  // adv: "Daha fazla ayar" altında kapalı duran ileri ayarlar
  const FILTERS = [
    { id: 'hdr', name: 'HDR', params: [['amount', 'Strength', 0, 100, 55]], run: (c, p) => IMG.hdr(c, p.amount) },
    {
      id: 'focus', name: 'Blur Background', pick: 'center', params: [
        ['type', 'Format', [['radial', 'Circle'], ['linear', 'Band']], 'radial'],
        ['blur', 'Blur', 0, 100, 50], ['size', 'Sharp Area', 0, 100, 25], ['feather', 'Feather', 0, 100, 30],
        ['angle', 'Band Angle', -90, 90, 0], ['bokeh', 'Light Glow (bokeh)', 0, 100, 0], ['invert', 'Invert (blur the Center)', 'bool', false]],
      adv: ['angle', 'bokeh', 'invert'],
      run: (c, p) => IMG.focus(c, { type: p.type, blur: p.blur, size: p.size / 100, feather: p.feather / 100, angle: p.angle, bokeh: p.bokeh, invert: p.invert, cx: p.cx, cy: p.cy }),
      hint: 'Click the image to choose the area that stays sharp.',
    },
    {
      id: 'splash', name: 'Color Splash', pick: 'hue', params: [['hue', 'Kept Hue', 0, 360, 0], ['range', 'Range', 0, 90, 25], ['soft', 'Feather', 0, 90, 20]],
      adv: ['soft'],
      run: (c, p) => IMG.colorSplash(c, p.hue, p.range, p.soft), hint: 'Click the spot you want to keep in color; the rest becomes black and white.',
    },
    {
      id: 'duotone', name: 'Duotone', params: [['c1', 'Shadows', 'color', '#1b0b5e'], ['c2', 'Highlights', 'color', '#ffd166'], ['amount', 'Mix', 0, 100, 100], ['tri', 'Use Three Colors', 'bool', false], ['c3', 'Midtones', 'color', '#ef476f']],
      adv: ['tri', 'c3'],
      run: (c, p) => IMG.pixelPass(c, { gradMap: { stops: p.tri ? [p.c1, p.c3, p.c2] : [p.c1, p.c2], amt: p.amount / 100 } }),
    },
    { id: 'mirror', name: 'Mirror', params: [['mode', 'Direction', [['left', 'Left→Right'], ['right', 'Right→Left'], ['top', 'Top→Bottom'], ['bottom', 'Bottom→Top'], ['quad', 'Quad']], 'left']], run: (c, p) => IMG.mirror(c, p.mode) },
    {
      id: 'dispersion', name: 'Dispersion', params: [['amount', 'Amount', 0, 100, 60], ['size', 'Particle Size', 0, 100, 30], ['start', 'Start', 0, 100, 40], ['angle', 'Direction', -180, 180, 0], ['seed', 'Random', 'seed', 3]],
      adv: ['start', 'angle'],
      run: (c, p) => IMG.dispersion(c, p),
    },
    {
      id: 'glitch', name: 'Glitch', presets: true, params: [['shift', 'Color Shift', 0, 100, 35], ['slices', 'Strip Shift', 0, 100, 30], ['blocks', 'Broken Blocks', 0, 100, 15], ['scan', 'Scan Lines', 0, 100, 20], ['seed', 'Random', 'seed', 7], ['noise', 'Noise', 0, 100, 10], ['color', 'Color Bands', 0, 100, 10], ['vertical', 'Vertical Offset', 'bool', false]],
      adv: ['noise', 'color', 'vertical'],
      run: (c, p) => IMG.glitch(c, p),
    },
    {
      id: 'pixelate', name: 'Pixelate', params: [['size', 'Cell Size', 1, 250, 15], ['mode', 'Format', [['square', 'Square'], ['tiles', 'Tiles'], ['dots', 'Dot']], 'square']],
      run: (c, p) => IMG.pixelate(c, Math.max(2, ms(c) * p.size / 1000), p.mode),
    },
    {
      id: 'halftone', name: 'Halftone', params: [['size', 'Dot Size', 1, 100, 12], ['mode', 'Color', [['mono', 'Black'], ['color', 'Colored']], 'mono'], ['angle', 'Angle', 0, 90, 45], ['amount', 'Mix', 0, 100, 100]],
      adv: ['angle', 'amount'],
      run: (c, p) => IMG.mixWith(c, IMG.halftone(c, Math.max(3, ms(c) * p.size / 1000), p.angle, p.mode), p.amount / 100),
    },
    { id: 'sketch', name: 'Pencil Sketch', params: [['strength', 'Strength', 0, 100, 60], ['color', 'Colored', 'bool', false]], run: (c, p) => IMG.sketch(c, p.strength, p.color) },
    { id: 'oil', name: 'Oil Paint', params: [['radius', 'Brush', 1, 100, 30], ['amount', 'Mix', 0, 100, 100]], adv: ['amount'], run: (c, p) => IMG.mixWith(c, IMG.kuwahara(c, Math.max(1, ms(c) * p.radius / 3000)), p.amount / 100) },
    { id: 'cartoon', name: 'Cartoon', params: [['levels', 'Number of Colors', 2, 12, 6], ['edge', 'Line', 0, 100, 50]], run: (c, p) => IMG.cartoon(c, p.levels, p.edge) },
    { id: 'emboss', name: 'Emboss', params: [['strength', 'Strength', 0, 100, 50], ['color', 'Colored', 'bool', false]], run: (c, p) => IMG.emboss(c, p.strength, p.color) },
    { id: 'neon', name: 'Neon Edges', params: [['strength', 'Strength', 0, 100, 60], ['mode', 'Color', [['color', 'Original'], ['rainbow', 'Rainbow'], ['white', 'White']], 'color']], run: (c, p) => IMG.neonEdges(c, p.strength, p.mode) },
    { id: 'posterize', name: 'Posterize', params: [['levels', 'Color Levels', 2, 16, 5]], run: (c, p) => IMG.pixelPass(c, { posterize: p.levels }) },
    { id: 'solarize', name: 'Solarize', params: [['t', 'Threshold', 0, 255, 128]], run: (c, p) => IMG.pixelPass(c, { solarize: p.t }) },
    { id: 'threshold', name: 'Black and White Threshold', params: [['t', 'Threshold', 0, 255, 128]], run: (c, p) => IMG.pixelPass(c, { threshold: p.t }) },
    { id: 'motion', name: 'Motion', params: [['angle', 'Angle', -180, 180, 0], ['amount', 'Distance', 0, 100, 30]], run: (c, p) => IMG.motionBlur(c, p.angle, ms(c) * p.amount / 600) },
    { id: 'zoom', name: 'Zoom Blur', pick: 'center', params: [['amount', 'Strength', 0, 100, 40]], run: (c, p) => IMG.zoomBlur(c, p.cx == null ? 0.5 : p.cx, p.cy == null ? 0.5 : p.cy, p.amount), hint: 'Click the image to choose the center.' },
    { id: 'chroma', name: 'Chromatic Aberration', params: [['amount', 'Strength', 0, 100, 35]], run: (c, p) => IMG.chromatic(c, p.amount) },
    { id: 'leak', name: 'Light Leak', params: [['style', 'Style', 0, 5, 0], ['amount', 'Intensity', 0, 100, 70], ['pos', 'Position (angle)', -180, 180, -135]], run: (c, p) => IMG.lightLeak(c, p.style, p.amount, p.pos) },
    { id: 'grain', name: 'Film Grain', params: [['amount', 'Grain', 0, 100, 40], ['fade', 'Fade', 0, 100, 20]], run: (c, p) => IMG.adjust(c, { grain: p.amount, fade: p.fade }) },
  ];
  const rnd = () => Math.round(Math.random() * 100);

  const defaults = f => {
    const o = {};
    for (const q of f.params) o[q[0]] = q[q.length - 1];
    return o;
  };

  const T = {
    id: 'filter', name: 'Filter', icon: 'filter', key: 'F', actions: true,
    sel: null, p: {}, sess: null, on: false,
    cursor() { return T.sel && T.sel.pick ? 'crosshair' : 'default'; },

    async activate() {
      T.on = false; T.sel = null;
      const L = await App.pixelLayer(true);
      T.sess = L ? new App.PreviewSession(L) : null;
      if (!L) UI.toast('Select an image layer to apply a filter', 'warn');
      T.hist.reset();
      T.makeThumbs();
    },
    deactivate() { if (T.sess) T.sess.clear(); T.sess = null; T.on = false; },
    isDirty() { return !!(T.sess && T.sel && T.on); },
    pendingState() { return { id: T.sel && T.sel.id, p: { ...T.p } }; },
    restorePending(st) { T.setState(st); },
    // araç içi geri al / yinele
    setState(st) {
      T.sel = st.id ? FILTERS.find(f => f.id === st.id) : null;
      T.p = { ...st.p };
      T.markCards(); T.buildParams();
      if (T.sel) T.run();
      else { if (T.sess) T.sess.clear(); T.on = false; UI.setActionsEnabled(false); }
    },
    canLocalUndo: () => T.hist.canUndo(),
    canLocalRedo: () => T.hist.canRedo(),
    localUndo: () => T.hist.undo(),
    localRedo: () => T.hist.redo(),
    run() {
      if (!T.sess || !T.sel) return;
      const f = T.sel, p = { ...T.p };
      T.on = true;
      T.sess.update(c => f.run(c, p));
      UI.setActionsEnabled(true);
      App.requestRender();
    },
    async apply() {
      if (!T.isDirty()) return;
      await T.sess.apply('Filter: ' + T.sel.name);
      T.on = false; T.sel = null;
      T.sess = new App.PreviewSession(T.sess.layer);
      T.hist.reset();
      T.makeThumbs();
      UI.rebuildPanel();
    },
    cancel() { if (T.sess) T.sess.clear(); T.on = false; T.sel = null; T.hist.reset(); },
    refresh() {
      const L = App.activeLayer();
      if (T.sess) T.sess.clear();
      T.on = false;
      T.sess = L && L.type === 'raster' ? new App.PreviewSession(L) : null;
      T.hist.reset();
      T.makeThumbs();
      UI.rebuildPanel();
    },

    onDown(p, drag) {
      if (!T.sess || !T.sel || !T.sel.pick) return;
      const L = T.sess.layer, q = App.docToLayer(L, p.x, p.y);
      const W = L.canvas.width, H = L.canvas.height;
      // sürüklerken imleç resmin dışına çıkarsa merkez kenarda imlece en yakın noktayı izler
      if (drag) { q.x = U.clamp(q.x, 0, W); q.y = U.clamp(q.y, 0, H); }
      else if (q.x < 0 || q.y < 0 || q.x > W || q.y > H) return;
      T.dragging = true;
      if (T.sel.pick === 'center') { T.p.cx = q.x / W; T.p.cy = q.y / H; }
      else {
        const d = L.canvas.getContext('2d').getImageData(Math.floor(q.x), Math.floor(q.y), 1, 1).data;
        T.p.hue = Math.round(U.rgb2hsl(d[0], d[1], d[2])[0]);
        if (T.fields && T.fields.hue) T.fields.hue.set(T.p.hue);
      }
      T.run();
    },
    onMove(p) { if (T.sel && T.sel.pick === 'center') T.onDown(p, T.dragging); },
    onUp() { if (T.sel && T.sel.pick && T.dragging) T.hist.push(); T.dragging = false; },
    drawOverlay(ctx) {
      if (!T.sess || !T.sel || T.sel.pick !== 'center' || !T.on) return;
      const L = T.sess.layer, W = L.canvas.width, H = L.canvas.height;
      const cx = (T.p.cx == null ? 0.5 : T.p.cx) * W, cy = (T.p.cy == null ? 0.5 : T.p.cy) * H;
      const c = App.layerToDoc(L, cx, cy), s = App.docToScreen(c.x, c.y);
      ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      if (T.sel.id === 'focus') {
        const M = Math.max(W, H) * App.layerScale(L) * App.view.zoom;
        const half = (T.p.size / 100) * M * 0.5, fe = (T.p.feather / 100) * M * 0.5;
        if (T.p.type === 'radial') {
          ctx.beginPath(); ctx.arc(s.x, s.y, half, 0, Math.PI * 2); ctx.stroke();
          ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(s.x, s.y, half + fe, 0, Math.PI * 2); ctx.stroke();
        } else {
          const a = (T.p.angle || 0) * Math.PI / 180, dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx, Lg = 4000;
          for (const [k, al] of [[half, 1], [-half, 1], [half + fe, 0.5], [-half - fe, 0.5]]) {
            ctx.globalAlpha = al;
            ctx.beginPath(); ctx.moveTo(s.x + nx * k - dx * Lg, s.y + ny * k - dy * Lg); ctx.lineTo(s.x + nx * k + dx * Lg, s.y + ny * k + dy * Lg); ctx.stroke();
          }
        }
      }
      ctx.setLineDash([]); ctx.globalAlpha = 1;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(s.x, s.y, 6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#4f8cff'; ctx.lineWidth = 2; ctx.stroke();
    },

    makeThumbs() {
      T.thumbs = new Map();
      if (!T.sess) return;
      const base = U.fit(T.sess.layer.canvas, 140);
      const s = Math.min(base.width, base.height);
      const sq = U.canvas(Math.min(96, s), Math.min(96, s));
      sq.getContext('2d').drawImage(base, (base.width - s) / 2, (base.height - s) / 2, s, s, 0, 0, sq.width, sq.height);
      T.thumbBase = sq;
      const list = FILTERS.slice();
      const step = () => {
        if (App.tool !== T) return;
        const t0 = performance.now();
        while (list.length && performance.now() - t0 < 12) {
          const f = list.shift();
          let c;
          try { c = f.run(sq, defaults(f)); } catch (e) { c = sq; }
          T.thumbs.set(f.id, c);
          const cv = document.querySelector(`.fx-card[data-id="${f.id}"] canvas`);
          if (cv) { const x = cv.getContext('2d'); x.clearRect(0, 0, 96, 96); x.drawImage(c, 0, 0, 96, 96); }
        }
        if (list.length) setTimeout(step, 0);
      };
      setTimeout(step, 30);
    },

    selectId(id) { const f = FILTERS.find(x => x.id === id); if (f && T.sess) T.select(f); },
    select(f) {
      if (!T.sess) { UI.toast('Select an image layer to apply a filter', 'warn'); return; }
      T.sel = f;
      T.p = defaults(f);
      T.markCards();
      T.buildParams();
      T.run();
      T.hist.push();
    },
    markCards() { document.querySelectorAll('#toolpanel .fx-card').forEach(c => c.classList.toggle('on', !!T.sel && c.dataset.id === T.sel.id)); },

    // Üstte filtre kartları; seçilen filtrenin ayarları panelin altında durur ve kaydırırken görünür kalır
    panel(body) {
      T.paramsBox = h('div', { class: 'fx-head at-bottom' });
      const grid = h('div', { class: 'fx-grid' }, FILTERS.map(f => {
        const c = h('canvas', { width: 96, height: 96 });
        const th = T.thumbs && T.thumbs.get(f.id);
        if (th) c.getContext('2d').drawImage(th, 0, 0, 96, 96);
        else if (T.thumbBase) { const x = c.getContext('2d'); x.globalAlpha = 0.3; x.drawImage(T.thumbBase, 0, 0, 96, 96); x.globalAlpha = 1; }
        return h('button', { class: 'fx-card' + (T.sel === f ? ' on' : ''), 'data-id': f.id, 'data-q': f.name + ' ' + App.t(f.name), title: f.name, onclick: () => T.select(f) }, c, h('span', null, f.name));
      }));
      const search = UI.searchBox(q => { T.q = q; UI.filterItems(grid, '.fx-card', q); }, 'Search Filters…');
      if (T.q) { search.inp.value = T.q; search.el.classList.add('has'); UI.filterItems(grid, '.fx-card', T.q); }
      body.append(search.el, grid, T.paramsBox);
      T.buildParams();
    },
    buildParams() {
      const box = T.paramsBox;
      if (!box) return;
      box.innerHTML = '';
      box.classList.toggle('empty', !T.sel);
      const f = T.sel;
      box.appendChild(h('div', { class: 'fx-head-row' },
        h('b', { class: 'fx-head-title' }, f ? f.name : 'Choose a Filter'),
        f ? UI.peekBtn() : null,
        f ? UI.iconBtn('reset', 'Restore Defaults', () => { T.p = { ...defaults(f), cx: T.p.cx, cy: T.p.cy }; T.syncFields(); T.run(); T.hist.push(); }) : null));
      if (f) box.appendChild(T.paramsPanel(f));
    },

    paramsPanel(f) {
      T.fields = {};
      const kids = [], advKids = [];
      if (f.hint) kids.push(UI.note(f.hint));
      let ct;
      const push = () => T.hist.push();
      if (f.presets) {
        kids.push(h('div', { class: 'btn-row' },
          UI.button('Random', () => { T.p = { ...T.p, shift: rnd(), slices: rnd(), blocks: rnd(), scan: rnd(), noise: Math.round(rnd() * 0.6), color: rnd(), seed: Math.floor(Math.random() * 1e6) }; T.syncFields(); T.run(); push(); }, { small: true, icon: 'dice' }),
          ...['GL1', 'GL2', 'GL3', 'GL4'].map((k, i) => UI.button(App.t('Preset {0}', i + 1), () => { Object.assign(T.p, IMG.GLITCH_PRESETS[k]); T.syncFields(); T.run(); push(); }, { small: true }))));
      }
      if (f.id === 'leak') {
        kids.push(h('div', { class: 'leak-row' }, IMG.LEAKS.map((cols, i) => h('button', {
          class: 'leak-sw', title: App.t('Style {0}', i + 1), style: { background: `linear-gradient(135deg, ${cols[0]}, ${cols[1]})` },
          onclick: () => { T.p.style = i; if (T.fields.style) T.fields.style.set(i); T.run(); push(); },
        }))));
      }
      for (const q of f.params) {
        const [k, label, a, b, def] = q;
        let fld;
        if (a === 'bool') fld = UI.toggle({ label, value: T.p[k], onChange: v => { T.p[k] = v; T.run(); push(); } });
        else if (a === 'color') fld = UI.color({ label, value: T.p[k], onInput: v => { T.p[k] = v; T.run(); clearTimeout(ct); ct = setTimeout(push, 400); } });
        else if (a === 'seed') {
          fld = { el: UI.button('New Random Layout', () => { T.p[k] = Math.floor(Math.random() * 1e6); T.run(); push(); }, { small: true, icon: 'dice' }), set() {} };
        } else if (Array.isArray(a)) fld = UI.seg({ label, options: a, value: T.p[k], wrap: true, onChange: v => { T.p[k] = v; T.run(); push(); } });
        else fld = UI.slider({ label, min: a, max: b, value: T.p[k], def, onInput: v => { T.p[k] = v; T.run(); }, onChange: push });
        T.fields[k] = fld;
        (f.adv && f.adv.includes(k) ? advKids : kids).push(fld.el);
      }
      // Daha fazla ayar: aşağı doğru kayarak açılır; düğme her zaman altta görünür kalır
      const out = h('div', { class: 'fx-params-in' }, h('div', { class: 'fx-scroll' }, kids));
      if (advKids.length) {
        T.advOpen = T.advOpen || {};
        const wrap = h('div', { class: 'fx-adv' + (T.advOpen[f.id] ? ' open' : '') }, h('div', { class: 'fx-adv-in' }, advKids));
        out.firstChild.appendChild(wrap);
        const tg = h('button', { class: 'fx-more' + (T.advOpen[f.id] ? ' open' : '') });
        const lab = () => { tg.innerHTML = `<span>${App.t(T.advOpen[f.id] ? 'Fewer Settings' : 'More Settings')}</span>` + App.icon('down', 14); };
        tg.onclick = () => {
          T.advOpen[f.id] = !T.advOpen[f.id];
          wrap.classList.toggle('open', T.advOpen[f.id]); tg.classList.toggle('open', T.advOpen[f.id]); lab();
          // yalnızca ayarlar kutusu kendi içinde kaydırılır; scrollIntoView yapışkan kutuyu taşıyan paneli de kaydırıp kutuyu aşağı itiyordu
          const sc = out.firstChild;
          if (T.advOpen[f.id]) setTimeout(() => { if (sc.scrollHeight > sc.clientHeight) sc.scrollTo({ top: sc.scrollHeight, behavior: App.scrollBehavior() }); }, 230);
        };
        lab();
        out.appendChild(tg);
      }
      return out;
    },
    syncFields() { for (const k in T.fields) if (T.fields[k].set && T.p[k] != null) T.fields[k].set(T.p[k]); },
  };

  T.hist = UI.localHist(() => ({ id: T.sel ? T.sel.id : null, p: { ...T.p } }), st => T.setState(st));
  App.on('active', () => { if (App.tool === T) T.refresh(); });
  App.registerTool(T);
})();
