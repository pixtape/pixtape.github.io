'use strict';
/* Proje sekmeleri: aynı anda birden fazla belge açık kalır, üstteki sekmelerle geçiş yapılır */
(() => {
  const { U, ui: UI } = App;
  const h = U.h;
  const K = id => (App.shortcuts ? App.shortcuts.label(id) : '');
  const H = App.history;

  const T = App.tabs = {
    list: [],          // { doc, stack, index, view, dirty, thumb }
    entry: d => T.list.find(e => e.doc === d),
    byId: id => T.list.find(e => e.doc.id === id),

    // Etkin belgenin geçmişini ve görünümünü sekmesine yaz
    stash() {
      const e = App.doc && T.entry(App.doc);
      if (!e) return;
      e.stack = H.stack; e.index = H.index; e.view = { ...App.view };
    },

    // o.quiet: ana ekrandayken arka planda geç (düzenleyiciyi açma)
    async switchTo(e, o = {}) {
      if (!e || e.doc === App.doc) { if (e && !o.quiet) App.showEditor(); return; }
      const t = App.tool;
      if (t && t.isDirty && t.isDirty()) {
        const r = await UI.choice('There are pending changes. Apply them?', [['apply', 'Apply', true], ['discard', 'Discard'], ['stay', 'Cancel']]);
        if (r === 'stay' || r == null) return;
        if (r === 'apply') await App.applyTool(); else App.cancelTool();
      } else if (t && t.cancel) { try { t.cancel(); } catch (err) { /* */ } }
      const cur = App.doc && T.entry(App.doc);
      if (cur && (cur.dirty || (!cur.saved && App.prefs.autosave))) { cur.dirty = false; await App.storage.saveCurrent(); }
      T.stash();
      App.doc = e.doc;
      H.stack = e.stack; H.index = e.index; H.pendingRedo = null;
      App.preview = null; App.strokePreview = null; App.cropAngle = 0; App.guides = [];
      Object.assign(App.view, e.view);
      App.emit('docopen');
      App.emit('doc');
      App.emit('history');
      App.emit('view');
      if (!o.quiet) App.showEditor(true);
      App.requestRender();
      T.render();
    },

    // Silinen projenin sekmesi kaydedilmeden kapanır (yoksa otomatik kayıt projeyi geri getirirdi)
    async forget(id) {
      const e = T.byId(id);
      if (!e) return;
      const i = T.list.indexOf(e), home = document.body.classList.contains('at-home');
      T.list.splice(i, 1);
      if (e.doc === App.doc) {
        const next = T.list[Math.min(i, T.list.length - 1)];
        App.doc = null; // switchTo silinen belgeyi kaydetmesin
        if (next) await T.switchTo(next, { quiet: home });
        else { App.closeDoc(); document.title = 'Pixtape'; if (!home) App.showHome(); }
      }
      T.render();
    },

    // Sekmeyi kapat; etkin sekmeyse komşusuna geç, hiç kalmadıysa ana ekrana dön
    async close(e) {
      e = e || T.entry(App.doc);
      if (!e) return;
      const i = T.list.indexOf(e);
      if (e.doc === App.doc) {
        if (App.prefs.autosave) await App.storage.saveCurrent();
        else if (e.dirty && !(await UI.confirm(App.t('Close "{0}"? Autosave is off, so your changes will be lost.', e.doc.name), 'Close', true))) return;
        T.list.splice(i, 1);
        const next = T.list[Math.min(i, T.list.length - 1)];
        if (next) {
          App.doc = null; // switchTo kapanan belgeyi saklamasın
          await T.switchTo(next);
        } else {
          App.closeDoc();
          document.title = 'Pixtape';
          App.showHome();
        }
      } else {
        if (!App.prefs.autosave && e.dirty && !(await UI.confirm(App.t('Close "{0}"? Autosave is off, so your changes will be lost.', e.doc.name), 'Close', true))) return;
        T.list.splice(i, 1);
      }
      T.render();
    },
    step(dir) {
      if (T.list.length < 2) return;
      const i = T.list.indexOf(T.entry(App.doc));
      T.switchTo(T.list[(i + dir + T.list.length) % T.list.length]);
    },

    render() {
      const bar = document.getElementById('docTabs');
      if (!bar) return;
      bar.innerHTML = '';
      let dragI = -1;
      T.list.forEach((e, i) => {
        const on = e.doc === App.doc;
        const tab = h('div', {
          class: 'dt-tab' + (on ? ' on' : ''), draggable: 'true', title: `${e.doc.name} (${e.doc.w} × ${e.doc.h})`,
          onclick: () => T.switchTo(e),
          onauxclick: ev => { if (ev.button === 1) { ev.preventDefault(); T.close(e); } },
        },
        e.thumb ? h('img', { class: 'dt-thumb', src: e.thumb, alt: '', draggable: 'false' }) : h('span', { class: 'dt-thumb', html: App.icon('image', 14) }),
        h('span', { class: 'dt-name', 'data-noi18n': '' }, e.doc.name),
        e.dirty && !App.prefs.autosave ? h('i', { class: 'dt-dot', title: 'Unsaved Changes' }) : null,
        h('button', { class: 'dt-x', title: 'Close', html: App.icon('close', 13), onclick: ev => { ev.stopPropagation(); T.close(e); } }));
        tab.addEventListener('contextmenu', ev => {
          ev.preventDefault();
          UI.menu(null, [
            { label: 'Close', icon: 'close', key: K('closeTab'), onClick: () => T.close(e) },
            { label: 'Close Other Tabs', icon: 'close', disabled: T.list.length < 2, onClick: async () => { for (const o of T.list.slice()) if (o !== e) await T.close(o); } },
            { label: 'Close Tabs to the Right', icon: 'right', disabled: i === T.list.length - 1, onClick: async () => { for (const o of T.list.slice(i + 1)) await T.close(o); } },
            '-',
            { label: 'Duplicate in New Tab', icon: 'copy', onClick: () => T.duplicate(e) },
          ], { at: { x: ev.clientX, y: ev.clientY } });
        });
        tab.addEventListener('dragstart', ev => { dragI = i; ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/plain', 'tab'); tab.classList.add('drag'); });
        tab.addEventListener('dragend', () => tab.classList.remove('drag'));
        tab.addEventListener('dragover', ev => { if (dragI >= 0 && dragI !== i) { ev.preventDefault(); tab.classList.add('over'); } });
        tab.addEventListener('dragleave', () => tab.classList.remove('over'));
        tab.addEventListener('drop', ev => {
          ev.preventDefault(); ev.stopPropagation();
          if (dragI < 0 || dragI === i) return;
          const [m] = T.list.splice(dragI, 1);
          T.list.splice(i, 0, m);
          T.render();
        });
        bar.appendChild(tab);
      });
      bar.appendChild(h('button', {
        class: 'dt-add', title: 'New Tab', html: App.icon('plus', 16),
        onclick: ev => UI.menu(ev.currentTarget, [
          { label: 'Open Image…', icon: 'folder', key: K('open'), onClick: () => App.actions.open() },
          { label: 'Create New…', icon: 'filePlus', key: K('new'), onClick: () => App.actions.newDialog() },
          { label: 'Recent Projects', icon: 'home', onClick: () => App.showHome() },
        ]),
      }));
      // Sekmeler sığmayınca iki yanda kaydırma okları (kaydırma çubuğu gizli)
      const nav = (dir, icon) => h('button', { class: 'dt-nav ' + (dir < 0 ? 'l' : 'r'), title: dir < 0 ? 'Scroll Left' : 'Scroll Right', html: App.icon(icon, 16), onclick: () => bar.scrollBy({ left: dir * Math.max(160, bar.clientWidth * 0.6), behavior: App.scrollBehavior() }) });
      bar.prepend(nav(-1, 'left'));
      bar.appendChild(nav(1, 'right'));
      const on = bar.querySelector('.dt-tab.on');
      if (on) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      T.syncNav();
    },
    syncNav() {
      const bar = document.getElementById('docTabs');
      if (!bar) return;
      const max = bar.scrollWidth - bar.clientWidth;
      bar.classList.toggle('can-l', bar.scrollLeft > 1);
      bar.classList.toggle('can-r', bar.scrollLeft < max - 1);
    },

    duplicate(e) {
      const d = e.doc;
      const layers = d.layers.map(L => { const c = App.cloneLayer(L); c.canvas = U.clone(L.canvas); return c; });
      App.newDoc({ w: d.w, h: d.h, name: d.name + ' ' + App.t('copy'), layers, label: 'Duplicated', paper: d.bg || null });
      App.showEditor();
    },

    init() {
      // Fare tekerleği sekmeleri yatay kaydırır
      const bar = document.getElementById('docTabs');
      if (bar) {
        bar.addEventListener('wheel', e => {
          if (bar.scrollWidth <= bar.clientWidth) return;
          e.preventDefault();
          bar.scrollLeft += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        }, { passive: false });
        bar.addEventListener('scroll', () => T.syncNav(), { passive: true });
        new ResizeObserver(() => T.syncNav()).observe(bar);
      }
      // Yeni belge açılınca mevcut belge kapanmaz; yeni sekme olarak eklenir
      const newDoc = App.newDoc;
      App.newDoc = o => {
        const same = o.id && T.byId(o.id);
        if (same) { T.switchTo(same); return same.doc; }
        // arkada kalan belge hiç kaydedilmediyse de kaydedilir: birden çok resim ayrı sekmelerde açılınca
        // hepsi sekmelerine girilmeden Son projeler listesinde görünür
        const cur = App.doc && T.entry(App.doc);
        if (cur && (cur.dirty || !cur.saved) && App.prefs.autosave) { cur.dirty = false; App.storage.saveCurrent(); }
        T.stash();
        const d = newDoc(o);
        const e = { doc: d, stack: H.stack, index: H.index, view: { ...App.view }, dirty: false, saved: !!o.id };
        const at = cur ? T.list.indexOf(cur) + 1 : T.list.length;
        T.list.splice(at, 0, e);
        T.render();
        T.thumbSoon();
        return d;
      };
      const closeDoc = App.closeDoc;
      App.closeDoc = () => {
        const e = App.doc && T.entry(App.doc);
        if (e) T.list.splice(T.list.indexOf(e), 1);
        closeDoc();
        T.render();
      };
      App.on('changed', () => { const e = App.doc && T.entry(App.doc); if (e) { const was = e.dirty; e.dirty = true; if (!was) T.render(); } T.thumbSoon(); });
      App.on('saved', d => { const e = T.entry(d); if (e) e.saved = true; if (e && e.dirty) { e.dirty = false; T.render(); } });
      App.on('doc', U.debounce(() => {
        const e = App.doc && T.entry(App.doc), el = document.querySelector('#docTabs .dt-tab.on .dt-name');
        if (e && el && el.textContent !== e.doc.name) el.textContent = e.doc.name;
      }, 100));
    },
    thumbSoon: U.debounce(() => {
      const d = App.doc, e = d && T.entry(d);
      if (!e) return;
      try { e.thumb = App.composite({ scale: Math.min(1, 40 / Math.max(d.w, d.h)) }).toDataURL('image/png'); } catch (err) { return; }
      const img = document.querySelector('#docTabs .dt-tab.on .dt-thumb');
      if (img && img.tagName === 'IMG') img.src = e.thumb; else T.render();
    }, 700),
  };
})();
