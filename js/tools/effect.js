'use strict';
/* Efekt aracı: hazır görünümler (önizlemeli küçük resimler + yoğunluk) */
(() => {
  const { U, ui: UI, IMG } = App;
  const h = U.h;

  const T = {
    id: 'effect', name: 'Effect', icon: 'effect', key: 'E', actions: true,
    sel: null, amount: 100, cat: 'All', sess: null,

    async activate() {
      T.sel = null;
      const L = await App.pixelLayer(true);
      T.sess = L ? new App.PreviewSession(L) : null;
      if (!L) UI.toast('Select an image layer to apply an effect', 'warn');
      T.hist.reset();
      T.makeThumbs();
    },
    deactivate() { if (T.sess) T.sess.clear(); T.sess = null; T.stopThumbs = true; },
    isDirty() { return !!(T.sess && T.sel); },
    pendingState() { return { name: T.sel && T.sel.name, amount: T.amount }; },
    restorePending(st) { T.setState(st); },
    // araç içi geri al / yinele (efekt seçimi ve yoğunluk adımları)
    setState(st) {
      T.sel = st.name ? IMG.EFFECTS.find(e => e.name === st.name) || null : null;
      T.amount = st.amount;
      if (T.amtSl) T.amtSl.set(T.amount);
      document.querySelectorAll('#toolpanel .fx-card').forEach(c => c.classList.toggle('on', T.sel ? c.dataset.name === T.sel.name : !c.dataset.name));
      if (T.sel) T.run(); else { if (T.sess) T.sess.clear(); UI.setActionsEnabled(false); }
      if (T.syncTitle) T.syncTitle();
    },
    canLocalUndo: () => T.hist.canUndo(),
    canLocalRedo: () => T.hist.canRedo(),
    localUndo: () => T.hist.undo(),
    localRedo: () => T.hist.redo(),
    run() {
      if (!T.sess || !T.sel) return;
      const def = T.sel, a = T.amount / 100;
      T.sess.update((c, s) => IMG.applyEffect(c, def, a, s));
      UI.setActionsEnabled(true);
    },
    async apply() {
      if (!T.isDirty()) return;
      await T.sess.apply('Effect: ' + T.sel.name);
      T.sel = null;
      T.sess = new App.PreviewSession(T.sess.layer);
      T.hist.reset();
      T.makeThumbs();
      UI.rebuildPanel();
    },
    cancel() {
      if (T.sess) T.sess.clear();
      T.sel = null;
      T.hist.reset();
      document.querySelectorAll('.fx-card.on').forEach(e => e.classList.remove('on'));
      if (T.syncTitle) T.syncTitle();
    },
    refresh() {
      const L = App.activeLayer();
      if (T.sess) T.sess.clear();
      T.sel = null;
      T.hist.reset();
      T.sess = L && L.type === 'raster' ? new App.PreviewSession(L) : null;
      T.makeThumbs();
      UI.rebuildPanel();
    },

    makeThumbs() {
      T.thumbs = new Map();
      T.stopThumbs = false;
      if (!T.sess) return;
      const base = U.fit(T.sess.layer.canvas, 150);
      // kare kırp
      const s = Math.min(base.width, base.height);
      const sq = U.canvas(Math.min(120, s), Math.min(120, s));
      sq.getContext('2d').drawImage(base, (base.width - s) / 2, (base.height - s) / 2, s, s, 0, 0, sq.width, sq.height);
      T.thumbBase = sq;
      const list = IMG.EFFECTS.slice();
      const step = () => {
        if (T.stopThumbs || App.tool !== T) return;
        const t0 = performance.now();
        while (list.length && performance.now() - t0 < 12) {
          const def = list.shift();
          let c;
          try { c = IMG.applyEffect(sq, def, 1, sq.width / T.sess.layer.canvas.width); } catch (e) { c = sq; }
          T.thumbs.set(def, c);
          const cv = document.querySelector(`.fx-card[data-name="${CSS.escape(def.name)}"] canvas`);
          if (cv) { const x = cv.getContext('2d'); x.clearRect(0, 0, cv.width, cv.height); x.drawImage(c, 0, 0, cv.width, cv.height); }
        }
        if (list.length) setTimeout(step, 0);
      };
      setTimeout(step, 30);
    },

    panel(body) {
      const amt = T.amtSl = UI.slider({ label: 'Intensity', min: 0, max: 100, value: T.amount, def: 100, onInput: v => { T.amount = v; T.run(); }, onChange: () => { if (T.sel) T.hist.push(); } });
      // Üst kısım (seçili efekt, önce/sonra, yoğunluk, kategoriler) kaydırırken görünür kalır
      T.titleEl = h('b', { class: 'fx-head-title' });
      T.syncTitle = () => { T.titleEl.textContent = App.t(T.sel ? T.sel.name : 'Original'); peek.style.visibility = T.sel ? '' : 'hidden'; };
      const peek = UI.peekBtn();
      // kategori sekmeleri: 50 efekt tek listede boğucu olmasın
      const cats = ['All', ...new Set(IMG.EFFECTS.map(e => e.cat))];
      body.appendChild(h('div', { class: 'fx-head' },
        h('div', { class: 'fx-head-row' }, T.titleEl, peek),
        amt.el,
        UI.tabs(cats.map(c => [c, c]), v => { T.cat = v; fill(); }, T.cat)));
      T.syncTitle();
      const grid = h('div', { class: 'fx-grid' });
      // arama: yazı varken kategoriye bakılmadan bütün efektlerde aranır
      const search = UI.searchBox(q => { T.q = q; fill(); }, 'Search Effects…');
      if (T.q) { search.inp.value = T.q; search.el.classList.add('has'); }
      const fill = () => {
        grid.innerHTML = '';
        const q = T.q || '';
        const orig = h('button', { class: 'fx-card' + (!T.sel ? ' on' : ''), onclick: () => { if (T.sess) T.sess.clear(); T.sel = null; grid.querySelectorAll('.fx-card').forEach(e => e.classList.remove('on')); orig.classList.add('on'); UI.setActionsEnabled(false); T.hist.push(); T.syncTitle(); } },
          (() => { const c = h('canvas', { width: 120, height: 120 }); if (T.thumbBase) c.getContext('2d').drawImage(T.thumbBase, 0, 0, 120, 120); return c; })(),
          h('span', null, 'Original'));
        if (!q) grid.appendChild(orig);
        for (const def of IMG.EFFECTS) {
          if (!q && T.cat !== 'All' && def.cat !== T.cat) continue;
          const c = h('canvas', { width: 120, height: 120 });
          const th = T.thumbs && T.thumbs.get(def);
          if (th) c.getContext('2d').drawImage(th, 0, 0, 120, 120);
          else if (T.thumbBase) { const x = c.getContext('2d'); x.globalAlpha = 0.3; x.drawImage(T.thumbBase, 0, 0, 120, 120); x.globalAlpha = 1; }
          const card = h('button', {
            class: 'fx-card' + (T.sel === def ? ' on' : ''), 'data-name': def.name, title: App.t(def.cat) + ' · ' + App.t(def.name),
            onclick: () => {
              grid.querySelectorAll('.fx-card').forEach(e => e.classList.remove('on'));
              card.classList.add('on');
              T.sel = def; T.run(); T.hist.push(); T.syncTitle();
            },
          }, c, h('span', null, def.name));
          card.dataset.q = [def.name, App.t(def.name), def.cat, App.t(def.cat)].join(' ');
          grid.appendChild(card);
        }
        if (q) UI.filterItems(grid, '.fx-card', q);
      };
      body.append(search.el, grid);
      fill();
    },
  };

  T.hist = UI.localHist(() => ({ name: T.sel ? T.sel.name : null, amount: T.amount }), st => T.setState(st));
  App.on('active', () => { if (App.tool === T) T.refresh(); });
  App.registerTool(T);
})();
