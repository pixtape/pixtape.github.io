'use strict';
/* Klavye kısayolları: kullanıcı her eylemin tuşunu değiştirebilir (Ayarlar > Klavye kısayolları).
   Tuş adı klavye düzenine göre okunur (ör. Türkçe Q klavyede AltGr + 8 = "["), ayrıca fiziksel tuş
   konumu da denenir; böylece Ctrl + Shift + ] gibi varsayılanlar her düzende çalışır. */
(() => {
  const { U, ui: UI } = App;
  const h = U.h;

  // [kimlik, grup, açıklama, varsayılan tuş]
  const LIST = [
    ['open', 'File', 'Open Image', 'Ctrl+O'],
    ['addImage', 'File', 'Add Image as Layer', 'Ctrl+Shift+O'],
    // Ctrl+N, Ctrl+W, Ctrl+Tab ve Ctrl+Shift+N tarayıcıya ayrılmıştır (sayfa bunları yakalayamaz); yerine Alt kullanılır
    ['new', 'File', 'New', 'Alt+N'],
    ['save', 'File', 'Save / Export', 'Ctrl+S'],
    ['saveProject', 'File', 'Save Project', 'Ctrl+Shift+S'],
    ['closeTab', 'File', 'Close Tab', 'Alt+W'],
    ['nextTab', 'File', 'Next Tab', 'Alt+PageDown'],
    ['prevTab', 'File', 'Previous Tab', 'Alt+PageUp'],
    ['undo', 'Editing', 'Undo', 'Ctrl+Z'],
    ['redo', 'Editing', 'Redo', 'Ctrl+Y'],
    ['copyLayer', 'Editing', 'Copy Layer', 'Ctrl+C'],
    ['copyImage', 'Editing', 'Copy Image to Clipboard', 'Ctrl+Shift+C'],
    ['duplicate', 'Layer', 'Duplicate Layer', 'Ctrl+D'],
    ['newLayer', 'Layer', 'New Empty Layer', 'Alt+Shift+N'],
    ['deleteLayer', 'Layer', 'Delete Layer', 'Delete'],
    ['mergeDown', 'Layer', 'Merge Down', 'Ctrl+E'],
    ['mergeVisible', 'Layer', 'Merge Visible', 'Ctrl+Shift+E'],
    ['lockLayer', 'Layer', 'Lock / Unlock Layer', 'Ctrl+L'],
    ['group', 'Layer', 'Group Layers', 'Ctrl+G'],
    ['ungroup', 'Layer', 'Ungroup', 'Ctrl+U'],
    ['layerUp', 'Layer', 'Bring Forward', 'Ctrl+]'],
    ['layerDown', 'Layer', 'Send Backward', 'Ctrl+['],
    ['layerTop', 'Layer', 'Bring to Front', 'Ctrl+Shift+]'],
    ['layerBottom', 'Layer', 'Send to Back', 'Ctrl+Shift+['],
    ['sizeUp', 'Brush and Size', 'Enlarge Brush / Layer', ']'],
    ['sizeDown', 'Brush and Size', 'Shrink Brush / Layer', '['],
    ['fit', 'View', 'Fit to Screen', 'Ctrl+0'],
    ['actual', 'View', 'Actual Pixels', 'Ctrl+1'],
    ['fill', 'View', 'Fill Screen', 'Ctrl+2'],
    ['zoomIn', 'View', 'Zoom In', 'Ctrl+='],
    ['zoomOut', 'View', 'Zoom Out', 'Ctrl+-'],
    ['compare', 'View', 'Hold for Before / After', '\\'],
    ['grid', 'View', 'Grid', 'G'],
    ['panels', 'View', 'Hide / Show Right Panel', 'Tab'],
    ['help', 'View', 'Keyboard Shortcuts', '?'],
    ['tool:arrange', 'Tools', 'Edit', 'V'],
    ['tool:crop', 'Tools', 'Crop', 'C'],
    ['tool:cutout', 'Tools', 'Cut Out', 'X'],
    ['tool:adjust', 'Tools', 'Adjust', 'A'],
    ['tool:effect', 'Tools', 'Effect', 'E'],
    ['tool:filter', 'Tools', 'Filter', 'F'],
    ['tool:retouch', 'Tools', 'Retouch', 'R'],
    ['tool:draw', 'Tools', 'Draw', 'B'],
    ['tool:text', 'Tools', 'Text', 'T'],
    ['tool:element', 'Tools', 'Elements', 'O'],
  ];
  // Değiştirilemeyen ek tuşlar (aynı eylemin ikinci tuşu)
  const ALIASES = { 'Ctrl+Shift+Z': 'redo', 'Ctrl+J': 'duplicate', 'Backspace': 'deleteLayer', 'Ctrl++': 'zoomIn', 'Ctrl+Shift+=': 'zoomIn', 'Ctrl+Q': 'lockLayer', 'Ctrl+Shift+G': 'ungroup' };
  // Kısayol listesinde gösterilen ek tuşlar
  const SHOWN = { redo: 'Ctrl+Shift+Z', duplicate: 'Ctrl+J', lockLayer: 'Ctrl+Q', ungroup: 'Ctrl+Shift+G' };
  const DEF = Object.fromEntries(LIST.map(r => [r[0], r[3]]));

  const CODE = { BracketLeft: '[', BracketRight: ']', Backslash: '\\', Slash: '/', Equal: '=', Minus: '-', Comma: ',', Period: '.', Semicolon: ';', Quote: "'", Backquote: '`', IntlBackslash: '<', Space: 'Space' };
  const NAMED = { ' ': 'Space', Esc: 'Escape', Del: 'Delete' };
  const isAltGr = e => !!(e.getModifierState && e.getModifierState('AltGraph'));
  // Tuş adı (klavye düzenine göre). Shift yalnızca harf ve adlandırılmış tuşlarda yazılır.
  const byKey = e => {
    let k = NAMED[e.key] || e.key;
    if (!k || ['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'Dead', 'Unidentified'].includes(k)) return null;
    const agr = isAltGr(e), ctrl = (e.ctrlKey || e.metaKey) && !agr, alt = e.altKey && !agr;
    const single = k.length === 1;
    const letter = single && k.toLocaleLowerCase('en') !== k.toLocaleUpperCase('en');
    if (single) k = k.toUpperCase();
    const shift = e.shiftKey && (!single || letter);
    return (ctrl ? 'Ctrl+' : '') + (alt ? 'Alt+' : '') + (shift ? 'Shift+' : '') + k;
  };
  // Fiziksel tuş konumu (ABD düzenine göre)
  const byCode = e => {
    const c = e.code || '';
    let k = CODE[c] || (/^Key[A-Z]$/.test(c) ? c.slice(3) : /^Digit\d$/.test(c) ? c.slice(5) : /^Numpad\d$/.test(c) ? c.slice(6) : null);
    if (!k) return null;
    const ctrl = e.ctrlKey || e.metaKey;
    return (ctrl ? 'Ctrl+' : '') + (e.altKey ? 'Alt+' : '') + (e.shiftKey ? 'Shift+' : '') + k;
  };

  const S = App.shortcuts = {
    LIST,
    get(id) { const o = App.prefs.keys || {}; return id in o ? o[id] : DEF[id] || ''; },
    // Menülerde gösterilecek metin
    label(id) { return S.get(id); },
    set(id, combo) {
      const o = { ...(App.prefs.keys || {}) };
      if (combo === DEF[id]) delete o[id]; else o[id] = combo;
      App.setPref('keys', Object.keys(o).length ? o : null);
    },
    reset() { App.setPref('keys', null); },
    combo: byKey,
    // Tuş birleşimine karşılık gelen eylem kimliği
    match0(c) {
      const r = LIST.find(x => S.get(x[0]) === c);
      return r ? r[0] : ALIASES[c] || null;
    },
    // Klavye olayına karşılık gelen eylem kimliği
    match(e) {
      for (const c of [byKey(e), byCode(e)]) {
        const id = c && S.match0(c);
        if (id) return id;
      }
      return null;
    },
    // Tuş bırakıldığında basılı tutulan eylem (öncesi/sonrası) bitsin mi?
    releases(id, e) {
      const k = S.get(id).split('+').pop();
      return !!k && ((NAMED[e.key] || e.key || '').toUpperCase() === k || (CODE[e.code] === k));
    },

    // Kısayol listesi: her satırdaki tuşa tıklayıp yeni tuşa basarak değiştirilir
    dialog() {
      let rec = null; // { id, btn }
      const body = h('div', { class: 'kbd-edit' });
      const draw = () => {
        body.innerHTML = '';
        let grp = null, box = null;
        for (const [id, g, label] of LIST) {
          if (g !== grp) { grp = g; box = h('div', { class: 'kbd-list' }); body.append(h('div', { class: 'kbd-group' }, g), box); }
          const cur = S.get(id), custom = cur !== DEF[id];
          const btn = h('button', { class: 'kbd-key' + (custom ? ' custom' : '') + (cur ? '' : ' none'), title: 'Click to change, then press the new key', 'data-noi18n': '' }, cur || App.t('None'));
          btn.onclick = () => {
            if (rec) rec.btn.classList.remove('rec');
            rec = { id, btn };
            btn.classList.add('rec'); btn.textContent = App.t('Press a Key…');
          };
          const rst = custom ? UI.iconBtn('reset', App.t('Reset to Default ({0})', DEF[id]), () => { S.set(id, DEF[id]); draw(); }, 'sm') : h('span', { class: 'kbd-sp' });
          const alt = SHOWN[id] && S.match0(SHOWN[id]) === id ? h('span', { class: 'kbd-alt' }, App.t('Also {0}', SHOWN[id])) : null;
          box.appendChild(h('div', { class: 'kbd-row' }, h('span', null, label), h('div', { class: 'kbd-c' }, alt, rst, btn)));
        }
        body.appendChild(UI.note('Fixed keys: Space + drag pans the view, arrow keys nudge the layer, by 10 px with Shift, Enter / Esc apply / cancel, Alt + wheel changes the size.'));
      };
      const key = e => {
        if (!rec) return;
        e.preventDefault(); e.stopImmediatePropagation();
        if (e.key === 'Escape') { rec = null; draw(); return; }
        const c = byKey(e);
        if (!c) return; // yalnızca Ctrl / Shift basıldı
        const { id } = rec;
        rec = null;
        const other = LIST.find(x => x[0] !== id && S.get(x[0]) === c);
        if (other) { S.set(other[0], ''); UI.toast(App.t('The shortcut for "{0}" was removed (that key is now used for "{1}").', App.t(other[2]), App.t(LIST.find(x => x[0] === id)[2])), 'info', 3500); }
        S.set(id, c);
        draw();
      };
      document.addEventListener('keydown', key, true);
      draw();
      return UI.modal({
        title: 'Keyboard Shortcuts', width: 760, cls: 'kbd-modal', content: body,
        buttons: [{ label: 'Reset All to Default', value: () => { S.reset(); draw(); return false; } }, { label: 'Close', value: null, primary: true }],
      }).finally(() => document.removeEventListener('keydown', key, true));
    },
  };
})();
