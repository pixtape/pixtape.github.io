'use strict';
/* Resim sıkıştırıcı: gözle görülür kalite kaybı olmadan dosya boyutunu küçültür
   - JPG / WEBP: görsel benzerlik (SSIM) hedefini koruyan en düşük kalite ikili aramayla bulunur
   - PNG: renkler en fazla 256'lık akıllı palete indirilir (pngquant benzeri), saydamlık korunur;
     daha iyi sonuç vermezse kayıpsız yeniden sıkıştırma denenir
   Sonuç orijinalden büyükse orijinal dosya korunur. */
(() => {
  const { U, ui: UI } = App;
  const h = U.h;
  const E = () => App.enc;
  const MIME = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
  // Seviye: hedef benzerlik (SSIM) ve PNG renk sayısı
  // floor: aranacak en düşük kalite (renk bozulmasını önlemek için taban)
  const LEVELS = {
    high: { ssim: 0.99, colors: 256, floor: 0.7, label: 'Best Quality' },
    balanced: { ssim: 0.98, colors: 256, floor: 0.55, label: 'Balanced' },
    small: { ssim: 0.96, colors: 128, floor: 0.4, label: 'Smallest File' },
  };
  const extOf = f => (f.name.split('.').pop() || '').toLowerCase().replace('jpeg', 'jpg');

  const hasAlpha = c => {
    const d = U.getData(c).data;
    for (let i = 3; i < d.length; i += 16) if (d[i] < 250) return true;
    return false;
  };
  const toBlob = (c, mime, q) => U.toBlob(c, mime, q);
  const flat = c => { const t = U.canvas(c.width, c.height), x = t.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, t.width, t.height); x.drawImage(c, 0, 0); return t; };

  // Hedef benzerliği koruyan en düşük kaliteyi bul (JPG / WEBP)
  const searchQuality = async (c, mime, lv, onStep) => {
    const target = lv.ssim;
    let lo = lv.floor, hi = 0.95, best = null;
    const tryQ = async q => {
      const b = await toBlob(c, mime, q);
      const back = await E().blobToCanvas(b);
      const s = E().ssimColor(c, back);
      onStep && onStep();
      return { b, s, q };
    };
    // önce üst sınırı dene; o bile hedefi tutturamıyorsa onu kullan
    const top = await tryQ(hi);
    if (top.s < target) return top;
    best = top;
    for (let i = 0; i < 6; i++) {
      const mid = (lo + hi) / 2, r = await tryQ(mid);
      if (r.s >= target) { best = r; hi = mid; } else lo = mid;
      if (hi - lo < 0.025) break;
    }
    return best;
  };

  // PNG: palet + kayıpsız seçenekleri dene, en küçüğünü al
  const compressPng = async (c, level, dither) => {
    const d = U.getData(c);
    const opts = [];
    // az renkli görüntüler zaten paletle kayıpsız ifade edilebilir
    const q = E().quantize(d.data, LEVELS[level].colors, { alpha: 'full', refine: 4 });
    const qi = dither ? E().mapPixels(d.data, q.palette, { alpha: 'full', dither: 0.75, width: c.width }) : q.index;
    const pal = await E().pngIndexed(c.width, c.height, q.palette, qi);
    // paletli sonucun kalitesini denetle; kötüyse kayıpsıza düş
    const back = await E().blobToCanvas(pal);
    const s = E().ssimColor(c, back);
    if (s >= LEVELS[level].ssim - 0.01) opts.push({ b: pal, s, note: App.t('{0} colors', q.palette.length) });
    opts.push({ b: await E().pngLossless(d.data, c.width, c.height), s: 1, note: App.t('lossless') });
    return opts.sort((a, b) => a.b.size - b.b.size)[0];
  };

  App.compress = {
    open() {
      const st = { level: 'balanced', fmt: 'keep', resize: false, maxSide: 2560, dither: true, files: [] };
      // her dosya: { file, src (canvas), out: { blob, s, note, fmt }, status, url }
      const list = h('div', { class: 'cp-list' });
      const total = h('div', { class: 'cp-total' });
      const fileIn = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/bmp,image/gif', multiple: true, style: { display: 'none' }, onchange: () => { add([...fileIn.files]); fileIn.value = ''; } });
      let ditherT = null;

      const outFmt = (f, alpha) => {
        if (st.fmt !== 'keep') return st.fmt === 'jpg' && alpha ? 'png' : st.fmt;
        const e = extOf(f.file);
        return e === 'png' || e === 'webp' || e === 'jpg' ? e : alpha ? 'png' : 'jpg';
      };
      // Ayarların özeti: sonuç hangi ayarlarla üretildi (ayar değişince sonuç "eski" sayılır)
      const keyOf = () => JSON.stringify([st.level, st.fmt, st.resize, st.maxSide, st.dither]);
      const run = async f => {
        const key = keyOf();
        f.status = 'work'; draw();
        try {
          let c = f.src;
          if (st.resize && Math.max(c.width, c.height) > st.maxSide) { const k = st.maxSide / Math.max(c.width, c.height); c = U.scaled(c, c.width * k, c.height * k); }
          const alpha = hasAlpha(c), fmt = outFmt(f, alpha);
          let r;
          if (fmt === 'png') r = await compressPng(c, st.level, st.dither);
          else r = await searchQuality(fmt === 'jpg' ? flat(c) : c, MIME[fmt], LEVELS[st.level]);
          r.fmt = fmt;
          if (r.q) r.note = App.t('quality {0}', Math.round(r.q * 100));
          // orijinalden büyükse (ve biçim/boyut değişmediyse) orijinali koru
          const same = fmt === extOf(f.file) && !(st.resize && c !== f.src);
          if (same && r.b.size >= f.file.size) r = { b: f.file, s: 1, fmt, note: App.t('Already Optimal'), orig: true };
          f.out = r; f.status = key === keyOf() ? 'done' : st.files.length <= AUTO_MAX ? 'wait' : 'stale';
        } catch (e) { console.error(e); f.status = 'error'; }
        draw();
      };
      // Sıra: bekleyen dosyalar teker teker işlenir (aynı anda tek iş)
      let working = false;
      const queue = async () => {
        if (working) return;
        working = true;
        try { let f; while ((f = st.files.find(x => x.status === 'wait'))) await run(f); } finally { working = false; }
      };
      const add = async fs => {
        const imgs = fs.filter(f => /^image\//.test(f.type));
        for (const file of imgs) {
          try {
            const src = await U.fileToCanvas(file);
            const f = { file, src, status: 'wait', alpha: hasAlpha(src) };
            st.files.push(f);
          } catch (e) { UI.toast(App.t('Could not open: {0}', file.name), 'error'); }
        }
        draw();
        queue();
      };
      const redo = list => { list.forEach(f => { if (f.status !== 'work') f.status = 'wait'; }); draw(); queue(); };

      const nameOut = f => f.file.name.replace(/\.[^.]+$/, '') + '.' + (f.out ? f.out.fmt : extOf(f.file));
      const draw = () => {
        // PNG'ye özgü ayar yalnızca PNG olarak kaydedilecek bir resim varsa görünür
        if (ditherT) ditherT.el.style.display = st.fmt === 'png' || st.files.some(f => outFmt(f, f.alpha) === 'png') ? '' : 'none';
        list.innerHTML = '';
        if (!st.files.length) {
          list.appendChild(h('div', { class: 'gif-empty' }, h('span', { html: App.icon('compress', 30) }), h('b', null, 'Add Images to Compress'), h('span', null, 'Drag JPG, PNG or WEBP files here. Everything is processed on your device.')));
          total.textContent = '';
          return;
        }
        let a = 0, b = 0;
        const stale = st.files.filter(f => f.status === 'stale');
        if (stale.length) list.appendChild(h('div', { class: 'cp-stale' },
          h('span', { html: App.icon('info', 16) }),
          h('span', null, App.t('Settings changed. {0} images are still compressed with the old settings.', stale.length)),
          UI.button('Compress with New Settings', () => redo(stale), { small: true, primary: true, icon: 'reset' })));
        st.files.forEach((f, i) => {
          const th = U.canvas(56, 56), x = th.getContext('2d'), k = Math.max(56 / f.src.width, 56 / f.src.height);
          x.drawImage(f.src, (56 - f.src.width * k) / 2, (56 - f.src.height * k) / 2, f.src.width * k, f.src.height * k);
          let right;
          const acts = [];
          if ((f.status === 'done' || f.status === 'stale') && f.out) {
            const save = 1 - f.out.b.size / f.file.size;
            a += f.file.size; b += f.out.b.size;
            // biçim değişince dosya büyüyebilir (ör. ekran görüntüsü PNG'den JPG'ye): bunu açıkça göster
            const bigger = save < -0.005;
            right = h('div', { class: 'cp-res' },
              h('span', { class: 'cp-save' + (bigger ? ' more' : save > 0.005 ? '' : ' none') }, bigger ? '+' + Math.round(-save * 100) + '%' : save > 0.005 ? '-' + Math.round(save * 100) + '%' : '0%'),
              h('div', { class: 'cp-stack' },
                h('span', { class: 'cp-sizes' }, U.fmtBytes(f.file.size) + ' → ', h('b', null, U.fmtBytes(f.out.b.size))),
                h('small', { class: 'cp-note' + (f.status === 'stale' ? ' old' : '') }, f.out.fmt.toUpperCase() + ' · ' + f.out.note + (f.status === 'stale' ? ' · ' + App.t('Old Settings') : '')),
                bigger ? h('small', { class: 'cp-note old' }, App.t('Larger than the original; {0} suits this image better', extOf(f.file).toUpperCase())) : null));
            if (f.status === 'stale') acts.push(UI.iconBtn('reset', 'Compress with New Settings', () => redo([f])));
            acts.push(UI.iconBtn('compare', 'Compare', () => compare(f)), UI.iconBtn('download', 'Save', () => App.saveBlob(f.out.b, nameOut(f))));
          } else right = h('div', { class: 'cp-res' }, f.status === 'error' ? h('span', { class: 'cp-err' }, 'Error') : h('span', { class: 'cp-spin' }), h('small', { class: 'cp-note' }, f.status === 'error' ? '' : f.status === 'wait' ? 'Queued…' : 'Compressing…'));
          acts.push(UI.iconBtn('close', 'Remove from List', () => { st.files.splice(i, 1); draw(); }));
          list.appendChild(h('div', { class: 'cp-item' }, th,
            h('div', { class: 'cp-name' }, h('b', { 'data-noi18n': '' }, f.file.name), h('small', null, `${f.src.width} x ${f.src.height}`)),
            right, h('div', { class: 'cp-acts' }, acts)));
        });
        total.textContent = b ? App.t('Total: {0} → {1} ({2}% smaller)', U.fmtBytes(a), U.fmtBytes(b), Math.max(0, Math.round((1 - b / a) * 100))) : '';
      };

      // Önce / sonra karşılaştırması: kaydırıcıyla ayrılan iki görüntü
      const compare = async f => {
        const after = await E().blobToCanvas(f.out.b);
        const W = Math.min(900, innerWidth - 80), k = Math.min(W / f.src.width, (innerHeight - 220) / f.src.height, 1);
        const cw = Math.round(f.src.width * k), ch = Math.round(f.src.height * k);
        const cv = h('canvas', { width: cw, height: ch, class: 'cp-cmp' });
        let pos = 0.5, zoom = false, zx = 0.5, zy = 0.5;
        const paint = () => {
          const x = cv.getContext('2d');
          x.clearRect(0, 0, cw, ch);
          x.imageSmoothingEnabled = !zoom;
          const draw1 = (img, clipL, clipR) => {
            x.save(); x.beginPath(); x.rect(clipL, 0, clipR - clipL, ch); x.clip();
            if (zoom) { const sw = cw / (k * 3), sh = ch / (k * 3); x.drawImage(img, zx * f.src.width - sw / 2, zy * f.src.height - sh / 2, sw, sh, 0, 0, cw, ch); }
            else x.drawImage(img, 0, 0, cw, ch);
            x.restore();
          };
          draw1(f.src, 0, cw * pos);
          draw1(after, cw * pos, cw);
          x.fillStyle = '#fff'; x.fillRect(cw * pos - 1, 0, 2, ch);
          x.font = '600 12px Segoe UI'; x.fillStyle = 'rgba(0,0,0,.6)';
          const t1 = App.t('Original'), t2 = App.t('Compressed');
          x.fillRect(8, 8, x.measureText(t1).width + 14, 22); x.fillRect(cw - x.measureText(t2).width - 22, 8, x.measureText(t2).width + 14, 22);
          x.fillStyle = '#fff'; x.fillText(t1, 15, 23); x.fillText(t2, cw - x.measureText(t2).width - 15, 23);
        };
        cv.addEventListener('pointermove', e => { const r = cv.getBoundingClientRect(); if (e.buttons || !zoom) pos = U.clamp((e.clientX - r.left) / r.width, 0, 1); if (zoom && !e.buttons) { zx = (e.clientX - r.left) / r.width; zy = (e.clientY - r.top) / r.height; } paint(); });
        cv.addEventListener('dblclick', e => { const r = cv.getBoundingClientRect(); zoom = !zoom; zx = (e.clientX - r.left) / r.width; zy = (e.clientY - r.top) / r.height; paint(); });
        paint();
        UI.modal({
          title: App.t('Compare: {0}', f.file.name), width: cw + 40,
          content: h('div', null, cv, UI.note('Move the mouse left and right to compare. Double-click to inspect details at 3x zoom.'),
            h('p', { class: 'note' }, App.t('Visual similarity: {0}%', (f.out.s * 100).toFixed(1)))),
        });
      };

      const zipAll = async () => {
        const stale = st.files.filter(f => f.status === 'stale');
        if (stale.length) {
          const r = await UI.choice(App.t('{0} images were compressed with the old settings. Compress them again with the new settings before downloading?', stale.length), [['redo', 'Recompress and Download', true], ['as', 'Download as Is'], [null, 'Cancel']]);
          if (r == null) return;
          if (r === 'redo') {
            await App.busy('Compressing…', async prog => { for (let i = 0; i < stale.length; i++) { prog(i / stale.length, `${i + 1} / ${stale.length}`); await run(stale[i]); } });
          }
        }
        const done = st.files.filter(f => (f.status === 'done' || f.status === 'stale') && f.out);
        if (!done.length) { UI.toast('No compressed files yet', 'warn'); return; }
        if (done.length === 1) { App.saveBlob(done[0].out.b, nameOut(done[0])); return; }
        const used = new Set();
        const files = done.map(f => { let n = nameOut(f), i = 2; while (used.has(n)) n = nameOut(f).replace(/(\.[^.]+)$/, `-${i++}$1`); used.add(n); return { name: n, blob: f.out.b }; });
        const z = await App.busy('Preparing ZIP…', () => App.enc.zip(files));
        if (z) App.saveBlob(z, 'pixtape-compressed.zip', [{ description: 'ZIP', accept: { 'application/zip': ['.zip'] } }]);
      };

      // Ayar değişince: az resim varsa hemen yeniden sıkıştır; çoksa işlem yükü olmasın diye
      // yalnızca "eski" olarak işaretle (kullanıcı isterse tek tıkla ya da indirirken yeniden sıkıştırılır)
      const AUTO_MAX = 3;
      const rerun = () => {
        if (!st.files.length) return;
        if (st.files.length <= AUTO_MAX) { redo(st.files.filter(f => f.status !== 'error')); return; }
        st.files.forEach(f => { if (f.status === 'done') f.status = 'stale'; });
        draw();
      };
      ditherT = UI.toggle({
        label: 'Smooth PNG Transitions', value: st.dither, onChange: v => { st.dither = v; rerun(); },
        info: 'Shrinking a PNG reduces the number of colors. With this on, neighboring pixels are mixed in different shades, so smooth transitions such as skies and gradients do not show stair-stepped banding. For logos and flat-color drawings, turning it off can make the file a bit smaller.',
      });
      const maxIn = UI.number({ label: 'Longest Edge (px)', value: st.maxSide, min: 64, onChange: v => { st.maxSide = Math.max(64, Math.round(v)); rerun(); } });
      maxIn.el.style.display = 'none';
      const side = h('div', { class: 'gif-side' },
        UI.section('Compression', [
          UI.seg({ options: Object.entries(LEVELS).map(([k, v]) => [k, v.label]), value: st.level, onChange: v => { st.level = v; rerun(); } }).el,
        ], { info: 'Pixtape automatically finds the lowest quality that is visually unnoticeable for each image. "Best quality" is nearly lossless; "Smallest file" gives the smallest size with a little more loss.' }),
        UI.section('Output Format', [
          UI.seg({ options: [['keep', 'Same'], ['jpg', 'JPG'], ['png', 'PNG'], ['webp', 'WEBP']], value: st.fmt, onChange: v => { st.fmt = v; rerun(); draw(); } }).el,
          ditherT.el,
        ], { info: 'Transparent images stay PNG instead of JPG.' }),
        UI.section('Reduce Size', [maxIn.el, UI.note('Very large photos are reduced to this size; the aspect ratio is kept.')], { toggle: { value: st.resize, onChange: v => { st.resize = v; maxIn.el.style.display = v ? '' : 'none'; rerun(); } } }));
      const main = h('div', { class: 'gif-main' },
        h('div', { class: 'gif-toolbar' },
          UI.button('Add Image', () => fileIn.click(), { small: true, primary: true, icon: 'image' }),
          h('div', { class: 'spacer' }),
          UI.button('Clear List', () => { st.files = []; draw(); }, { small: true, cls: 'ghost', icon: 'trash' }), fileIn),
        list, total);
      main.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
      main.addEventListener('drop', e => { if (!e.dataTransfer.files.length) return; e.preventDefault(); e.stopPropagation(); add([...e.dataTransfer.files]); });
      draw();
      UI.modal({
        title: 'Compress Images', width: Math.min(1040, innerWidth - 40), sticky: true,
        content: h('div', { class: 'gif-wrap' }, main, side),
        buttons: [{ label: 'Close', value: null }, { label: 'Download All', primary: true, value: () => { zipAll(); return false; } }],
      });
    },
  };
})();
