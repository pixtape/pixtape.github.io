'use strict';
/* Kolaj oluşturucu */
(() => {
  const { U, ui: UI } = App;
  const h = U.h;
  const t3 = 1 / 3;
  const LAYOUTS = [
    [[0, 0, 0.5, 1], [0.5, 0, 0.5, 1]],
    [[0, 0, 1, 0.5], [0, 0.5, 1, 0.5]],
    [[0, 0, 0.5, 1], [0.5, 0, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]],
    [[0, 0, 1, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]],
    [[0, 0, t3, 1], [t3, 0, t3, 1], [2 * t3, 0, t3, 1]],
    [[0, 0, 1, t3], [0, t3, 1, t3], [0, 2 * t3, 1, t3]],
    [[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]],
    [[0, 0, 1, 0.6], [0, 0.6, t3, 0.4], [t3, 0.6, t3, 0.4], [2 * t3, 0.6, t3, 0.4]],
    [[0, 0, 0.62, 1], [0.62, 0, 0.38, t3], [0.62, t3, 0.38, t3], [0.62, 2 * t3, 0.38, t3]],
    [[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, t3, 0.5], [t3, 0.5, t3, 0.5], [2 * t3, 0.5, t3, 0.5]],
    [[0, 0, 0.5, t3 * 2], [0.5, 0, 0.5, t3], [0.5, t3, 0.5, t3], [0, 2 * t3, 0.5, t3], [0.5, 2 * t3, 0.5, t3]],
    [[0, 0, t3, 0.5], [t3, 0, t3, 0.5], [2 * t3, 0, t3, 0.5], [0, 0.5, t3, 0.5], [t3, 0.5, t3, 0.5], [2 * t3, 0.5, t3, 0.5]],
    [[0, 0, 0.5, t3], [0.5, 0, 0.5, t3], [0, t3, 0.5, t3], [0.5, t3, 0.5, t3], [0, 2 * t3, 0.5, t3], [0.5, 2 * t3, 0.5, t3]],
    [[0, 0, 0.25, 0.5], [0.25, 0, 0.5, 0.5], [0.75, 0, 0.25, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]],
    [[0, 0, t3, t3], [t3, 0, t3, t3], [2 * t3, 0, t3, t3], [0, t3, t3, t3], [t3, t3, t3, t3], [2 * t3, t3, t3, t3], [0, 2 * t3, t3, t3], [t3, 2 * t3, t3, t3], [2 * t3, 2 * t3, t3, t3]],
    [[0, 0, 1, 1]],
  ];
  const RATIOS = [['1:1', 1], ['4:5', 0.8], ['3:4', 0.75], ['2:3', 2 / 3], ['9:16', 9 / 16], ['16:9', 16 / 9], ['3:2', 1.5], ['4:3', 4 / 3]];

  const C = App.collage = {
    st: null,
    open() {
      const st = C.st = { layout: 6, cells: [], ratio: 1, size: 2400, sp: 2, round: 0, bg: '#ffffff', drag: null };
      const cv = h('canvas', { class: 'col-canvas' });
      const fileIn = h('input', { type: 'file', accept: 'image/*', multiple: true, style: { display: 'none' } });
      let target = -1;
      const W = () => st.ratio >= 1 ? st.size : Math.round(st.size * st.ratio);
      const H = () => st.ratio >= 1 ? Math.round(st.size / st.ratio) : st.size;
      const rects = (w, hh) => {
        const sp = Math.round(Math.min(w, hh) * st.sp / 100);
        const aw = w - sp, ah = hh - sp;
        return LAYOUTS[st.layout].map(([fx, fy, fw, fh]) => ({ x: sp + fx * aw, y: sp + fy * ah, w: fw * aw - sp, h: fh * ah - sp }));
      };
      const drawCells = (x, w, hh, preview) => {
        x.fillStyle = st.gradOn ? U.gradFill(x, st.grad, 0, 0, w, hh) : st.bg; x.fillRect(0, 0, w, hh);
        const R = rects(w, hh), rad = Math.min(w, hh) * st.round / 200;
        R.forEach((r, i) => {
          const cell = st.cells[i];
          x.save();
          x.beginPath(); x.roundRect(r.x, r.y, r.w, r.h, Math.min(rad, r.w / 2, r.h / 2)); x.clip();
          if (cell && cell.img) {
            const im = cell.img, k = Math.max(r.w / im.width, r.h / im.height) * cell.z;
            const iw = im.width * k, ih = im.height * k;
            const ox = (iw - r.w) / 2, oy = (ih - r.h) / 2;
            x.imageSmoothingQuality = 'high';
            x.drawImage(im, r.x - ox + cell.ox * ox, r.y - oy + cell.oy * oy, iw, ih);
          } else if (preview) {
            x.fillStyle = '#e4e7ee'; x.fillRect(r.x, r.y, r.w, r.h);
            x.fillStyle = '#8a90a0'; x.font = `600 ${Math.max(12, Math.min(r.w, r.h) * 0.08)}px Segoe UI`; x.textAlign = 'center'; x.textBaseline = 'middle';
            x.fillText('+ Photo', r.x + r.w / 2, r.y + r.h / 2);
          }
          x.restore();
          if (preview && i === st.hover) { x.strokeStyle = '#4f8cff'; x.lineWidth = 3; x.strokeRect(r.x + 1.5, r.y + 1.5, r.w - 3, r.h - 3); }
        });
      };
      let pvScale = 1;
      const draw = () => {
        const w = W(), hh = H();
        // clientWidth: pencerenin açılış animasyonundaki küçültmeden etkilenmez (getBoundingClientRect etkilenir)
        const pe = cv.parentElement, box = pe && pe.clientWidth ? { width: pe.clientWidth, height: pe.clientHeight } : { width: 600, height: 500 };
        pvScale = Math.min((box.width - 20) / w, (box.height - 20) / hh, 1);
        cv.width = Math.round(w * pvScale); cv.height = Math.round(hh * pvScale);
        const x = cv.getContext('2d');
        x.setTransform(pvScale, 0, 0, pvScale, 0, 0);
        drawCells(x, w, hh, true);
      };
      const cellAt = e => {
        const r = cv.getBoundingClientRect();
        const px = (e.clientX - r.left) / pvScale, py = (e.clientY - r.top) / pvScale;
        return rects(W(), H()).findIndex(c => px >= c.x && py >= c.y && px <= c.x + c.w && py <= c.y + c.h);
      };
      const addFiles = async (files, start) => {
        let i = start == null ? 0 : start;
        for (const f of files) {
          if (!f.type.startsWith('image/')) continue;
          if (start == null) while (i < LAYOUTS[st.layout].length && st.cells[i] && st.cells[i].img) i++;
          if (i >= LAYOUTS[st.layout].length) break;
          const img = U.fit(await U.fileToCanvas(f), 3000);
          st.cells[i] = { img, z: 1, ox: 0, oy: 0 };
          i++;
          draw();
        }
      };
      fileIn.onchange = () => { addFiles([...fileIn.files], target >= 0 ? target : null); fileIn.value = ''; };
      cv.addEventListener('pointerdown', e => {
        const i = cellAt(e);
        if (i < 0) return;
        const cell = st.cells[i];
        if (!cell || !cell.img) { target = i; fileIn.click(); return; }
        cv.setPointerCapture(e.pointerId);
        st.drag = { i, x: e.clientX, y: e.clientY, ox: cell.ox, oy: cell.oy };
      });
      cv.addEventListener('pointermove', e => {
        if (st.drag) {
          const cell = st.cells[st.drag.i], r = rects(W(), H())[st.drag.i];
          const im = cell.img, k = Math.max(r.w / im.width, r.h / im.height) * cell.z;
          const ox = (im.width * k - r.w) / 2 || 1, oy = (im.height * k - r.h) / 2 || 1;
          cell.ox = U.clamp(st.drag.ox + (e.clientX - st.drag.x) / pvScale / ox, -1, 1);
          cell.oy = U.clamp(st.drag.oy + (e.clientY - st.drag.y) / pvScale / oy, -1, 1);
          draw();
        } else {
          const i = cellAt(e);
          if (i !== st.hover) { st.hover = i; draw(); }
        }
      });
      cv.addEventListener('pointerup', () => { st.drag = null; });
      cv.addEventListener('wheel', e => {
        const i = cellAt(e), cell = st.cells[i];
        if (!cell || !cell.img) return;
        e.preventDefault();
        cell.z = U.clamp(cell.z * Math.exp(-e.deltaY * 0.0015), 1, 5);
        draw();
      }, { passive: false });
      cv.addEventListener('contextmenu', e => {
        e.preventDefault();
        const i = cellAt(e);
        if (i >= 0 && st.cells[i]) UI.menu({ getBoundingClientRect: () => ({ left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY }) }, [
          { label: 'Replace Photo', icon: 'image', onClick: () => { target = i; fileIn.click(); } },
          { label: 'Clear Cell', icon: 'trash', onClick: () => { st.cells[i] = null; draw(); } },
        ]);
      });
      cv.addEventListener('dragover', e => e.preventDefault());
      cv.addEventListener('drop', e => {
        e.preventDefault(); e.stopPropagation();
        const i = cellAt(e);
        const files = [...e.dataTransfer.files];
        if (files.length === 1 && i >= 0) addFiles(files, i); else addFiles(files);
      });

      const layoutGrid = h('div', { class: 'col-layouts' }, LAYOUTS.map((L, i) => {
        const c = U.canvas(52, 52), x = c.getContext('2d');
        x.fillStyle = '#e8eaf0';
        L.forEach(([fx, fy, fw, fh]) => x.fillRect(2 + fx * 48 + 1.5, 2 + fy * 48 + 1.5, fw * 48 - 3, fh * 48 - 3));
        const b = h('button', { class: 'col-lay' + (i === st.layout ? ' on' : ''), onclick: () => { st.layout = i; layoutGrid.querySelectorAll('.col-lay').forEach((q, j) => q.classList.toggle('on', j === i)); draw(); } }, c);
        return b;
      }));
      const side = h('div', { class: 'col-side' },
        UI.section('Layout', [layoutGrid]),
        UI.section('Format', [
          UI.seg({ options: RATIOS.map(([t, v]) => [String(v), t]), value: '1', wrap: true, onChange: v => { st.ratio = +v; draw(); } }).el,
          UI.select({ label: 'Long Edge Size', options: [['1080', '1080 px'], ['1600', '1600 px'], ['2400', '2400 px'], ['3600', '3600 px'], ['4800', '4800 px']], value: '2400', onChange: v => { st.size = +v; draw(); } }).el,
          UI.slider({ label: 'Space', min: 0, max: 10, step: 0.25, value: st.sp, def: 2, onInput: v => { st.sp = v; draw(); } }).el,
          UI.slider({ label: 'Corner Roundness', min: 0, max: 50, value: st.round, onInput: v => { st.round = v; draw(); } }).el,
          UI.color({ label: 'Background', value: st.bg, onInput: v => { st.bg = v; draw(); }, grad: { on: !!st.gradOn, fresh: !st.grad, value: st.grad || U.gradDef(st.bg, '#6c5cff', 135), onMode: on => { st.gradOn = on; if (!st.grad) st.grad = U.gradDef(st.bg, '#6c5cff', 135); draw(); }, onInput: g => { st.grad = g; draw(); } } }).el,
        ]),
        UI.button('Add Photos…', () => { target = -1; fileIn.click(); }, { block: true, icon: 'upload' }),
        UI.note('Click a cell to add a photo. Drag to pan, use the mouse wheel to zoom, right-click to replace.'),
        fileIn);
      const stage = h('div', { class: 'col-stage' }, cv);
      const content = h('div', { class: 'col-wrap' }, side, stage);
      // sahne boyutu değişince (pencere açılırken, yeniden boyutlanınca) önizleme yeniden çizilir
      let lastSz = '';
      const ro = new ResizeObserver(() => { const s = stage.clientWidth + 'x' + stage.clientHeight; if (s !== lastSz) { lastSz = s; draw(); } });
      UI.modal({
        title: 'Make Collage', width: Math.min(1180, innerWidth - 40), content, sticky: true,
        onOpen: () => { ro.observe(stage); requestAnimationFrame(draw); },
        buttons: [{ label: 'Close', value: null }, {
          label: 'Open in Editor', primary: true, value: () => {
            if (!st.cells.some(c => c && c.img)) { UI.toast('Add at least one photo first', 'warn'); return false; }
            return 'ok';
          },
        }],
      }).then(r => { ro.disconnect(); if (r === 'ok') C.build(); });
      C._draw = draw;
      C._rects = rects;
    },

    build() {
      const st = C.st;
      const w = st.ratio >= 1 ? st.size : Math.round(st.size * st.ratio), hh = st.ratio >= 1 ? Math.round(st.size / st.ratio) : st.size;
      const bg = U.canvas(w, hh), bx = bg.getContext('2d');
      bx.fillStyle = st.gradOn ? U.gradFill(bx, st.grad, 0, 0, w, hh) : st.bg; bx.fillRect(0, 0, w, hh);
      const layers = [App.newLayer(bg, { name: 'Background' })];
      const R = C._rects(w, hh), rad = Math.min(w, hh) * st.round / 200;
      R.forEach((r, i) => {
        const cell = st.cells[i];
        if (!cell || !cell.img) return;
        const c = U.canvas(r.w, r.h), x = c.getContext('2d');
        x.beginPath(); x.roundRect(0, 0, c.width, c.height, Math.min(rad, r.w / 2, r.h / 2)); x.clip();
        const im = cell.img, k = Math.max(r.w / im.width, r.h / im.height) * cell.z;
        const iw = im.width * k, ih = im.height * k, ox = (iw - r.w) / 2, oy = (ih - r.h) / 2;
        x.imageSmoothingQuality = 'high';
        x.drawImage(im, -ox + cell.ox * ox, -oy + cell.oy * oy, iw, ih);
        layers.push(App.newLayer(c, { name: 'Photo ' + (i + 1), x: r.x + r.w / 2, y: r.y + r.h / 2 }));
      });
      App.newDoc({ w, h: hh, name: App.t('Collage'), layers, label: 'Collage' });
      App.showEditor();
    },
  };
})();
