'use strict';
/* Çalışma alanı düzeni: araç paneli, Katmanlar ve Geçmiş birbirinden bağımsız panellerdir.
   Her panel çalışma alanının solundaki ya da sağındaki bir sütuna yerleşir; bir sütunda paneller
   alt alta gruplar hâlinde durur, bir grupta birden çok panel sekme olarak birleşebilir.
   Düzen prefs.dock içinde saklanır: [sütun, 'stage', sütun, ...]
   sütun = { w: genişlik, g: [{ t: [panel kimlikleri], a: etkin panel, f: yükseklik payı }] } */
(() => {
  const { U, ui: UI } = App;
  const h = U.h;
  const K = id => (App.shortcuts ? App.shortcuts.label(id) : '');
  const $ = id => document.getElementById(id);
  const WMIN = 200, WMAX = 560;
  // araç panelinin sütunu daha fazla daraltılamaz: düğme ve seçenek adları sığmaz hâle gelir
  const TOOL_WMIN = 270;
  const minW = c => (c.g && c.g.some(g => g.t.includes('tool')) ? TOOL_WMIN : WMIN);
  const PANES = { tool: ['Tool Panel', 'adjust'], layers: ['Layers', 'layers'], history: ['History', 'history'] };
  const EL = { tool: 'toolpanel', layers: 'layersPane', history: 'historyPane' };
  const defW = id => (id === 'tool' ? 320 : 250);
  const DEF = () => [{ w: 320, g: [{ t: ['tool'], a: 'tool', f: 1 }] }, 'stage', { w: 250, g: [{ t: ['layers', 'history'], a: 'layers', f: 1 }] }];
  const clone = o => JSON.parse(JSON.stringify(o));
  const paneName = id => (id === 'tool' && App.tool ? App.tool.name : PANES[id][0]);
  const paneIcon = id => (id === 'tool' && App.tool ? App.tool.icon : PANES[id][1]);

  // Kayıtlı düzeni denetler: her panel tam bir kez, çalışma alanı tam bir kez bulunur
  const norm = d => {
    if (!Array.isArray(d) || d.filter(c => c === 'stage').length !== 1) return DEF();
    const seen = new Set();
    let cols = clone(d).filter(c => c === 'stage' || (c && Array.isArray(c.g)));
    for (const c of cols) {
      if (c === 'stage') continue;
      c.w = U.clamp(+c.w || 260, minW(c), WMAX);
      c.g = c.g.filter(g => g && Array.isArray(g.t)).map(g => {
        g.t = g.t.filter(id => PANES[id] && !seen.has(id) && seen.add(id));
        if (!g.t.includes(g.a)) g.a = g.t[0];
        g.f = +g.f > 0 ? +g.f : 1;
        return g;
      }).filter(g => g.t.length);
    }
    cols = cols.filter(c => c === 'stage' || c.g.length);
    for (const id in PANES) if (!seen.has(id)) cols.push({ w: defW(id), g: [{ t: [id], a: id, f: 1 }] });
    return cleanup(cols);
  };
  // Boş grupları ve sütunları atar; yükseklik payları toplamı grup sayısına eşitlenir
  // (tek kalan grubun payı 1'in altına düşerse sütunu doldurmaz, panel yarım görünür)
  const cleanup = cols => cols.filter(c => {
    if (c === 'stage') return true;
    c.g = c.g.filter(g => g.t.length);
    for (const g of c.g) if (!g.t.includes(g.a)) g.a = g.t[0];
    const sum = c.g.reduce((s, g) => s + (+g.f > 0 ? +g.f : 1), 0);
    if (Math.abs(sum - c.g.length) > 1e-6) for (const g of c.g) g.f = (+g.f > 0 ? +g.f : 1) * c.g.length / sum;
    return c.g.length;
  });
  const findPane = (cols, id) => {
    for (const c of cols) if (c !== 'stage') for (const g of c.g) if (g.t.includes(id)) return { c, g };
    return null;
  };

  /* ---------------------------------------------------------------- sürükle-bırak altyapısı
     Sürüklerken imleci takip eden küçük bir kart ve bırakılacak yeri gösteren bir alan çizilir. */
  const drag = (e, o) => {
    const x0 = e.clientX, y0 = e.clientY;
    let ghost = null, hint = null, zone = null;
    const mv = ev => {
      if (!ghost) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 8) return;
        ghost = h('div', { class: 'drag-ghost', html: App.icon(o.icon, 16) + `<span>${App.t(o.label)}</span>` });
        hint = h('div', { class: 'drop-hint' }, h('span'));
        document.body.append(hint, ghost);
        document.body.classList.add('dragging-ui');
      }
      ghost.style.transform = `translate(${ev.clientX + 14}px, ${ev.clientY + 12}px)`;
      zone = o.zone(ev.clientX, ev.clientY);
      if (!zone) { hint.classList.remove('show'); ghost.classList.add('no'); return; }
      ghost.classList.remove('no');
      const r = zone.rect;
      Object.assign(hint.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
      hint.classList.add('show');
      hint.classList.toggle('same', !!zone.same);
      hint.firstChild.textContent = App.t(zone.label || '');
    };
    const end = () => {
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('keydown', key, true);
      if (ghost) { ghost.remove(); hint.remove(); document.body.classList.remove('dragging-ui'); }
    };
    const up = () => { const had = !!ghost; end(); if (had && zone && !zone.same) o.drop(zone); };
    const key = ev => { if (ev.key === 'Escape') { zone = null; end(); } };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('keydown', key, true);
  };
  const rectOf = el => el.getBoundingClientRect();

  // Paneli düzende taşır. z: { kind: 'col', at } | { kind: 'tab', ci, gi, at } | { kind: 'split', ci, gi, below }
  const moved = (cols0, id, z) => {
    const cols = clone(cols0);
    const tc = z.ci != null ? cols[z.ci] : null, tg = tc ? tc.g[z.gi] : null;
    const src = findPane(cols, id);
    // tek panelli grubu kendi üstüne ya da altına bırakmak bir şey değiştirmez
    if (z.kind === 'split' && src && src.g === tg && tg.t.length === 1) return cleanup(clone(cols0));
    if (src) src.g.t.splice(src.g.t.indexOf(id), 1);
    if (z.kind === 'col') cols.splice(z.at, 0, { w: defW(id), g: [{ t: [id], a: id, f: 1 }] });
    else if (z.kind === 'tab') { tg.t.splice(Math.min(z.at, tg.t.length), 0, id); tg.a = id; }
    else {
      const i = tc.g.indexOf(tg), f = tg.f / 2;
      tg.f = f;
      tc.g.splice(i + (z.below ? 1 : 0), 0, { t: [id], a: id, f });
    }
    return cleanup(cols);
  };

  let hideOthers = false;     // Katmanlar ve Geçmiş geçici olarak gizli (Tab tuşu)
  /* Telefon (dar ekran): kayıtlı düzen kullanılmaz. Araçlar en altta yatay bir şerittir; araç paneli bunun üstünde
     alttan açılan bir çekmecedir (başlığına dokununca açılır / kapanır); Katmanlar ve Geçmiş üst çubuktaki düğmeyle
     sağdan açılan çekmecededir. Paneller sürüklenip taşınmaz, genişlik tutamaçları yoktur. */
  const MQ = window.matchMedia ? matchMedia('(max-width: 760px)') : null;
  let mTab = 'layers';
  const L = App.layout = {
    isMobile() { return !!(MQ && MQ.matches); },
    sheet(open) { document.body.classList.toggle('m-open', open == null ? !document.body.classList.contains('m-open') : !!open); App.resizeView && setTimeout(() => App.resizeView(), 0); },
    sideSheet(open) { document.body.classList.toggle('m-side', open == null ? !document.body.classList.contains('m-side') : !!open); },
    get() { const c = norm(App.prefs.dock); App.prefs.dock = c; return c; },
    save(cols) { App.setPref('dock', cols); L.apply(); },
    // Panel çalışma alanının hangi tarafında
    side(id) {
      const cols = L.get(), f = findPane(cols, id);
      return f && cols.indexOf(f.c) < cols.indexOf('stage') ? 'left' : 'right';
    },
    // Paneli verilen tarafın en dışında yeni bir sütuna taşı
    place(id, side) {
      const cols = L.get();
      L.save(moved(cols, id, { kind: 'col', at: side === 'left' ? 0 : cols.length }));
    },
    swap() { L.place('tool', L.side('tool') === 'left' ? 'right' : 'left'); },
    // Katmanlar ve Geçmiş: aynı gruptaysa alt alta ayır, değilse sekme olarak birleştir
    toggleTabs() {
      const cols = L.get(), a = findPane(cols, 'layers'), b = findPane(cols, 'history');
      if (a.g === b.g) L.save(moved(cols, 'history', { kind: 'split', ci: cols.indexOf(a.c), gi: a.c.g.indexOf(a.g), below: true }));
      else L.save(moved(cols, 'history', { kind: 'tab', ci: cols.indexOf(a.c), gi: a.c.g.indexOf(a.g), at: 9 }));
    },
    resetWidths() { const cols = L.get(); for (const c of cols) if (c !== 'stage') c.w = c.g.some(g => g.t.includes('tool')) ? 320 : 250; L.save(cols); },
    reset() {
      App.prefs.toolOrder = null;
      hideOthers = false;
      document.body.classList.remove('no-right');
      UI.buildToolbar();
      L.save(null);
    },
    // Araç panelini gizle / göster (telefonda alttaki çekmeceyi açar / kapatır)
    toggleToolPanel(show) {
      if (L.isMobile()) { L.sheet(show == null ? undefined : show); return; }
      const hide = show == null ? !document.body.classList.contains('tp-hidden') : !show;
      if (hide === document.body.classList.contains('tp-hidden')) return;
      document.body.classList.toggle('tp-hidden', hide);
      L.syncToolHidden();
      App.resizeView && setTimeout(() => App.resizeView(), 0);
    },
    // Gizliyken araç panelinin sütunu (tek başınaysa) genişlik tutamacıyla birlikte tamamen kalkar; sütunda başka
    // paneller de varsa yalnızca araç panelinin grubu kalkar
    syncToolHidden() {
      const hide = document.body.classList.contains('tp-hidden') && !L.isMobile();
      const tp = $('toolpanel'), grp = tp.closest('.dock-grp'), col = tp.closest('.dock-col');
      if (!grp || !col) return;
      const solo = col.querySelectorAll(':scope > .dock-grp').length === 1;
      const rz = col.nextElementSibling && col.nextElementSibling.classList.contains('pane-resizer') ? col.nextElementSibling : null;
      col.style.display = hide && solo ? 'none' : '';
      if (rz) rz.style.display = hide && solo ? 'none' : '';
      grp.style.display = hide && !solo ? 'none' : '';
      const sp = grp.previousElementSibling && grp.previousElementSibling.classList.contains('rp-split') ? grp.previousElementSibling : grp.nextElementSibling && grp.nextElementSibling.classList.contains('rp-split') ? grp.nextElementSibling : null;
      if (sp) sp.style.display = hide && !solo ? 'none' : '';
    },
    toggleOthers() {
      hideOthers = !hideOthers;
      document.body.classList.toggle('no-right', hideOthers);
      L.apply();
    },
    menuItems() {
      const cols = L.get(), a = findPane(cols, 'layers'), b = findPane(cols, 'history');
      const NAMES = { tool: ['Move Tool Panel to the Right', 'Move Tool Panel to the Left'], layers: ['Move Layers Panel to the Right', 'Move Layers Panel to the Left'], history: ['Move History Panel to the Right', 'Move History Panel to the Left'] };
      const mv = id => ({ label: NAMES[id][L.side(id) === 'left' ? 0 : 1], icon: 'swap', onClick: () => L.place(id, L.side(id) === 'left' ? 'right' : 'left') });
      return [
        mv('tool'), mv('layers'), mv('history'),
        { label: a.g === b.g ? 'Layers and History: stacked' : 'Layers and History: tabbed', icon: 'panels', onClick: () => L.toggleTabs() },
        { label: 'Show/Hide Layers and History', icon: 'layers', key: K('panels'), onClick: () => L.toggleOthers() },
        { label: 'Reset Layout', icon: 'reset', onClick: () => L.reset() },
      ];
    },

    /* ------------------------------------------------ düzeni sayfaya uygula */
    apply() {
      const ws = $('workspace'), hold = $('paneHold');
      if (!ws) return;
      UI.closePopups();
      const mob = L.isMobile();
      document.body.classList.toggle('mobile', mob);
      let cols = L.get();
      if (mob) cols = [{ w: 0, g: [{ t: ['tool'], a: 'tool', f: 1 }] }, 'stage', { w: 0, g: [{ t: ['layers', 'history'], a: mTab, f: 1 }] }];
      else if (hideOthers) {
        cols = clone(cols);
        for (const c of cols) if (c !== 'stage') for (const g of c.g) g.t = g.t.filter(id => id === 'tool');
        cols = cleanup(cols);
      }
      for (const id in EL) hold.appendChild($(EL[id]));
      ws.querySelectorAll('.dock-col, .pane-resizer').forEach(x => x.remove());
      const si = cols.indexOf('stage'), line = '1px solid var(--line)';
      let n = 0;
      const tb = $('toolbar');
      cols.forEach((c, ci) => {
        if (c === 'stage') { $('stageWrap').style.order = n++; return; }
        const left = ci < si;
        const col = h('div', { class: 'dock-col' + (mob ? (left ? ' m-tool' : ' m-sidebar') : ''), 'data-ci': ci, style: mob ? {} : { width: c.w + 'px', borderLeft: left ? '0' : line, borderRight: left ? line : '0' } });
        c.g.forEach((g, gi) => {
          if (gi) col.appendChild(splitter(c, gi));
          col.appendChild(group(g, ci, gi));
        });
        const rz = resizer(col, c, left);
        const hasTool = c.g.some(g => g.t.includes('tool'));
        // araç çubuğu araç panelinin dış kenarında durur; panel iki sütunun arasındaysa çalışma alanı tarafına geçer
        const outer = left ? ci === 0 : ci === cols.length - 1, barLeft = outer ? left : !left;
        const seq = left ? [col, rz] : [rz, col];
        if (hasTool) { if (barLeft) seq.unshift(tb); else seq.push(tb); }
        for (const el of seq) el.style.order = n++;
        if (hasTool) Object.assign(tb.style, { borderLeft: barLeft ? '0' : line, borderRight: barLeft ? line : '0' });
        ws.append(col, rz);
      });
      const bg = { dark: '#0b0c10', gray: '#3a3d44', light: '#d9dce2' }[App.prefs.stageBg];
      if (bg) document.documentElement.style.setProperty('--stage', bg); else document.documentElement.style.removeProperty('--stage');
      L.syncToolHidden();
      App.resizeView && setTimeout(() => App.resizeView(), 0);
    },
    // Araç değişince sekme adı güncellenir; araç paneli bir sekmedeyse öne gelir
    onTool() {
      if (document.body.classList.contains('tp-hidden')) L.toggleToolPanel(true); // başka araca geçilince panel yine açılır
      // telefonda çekmece yalnızca araç düğmesine basınca açılır; tuvalde bir katmana dokunup araç kendiliğinden
      // değişince açılmaz (açılsa çalışma alanı küçülür, resim kayar ve panel ekranı kaplar)
      if (L.isMobile()) { document.querySelectorAll('.rp-tab[data-pane="tool"]').forEach(b => { b.innerHTML = App.icon(paneIcon('tool'), 16) + `<span>${App.t(paneName('tool'))}</span>`; }); return; }
      const cols = L.get(), f = findPane(cols, 'tool');
      if (f && f.g.t.length > 1 && f.g.a !== 'tool') { f.g.a = 'tool'; L.save(cols); return; }
      document.querySelectorAll('.rp-tab[data-pane="tool"]').forEach(b => { b.innerHTML = App.icon(paneIcon('tool'), 16) + `<span>${App.t(paneName('tool'))}</span>`; });
    },

    init() {
      document.addEventListener('pointerdown', e => {
        if (e.button !== 0) return;
        const t = e.target;
        if (L.isMobile()) {
          // telefonda başlığa dokunmak araç panelini açar / kapatır; tuvale dokunmak sağ çekmeceyi kapatır
          if (t.closest('#toolpanel .tp-head') && !t.closest('button,input,select,textarea')) { L.sheet(); return; }
          if (t.closest('#stage')) L.sideSheet(false);
          return;
        }
        if (t.closest('#toolpanel .tp-head') && !t.closest('button,input,select,textarea')) return paneDrag(e, 'tool');
        const tab = t.closest('.dock-col .rp-tab, .dock-col .rp-phead');
        if (tab) return paneDrag(e, tab.dataset.pane);
      });
      $('toolpanel').title = '';
      App.on('prefs', k => { if (k === 'stageBg') L.apply(); });
      App.on('tool', () => L.onTool());
      if (MQ && MQ.addEventListener) MQ.addEventListener('change', () => L.apply());
      // telefonda Katmanlar düğmesi (üst çubuk)
      const lb = h('button', { id: 'btnLayersM', class: 'icon-btn', title: 'Layers', html: App.icon('layers', 18), onclick: () => L.sideSheet() });
      const st = $('btnSettings');
      if (st) st.before(lb);
      L.apply();
    },
  };

  // Bir grup: birden çok paneli varsa sekme çubuğu, tek paneli varsa başlık (araç panelinin kendi başlığı vardır)
  function group(g, ci, gi) {
    const el = h('div', { class: 'dock-grp', 'data-ci': ci, 'data-gi': gi, style: { flex: g.f + ' 1 0' } });
    if (g.t.length > 1) {
      el.appendChild(h('div', { class: 'rp-tabs' }, g.t.map(id => h('button', {
        class: 'rp-tab' + (id === g.a ? ' on' : ''), 'data-pane': id, title: 'Click, or drag to move it somewhere else',
        html: App.icon(paneIcon(id), 16) + `<span>${App.t(paneName(id))}</span>`,
        onclick: () => {
          if (L.isMobile()) { mTab = id; L.apply(); return; }
          const cols = L.get(), f = findPane(cols, id);
          if (f) { f.g.a = id; L.save(cols); }
        },
      }))));
    } else if (g.t[0] !== 'tool') {
      const id = g.t[0];
      el.appendChild(h('div', { class: 'rp-phead', 'data-pane': id, title: 'Drag the header to move the panel', html: App.icon(PANES[id][1], 15) + `<span>${App.t(PANES[id][0])}</span>` }));
    }
    for (const id of g.t) { const p = $(EL[id]); p.classList.toggle('on', id === g.a); el.appendChild(p); }
    return el;
  }

  // Alt alta iki grubun arasındaki ayırıcı
  function splitter(c, gi) {
    const sp = h('div', { class: 'rp-split', title: 'Drag to Resize' });
    sp.addEventListener('pointerdown', e => {
      e.preventDefault();
      const a = sp.previousElementSibling, b = sp.nextElementSibling;
      const ra = rectOf(a), rb = rectOf(b), tot = ra.height + rb.height, fs = c.g[gi - 1].f + c.g[gi].f;
      sp.classList.add('on');
      const mv = ev => {
        const ha = U.clamp(ev.clientY - ra.top, 80, tot - 80);
        c.g[gi - 1].f = fs * ha / tot; c.g[gi].f = fs - c.g[gi - 1].f;
        a.style.flex = c.g[gi - 1].f + ' 1 0'; b.style.flex = c.g[gi].f + ' 1 0';
      };
      const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); sp.classList.remove('on'); App.setPref('dock', App.prefs.dock); };
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
    });
    return sp;
  }

  // Sütunun çalışma alanına bakan kenarındaki genişlik tutamacı
  function resizer(col, c, left) {
    const r = h('div', { class: 'pane-resizer', title: 'Drag to change the width. Double-click to reset.' });
    r.addEventListener('pointerdown', e => {
      e.preventDefault();
      try { r.setPointerCapture(e.pointerId); } catch (err) { /* */ }
      r.classList.add('on');
      const x0 = e.clientX, w0 = rectOf(col).width;
      const mv = ev => {
        const dx = ev.clientX - x0;
        c.w = Math.round(U.clamp(w0 + (left ? dx : -dx), minW(c), WMAX));
        col.style.width = c.w + 'px';
        App.resizeView();
      };
      const up = () => {
        r.removeEventListener('pointermove', mv); r.removeEventListener('pointerup', up);
        r.classList.remove('on');
        App.setPref('dock', App.prefs.dock);
      };
      r.addEventListener('pointermove', mv); r.addEventListener('pointerup', up);
    });
    r.addEventListener('dblclick', () => { c.w = c.g.some(g => g.t.includes('tool')) ? 320 : 250; L.save(App.prefs.dock); });
    return r;
  }

  // Paneli sürükleyip bırakma: başka bir grubun sekmesi, bir grubun üstü/altı ya da yeni bir sütun
  function paneDrag(e, id) {
    if (hideOthers || L.isMobile()) return;
    drag(e, {
      label: paneName(id), icon: paneIcon(id),
      zone: (x, y) => {
        const cols = L.get(), ws = rectOf($('workspace'));
        if (y < ws.top || y > ws.bottom || x < ws.left || x > ws.right) return null;
        const res = (z, rect, label) => {
          const same = JSON.stringify(moved(cols, id, z)) === JSON.stringify(cols);
          return { ...z, rect, label: same ? 'The Panel Is Here' : label, same };
        };
        // sütunlar arası sınırlar: yeni sütun
        const items = cols.map((c, ci) => ({ ci, r: rectOf(c === 'stage' ? $('stageWrap') : document.querySelector(`.dock-col[data-ci="${ci}"]`)) }));
        const si = cols.indexOf('stage');
        const bx = [items[0].r.left, ...items.slice(1).map((it, k) => (items[k].r.right + it.r.left) / 2), items[items.length - 1].r.right];
        for (let k = 0; k < bx.length; k++) {
          const near = Math.abs(x - bx[k]) < 22 || (k === 0 && x < bx[0]) || (k === bx.length - 1 && x > bx[k]);
          const nextToStage = k === si || k === si + 1;
          if (!near && !(nextToStage && x > items[si].r.left && x < items[si].r.right && Math.abs(x - bx[k]) < 110)) continue;
          const w = Math.min(defW(id), 260);
          // çalışma alanının yanındaki sınırlarda alan çalışma alanının üstünde gösterilir
          const left = k === 0 || k === si ? bx[k] : k === bx.length - 1 || k === si + 1 ? bx[k] - w : bx[k] - w / 2;
          return res({ kind: 'col', at: k }, { left, top: ws.top, width: w, height: ws.height }, 'Place as a New Column');
        }
        // gruplar: başlık bölgesi sekme, gövdenin üst/alt yarısı alt alta
        for (const el of document.querySelectorAll('.dock-grp')) {
          const r = rectOf(el);
          if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
          const ci = +el.dataset.ci, gi = +el.dataset.gi, g = cols[ci].g[gi];
          const head = el.querySelector(':scope > .rp-tabs, :scope > .rp-phead, :scope > #toolpanel > .tp-head');
          const hb = head ? rectOf(head).bottom : r.top + 44;
          if (y < hb + 8) {
            const tabs = [...el.querySelectorAll(':scope > .rp-tabs .rp-tab')].filter(t => t.dataset.pane !== id);
            let at = tabs.findIndex(t => x < rectOf(t).left + rectOf(t).width / 2);
            if (at < 0) at = g.t.filter(t => t !== id).length;
            return res({ kind: 'tab', ci, gi, at }, r, 'Merge as a Tab');
          }
          const below = y > hb + (r.bottom - hb) / 2;
          const half = (r.bottom - hb) / 2;
          return res({ kind: 'split', ci, gi, below }, { left: r.left, width: r.width, top: below ? hb + half : hb, height: half }, below ? 'Place at Bottom' : 'Place at Top');
        }
        return null;
      },
      drop: z => L.save(moved(L.get(), id, z)),
    });
  }
})();
