'use strict';
/* Kaydet / dışa aktar penceresi */
(() => {
  const { U, ui: UI } = App;
  const h = U.h;
  const MIME = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

  /* Kaydetme: tarayıcı destekliyorsa "Farklı kaydet" penceresi açılır, desteklemiyorsa dosya indirilir. */
  const download = (blob, name) => {
    const a = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  };

  App.saveBlob = async (blob, name, types) => {
    if (window.showSaveFilePicker) {
      try {
        const ext = name.split('.').pop();
        const handle = await window.showSaveFilePicker({ suggestedName: name, types: types || [{ description: ext.toUpperCase(), accept: { [blob.type || 'application/octet-stream']: ['.' + ext] } }] });
        const w = await handle.createWritable();
        await w.write(blob); await w.close();
        return true;
      } catch (e) {
        if (e && e.name === 'AbortError') return false;
      }
    }
    download(blob, name);
    return true;
  };

  // Çok sayıda dosyayı bir klasöre kaydetme (toplu düzenleme). Klasör bir kez seçilir.
  // Dönen nesne: { write(ad, blob), end() }; vazgeçilirse null.
  App.saveMany = async () => {
    if (window.showDirectoryPicker) {
      let dir;
      try { dir = await window.showDirectoryPicker({ mode: 'readwrite' }); } catch (e) { if (e.name === 'AbortError') return null; }
      if (dir) return {
        write: async (name, blob) => { const fh = await dir.getFileHandle(name, { create: true }); const w = await fh.createWritable(); await w.write(blob); await w.close(); },
        end: async () => {},
      };
    }
    return { write: async (name, blob) => { download(blob, name); await new Promise(r => setTimeout(r, 350)); }, end: async () => {} };
  };

  App.exportDialog = async () => {
    const d = App.doc;
    if (!d) return;
    if (App.tool && App.tool.isDirty && App.tool.isDirty()) {
      const r = await UI.choice('There are pending changes. Apply them before saving?', [['apply', 'Apply', true], ['skip', 'Continue Without Applying']]);
      if (r === 'apply') await App.applyTool();
      if (r == null) return;
    }
    const hasAlpha = (() => {
      const c = App.composite({ scale: Math.min(1, 256 / Math.max(d.w, d.h)) });
      const a = U.getData(c).data;
      for (let i = 3; i < a.length; i += 4) if (a[i] < 250) return true;
      return false;
    })();
    const st = { name: (d.name || 'pixtape').replace(/\.[a-z0-9]+$/i, ''), fmt: App.prefs.exportFmt && App.prefs.exportFmt !== 'auto' ? App.prefs.exportFmt : hasAlpha ? 'png' : 'jpg', q: App.prefs.exportQ || 90, w: d.w, h: d.h, bg: '#ffffff' };
    const pv = h('canvas', { class: 'exp-preview' });
    const info = h('div', { class: 'exp-info' }, 'Calculating…');
    let lastBlob = null, tok = 0;
    const render = () => App.composite({ scale: st.w / d.w, bg: st.fmt === 'jpg' ? st.bg : null });
    const estimate = U.debounce(async () => {
      const my = ++tok;
      info.textContent = 'Calculating…';
      const c = render();
      const b = await U.toBlob(c, MIME[st.fmt], st.q / 100);
      if (my !== tok) return;
      lastBlob = b;
      info.innerHTML = `<b>${st.w} × ${st.h}</b> px · ${st.fmt.toUpperCase()} · <b>${U.fmtBytes(b.size)}</b>`;
      const k = Math.min(1, 300 / Math.max(c.width, c.height));
      pv.width = Math.round(c.width * k); pv.height = Math.round(c.height * k);
      const x = pv.getContext('2d');
      x.clearRect(0, 0, pv.width, pv.height);
      x.drawImage(c, 0, 0, pv.width, pv.height);
    }, 250);
    const nameIn = h('input', { type: 'text', class: 'full', value: st.name, oninput: () => { st.name = nameIn.value; } });
    const fmt = UI.seg({ options: [['jpg', 'JPG'], ['png', 'PNG'], ['webp', 'WEBP']], value: st.fmt, onChange: v => { st.fmt = v; qs.el.style.display = v === 'png' ? 'none' : ''; bgc.el.style.display = v === 'jpg' && hasAlpha ? '' : 'none'; lastBlob = null; estimate(); } });
    const qs = UI.slider({ label: 'Quality', min: 10, max: 100, value: st.q, def: 90, onInput: v => { st.q = v; lastBlob = null; estimate(); } });
    const bgc = UI.color({ label: 'Transparent Area Color', value: st.bg, palette: false, onInput: v => { st.bg = v; lastBlob = null; estimate(); } });
    const wIn = UI.number({ label: 'Width', value: st.w, min: 1, onChange: v => { st.w = Math.max(1, Math.round(v)); st.h = Math.max(1, Math.round(st.w * d.h / d.w)); hIn.set(st.h); pct.set(Math.round(st.w / d.w * 100)); lastBlob = null; estimate(); } });
    const hIn = UI.number({ label: 'Height', value: st.h, min: 1, onChange: v => { st.h = Math.max(1, Math.round(v)); st.w = Math.max(1, Math.round(st.h * d.w / d.h)); wIn.set(st.w); pct.set(Math.round(st.w / d.w * 100)); lastBlob = null; estimate(); } });
    const pct = UI.slider({ label: 'Scale (%)', min: 5, max: 200, value: 100, def: 100, onInput: v => { st.w = Math.max(1, Math.round(d.w * v / 100)); st.h = Math.max(1, Math.round(d.h * v / 100)); wIn.set(st.w); hIn.set(st.h); lastBlob = null; estimate(); } });
    qs.el.style.display = st.fmt === 'png' ? 'none' : '';
    bgc.el.style.display = st.fmt === 'jpg' && hasAlpha ? '' : 'none';
    const content = h('div', { class: 'exp' },
      h('div', { class: 'exp-left' }, h('div', { class: 'exp-pv-wrap' }, pv), info),
      h('div', { class: 'exp-right' },
        h('div', { class: 'field' }, h('label', { class: 'fld-label' }, 'File Name'), nameIn),
        h('div', { class: 'field' }, h('label', { class: 'fld-label' }, 'Format'), fmt.el),
        qs.el, bgc.el,
        h('div', { class: 'grid2' }, wIn.el, hIn.el), pct.el,
        h('div', { class: 'btn-row' },
          UI.button('Copy to Clipboard', async () => {
            try {
              const b = await U.toBlob(render(), 'image/png');
              await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]);
              UI.toast('Copied to clipboard', 'ok');
            } catch (e) { UI.toast('Could not copy to clipboard: ' + e.message, 'error'); }
          }, { small: true, icon: 'clipboard' }),
          UI.button('Project (.pixtape)', () => App.actions.saveProject(), { small: true }),
        )));
    estimate();
    const r = await UI.modal({
      title: 'Save', width: 720, content,
      buttons: [{ label: 'Cancel', value: null }, { label: 'Download', value: 'save', primary: true }],
    });
    if (r !== 'save') return;
    const blob = lastBlob || await U.toBlob(render(), MIME[st.fmt], st.q / 100);
    const fname = (st.name || 'pixtape').replace(/[\\/:*?"<>|]/g, '_') + '.' + st.fmt;
    const ok = await App.saveBlob(blob, fname, [{ description: App.t('{0} image', st.fmt.toUpperCase()), accept: { [MIME[st.fmt]]: ['.' + (st.fmt === 'jpg' ? 'jpg' : st.fmt)] } }]);
    if (ok) { d.name = st.name; UI.toast('Saved: ' + fname, 'ok'); App.emit('doc'); }
  };
})();
