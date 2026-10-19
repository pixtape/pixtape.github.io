'use strict';
/* Toplu düzenleme: çok sayıda fotoğrafa aynı işlemleri uygula */
(() => {
  const { U, ui: UI, IMG } = App;
  const h = U.h;
  const MIME = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
  const POS = [['custom', 'Custom (drag in Preview)'], ['tl', 'Top Left'], ['tc', 'Top Center'], ['tr', 'Top Right'], ['ml', 'Middle Left'], ['mc', 'Center'], ['mr', 'Middle Right'], ['bl', 'Bottom Left'], ['bc', 'Bottom Center'], ['br', 'Bottom Right']];
  // yalnızca bu cihazda yüklü olanlar; hiçbiri yoksa tarayıcının genel yazı tipleri
  const WM_FONTS = ['Segoe UI', 'Helvetica', 'Arial', 'Arial Black', 'Georgia', 'Impact', 'Times New Roman', 'Trebuchet MS', 'Segoe Script', 'Courier New'].filter(f => U.hasFont(f));
  if (!WM_FONTS.length) WM_FONTS.push('sans-serif', 'serif', 'monospace');

  // Filigranın fotoğraftaki kutusu (merkez ve boyut, piksel)
  const wmBox = (c, o, x) => {
    const s = Math.max(10, Math.min(c.width, c.height) * o.wmSize / 100);
    x.font = `${o.wmBold ? 700 : 400} ${s}px "${o.wmFont}", "Segoe UI", sans-serif`;
    const tw = x.measureText(o.wmText).width, th = s * 1.1, m = s * 0.8;
    let cx, cy;
    if (o.wmPos === 'custom') { cx = o.wmX * c.width; cy = o.wmY * c.height; }
    else {
      const [v, hz] = o.wmPos;
      cx = hz === 'l' ? m + tw / 2 : hz === 'r' ? c.width - m - tw / 2 : c.width / 2;
      cy = v === 't' ? m + th / 2 : v === 'b' ? c.height - m - th / 2 : c.height / 2;
    }
    return { cx, cy, w: tw, h: th, s };
  };

  /* Kırpma alanı: önizlemede fareyle seçilir ve fotoğrafa göre oranlı saklanır; böylece her fotoğrafta aynı bölge alınır.
     - Serbest: alan doğrudan fotoğrafın kesirleri (fx, fy, fw, fh)
     - Oranlı: alanın merkezi (cx, cy) ve büyüklüğü (cs: o orandaki en büyük kutuya göre); her fotoğrafta oran aynı kalır */
  const cropRatio = o => {
    if (o.ratio === 'free') return 0;
    if (o.ratio === 'custom') return Math.max(0.01, +o.rw || 1) / Math.max(0.01, +o.rh || 1);
    const [a, b] = o.ratio.split(':').map(Number);
    return a / b;
  };
  const cropRect = (W, H, o) => {
    const r = cropRatio(o);
    let x, y, w, hh;
    if (!r) {
      w = U.clamp(o.fw, 0.01, 1) * W; hh = U.clamp(o.fh, 0.01, 1) * H;
      x = U.clamp(o.fx * W, 0, W - w); y = U.clamp(o.fy * H, 0, H - hh);
    } else {
      const w0 = Math.min(W, H * r), h0 = w0 / r, s = U.clamp(o.cs, 0.02, 1);
      w = w0 * s; hh = h0 * s;
      x = U.clamp(o.cx * W - w / 2, 0, W - w); y = U.clamp(o.cy * H - hh / 2, 0, H - hh);
    }
    return { x, y, w, h: hh };
  };
  const cropped = (c, o) => {
    if (!o.crop) return c;
    const R = cropRect(c.width, c.height, o);
    const w = Math.max(1, Math.round(R.w)), hh = Math.max(1, Math.round(R.h));
    const t = U.canvas(w, hh);
    t.getContext('2d').drawImage(c, Math.round(R.x), Math.round(R.y), w, hh, 0, 0, w, hh);
    return t;
  };
  // Boyutlandırma katsayısı (kırpılmış boyuta göre)
  const resizeK = (w, hh, o) => {
    if (!o.resize) return 1;
    let k = 1;
    if (o.rmode === 'max') k = o.px / Math.max(w, hh);
    if (o.rmode === 'w') k = o.px / w;
    if (o.rmode === 'h') k = o.px / hh;
    if (o.rmode === 'pct') k = o.pct / 100;
    if (o.rmode !== 'pct' && o.noUp) k = Math.min(1, k);
    return k;
  };
  // Çıktı boyutu (piksel): önce kırpma, sonra boyutlandırma, sonra kenarlık
  const outDims = (W, H, o) => {
    let w = W, hh = H;
    if (o.crop) { const R = cropRect(W, H, o); w = Math.max(1, Math.round(R.w)); hh = Math.max(1, Math.round(R.h)); }
    const k = resizeK(w, hh, o);
    if (Math.abs(k - 1) > 1e-3) { w = Math.max(1, Math.round(w * k)); hh = Math.max(1, Math.round(hh * k)); }
    if (o.borderOn && o.border > 0) { const b = Math.round(Math.min(w, hh) * o.border / 100); w += b * 2; hh += b * 2; }
    return [w, hh];
  };

  const process = (src, o, info) => {
    let c = cropped(src, o);
    const k = resizeK(c.width, c.height, o);
    if (Math.abs(k - 1) > 1e-3) c = U.scaled(c, c.width * k, c.height * k);
    if (o.color) {
      if (o.auto) c = IMG.adjust(c, IMG.autoParams(c));
      const adj = { brightness: o.brightness, contrast: o.contrast, saturation: o.saturation, sharpen: o.sharpen, temperature: o.temperature };
      if (!IMG.isNeutral(adj)) c = IMG.adjust(c, adj);
    }
    if (o.effOn && o.effect >= 0) c = IMG.applyEffect(c, IMG.EFFECTS[o.effect], o.effAmt / 100);
    if (o.borderOn && o.border > 0) {
      const b = Math.round(Math.min(c.width, c.height) * o.border / 100), t = U.canvas(c.width + b * 2, c.height + b * 2), x = t.getContext('2d');
      x.fillStyle = o.borderColor; x.fillRect(0, 0, t.width, t.height); x.drawImage(c, b, b);
      c = t;
    }
    if (o.wm && o.wmText) {
      if (c === src) c = U.clone(src);
      const x = c.getContext('2d'), B = wmBox(c, o, x);
      x.save();
      x.globalAlpha = o.wmOp / 100;
      x.textAlign = 'center'; x.textBaseline = 'middle';
      if (o.wmShadow) { x.shadowColor = 'rgba(0,0,0,.5)'; x.shadowBlur = B.s * 0.12; x.shadowOffsetY = B.s * 0.04; }
      // degrade yazının kutusuna yayılır
      x.fillStyle = o.wmGradOn && o.wmGrad ? U.gradFill(x, o.wmGrad, B.cx - B.w / 2, B.cy - B.h / 2, B.w, B.h) : o.wmColor;
      x.fillText(o.wmText, B.cx, B.cy);
      x.restore();
      if (info) info.wm = B;
    }
    if (o.fmt === 'jpg') {
      const t = U.canvas(c.width, c.height), x = t.getContext('2d');
      x.fillStyle = '#ffffff'; x.fillRect(0, 0, t.width, t.height); x.drawImage(c, 0, 0);
      c = t;
    }
    return c;
  };

  App.batch = {
    open() {
      const o = {
        resize: true, rmode: 'max', px: 1920, pct: 50, noUp: true, crop: false, ratio: 'free', rw: 3, rh: 2, fx: 0.1, fy: 0.1, fw: 0.8, fh: 0.8, cx: 0.5, cy: 0.5, cs: 0.9,
        color: false, auto: false, brightness: 0, contrast: 0, saturation: 0, sharpen: 0, temperature: 0,
        effOn: false, effect: 0, effAmt: 100, borderOn: false, border: 3, borderColor: '#ffffff',
        wm: false, wmText: '© Pixtape', wmPos: 'br', wmX: 0.85, wmY: 0.9, wmSize: 4, wmOp: 70, wmColor: '#ffffff', wmGradOn: false, wmGrad: null, wmFont: WM_FONTS[0], wmBold: true, wmShadow: true,
        fmt: 'jpg', q: 90, suffix: '_edited',
      };
      let files = [], sel = 0, showOrig = false;      const srcCache = new Map(); // dosya → önizleme boyutundaki kaynak
      const dims = new Map(); // dosya → gerçek boyutu [w, h]
      let fullCache = null; // seçili fotoğrafın tam boyutlu hâli (dosya boyutu tahmini için)
      const list = h('div', { class: 'bt-list' });
      const prog = h('div', { class: 'bt-prog' }, h('div', { class: 'bt-bar' }));
      const pvc = h('canvas', { class: 'bt-pv' });
      const pvInfo = h('div', { class: 'bt-pv-info', 'data-noi18n': '' });
      const fileIn = h('input', { type: 'file', accept: 'image/*', multiple: true, style: { display: 'none' }, onchange: () => { add([...fileIn.files]); fileIn.value = ''; } });
      const thumbs = new Map();
      const thumbOf = f => { if (!thumbs.has(f)) thumbs.set(f, URL.createObjectURL(f)); return thumbs.get(f); };
      const countEl = h('span', { class: 'note' });
      const refreshList = () => {
        list.innerHTML = '';
        if (!files.length) list.appendChild(h('div', { class: 'bt-empty' }, 'Drag photos here or click "Choose photos".'));
        files.forEach((f, i) => list.appendChild(h('div', { class: 'bt-item' + (i === sel ? ' on' : ''), title: 'Show in Preview', onclick: () => { sel = i; refreshList(); preview(); } },
          h('img', { class: 'bt-th', src: thumbOf(f), alt: '' }),
          h('span', { class: 'bt-name', 'data-noi18n': '' }, f.name), h('span', { class: 'bt-size' }, U.fmtBytes(f.size)),
          h('button', { class: 'icon-btn sm', title: 'Remove from List', html: App.icon('close', 14), onclick: e => { e.stopPropagation(); files.splice(i, 1); if (sel >= files.length) sel = Math.max(0, files.length - 1); refreshList(); preview(); } }))));
        countEl.textContent = App.t('{0} photos', files.length);
      };
      const add = fs => { files.push(...fs.filter(f => f.type.startsWith('image/'))); refreshList(); preview(); };

      // Önizleme: seçili fotoğraf büyük gösterilir; "Orijinal" basılı tutulunca düzenlenmemiş hâli
      let pvState = null; // { c (işlenmiş), src (kırpılmış orijinal), wm (filigran kutusu), crop (kırpma alanı düzenleniyor) }
      let cropEdit = false;
      const paint = () => {
        const x = pvc.getContext('2d');
        if (!pvState) { pvc.width = 1; pvc.height = 1; x.clearRect(0, 0, 1, 1); return; }
        const c = showOrig ? pvState.src : pvState.c;
        pvc.width = c.width; pvc.height = c.height;
        x.drawImage(c, 0, 0);
        // kırpma alanı: dışı karartılır, köşelerden boyutlandırılır, içinden taşınır
        if (pvState.crop) {
          const W = c.width, H = c.height, R = cropRect(W, H, o), s = pvScale();
          x.save();
          x.fillStyle = 'rgba(0,0,0,.55)';
          x.beginPath(); x.rect(0, 0, W, H); x.rect(R.x, R.y, R.w, R.h); x.fill('evenodd');
          x.strokeStyle = 'rgba(255,255,255,.35)'; x.lineWidth = s;
          x.beginPath();
          for (const t of [1 / 3, 2 / 3]) { x.moveTo(R.x + R.w * t, R.y); x.lineTo(R.x + R.w * t, R.y + R.h); x.moveTo(R.x, R.y + R.h * t); x.lineTo(R.x + R.w, R.y + R.h * t); }
          x.stroke();
          x.strokeStyle = '#fff'; x.lineWidth = 1.5 * s; x.strokeRect(R.x, R.y, R.w, R.h);
          const L = 16 * s;
          x.lineWidth = 4 * s; x.lineCap = 'square';
          x.beginPath();
          for (const [px, py, dx, dy] of [[R.x, R.y, 1, 1], [R.x + R.w, R.y, -1, 1], [R.x, R.y + R.h, 1, -1], [R.x + R.w, R.y + R.h, -1, -1]]) { x.moveTo(px + dx * L, py); x.lineTo(px, py); x.lineTo(px, py + dy * L); }
          x.stroke();
          x.restore();
          return;
        }
        // filigran kutusu: sürüklenebileceğini gösterir
        if (!showOrig && o.wm && pvState.wm) {
          const B = pvState.wm, lw = Math.max(1, c.width / 500);
          x.save(); x.setLineDash([6 * lw, 4 * lw]); x.lineWidth = lw;
          x.strokeStyle = 'rgba(255,255,255,.85)'; x.strokeRect(B.cx - B.w / 2 - 6, B.cy - B.h / 2 - 4, B.w + 12, B.h + 8);
          x.strokeStyle = 'rgba(0,0,0,.6)'; x.lineDashOffset = 5 * lw; x.strokeRect(B.cx - B.w / 2 - 6, B.cy - B.h / 2 - 4, B.w + 12, B.h + 8);
          x.restore();
        }
      };
      const render = src => {
        // kırpma alanı düzenlenirken fotoğrafın tamamı (renk ve efektle) gösterilir
        if (o.crop && cropEdit) {
          pvState = { c: process(src, { ...o, resize: false, crop: false, borderOn: false, wm: false, fmt: 'png' }), src, crop: true };
          paint(); updInfo();
          return;
        }
        const info = {};
        // boyutlandırma önizlemede yapılmaz (oranlar aynı kalır); diğer işlemler aynen uygulanır
        const c = process(src, { ...o, resize: false }, info);
        pvState = { c, src: cropped(src, o), wm: info.wm };
        paint(); updInfo();
      };
      // Ayar değişince önizleme beklemeden, sürgü sürüklenirken de her karede yenilenir
      let rq = 0;
      const live = () => {
        if (rq) return;
        rq = requestAnimationFrame(() => {
          rq = 0;
          const src = files.length && srcCache.get(files[sel]);
          if (src) render(src); else preview();
        });
      };
      const preview = U.debounce(async () => {
        if (!files.length) { pvState = null; pvInfo.textContent = ''; paint(); return; }
        const f = files[sel];
        let src = srcCache.get(f);
        if (!src) {
          const full = await U.fileToCanvas(f);
          dims.set(f, [full.width, full.height]);
          fullCache = { f, c: full };
          src = U.fit(full, 1100); srcCache.set(f, src);
        }
        if (files[sel] !== f) return;
        pvInfo.textContent = `${sel + 1} / ${files.length} · ${f.name}`;
        render(src);
      }, 120);

      // Filigranı önizlemede fareyle taşı
      const toPx = e => { const r = pvc.getBoundingClientRect(); return { x: (e.clientX - r.left) * pvc.width / r.width, y: (e.clientY - r.top) * pvc.height / r.height }; };
      const onWm = p => { const B = pvState && pvState.wm; return !!(o.wm && B && Math.abs(p.x - B.cx) <= B.w / 2 + 12 && Math.abs(p.y - B.cy) <= B.h / 2 + 10); };
      let wmDrag = false;
      // önizleme pikseli başına ekran pikseli (tutamaç boyutu ekranda sabit kalsın)
      const pvScale = () => { const r = pvc.getBoundingClientRect(); return r.width ? pvc.width / r.width : 1; };
      // Kırpma alanında farenin üzerinde olduğu parça: köşe, kenar (serbestte), içi ya da dışı
      const cropHit = p => {
        const W = pvc.width, H = pvc.height, R = cropRect(W, H, o), t = 12 * pvScale(), free = !cropRatio(o);
        const nx = Math.abs(p.x - R.x) <= t, fx = Math.abs(p.x - R.x - R.w) <= t, ny = Math.abs(p.y - R.y) <= t, fy = Math.abs(p.y - R.y - R.h) <= t;
        const inX = p.x > R.x - t && p.x < R.x + R.w + t, inY = p.y > R.y - t && p.y < R.y + R.h + t;
        if ((nx || fx) && (ny || fy)) return (ny ? 'n' : 's') + (nx ? 'w' : 'e');
        if (free && inY && (nx || fx)) return nx ? 'w' : 'e';
        if (free && inX && (ny || fy)) return ny ? 'n' : 's';
        if (p.x > R.x && p.x < R.x + R.w && p.y > R.y && p.y < R.y + R.h) return 'move';
        return 'new';
      };
      const CUR = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', move: 'move', new: 'crosshair' };
      // Piksel kutusunu ayarlara geri yaz
      const setCrop = R => {
        const W = pvc.width, H = pvc.height, r = cropRatio(o);
        if (!r) { o.fx = R.x / W; o.fy = R.y / H; o.fw = R.w / W; o.fh = R.h / H; }
        else { const w0 = Math.min(W, H * r); o.cs = U.clamp(R.w / w0, 0.02, 1); o.cx = (R.x + R.w / 2) / W; o.cy = (R.y + R.h / 2) / H; }
      };
      const cropDrag = e => {
        const W = pvc.width, H = pvc.height, r = cropRatio(o), p0 = toPx(e), R0 = cropRect(W, H, o), mode = cropHit(p0);
        const min = 10 * pvScale();
        // sabit kalan köşe / kenar
        let ax = mode.includes('w') ? R0.x + R0.w : R0.x, ay = mode.includes('n') ? R0.y + R0.h : R0.y;
        if (mode === 'new') { ax = U.clamp(p0.x, 0, W); ay = U.clamp(p0.y, 0, H); }
        // Alt basılıyken merkezden büyür (merkez: alanın ortası; yeni alan çizerken başlangıç noktası)
        const C = mode === 'new' ? { x: ax, y: ay } : { x: R0.x + R0.w / 2, y: R0.y + R0.h / 2 };
        let last = e;
        const mv = ev => {
          last = ev;
          const p = toPx(ev);
          let R;
          if (mode === 'move') {
            R = { ...R0, x: U.clamp(R0.x + p.x - p0.x, 0, W - R0.w), y: U.clamp(R0.y + p.y - p0.y, 0, H - R0.h) };
          } else if (ev.altKey) {
            const mx = Math.min(C.x, W - C.x), my = Math.min(C.y, H - C.y);
            let hw, hh;
            if (r) { hw = U.clamp(Math.max(Math.abs(p.x - C.x), Math.abs(p.y - C.y) * r), min / 2, Math.max(min / 2, Math.min(mx, my * r))); hh = hw / r; }
            else {
              hw = mode === 'n' || mode === 's' ? R0.w / 2 : U.clamp(Math.abs(p.x - C.x), min / 2, Math.max(min / 2, mx));
              hh = mode === 'e' || mode === 'w' ? R0.h / 2 : U.clamp(Math.abs(p.y - C.y), min / 2, Math.max(min / 2, my));
            }
            R = { x: C.x - hw, y: C.y - hh, w: hw * 2, h: hh * 2 };
          } else if (r) {
            // oranlı: sabit köşeden farenin yönüne, orana uyan en büyük kutu
            const sx = p.x >= ax ? 1 : -1, sy = p.y >= ay ? 1 : -1;
            const maxW = Math.min(sx > 0 ? W - ax : ax, (sy > 0 ? H - ay : ay) * r);
            const w = U.clamp(Math.max(Math.abs(p.x - ax), Math.abs(p.y - ay) * r), min, Math.max(min, maxW)), hh = w / r;
            R = { x: sx > 0 ? ax : ax - w, y: sy > 0 ? ay : ay - hh, w, h: hh };
          } else {
            const px = U.clamp(p.x, 0, W), py = U.clamp(p.y, 0, H);
            const horiz = mode !== 'n' && mode !== 's', vert = mode !== 'e' && mode !== 'w';
            const x0 = horiz ? Math.min(ax, px) : R0.x, x1 = horiz ? Math.max(ax, px) : R0.x + R0.w;
            const y0 = vert ? Math.min(ay, py) : R0.y, y1 = vert ? Math.max(ay, py) : R0.y + R0.h;
            R = { x: x0, y: y0, w: Math.max(min, x1 - x0), h: Math.max(min, y1 - y0) };
          }
          setCrop(R); live();
        };
        // Alt'a fare kıpırdamadan basılıp bırakılınca da alan hemen güncellenir
        const key = ev => {
          if (ev.key !== 'Alt' || mode === 'move') return;
          ev.preventDefault();
          mv({ clientX: last.clientX, clientY: last.clientY, altKey: ev.type === 'keydown' });
        };
        const up = () => {
          pvc.removeEventListener('pointermove', mv); pvc.removeEventListener('pointerup', up);
          window.removeEventListener('keydown', key, true); window.removeEventListener('keyup', key, true);
          updInfo();
        };
        pvc.addEventListener('pointermove', mv); pvc.addEventListener('pointerup', up);
        window.addEventListener('keydown', key, true); window.addEventListener('keyup', key, true);
        if (mode === 'new' && r) mv(e);
      };
      pvc.addEventListener('pointermove', e => {
        if (e.buttons) return;
        if (pvState && pvState.crop) { pvc.style.cursor = CUR[cropHit(toPx(e))]; return; }
        if (!wmDrag) pvc.style.cursor = onWm(toPx(e)) ? 'move' : '';
      });
      pvc.addEventListener('pointerdown', e => {
        if (pvState && pvState.crop) { e.preventDefault(); pvc.setPointerCapture(e.pointerId); cropDrag(e); return; }
        if (!pvState || !o.wm) return;
        const p = toPx(e);
        if (!onWm(p)) return;
        e.preventDefault(); pvc.setPointerCapture(e.pointerId);
        const B = pvState.wm, dx = B.cx - p.x, dy = B.cy - p.y, W = pvState.c.width, H = pvState.c.height;
        if (o.wmPos !== 'custom') { o.wmPos = 'custom'; posSel.set('custom'); }
        wmDrag = true;
        const mv = ev => {
          const q = toPx(ev);
          o.wmX = U.clamp((q.x + dx) / W, 0, 1); o.wmY = U.clamp((q.y + dy) / H, 0, 1);
          live();
        };
        const up = () => { wmDrag = false; pvc.removeEventListener('pointermove', mv); pvc.removeEventListener('pointerup', up); };
        pvc.addEventListener('pointermove', mv); pvc.addEventListener('pointerup', up);
      });
      const origBtn = UI.button('Original', null, { small: true, cls: 'ghost', icon: 'compare', title: 'Hold: show the unedited version' });
      const hold = v => () => { if (showOrig !== v) { showOrig = v; paint(); } };
      origBtn.addEventListener('pointerdown', hold(true)); origBtn.addEventListener('pointerup', hold(false)); origBtn.addEventListener('pointerleave', hold(false));
      const step = d => { if (files.length) { sel = (sel + d + files.length) % files.length; refreshList(); preview(); } };

      const set = k => v => { o[k] = v; live(); };
      const left = h('div', { class: 'bt-left' },
        h('div', { class: 'row' }, UI.button('Choose Photos…', () => fileIn.click(), { small: true, primary: true, icon: 'upload' }), countEl),
        list, prog, fileIn);
      const center = h('div', { class: 'bt-center' },
        h('div', { class: 'bt-pv-wrap' }, pvc),
        h('div', { class: 'bt-pv-bar' },
          UI.iconBtn('left', 'Previous Photo', () => step(-1)), pvInfo, UI.iconBtn('right', 'Next Photo', () => step(1)),
          h('div', { class: 'spacer' }), origBtn));
      for (const el of [left, center]) {
        el.addEventListener('dragover', e => e.preventDefault());
        el.addEventListener('drop', e => { e.preventDefault(); e.stopPropagation(); add([...e.dataTransfer.files]); });
      }
      // Boyut: hangi kenarın ne olacağı seçilir; seçili fotoğrafın önceki ve sonraki boyutu hemen görünür
      const RMODES = [['max', 'Long Edge'], ['w', 'Width'], ['h', 'Height'], ['pct', 'Percent']];
      const valIn = h('input', { type: 'number', class: 'rs-val', min: 1 });
      const unit = h('span', { class: 'rs-unit' });
      const chips = h('div', { class: 'rs-presets' });
      const explain = h('div', { class: 'rs-explain' });
      const noUp = UI.toggle({ label: 'Don\'t Enlarge Small Photos', value: o.noUp, onChange: v => { o.noUp = v; syncRes(); } });
      const syncRes = () => {
        const pct = o.rmode === 'pct', v = pct ? o.pct : o.px;
        valIn.value = v; unit.textContent = pct ? '%' : 'px';
        chips.innerHTML = '';
        (pct ? [25, 50, 75, 150, 200] : [800, 1080, 1280, 1920, 2560, 3840]).forEach(n => chips.appendChild(h('button', {
          class: 'rs-chip' + (n === v ? ' on' : ''), onclick: () => { if (pct) o.pct = n; else o.px = n; syncRes(); },
        }, pct ? n + '%' : String(n))));
        noUp.el.style.display = pct ? 'none' : '';
        explain.textContent = {
          max: App.t('The longer side of each photo becomes {0} px.', v),
          w: App.t('The width of each photo becomes {0} px.', v),
          h: App.t('The height of each photo becomes {0} px.', v),
          pct: App.t('Each photo becomes {0}% of its size.', v),
        }[o.rmode] + ' ' + App.t('The aspect ratio is kept.');
        updInfo();
      };
      /* Seçili fotoğrafın sonucu: boyut (önce → sonra) ve kaydedilince yaklaşık dosya boyutu.
         Dosya boyutu, fotoğraf gerçek boyutunda işlenip kodlanarak ölçülür (biraz bekledikten sonra). */
      const dimsEl = h('div', { class: 'bt-dims', 'data-noi18n': '' });
      const sizeEl = h('div', { class: 'bt-dims', 'data-noi18n': '' });
      let estJob = 0;
      const estimate = U.debounce(async () => {
        const f = files[sel], id = ++estJob;
        if (!f) { sizeEl.textContent = ''; return; }
        try {
          const full = fullCache && fullCache.f === f ? fullCache.c : await U.fileToCanvas(f);
          if (id !== estJob) return;
          fullCache = { f, c: full };
          const blob = await U.toBlob(process(full, o), MIME[o.fmt], o.q / 100);
          if (id !== estJob) return;
          sizeEl.innerHTML = '';
          sizeEl.append(App.t('File size of the selected photo') + ': ', h('b', null, U.fmtBytes(blob.size)));
        } catch (e) { sizeEl.textContent = ''; }
      }, 700);
      const updInfo = () => {
        const f = files[sel], d = f && dims.get(f);
        dimsEl.innerHTML = '';
        if (d) {
          const [w, hh] = outDims(d[0], d[1], o);
          dimsEl.append(App.t('Selected photo') + ': ', `${d[0]} × ${d[1]} → `, h('b', null, `${w} × ${hh}`), ' px');
        }
        if (f) { sizeEl.textContent = App.t('Calculating file size…'); estimate(); } else sizeEl.textContent = '';
      };
      valIn.addEventListener('change', () => { const n = Math.max(1, Math.round(+valIn.value || 1)); if (o.rmode === 'pct') o.pct = Math.min(1000, n); else o.px = n; syncRes(); });
      const rmode = UI.seg({ options: RMODES, value: o.rmode, onChange: v => { o.rmode = v; syncRes(); } });
      syncRes();
      const effSel = UI.select({ options: IMG.EFFECTS.map((e, i) => [String(i), e.name]), value: String(o.effect), onChange: v => { o.effect = +v; live(); } });
      // Kırp: hazır oranlar ya da özel oran (ör. 5:4)
      const ratioW = h('input', { type: 'number', class: 'rs-val', min: 0.1, step: 0.1, value: o.rw, oninput: () => { o.rw = +ratioW.value || 1; live(); } });
      const ratioH = h('input', { type: 'number', class: 'rs-val', min: 0.1, step: 0.1, value: o.rh, oninput: () => { o.rh = +ratioH.value || 1; live(); } });
      const customRow = h('div', { class: 'rs-input' }, ratioW, h('span', { class: 'rs-unit' }, ':'), ratioH);
      customRow.style.display = o.ratio === 'custom' ? '' : 'none';
      const ratioSeg = UI.seg({
        options: [['free', 'Free'], ['1:1', '1:1'], ['4:5', '4:5'], ['3:4', '3:4'], ['2:3', '2:3'], ['16:9', '16:9'], ['9:16', '9:16'], ['custom', 'Custom']], value: o.ratio, wrap: true,
        onChange: v => {
          // alan aynı yerde kalsın: serbest kutunun merkezi oranlı kutunun merkezi olur (ve tersi)
          const pv = pvState && pvState.src, W = pv ? pv.width : 1000, H = pv ? pv.height : 1000, R = cropRect(W, H, o);
          o.ratio = v;
          if (!cropRatio(o)) { o.fx = R.x / W; o.fy = R.y / H; o.fw = R.w / W; o.fh = R.h / H; }
          else {
            // yeni oranlı kutu eskisiyle aşağı yukarı aynı büyüklükte olsun
            const r = cropRatio(o), w0 = Math.min(W, H * r), h0 = w0 / r;
            o.cx = (R.x + R.w / 2) / W; o.cy = (R.y + R.h / 2) / H; o.cs = U.clamp(Math.sqrt(R.w * R.h / (w0 * h0)), 0.05, 1);
          }
          customRow.style.display = v === 'custom' ? '' : 'none';
          setCropEdit(true);
        },
      });
      // Kırpma alanını düzenleme: önizlemede fotoğrafın tamamı ve alan görünür
      const editBtn = UI.button('Edit Area', () => setCropEdit(!cropEdit), { small: true, icon: 'crop' });
      // alanı boyutunu koruyarak fotoğrafın ortasına taşır
      const centerBtn = UI.button('Center Area', () => {
        if (!cropRatio(o)) { o.fx = (1 - o.fw) / 2; o.fy = (1 - o.fh) / 2; } else { o.cx = 0.5; o.cy = 0.5; }
        setCropEdit(true);
      }, { small: true, cls: 'ghost', icon: 'center' });
      const resetBtn = UI.button('Reset Area', () => { Object.assign(o, { fx: 0.1, fy: 0.1, fw: 0.8, fh: 0.8, cx: 0.5, cy: 0.5, cs: 0.9 }); setCropEdit(true); }, { small: true, cls: 'ghost', icon: 'reset' });
      const setCropEdit = v => {
        cropEdit = !!v && o.crop;
        editBtn.classList.toggle('primary', cropEdit);
        editBtn.lastChild.textContent = cropEdit ? 'Done' : 'Edit Area';
        live();
      };
      const posSel = UI.select({ label: 'Position', options: POS, value: o.wmPos, onChange: set('wmPos') });
      const fontSel = UI.select({ label: 'Font', options: WM_FONTS.map(f => [f, f]), value: o.wmFont, onChange: set('wmFont') });
      fontSel.sel.setAttribute('data-noi18n', '');
      const right = h('div', { class: 'bt-right' },
        UI.section('Resize', [
          rmode.el,
          h('div', { class: 'rs-input' }, valIn, unit),
          chips, explain, noUp.el, dimsEl,
        ], { toggle: { value: o.resize, onChange: v => { o.resize = v; updInfo(); } } }),
        UI.section('Crop', [ratioSeg.el, customRow, h('div', { class: 'row wrap' }, editBtn, centerBtn, resetBtn), UI.note('Drag in the preview to choose the area: corners resize it, inside moves it. Hold Alt to resize from the center. The same area is taken from every photo.')], {
          toggle: { value: o.crop, onChange: v => { o.crop = v; setCropEdit(v); } },
          info: 'Free: choose any area. With a ratio, the area keeps that shape on every photo, such as a 1:1 square, a 4:5 Instagram portrait or 16:9 widescreen.',
        }),
        UI.section('Color and Tone', [
          UI.toggle({ label: 'Auto Enhance', value: o.auto, onChange: set('auto') }).el,
          UI.slider({ label: 'Brightness', value: 0, onInput: set('brightness') }).el,
          UI.slider({ label: 'Contrast', value: 0, onInput: set('contrast') }).el,
          UI.slider({ label: 'Saturation', value: 0, onInput: set('saturation') }).el,
          UI.slider({ label: 'Temperature', value: 0, onInput: set('temperature') }).el,
          UI.slider({ label: 'Sharpness', min: 0, max: 100, value: 0, onInput: set('sharpen') }).el,
        ], { toggle: { value: o.color, onChange: set('color') } }),
        UI.section('Effect', [
          effSel.el,
          UI.slider({ label: 'Intensity', min: 0, max: 100, value: 100, onInput: set('effAmt') }).el,
        ], { toggle: { value: o.effOn, onChange: set('effOn') } }),
        UI.section('Border', [
          UI.slider({ label: 'Thickness (%)', min: 0.5, max: 15, step: 0.5, value: o.border, onInput: set('border') }).el,
          UI.color({ label: 'Color', value: o.borderColor, palette: false, onInput: set('borderColor') }).el,
        ], { toggle: { value: o.borderOn, onChange: set('borderOn') } }),
        UI.section('Watermark', [
          h('div', { class: 'field' }, h('label', { class: 'fld-label' }, 'Text'), h('input', { type: 'text', class: 'full', value: o.wmText, oninput: e => { o.wmText = e.target.value; live(); } })),
          posSel.el,
          fontSel.el,
          h('div', { class: 'row' }, UI.toggle({ label: 'Bold', value: o.wmBold, onChange: set('wmBold') }).el, UI.toggle({ label: 'Shadow', value: o.wmShadow, onChange: set('wmShadow') }).el),
          UI.slider({ label: 'Size', min: 1, max: 60, step: 0.5, value: o.wmSize, def: 4, onInput: set('wmSize') }).el,
          UI.slider({ label: 'Opacity', min: 5, max: 100, value: o.wmOp, onInput: set('wmOp') }).el,
          UI.color({
            label: 'Color', value: o.wmColor, palette: false, onInput: set('wmColor'),
            grad: { on: o.wmGradOn, fresh: !o.wmGrad, value: o.wmGrad || U.gradDef(o.wmColor, '#6c5cff', 90), onMode: on => { if (!o.wmGrad) o.wmGrad = U.gradDef(o.wmColor, '#6c5cff', 90); set('wmGradOn')(on); }, onInput: set('wmGrad') },
          }).el,
        ], { toggle: { value: o.wm, onChange: set('wm') }, info: 'Drag the watermark in the preview with the mouse to place it. The position is relative to the photo size, so it lands in the same spot on every photo.' }),
        UI.section('Output', [
          UI.seg({ options: [['jpg', 'JPG'], ['png', 'PNG'], ['webp', 'WEBP']], value: o.fmt, onChange: set('fmt') }).el,
          UI.slider({ label: 'Quality', min: 10, max: 100, value: o.q, def: 90, onInput: set('q') }).el,
          sizeEl,
          h('div', { class: 'field' }, h('label', { class: 'fld-label' }, 'File Name Suffix'), h('input', { type: 'text', class: 'full', value: o.suffix, oninput: e => { o.suffix = e.target.value; } })),
        ]));
      refreshList();

      const run = async () => {
        if (!files.length) { UI.toast('Add photos first', 'warn'); return false; }
        const out = await App.saveMany();
        if (!out) return false;
        const bar = prog.firstChild;
        let done = 0, fail = 0;
        for (const f of files) {
          try {
            const src = await U.fileToCanvas(f);
            const c = process(src, o);
            const blob = await U.toBlob(c, MIME[o.fmt], o.q / 100);
            const name = f.name.replace(/\.[^.]+$/, '') + o.suffix + '.' + o.fmt;
            await out.write(name, blob);
          } catch (e) { console.error(e); fail++; }
          done++;
          bar.style.width = (done / files.length * 100) + '%';
          await U.nextFrame();
        }
        await out.end();
        UI.toast(fail ? App.t('{0} photos processed, {1} errors', done - fail, fail) : App.t('{0} photos processed', done), fail ? 'warn' : 'ok', 4000);
        return false;
      };
      UI.modal({
        title: 'Batch Editing', width: Math.min(1240, innerWidth - 40), sticky: true, cls: 'batch-modal',
        content: h('div', { class: 'bt-wrap' }, left, center, right),
        buttons: [{ label: 'Close', value: null }, { label: 'Process and Save All', primary: true, value: () => { run(); return false; } }],
      }).then(() => { for (const u of thumbs.values()) URL.revokeObjectURL(u); });
    },
  };
})();
