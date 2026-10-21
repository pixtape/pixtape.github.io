'use strict';
/* Pixtape - çekirdek: yardımcılar, belge/katman modeli, geçmiş, çizim motoru, görünüm */
(() => {
  const App = window.App = {
    doc: null,
    tools: {},
    toolOrder: [],
    tool: null,
    view: { zoom: 1, x: 0, y: 0 },
    preview: null,          // { layer, canvas } - araç önizlemesi
    strokePreview: null,    // { layer, canvas, alpha, op } - fırça darbesi önizlemesi
    cropAngle: 0,
    compare: false,
    showGrid: false,
    // ızgara (sağ tıkla ayarlanır): hücre sayısı ya da hücre boyutu (px), çizgi rengi, opaklık, yapışma
    grid: { mode: 'count', c: 3, r: 3, sx: 50, sy: 50, color: '#ffffff', op: 0.35, snap: true },
    guides: [],             // pembe hizalama çizgileri: ['v' | 'h', doküman koordinatı]
    brushCursor: null,      // { x, y, r } (ekran px)
    keys: {},
    layerRenderers: {},
    _ev: {},
  };

  /* Kalıcı kullanıcı ayarları (Ayarlar penceresi) */
  App.PREF_DEFAULTS = {
    snap: true,          // pembe hizalama çizgileri ve yapışma
    free: false,         // tamamen serbest mod: oran kilidi yok, Shift etkisiz
    rotStep: 15,         // Shift ile döndürürken açı adımı (derece)
    rotSnap: false,      // her zaman Shift basılıymış gibi adım adım döndür
    guideColor: '#ff3bd0',
    snapDist: 7,         // yapışma mesafesi (ekran px)
    histMax: 100,        // geçmişte tutulacak adım sayısı
    autosave: true,      // projeleri otomatik kaydet
    keepProjects: 0,     // saklanacak son proje sayısı (0: sınırsız, hiçbir proje kendiliğinden silinmez; sabitlenenler hariç)
    wheel: 'zoom',       // fare tekerleği: 'zoom' | 'pan'
    stageBg: 'auto',     // çalışma alanı rengi: 'auto' | 'dark' | 'gray' | 'light'
    uiScale: 100,        // arayüz ölçeği (%)
    motion: true,        // arayüz animasyonları (kapalıyken pencereler, menüler ve geçişler anında belirir)
    fastPreview: false,  // kaydırıcı sürüklenirken önizlemeyi yarım çözünürlükte hesapla (bazı filtreler o sırada farklı görünür)
    exportFmt: 'auto',   // varsayılan kaydetme biçimi
    exportQ: 90,
    confirmClose: true,  // kaydedilmemiş sekmeyi kapatırken sor
    toolOrder: null,     // araç simgelerinin sırası
    dock: null,          // panel düzeni (bkz. layout.js)
    nudge: 1, nudgeBig: 10,   // ok tuşlarıyla kaydırma (px); Shift ile büyük adım
    textColor: '#000000', textFont: 'Segoe UI', textBold: true,   // yeni metinlerin varsayılanları
    drawColor: '#ff3b30', shapeColor: '#6c5cff',                  // çizim ve şekil rengi
    newW: 1920, newH: 1080,   // "Yeni oluştur" penceresindeki boyut
    xformSpace: 'local', // boyutlandırma ekseni: 'local' (nesneye göre) | 'world' (tuvale göre)
    xformPivot: 'edge',  // sabit nokta: 'edge' (karşı kenar/köşe) | 'center' (merkez)
    keys: null,          // kullanıcının değiştirdiği kısayollar { eylem: 'Ctrl+K' }
  };
  App.prefs = { ...App.PREF_DEFAULTS };
  try { Object.assign(App.prefs, JSON.parse(localStorage.getItem('pixtape-prefs')) || {}); } catch (e) { /* */ }
  // eski varsayılan (40) adım sayısı yeni varsayılana (100) çıkarılır; bir kez yapılır
  if (!App.prefs.hist100) { if (App.prefs.histMax === 40) App.prefs.histMax = 100; App.prefs.hist100 = true; }
  App.setPref = (k, v) => {
    App.prefs[k] = v;
    try { localStorage.setItem('pixtape-prefs', JSON.stringify(App.prefs)); } catch (e) { /* */ }
    App.emit('prefs', k, v);
    if (k === 'motion') App.applyMotion();
  };
  // Animasyonlar kapalıysa (Ayarlar ya da sistemde "animasyonları azalt") arayüz anında değişir
  App.motion = () => App.prefs.motion !== false && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  App.scrollBehavior = () => (App.motion() ? 'smooth' : 'auto');
  App.applyMotion = () => {
    const root = document.documentElement, off = App.prefs.motion === false, was = root.classList.contains('no-motion');
    root.classList.toggle('no-motion', off);
    // Yeniden açılınca ekrandaki pencerelerin açılış animasyonu baştan oynamasın
    if (was && !off && document.getAnimations) {
      for (const a of document.getAnimations()) {
        try { if (a.effect && a.effect.getComputedTiming().iterations !== Infinity) a.finish(); } catch (_) {}
      }
    }
  };
  App.applyMotion();

  // Çeviri: i18n.js etkin dile göre değiştirir; {0}, {1} yer tutucularını doldurur
  App.fmt = (s, a) => (a && a.length ? String(s).replace(/\{(\d+)\}/g, (m, i) => (a[i] == null ? m : a[i])) : s);
  App.t = (s, ...a) => App.fmt(s, a);
  App.on = (e, f) => (App._ev[e] = App._ev[e] || []).push(f);
  App.emit = (e, ...a) => (App._ev[e] || []).forEach(f => { try { f(...a); } catch (err) { console.error(err); } });

  /* ---------------------------------------------------------------- yardımcılar */
  const U = App.U = {
    clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
    lerp: (a, b, t) => a + (b - a) * t,
    smooth: (a, b, x) => { const t = U.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); },
    uid: () => Math.random().toString(36).slice(2, 10),
    canvas(w, h) {
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(w));
      c.height = Math.max(1, Math.round(h));
      return c;
    },
    clone(src) {
      const c = U.canvas(src.width, src.height);
      c.getContext('2d').drawImage(src, 0, 0);
      return c;
    },
    getData(c) { return c.getContext('2d').getImageData(0, 0, c.width, c.height); },
    // Yazı tipi bu cihazda yüklü mü: metin, yazı tipi yoksa kullanılacak genel yazı tipleriyle aynı genişlikte çıkıyorsa yoktur
    hasFont(name) {
      const m = U._fontM || (U._fontM = { x: document.createElement('canvas').getContext('2d'), memo: new Map() });
      if (m.memo.has(name)) return m.memo.get(name);
      const s = 'mmmmmmmmmmlli WWW 0123 ğşİ', w = f => { m.x.font = '72px ' + f; return m.x.measureText(s).width; };
      const r = ['monospace', 'serif', 'sans-serif'].some(g => w(`"${name}", ${g}`) !== w(g));
      m.memo.set(name, r);
      return r;
    },
    fromData(d) {
      const c = U.canvas(d.width, d.height);
      c.getContext('2d').putImageData(d, 0, 0);
      return c;
    },
    // Yüksek kaliteli (çok adımlı) ölçekleme
    scaled(src, w, h) {
      w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
      let cur = src, cw = src.width, ch = src.height;
      while (cw / 2 > w && ch / 2 > h) {
        cw = Math.round(cw / 2); ch = Math.round(ch / 2);
        const t = U.canvas(cw, ch), x = t.getContext('2d');
        x.imageSmoothingQuality = 'high';
        x.drawImage(cur, 0, 0, cw, ch);
        cur = t;
      }
      const out = U.canvas(w, h), o = out.getContext('2d');
      o.imageSmoothingQuality = 'high';
      o.drawImage(cur, 0, 0, w, h);
      return out;
    },
    fit(src, maxSide) {
      const s = Math.min(1, maxSide / Math.max(src.width, src.height));
      return s >= 1 ? src : U.scaled(src, src.width * s, src.height * s);
    },
    async fileToCanvas(file) {
      try {
        const bmp = await createImageBitmap(file);
        const c = U.canvas(bmp.width, bmp.height);
        c.getContext('2d').drawImage(bmp, 0, 0);
        bmp.close && bmp.close();
        return c;
      } catch (e) {
        return U.urlToCanvas(URL.createObjectURL(file), true);
      }
    },
    urlToCanvas(url, revoke) {
      return new Promise((res, rej) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          const w = img.naturalWidth || 800, h = img.naturalHeight || 600;
          const c = U.canvas(w, h);
          c.getContext('2d').drawImage(img, 0, 0, w, h);
          if (revoke) URL.revokeObjectURL(url);
          res(c);
        };
        img.onerror = () => rej(new Error('Image could not be loaded'));
        img.src = url;
      });
    },
    toBlob(c, type = 'image/png', q = 0.92) {
      return new Promise(r => c.toBlob(b => r(b), type, q));
    },
    debounce(fn, ms) {
      let t;
      return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
    },
    hex2rgb(h) {
      h = (h || '#000').replace('#', '');
      if (h.length === 3) h = h.split('').map(x => x + x).join('');
      const n = parseInt(h.slice(0, 6), 16) || 0;
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    },
    rgb2hex: (r, g, b) => '#' + [r, g, b].map(v => U.clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join(''),
    rgba(hex, a) { const [r, g, b] = U.hex2rgb(hex); return `rgba(${r},${g},${b},${a})`; },
    rgb2hsl(r, g, b) {
      r /= 255; g /= 255; b /= 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
      let h = 0, s = 0;
      if (mx !== mn) {
        const d = mx - mn;
        s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
        if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
        else if (mx === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h *= 60;
      }
      return [h, s, l];
    },
    hsl2rgb(h, s, l) {
      h = ((h % 360) + 360) % 360 / 360;
      if (s === 0) return [l * 255, l * 255, l * 255];
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
      const f = t => {
        if (t < 0) t += 1; if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };
      return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
    },
    // Tohumlu rastgele sayı üretici
    rng(seed) {
      let a = seed >>> 0 || 1;
      return () => {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    },
    fmtBytes(n) {
      if (n < 1024) return n + ' B';
      if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
      return (n / 1048576).toFixed(2) + ' MB';
    },
    h(tag, props, ...kids) {
      const el = document.createElement(tag);
      if (props) for (const k in props) {
        const v = props[k];
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k === 'html') el.innerHTML = v;
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected') el[k] = v;
        else el.setAttribute(k, v === true ? '' : v);
      }
      for (const kid of kids.flat(Infinity)) {
        if (kid == null || kid === false) continue;
        el.appendChild(typeof kid === 'string' || typeof kid === 'number' ? document.createTextNode(String(kid)) : kid);
      }
      return el;
    },
    nextFrame: () => new Promise(r => { requestAnimationFrame(() => requestAnimationFrame(r)); setTimeout(r, 80); }),
    dist: (a, b) => Math.hypot(a.x - b.x, a.y - b.y),

    /* degrade: { type: 'linear' | 'radial', angle (derece, 0 = yukarı, 90 = sağa), stops: [{ p: 0..1, c: '#rrggbb', a: 0..1 }] } */
    gradDef: (c1 = '#ffffff', c2 = '#000000', angle = 90) => ({ type: 'linear', angle, stops: [{ p: 0, c: c1, a: 1 }, { p: 1, c: c2, a: 1 }] }),
    gradStops: g => g.stops.slice().sort((a, b) => a.p - b.p),
    gradCSS(g) {
      const st = U.gradStops(g).map(s => `${U.rgba(s.c, s.a == null ? 1 : s.a)} ${(s.p * 100).toFixed(1)}%`).join(', ');
      return g.type === 'radial' ? `radial-gradient(circle, ${st})` : `linear-gradient(${g.angle || 0}deg, ${st})`;
    },
    // Bir kutuyu (x, y, w, h) kaplayan tuval degradesi
    gradFill(ctx, g, x, y, w, h) {
      const cx = x + w / 2, cy = y + h / 2;
      let gr;
      if (g.type === 'radial') gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(1, Math.hypot(w, h) / 2));
      else {
        const a = (g.angle || 0) * Math.PI / 180, dx = Math.sin(a), dy = -Math.cos(a);
        const L = Math.max(0.5, (Math.abs(w * dx) + Math.abs(h * dy)) / 2);
        gr = ctx.createLinearGradient(cx - dx * L, cy - dy * L, cx + dx * L, cy + dy * L);
      }
      for (const s of U.gradStops(g)) gr.addColorStop(U.clamp(s.p, 0, 1), U.rgba(s.c, s.a == null ? 1 : s.a));
      return gr;
    },
  };

  /* ---------------------------------------------------------------- katmanlar */
  App.newLayer = (canvas, props = {}) => {
    const L = Object.assign({
      id: U.uid(), name: 'Layer', type: 'raster', canvas,
      x: canvas.width / 2, y: canvas.height / 2, sx: 1, sy: 1, rot: 0,
      flipX: false, flipY: false, opacity: 1, blend: 'source-over',
      visible: true, locked: false, shadow: null,
    }, props);
    L.name = App.t(L.name);
    return L;
  };

  const DEEP = ['text', 'shape', 'shadow', 'frame', 'overlay'];
  App.cloneLayer = L => {
    const o = { ...L };
    for (const k of DEEP) if (o[k]) o[k] = JSON.parse(JSON.stringify(o[k]));
    if (o.children) o.children = o.children.map(App.cloneLayer); // grubun içindeki katmanlar
    return o;
  };

  App.activeLayer = () => {
    const d = App.doc;
    return d ? d.layers.find(l => l.id === d.active) || null : null;
  };
  App.layerById = id => App.doc && App.doc.layers.find(l => l.id === id);

  // record: seçim değişikliği geri alma adımı olarak saklanır (Ctrl+Z önce seçimi geri getirir)
  App.setActive = (id, record = true) => {
    if (!App.doc) return;
    if (record && (id || null) !== (App.doc.active || null)) App.history.selStep(App.doc.active || null, id || null);
    App.doc.active = id;
    App.emit('active');
    if (record) App.emit('picked', id); // kullanıcı seçti (geri alma ya da program değil)
    App.requestRender();
  };

  App.layerName = base => {
    const names = new Set(App.doc.layers.map(l => l.name));
    if (!names.has(base)) return base;
    let i = 2;
    while (names.has(base + ' ' + i)) i++;
    return base + ' ' + i;
  };

  App.addLayer = (L, opt = {}) => {
    const d = App.doc;
    if (opt.name !== false && L.name) L.name = App.layerName(L.name);
    let idx = opt.index;
    if (idx == null) {
      const a = d.layers.findIndex(l => l.id === d.active);
      idx = a >= 0 ? a + 1 : d.layers.length;
    }
    d.layers.splice(idx, 0, L);
    if (opt.select !== false) d.active = L.id;
    App.emit('doc');
    App.requestRender();
    return L;
  };

  App.removeLayer = id => {
    const d = App.doc, i = d.layers.findIndex(l => l.id === id);
    if (i < 0) return;
    d.layers.splice(i, 1);
    if (d.active === id) d.active = d.layers.length ? d.layers[Math.max(0, i - 1)].id : null;
    App.emit('doc');
    App.requestRender();
  };

  App.moveLayer = (id, to) => {
    const d = App.doc, i = d.layers.findIndex(l => l.id === id);
    if (i < 0) return;
    to = U.clamp(to, 0, d.layers.length - 1);
    if (to === i) return;
    const [L] = d.layers.splice(i, 1);
    d.layers.splice(to, 0, L);
    App.emit('doc');
    App.requestRender();
  };

  App.duplicateLayer = L => {
    const c = App.cloneLayer(L);
    c.id = U.uid();
    c.canvas = U.clone(L.canvas);
    c.name = L.name + ' copy'; // veri İngilizce; ekranda seçili dile çevrilir
    if (L.type !== 'raster' && L.canvas.width > 1) { c.x += 20; c.y += 20; }
    App.addLayer(c);
    return c;
  };

  App.refreshLayer = L => {
    const r = App.layerRenderers[L.type];
    if (r) r(L);
    App.requestRender();
  };

  App.rasterize = L => {
    if (L.type === 'raster') return;
    L.type = 'raster';
    delete L.text; delete L.shape; delete L.frame; delete L.overlay; delete L.children; delete L._k;
    App.emit('doc');
  };

  // Piksel düzenleyen araçlar için: aktif katmanı raster olarak döndürür (gerekirse sorar)
  App.pixelLayer = async (quiet) => {
    const L = App.activeLayer();
    if (!L) { if (!quiet) App.ui.toast('Select a layer first', 'warn'); return null; }
    if (!L.visible) { if (!quiet) App.ui.toast('The selected layer is hidden', 'warn'); }
    if (L.type !== 'raster') {
      const ok = await App.ui.confirm(L.type === 'text' ? 'This is a text layer. Rasterize it for pixel editing?' : 'This is a vector layer. Rasterize it for pixel editing?', 'Rasterize');
      if (!ok) return null;
      App.rasterize(L);
      App.commit('Rasterize');
    }
    return L;
  };

  /* ---------------------------------------------------------------- dönüşümler */
  // L._world: "Tuvale göre" boyutlandırırken geçici, tuval eksenlerinde ölçek (bırakınca katmana işlenir)
  const worldPre = L => {
    const w = L._world;
    return w ? new DOMMatrix().translate(w.ax, w.ay).scale(w.kx, w.ky).translate(-w.ax, -w.ay) : new DOMMatrix();
  };
  App.layerMatrix = L => worldPre(L)
    .translate(L.x, L.y)
    .rotate(L.rot)
    .multiply(new DOMMatrix([1, 0, L.skew || 0, 1, 0, 0]))
    .scale((L.flipX ? -1 : 1) * L.sx, (L.flipY ? -1 : 1) * L.sy)
    .translate(-L.canvas.width / 2, -L.canvas.height / 2);

  App.docToLayer = (L, x, y) => {
    const p = App.layerMatrix(L).inverse().transformPoint(new DOMPoint(x, y));
    return { x: p.x, y: p.y };
  };
  App.layerToDoc = (L, x, y) => {
    const p = App.layerMatrix(L).transformPoint(new DOMPoint(x, y));
    return { x: p.x, y: p.y };
  };
  App.layerCorners = L => {
    const w = L.canvas.width, h = L.canvas.height;
    return [[0, 0], [w, 0], [w, h], [0, h]].map(([x, y]) => App.layerToDoc(L, x, y));
  };
  // Katmanın doküman birimindeki ölçeği (fırça boyutunu katman pikseline çevirmek için)
  App.layerScale = L => Math.abs(L.sx * L.sy) ** 0.5 || 1;

  // ok verilirse yalnızca onu sağlayan katmanlar sayılır (ör. kilitliler atlanır, alttaki katman seçilir)
  App.hitLayer = (x, y, ok) => {
    const d = App.doc;
    for (let i = d.layers.length - 1; i >= 0; i--) {
      const L = d.layers[i];
      if (!L.visible || (ok && !ok(L))) continue;
      const p = App.docToLayer(L, x, y);
      if (p.x < 0 || p.y < 0 || p.x >= L.canvas.width || p.y >= L.canvas.height) continue;
      try {
        const a = L.canvas.getContext('2d').getImageData(p.x | 0, p.y | 0, 1, 1).data[3];
        if (a > 8) return L;
      } catch (e) { return L; }
    }
    return null;
  };
  /* Tuvalde tıklanarak seçilecek katman. Tuvalin tamamını kaplayan en alttaki katman (arka plan, açılan fotoğraf)
     "boş yer" sayılır: üzerine tıklamak seçimi kaldırır. Katmanlar panelinden seçilmişse tuvalde de tutulup taşınabilir. */
  App.isBackdrop = L => {
    const d = App.doc;
    if (!d || L !== d.layers[0] || d.layers.length < 2) return false;
    const b = App.layerAABB(L);
    return b.x0 <= 1 && b.y0 <= 1 && b.x1 >= d.w - 1 && b.y1 >= d.h - 1;
  };
  App.pickLayer = (x, y, ok) => {
    const L = App.hitLayer(x, y, ok);
    return L && App.isBackdrop(L) && L.id !== App.doc.active ? null : L;
  };

  /* ---------------------------------------------------------------- hizalama kılavuzları (pembe çizgiler) */
  // Katmanın doküman üzerindeki eksene hizalı sınır kutusu
  App.layerAABB = L => {
    const pts = App.layerCorners(L), xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  };
  /* Katmanın görünen (saydam olmayan) kısmının sınır kutusu. Katman tuvalinde çoğu zaman boş kenar payı olur
     (ör. ok ucunun payı, döndürülmüş çizgi); hizalama bu boşluğa değil görünen kenara yapılmalı.
     Her satırın en sol ve en sağ dolu pikseli bir kez bulunur, katman konumu değişince yalnızca dönüşüm yeniden hesaplanır. */
  // Andrew'un tekdüze zincir algoritması: noktaların dışbükey zarfı
  const convexHull = pts => {
    if (pts.length < 4) return pts;
    const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
    for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
    lo.pop(); up.pop();
    return lo.concat(up);
  };
  const hulls = new WeakMap();
  let hullGen = 0;
  App.on('history', () => { hullGen++; });
  const hullOf = c => {
    let e = hulls.get(c);
    if (e && e.gen === hullGen) return e;
    const W = c.width, H = c.height, s = Math.min(1, Math.sqrt(1e6 / (W * H)));
    const w = Math.max(1, Math.round(W * s)), h = Math.max(1, Math.round(H * s));
    let src = c;
    if (s < 1) { src = U.canvas(w, h); src.getContext('2d').drawImage(c, 0, 0, w, h); }
    let pts = [];
    try {
      const d = src.getContext('2d').getImageData(0, 0, w, h).data, kx = W / w, ky = H / h;
      for (let y = 0; y < h; y++) {
        let a = -1, b = -1;
        for (let x = 0, i = y * w * 4 + 3; x < w; x++, i += 4) if (d[i] > 8) { if (a < 0) a = x; b = x; }
        if (a >= 0) pts.push([a * kx, y * ky], [a * kx, (y + 1) * ky], [(b + 1) * kx, y * ky], [(b + 1) * kx, (y + 1) * ky]);
      }
    } catch (err) { pts = [[0, 0], [W, 0], [W, H], [0, H]]; }
    // Dönüşmüş sınır kutusu için dışbükey zarfın köşeleri yeterli: binlerce nokta yerine birkaç nokta
    // (taşırken her fare hareketinde yeniden hesaplandığı için önemli; dolu bir katman 4 köşeye iner)
    e = { gen: hullGen, pts: convexHull(pts), tf: '', box: null };
    hulls.set(c, e);
    return e;
  };
  // Bir değişiklikten sonra katmanların görünen sınırları boşta kalınan anda önceden hesaplanır; yoksa ilk taşımada
  // (hizalama için) büyük bir arka plan resmi baştan taranır ve sürükleme ilk anda takılır
  let hullWarm = 0;
  App.on('history', () => {
    const idle = window.requestIdleCallback || (f => setTimeout(f, 200));
    const run = ++hullWarm;
    idle(() => {
      const d = App.doc;
      if (!d || run !== hullWarm || App.pointerDown) return;
      for (const L of d.layers) if (L.type !== 'text' && L.visible && L.canvas && L.canvas.width) hullOf(L.canvas);
    }, { timeout: 1500 });
  });
  App.contentAABB = L => {
    if (L.type === 'text' || !L.canvas.width || !L.canvas.height) return App.layerAABB(L);
    const e = hullOf(L.canvas);
    if (!e.pts.length) return null;
    const w = L._world, tf = [L.x, L.y, L.rot, L.sx, L.sy, L.flipX, L.flipY, L.skew, w && [w.ax, w.ay, w.kx, w.ky]].join();
    if (e.tf !== tf) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [x, y] of e.pts) {
        const q = App.layerToDoc(L, x, y);
        if (q.x < x0) x0 = q.x; if (q.x > x1) x1 = q.x; if (q.y < y0) y0 = q.y; if (q.y > y1) y1 = q.y;
      }
      e.tf = tf; e.box = { x0, y0, x1, y1 };
    }
    return e.box;
  };
  // Yakalama hedefleri: tuval kenarları/merkezi ve diğer katmanların kenarları/merkezleri
  App.snapTargets = skip => {
    const d = App.doc, xs = [0, d.w / 2, d.w], ys = [0, d.h / 2, d.h];
    // ızgara açıkken nesneler ızgara çizgilerine de yapışır (ör. üçte bir kuralına göre yerleştirmek için)
    if (App.showGrid && App.grid.snap !== false) {
      const g = App.gridLines(d);
      xs.push(...g.xs); ys.push(...g.ys);
    }
    for (const L of d.layers) {
      if (!L.visible || L === skip || (App.snapSkip && App.snapSkip.has(L)) || L.type === 'frame' || L.type === 'overlay') continue;
      const b = App.contentAABB(L);
      if (!b) continue; // boş katman
      if (b.x1 - b.x0 >= d.w * 0.98 && b.y1 - b.y0 >= d.h * 0.98) continue; // tuvali kaplayan katman zaten tuvalle aynı
      xs.push(b.x0, (b.x0 + b.x1) / 2, b.x1);
      ys.push(b.y0, (b.y0 + b.y1) / 2, b.y1);
      // diğer katmanın kutusu (görünen kısmından farklıysa) da hedeftir
      if (L.type !== 'text' && L.type !== 'raster') {
        const k = App.layerAABB(L);
        if (Math.abs(k.x0 - b.x0) > 0.5 || Math.abs(k.x1 - b.x1) > 0.5) xs.push(k.x0, k.x1);
        if (Math.abs(k.y0 - b.y0) > 0.5 || Math.abs(k.y1 - b.y1) > 0.5) ys.push(k.y0, k.y1);
      }
    }
    return { xs, ys };
  };
  // Verilen x / y değerlerinden hedefe en yakın olanı bulur; kaydırma miktarını döndürür ve kılavuzları ayarlar
  // Hizalama açık mı: Ctrl ya da Alt basılıyken ayar o an için tersine döner (açıksa kapanır, kapalıysa açılır).
  // Bütün araçlarda (taşıma, boyutlandırma, döndürme, şekil çizme) aynı kural geçerlidir.
  App.snapOn = e => !!App.prefs.snap !== !!(e && (e.ctrlKey || e.metaKey || e.altKey));
  App.snap = (xv, yv, skip, e) => {
    App.guides = [];
    if (!App.doc || !App.snapOn(e)) return { dx: 0, dy: 0 };
    const th = (App.prefs.snapDist || 7) / App.view.zoom, T = App.snapTargets(skip);
    const best = (vals, targets) => {
      let b = null;
      for (const v of vals) for (const t of targets) {
        const dd = t - v;
        if (Math.abs(dd) < th && (!b || Math.abs(dd) < Math.abs(b.d) - 1e-6)) b = { d: dd, t };
      }
      return b;
    };
    const bx = xv && xv.length ? best(xv, T.xs) : null, by = yv && yv.length ? best(yv, T.ys) : null;
    if (bx) App.guides.push(['v', bx.t]);
    if (by) App.guides.push(['h', by.t]);
    return { dx: bx ? bx.d : 0, dy: by ? by.d : 0 };
  };
  // Katmanı (nx, ny) merkezine taşırken kenar ve merkezleri hizala
  App.snapMove = (L, nx, ny, e) => {
    // görünen kısmın kenarları ve ortası hizalanır (katman merkezine göre konumları)
    // Katmanın kutusunun (tutamaçların durduğu çerçeve) kenarları da hizalanır; hangisi yakınsa o yapışır
    const xs = [], ys = [];
    for (const b of [App.contentAABB(L), App.layerAABB(L)]) {
      if (!b) continue;
      const l = b.x0 - L.x, r = b.x1 - L.x, t = b.y0 - L.y, bt = b.y1 - L.y;
      xs.push(nx + l, nx + (l + r) / 2, nx + r); ys.push(ny + t, ny + (t + bt) / 2, ny + bt);
    }
    const s = App.snap(xs, ys, L, e);
    return { x: nx + s.dx, y: ny + s.dy };
  };
  App.snapPoint = (x, y, skip, e) => {
    const s = App.snap([x], [y], skip, e);
    return { x: x + s.dx, y: y + s.dy };
  };
  /* Şekil çizerken başlangıç noktası: imleç bir hizalama çizgisine yakınsa oradan başlar.
     Fare tuvalde gezerken yapışacağı çizgi ve nokta önceden gösterilir. Ctrl / Alt hizalamayı o an için tersine çevirir. */
  App.snapStart = (p, e) => {
    const q = App.snapPoint(p.x, p.y, null, e);
    App.snapDot = App.guides.length ? q : null;
    return q;
  };
  // Şekil sürüklenirken bitiş noktası
  App.snapEnd = (p, skip, e) => App.snapPoint(p.x, p.y, skip, e);
  App.hoverSnap = (p, e) => {
    const had = App.guides.length || App.snapDot;
    App.snapStart(p, e);
    if (had || App.guides.length) App.requestRender();
  };
  App.clearSnap = () => { if (App.guides.length || App.snapDot) { App.guides = []; App.snapDot = null; App.requestRender(); } };

  /* ---------------------------------------------------------------- belge */
  App.newDoc = ({ w, h, name = App.t('Untitled'), bg = '#ffffff', layers, label = 'New Document', id, paper = null }) => {
    if (App.tool && App.tool.cancel) try { App.tool.cancel(); } catch (e) { /* */ }
    App.preview = null; App.strokePreview = null; App.cropAngle = 0;
    const d = App.doc = { id: id || U.uid(), w: Math.round(w), h: Math.round(h), name, layers: [], active: null, created: Date.now(), bg: paper };
    if (layers) d.layers = layers;
    else {
      const c = U.canvas(w, h);
      // bg: renk ya da degrade
      if (bg && bg !== 'transparent') { const x = c.getContext('2d'); x.fillStyle = typeof bg === 'object' ? U.gradFill(x, bg, 0, 0, w, h) : bg; x.fillRect(0, 0, w, h); }
      d.layers.push(App.newLayer(c, { name: 'Background' }));
    }
    d.active = d.layers.length ? d.layers[d.layers.length - 1].id : null;
    App.history.reset(label);
    App.emit('docopen');
    App.emit('doc');
    App.resizeView();
    App.fit('limit');
    return d;
  };

  App.openCanvas = (canvas, name) => App.newDoc({
    w: canvas.width, h: canvas.height, name: name || 'Image',
    layers: [App.newLayer(canvas, { name: 'Background' })], label: 'Open',
  });

  App.closeDoc = () => {
    if (App.tool && App.tool.cancel) try { App.tool.cancel(); } catch (e) { /* */ }
    App.doc = null;
    App.preview = null;
    App.history.stack = []; App.history.index = -1;
    App.emit('docclose');
  };

  // Belgedeki tüm katmanları bir dönüşümle güncelle
  App.rotateDoc = deg => {
    const d = App.doc, cx = d.w / 2, cy = d.h / 2;
    const nw = deg % 180 ? d.h : d.w, nh = deg % 180 ? d.w : d.h;
    const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    for (const L of d.layers) {
      const dx = L.x - cx, dy = L.y - cy;
      L.x = nw / 2 + dx * c - dy * s;
      L.y = nh / 2 + dx * s + dy * c;
      L.rot = L.rot + deg;
    }
    d.w = nw; d.h = nh;
  };

  App.flipDoc = axis => {
    const d = App.doc;
    for (const L of d.layers) {
      if (axis === 'h') { L.x = d.w - L.x; L.flipX = !L.flipX; }
      else { L.y = d.h - L.y; L.flipY = !L.flipY; }
      L.rot = -L.rot;
      if (L.skew) L.skew = -L.skew;
    }
  };

  App.cropDoc = (x, y, w, h, angleDeg = 0) => {
    const d = App.doc;
    if (angleDeg) {
      const a = angleDeg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), cx = d.w / 2, cy = d.h / 2;
      for (const L of d.layers) {
        const dx = L.x - cx, dy = L.y - cy;
        L.x = cx + dx * c - dy * s;
        L.y = cy + dx * s + dy * c;
        L.rot += angleDeg;
      }
    }
    for (const L of d.layers) { L.x -= x; L.y -= y; }
    d.w = Math.max(1, Math.round(w)); d.h = Math.max(1, Math.round(h));
    App.bakeAll();
  };

  App.canvasSize = (w, h, ax = 0.5, ay = 0.5, fill) => {
    const d = App.doc, dx = (w - d.w) * ax, dy = (h - d.h) * ay;
    for (const L of d.layers) { L.x += dx; L.y += dy; }
    d.w = Math.round(w); d.h = Math.round(h);
    if (fill && fill !== 'transparent') {
      const c = U.canvas(d.w, d.h), x = c.getContext('2d');
      x.fillStyle = fill; x.fillRect(0, 0, d.w, d.h);
      d.layers.unshift(App.newLayer(c, { name: App.layerName('Base') }));
    }
  };

  App.resizeDoc = (w, h) => {
    const d = App.doc, fx = w / d.w, fy = h / d.h;
    for (const L of d.layers) {
      L.x *= fx; L.y *= fy;
      if (L.type === 'text' && L.text) { L.text.size *= Math.sqrt(fx * fy); App.refreshLayer(L); }
      else if (L.type === 'shape' && L.shape) { L.shape.w *= fx; L.shape.h *= fy; App.refreshLayer(L); }
      else { L.sx *= fx; L.sy *= fy; }
    }
    d.w = Math.max(1, Math.round(w)); d.h = Math.max(1, Math.round(h));
    for (const L of d.layers) if (L.type === 'frame' || L.type === 'overlay') App.refreshLayer(L);
    App.bakeAll();
  };

  // Raster katmanın ölçeğini piksellere işle (yeniden örnekle)
  App.bakeScale = L => {
    if (L.type !== 'raster') return;
    const sx = Math.abs(L.sx), sy = Math.abs(L.sy);
    if (Math.abs(sx - 1) < 1e-3 && Math.abs(sy - 1) < 1e-3) return;
    const nw = Math.max(1, Math.round(L.canvas.width * sx)), nh = Math.max(1, Math.round(L.canvas.height * sy));
    if (nw * nh > 64e6) return; // aşırı büyükse ölçekli bırak
    L.canvas = U.scaled(L.canvas, nw, nh);
    L.sx = Math.sign(L.sx) || 1; L.sy = Math.sign(L.sy) || 1;
  };
  // Fırça boyutu kaydırıcılarının üst sınırı belge boyutuyla büyür (8K gibi büyük fotoğraflarda da yeterli olsun)
  App.brushMax = (base, div = 8) => {
    const d = App.doc;
    return d ? Math.max(base, Math.round(Math.max(d.w, d.h) / div / 10) * 10) : base;
  };
  // Katmanın tamamen saydam kenarlarını kırpar; katman görüntüde yerinden oynamaz (döndürülmüş olsa da)
  App.trimLayer = L => {
    const c = L.canvas, W = c.width, H = c.height, d = c.getContext('2d').getImageData(0, 0, W, H).data;
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) for (let x = 0, i = y * W * 4 + 3; x < W; x++, i += 4) {
      if (d[i] > 2) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 < 0 || (x0 === 0 && y0 === 0 && x1 === W - 1 && y1 === H - 1)) return;
    const nw = x1 - x0 + 1, nh = y1 - y0 + 1, n = U.canvas(nw, nh);
    n.getContext('2d').drawImage(c, -x0, -y0);
    const ctr = App.layerToDoc(L, x0 + nw / 2, y0 + nh / 2);
    L.canvas = n; L.x = ctr.x; L.y = ctr.y;
  };
  App.bakeAll = () => {
    for (const L of App.doc.layers) {
      App.bakeScale(L);
      if (L.type === 'frame' || L.type === 'overlay') App.refreshLayer(L);
    }
  };

  /* ---------------------------------------------------------------- birleştirme */
  // Belgenin arka plan rengi: düz renk (metin) ya da degrade (nesne); (0, 0, w, h) kutusunu doldurur
  App.fillPaper = (x, paper, w, h) => {
    x.fillStyle = typeof paper === 'object' ? U.gradFill(x, paper, 0, 0, w, h) : paper;
    x.fillRect(0, 0, w, h);
  };
  App.composite = (opt = {}) => {
    const d = App.doc, s = opt.scale || 1;
    const c = U.canvas(d.w * s, d.h * s), x = c.getContext('2d');
    if (opt.bg) { x.fillStyle = opt.bg; x.fillRect(0, 0, c.width, c.height); }
    // belgenin arka plan rengi (Katmanlar panelinin en altındaki satır); yalnızca tüm belge birleştirilirken
    const paper = opt.layers ? null : (opt.paper !== undefined ? opt.paper : d.bg);
    if (paper) App.fillPaper(x, paper, c.width, c.height);
    x.imageSmoothingQuality = 'high';
    x.scale(c.width / d.w, c.height / d.h);
    const layers = opt.layers || d.layers;
    for (const L of layers) if (L.visible || opt.hidden) App.drawLayer(x, L, s, !!opt.live);
    return c;
  };

  App.mergeDown = L => {
    const d = App.doc, i = d.layers.indexOf(L);
    if (i <= 0) return false;
    const below = d.layers[i - 1];
    const c = U.canvas(d.w, d.h), x = c.getContext('2d');
    x.imageSmoothingQuality = 'high';
    App.drawLayer(x, below, 1);
    App.drawLayer(x, L, 1);
    const M = App.newLayer(c, { name: below.name, visible: below.visible || L.visible });
    d.layers.splice(i - 1, 2, M);
    d.active = M.id;
    return true;
  };

  App.mergeVisible = () => {
    const d = App.doc, vis = d.layers.filter(l => l.visible);
    if (vis.length < 2) return false;
    const c = App.composite({ layers: vis });
    const idx = d.layers.indexOf(vis[0]);
    d.layers = d.layers.filter(l => !l.visible);
    const M = App.newLayer(c, { name: 'Merged' });
    d.layers.splice(Math.min(idx, d.layers.length), 0, M);
    d.active = M.id;
    return true;
  };

  // Seçili katmanları (sıralarını koruyarak) tek bir katmanda birleştir
  App.mergeLayers = ids => {
    const d = App.doc, sel = d.layers.filter(l => ids.includes(l.id));
    if (sel.length < 2) return false;
    const c = App.composite({ layers: sel, hidden: false });
    const top = d.layers.indexOf(sel[sel.length - 1]);
    const M = App.newLayer(c, { name: sel[sel.length - 1].name });
    d.layers.splice(top + 1, 0, M);
    d.layers = d.layers.filter(l => !sel.includes(l));
    d.active = M.id;
    return true;
  };

  App.flatten = () => {
    const d = App.doc;
    const c = App.composite();
    const M = App.newLayer(c, { name: 'Background' });
    d.layers = [M];
    d.bg = null; // arka plan rengi birleştirilen resme işlendi
    d.active = M.id;
  };

  /* ---------------------------------------------------------------- geçmiş */
  App.history = {
    stack: [], index: -1,
    get max() { return U.clamp(App.prefs.histMax || 100, 5, 500); },
    snapshot() {
      const d = App.doc;
      return { w: d.w, h: d.h, bg: d.bg || null, active: d.active, layers: d.layers.map(App.cloneLayer) };
    },
    reset(label) {
      this.stack = [{ label, state: this.snapshot(), time: Date.now() }];
      this.index = 0;
      App.emit('history');
    },
    // Seçim adımları, ardından gelen değişikliğe kadar geçerli olan geçmiş adımında tutulur (geçmiş panelinde görünmez)
    selStep(from, to) {
      const e = this.stack[this.index];
      if (!e) return;
      (e.sels = e.sels || []).push({ from, to });
      if (e.sels.length > 100) e.sels.shift();
      e.selRedo = null;
      if (App.ui && App.ui.syncUndo) App.ui.syncUndo();
    },
    // Seçim adımını geri al / yinele; yapılacak adım yoksa false
    selHist(redo) {
      const e = this.stack[this.index], d = App.doc;
      if (!e || !d) return false;
      const from = redo ? e.selRedo : e.sels, to = redo ? (e.sels = e.sels || []) : (e.selRedo = e.selRedo || []);
      const ok = id => !id || d.layers.some(l => l.id === id);
      while (from && from.length) {
        const s = from.pop(), id = redo ? s.to : s.from;
        to.push(s);
        // silinmiş nesneye ya da zaten seçili olana dönen adım atlanır
        if (!ok(id) || (id || null) === (d.active || null)) continue;
        d.active = id;
        App.emit('active');
        if (App.tool && App.tool.refresh) App.tool.refresh();
        App.requestRender();
        if (App.ui && App.ui.syncUndo) App.ui.syncUndo();
        return true;
      }
      return false;
    },
    push(label) {
      if (!App.doc) return;
      this.pendingRedo = null;
      if (this.stack[this.index]) this.stack[this.index].selRedo = null;
      this.stack.length = this.index + 1;
      this.stack.push({ label, state: this.snapshot(), time: Date.now() });
      // ilk durumu karşılaştırma için koru, aradakileri sil
      while (this.stack.length > this.max) this.stack.splice(1, 1);
      this.index = this.stack.length - 1;
      App.emit('history');
      App.emit('changed');
    },
    restore(state) {
      const d = App.doc;
      d.w = state.w; d.h = state.h; d.bg = state.bg || null;
      d.layers = state.layers.map(App.cloneLayer);
      d.active = state.active;
      App.preview = null; App.strokePreview = null;
      App.emit('doc');
      App.requestRender();
    },
    go(i) {
      if (i < 0 || i >= this.stack.length || i === this.index) return;
      if (App.tool && App.tool.cancel) try { App.tool.cancel(true); } catch (e) { /* */ }
      this.pendingRedo = null;
      this.index = i;
      this.restore(this.stack[i].state);
      // bu adımdan sonra yapılan seçim geri gelir (seçim adımları buradan sonra tek tek geri alınır)
      const ss = this.stack[i].sels, last = ss && ss.length ? ss[ss.length - 1].to : undefined;
      if (last !== undefined && (!last || App.doc.layers.some(l => l.id === last))) App.doc.active = last;
      App.emit('history');
      App.emit('changed');
      if (App.tool && App.tool.refresh) App.tool.refresh();
    },
    // Araçta uygulanmamış değişiklik varsa önce onu geri alır (yinelenebilir şekilde)
    undo() {
      const t = App.tool;
      if (t && t.localUndo && t.localUndo()) { App.emit('history'); return; }
      if (toolDirty()) {
        const st = t.pendingState ? t.pendingState() : null;
        App.cancelTool();
        this.pendingRedo = st ? { tool: t, st, index: this.index } : null;
        App.emit('history');
        return;
      }
      if (this.selHist(false)) return;
      this.go(this.index - 1);
    },
    redo() {
      const t = App.tool;
      if (t && t.localRedo && t.localRedo()) { App.emit('history'); return; }
      const pr = this.pendingRedo;
      if (pr && pr.tool === t && pr.index === this.index && !toolDirty()) {
        this.pendingRedo = null;
        t.restorePending(pr.st);
        App.emit('history');
        return;
      }
      if (this.selHist(true)) return;
      this.go(this.index + 1);
    },
    canUndo() { const e = this.stack[this.index]; return this.index > 0 || toolDirty() || !!(e && e.sels && e.sels.length) || !!(App.tool && App.tool.canLocalUndo && App.tool.canLocalUndo()); },
    canRedo() {
      const t = App.tool, pr = this.pendingRedo, e = this.stack[this.index];
      return this.index < this.stack.length - 1 || !!(e && e.selRedo && e.selRedo.length) || !!(t && t.canLocalRedo && t.canLocalRedo()) || !!(pr && pr.tool === t && pr.index === this.index);
    },
  };
  const toolDirty = () => !!(App.tool && App.tool.isDirty && App.tool.isDirty());

  App.commit = label => {
    App.history.push(label);
    App.emit('doc');
    App.requestRender();
  };

  /* ---------------------------------------------------------------- görüntüleme */
  const R = App.R = { pending: false, dpr: 1, cssW: 1, cssH: 1 };

  App.initView = (canvas, stage) => {
    R.canvas = canvas; R.stage = stage;
    R.ctx = canvas.getContext('2d');
    R.buf = document.createElement('canvas');
    R.tmp = document.createElement('canvas');
    const pc = U.canvas(16, 16), px = pc.getContext('2d');
    px.fillStyle = '#ffffff'; px.fillRect(0, 0, 16, 16);
    px.fillStyle = '#d6d9de'; px.fillRect(0, 0, 8, 8); px.fillRect(8, 8, 8, 8);
    R.checker = R.ctx.createPattern(pc, 'repeat');
    new ResizeObserver(() => { App.resizeView(); }).observe(stage);
    App.resizeView();
  };

  App.resizeView = () => {
    if (!R.stage) return;
    const r = R.stage.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const oldW = R.cssW, oldH = R.cssH;
    const cssW = Math.max(1, r.width), cssH = Math.max(1, r.height);
    if (cssW === oldW && cssH === oldH && dpr === R.dpr) return;
    R.dpr = dpr; R.cssW = cssW; R.cssH = cssH;
    R.canvas.width = Math.round(R.cssW * dpr); R.canvas.height = Math.round(R.cssH * dpr);
    R.canvas.style.width = R.cssW + 'px'; R.canvas.style.height = R.cssH + 'px';
    R.buf.width = R.canvas.width; R.buf.height = R.canvas.height;
    // görünümü merkezde tut
    App.view.x += (R.cssW - oldW) / 2; App.view.y += (R.cssH - oldH) / 2;
    // Boyut değişince tuval silinir; bir sonraki kareyi beklemeden hemen çiz (resim yanıp sönmesin)
    App.renderNow();
  };

  App.screenToDoc = (sx, sy) => ({ x: (sx - App.view.x) / App.view.zoom, y: (sy - App.view.y) / App.view.zoom });
  App.docToScreen = (x, y) => ({ x: x * App.view.zoom + App.view.x, y: y * App.view.zoom + App.view.y });

  App.setZoom = (z, cx, cy) => {
    const v = App.view;
    z = U.clamp(z, 0.02, 32);
    if (cx == null) { cx = R.cssW / 2; cy = R.cssH / 2; }
    const p = App.screenToDoc(cx, cy);
    v.zoom = z;
    v.x = cx - p.x * z; v.y = cy - p.y * z;
    App.emit('view');
    App.requestRender();
  };

  App.fit = mode => {
    const d = App.doc;
    if (!d) return;
    const pad = 36;
    let z = Math.min((R.cssW - pad * 2) / d.w, (R.cssH - pad * 2) / d.h);
    if (mode === 'limit') z = Math.min(z, 1);
    if (mode === 'fill') z = Math.max(R.cssW / d.w, R.cssH / d.h);
    if (mode === 'actual') z = 1;
    z = U.clamp(z, 0.02, 32);
    App.view.zoom = z;
    App.view.x = (R.cssW - d.w * z) / 2;
    App.view.y = (R.cssH - d.h * z) / 2;
    App.emit('view');
    App.requestRender();
  };

  App.requestRender = () => {
    if (R.pending) return;
    R.pending = true;
    requestAnimationFrame(App.renderNow);
  };

  /* Küçültülmüş kopyalar: uzaklaştırılmış görünümde büyük bir katmanı her karede baştan küçültmek pahalıdır.
     Katmanın yarıya, dörtte bire... küçültülmüş hâli bir kez yüksek kalitede hazırlanır ve ekrana bu çizilir
     (en fazla 2 kat küçültülerek çizildiği için görüntü kalitesi düşmez). Bir değişiklik kaydedilince yenilenir. */
  const mips = new WeakMap();
  let mipGen = 0;
  App.on('history', () => { mipGen++; });
  const mipFor = (c, k) => {
    if (k >= 0.5 || c.width * c.height < 300 * 300) return null;
    let lvl = 0.5;
    while (lvl / 2 >= k && lvl > 1 / 64) lvl /= 2;
    let e = mips.get(c);
    if (!e || e.gen !== mipGen) { e = { gen: mipGen, lv: {} }; mips.set(c, e); }
    if (e.lv[lvl]) return e.lv[lvl];
    // bir üst seviye varsa ondan, yoksa asıl görüntüden yarıya yarıya küçült
    let cur = c, s = 1;
    for (let q = 0.5; q > lvl; q /= 2) if (e.lv[q]) { cur = e.lv[q]; s = q; }
    while (s > lvl) {
      const n = U.canvas(Math.max(1, Math.round(cur.width / 2)), Math.max(1, Math.round(cur.height / 2))), x = n.getContext('2d');
      x.imageSmoothingQuality = 'high';
      x.drawImage(cur, 0, 0, n.width, n.height);
      cur = n; s /= 2;
      e.lv[s] = n;
    }
    return cur;
  };

  App.drawLayer = (ctx, L, pxScale = 1, live = false) => {
    const cw = L.canvas.width, ch = L.canvas.height;
    let src = L.canvas;
    if (live && App.preview && App.preview.layer === L && !App.peek) src = App.preview.canvas;
    // yalnızca ekrana çizerken; düzenlenmekte olan (fare basılıyken etkin) katman için kullanılmaz.
    // Taşırken pikseller değişmediği için küçültülmüş kopya kullanılabilir (büyük resim sürüklerken akıcı kalır).
    else if (live && !(App.pointerDown && L.id === App.doc.active && !(App.xform && App.xform.drag && App.xform.drag.mode === 'move'))) {
      const w = L._world, k = pxScale * Math.max(Math.abs(L.sx), Math.abs(L.sy)) * (w ? Math.max(Math.abs(w.kx), Math.abs(w.ky)) : 1);
      src = mipFor(L.canvas, k) || src;
    }
    ctx.save();
    ctx.globalAlpha = L.opacity;
    ctx.globalCompositeOperation = L.blend || 'source-over';
    if (L._world) { const w = L._world; ctx.translate(w.ax, w.ay); ctx.scale(w.kx, w.ky); ctx.translate(-w.ax, -w.ay); }
    ctx.translate(L.x, L.y);
    ctx.rotate(L.rot * Math.PI / 180);
    if (L.skew) ctx.transform(1, 0, L.skew, 1, 0, 0); // eğme (tuvale göre boyutlandırılmış döndürülmüş katman)
    ctx.scale((L.flipX ? -1 : 1) * L.sx, (L.flipY ? -1 : 1) * L.sy);
    const sh = L.shadow;
    // metin katmanları gölgelerini kendileri çizer (arka plan kutusu gölge üretmesin diye)
    if (sh && sh.on && L.type !== 'text') {
      ctx.shadowColor = U.rgba(sh.color || '#000000', sh.opacity == null ? 0.6 : sh.opacity);
      ctx.shadowBlur = (sh.blur || 0) * pxScale;
      ctx.shadowOffsetX = (sh.x || 0) * pxScale;
      ctx.shadowOffsetY = (sh.y || 0) * pxScale;
    }
    const sp = live && App.strokePreview;
    if (sp && sp.layer === L) {
      const t = R.tmp;
      if (t.width !== cw || t.height !== ch) { t.width = cw; t.height = ch; }
      const tx = t.getContext('2d');
      tx.globalCompositeOperation = 'source-over'; tx.globalAlpha = 1;
      tx.clearRect(0, 0, cw, ch);
      tx.drawImage(src, 0, 0, cw, ch);
      tx.globalAlpha = sp.alpha == null ? 1 : sp.alpha;
      tx.globalCompositeOperation = sp.op || 'source-over';
      tx.drawImage(sp.canvas, 0, 0);
      tx.globalAlpha = 1; tx.globalCompositeOperation = 'source-over';
      ctx.drawImage(t, -cw / 2, -ch / 2);
    } else {
      ctx.drawImage(src, -cw / 2, -ch / 2, cw, ch);
    }
    ctx.restore();
  };

  App.renderNow = () => {
    R.pending = false;
    const c = R.canvas, ctx = R.ctx, dpr = R.dpr, W = c.width, H = c.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const d = App.doc;
    if (!d) return;
    const v = App.view, z = v.zoom * dpr;
    /* Belge alanı ekran piksellerine oturtulur: kenarı bir pikselin ortasına denk gelirse tuvali kaplayan bir
       resmin kenar pikselleri yarı saydam çizilir ve arkadaki dama deseni ince açık bir çizgi olarak görünür. */
    const rx = Math.round(v.x * dpr), ry = Math.round(v.y * dpr);
    const rw = Math.max(1, Math.round(v.x * dpr + d.w * z) - rx), rh = Math.max(1, Math.round(v.y * dpr + d.h * z) - ry);
    const zx = rw / d.w, zy = rh / d.h;

    // gölge + dama deseni. Belgenin gölgesi boyutu değişmedikçe bir kez çizilip saklanır
    // (her karede büyük bir alanı bulanıklaştırmak taşırken ve kaydırırken gereksiz yük)
    const sb = 24 * dpr, sp = Math.ceil(sb * 2);
    if (rw + sp * 2 > 6000 || rh + sp * 2 > 6000) {
      // çok yakınlaştırılmışken (belge ekrandan çok büyük) doğrudan çizilir; dev bir ara tuval açılmaz
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = sb;
      ctx.fillStyle = '#ffffff'; ctx.fillRect(rx, ry, rw, rh);
      ctx.restore();
    } else {
      let shc = R.shadowCache;
      if (!shc || shc.w !== rw || shc.h !== rh || shc.dpr !== dpr) {
        const cv = U.canvas(rw + sp * 2, rh + sp * 2), sx = cv.getContext('2d');
        sx.shadowColor = 'rgba(0,0,0,.45)'; sx.shadowBlur = sb;
        sx.fillStyle = '#ffffff'; sx.fillRect(sp, sp, rw, rh);
        shc = R.shadowCache = { w: rw, h: rh, dpr, cv };
      }
      ctx.drawImage(shc.cv, rx - sp, ry - sp);
    }
    ctx.save();
    ctx.translate(rx, ry);
    ctx.fillStyle = R.checker;
    ctx.fillRect(0, 0, rw, rh);
    ctx.restore();

    // katmanlar ayrı tamponda (karışım modları doğru çalışsın diye)
    const b = R.buf, bx = b.getContext('2d');
    bx.setTransform(1, 0, 0, 1, 0, 0);
    bx.globalAlpha = 1; bx.globalCompositeOperation = 'source-over';
    bx.clearRect(0, 0, W, H);
    bx.save();
    bx.beginPath(); bx.rect(rx, ry, rw, rh); bx.clip();
    bx.setTransform(zx, 0, 0, zy, rx, ry);
    bx.imageSmoothingEnabled = v.zoom < 2;
    bx.imageSmoothingQuality = v.zoom < 0.5 ? 'medium' : 'high';
    if (App.cropAngle) {
      bx.translate(d.w / 2, d.h / 2);
      bx.rotate(App.cropAngle * Math.PI / 180);
      bx.translate(-d.w / 2, -d.h / 2);
    }
    const st0 = App.compare && App.history.stack[0] ? App.history.stack[0].state : null;
    const layers = st0 ? st0.layers : d.layers, paper = st0 ? st0.bg : d.bg;
    if (paper) { bx.save(); bx.setTransform(zx, 0, 0, zy, rx, ry); App.fillPaper(bx, paper, d.w, d.h); bx.restore(); }
    // ekranda görünmeyen (gizli, tamamen saydam ya da görünür alanın dışında kalan) katmanlar çizilmez
    const vx0 = -v.x / v.zoom, vy0 = -v.y / v.zoom, vx1 = (R.cssW - v.x) / v.zoom, vy1 = (R.cssH - v.y) / v.zoom;
    const onScreen = L => {
      if (App.cropAngle || L._world || L.skew) return true;
      const b = App.layerAABB(L), sh = L.shadow, m = sh && sh.on ? (sh.blur || 0) * 2 + Math.max(Math.abs(sh.x || 0), Math.abs(sh.y || 0)) : 0;
      return b.x1 + m >= vx0 && b.x0 - m <= vx1 && b.y1 + m >= vy0 && b.y0 - m <= vy1;
    };
    for (const L of layers) if (L.visible && L.opacity > 0 && onScreen(L)) App.drawLayer(bx, L, z, !App.compare);
    bx.restore();
    ctx.drawImage(b, 0, 0);

    // kaplamalar (ekran koordinatı)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (App.showGrid) drawGrid(ctx, d);
    if (App.tool && App.tool.drawOverlay && !App.compare) {
      ctx.save();
      try { App.tool.drawOverlay(ctx); } catch (e) { console.error(e); }
      ctx.restore();
    }
    if (App.guides.length && !App.compare) {
      ctx.save();
      ctx.strokeStyle = App.prefs.guideColor || '#ff3bd0'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (const [k, val] of App.guides) {
        if (k === 'v') { const s = Math.round(App.docToScreen(val, 0).x) + 0.5; ctx.moveTo(s, 0); ctx.lineTo(s, R.cssH); }
        else { const s = Math.round(App.docToScreen(0, val).y) + 0.5; ctx.moveTo(0, s); ctx.lineTo(R.cssW, s); }
      }
      ctx.stroke();
      // şekil çizmeden önce: başlangıcın yapışacağı nokta
      const sd = App.snapDot;
      if (sd) {
        const s = App.docToScreen(sd.x, sd.y);
        ctx.fillStyle = '#fff'; ctx.strokeStyle = App.prefs.guideColor || '#ff3bd0'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(s.x, s.y, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
      ctx.restore();
    }
    const bc = App.brushCursor;
    if (bc && !App.compare) {
      // boyut her çizimde güncel fırça boyutu ve yakınlaştırmadan hesaplanır: fare kıpırdamadan yakınlaştırılınca ya da
      // boyut değişince de yuvarlak gerçek boyutunu gösterir
      const bt = App.tool;
      if (bt && bt.brushSize && bt.brushSize() > 0) bc.r = bt.brushSize() / 2 * App.view.zoom;
      ctx.save();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(0,0,0,.7)';
      ctx.beginPath(); ctx.arc(bc.x, bc.y, Math.max(1, bc.r) + 1, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.95)';
      ctx.beginPath(); ctx.arc(bc.x, bc.y, Math.max(1, bc.r), 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(bc.x - 4, bc.y); ctx.lineTo(bc.x + 4, bc.y); ctx.moveTo(bc.x, bc.y - 4); ctx.lineTo(bc.x, bc.y + 4); ctx.stroke();
      ctx.restore();
    }
    if (App.compare) {
      ctx.font = '600 12px Segoe UI, sans-serif';
      const t = App.t('BEFORE');
      const tw = ctx.measureText(t).width + 16;
      ctx.fillStyle = 'rgba(0,0,0,.65)';
      ctx.fillRect(v.x + 10, v.y + 10, tw, 22);
      ctx.fillStyle = '#fff'; ctx.fillText(t, v.x + 18, v.y + 25);
    }
    App.emit('frame');
  };

  /* Izgara: belirli sayıda hücreye bölünür (mode 'count': c sütun, r satır) ya da sabit boyutlu hücrelerle
     (mode 'size': sx × sy piksel; ör. 50 px kareler) sol üstten başlayarak döşenir. */
  App.gridLines = d => {
    const g = App.grid || {}, xs = [], ys = [];
    if (g.mode === 'size') {
      const sx = Math.max(1, g.sx || 50), sy = Math.max(1, g.sy || sx);
      for (let x = sx; x < d.w - 1e-6; x += sx) xs.push(x);
      for (let y = sy; y < d.h - 1e-6; y += sy) ys.push(y);
    } else {
      const nc = g.c || 3, nr = g.r || 3;
      for (let i = 1; i < nc; i++) xs.push(d.w * i / nc);
      for (let i = 1; i < nr; i++) ys.push(d.h * i / nr);
    }
    return { xs, ys };
  };
  function drawGrid(ctx, d) {
    const a = App.docToScreen(0, 0), b = App.docToScreen(d.w, d.h), g = App.grid || {};
    const { xs, ys } = App.gridLines(d), z = App.view.zoom;
    ctx.save();
    ctx.lineWidth = 1;
    // sık ızgarada çizgiler uzaklaştıkça soluklaşır (görüntüyü örtmesin); ekranda çok sıklaşırsa aradan çizgi atlanır
    const spX = xs.length ? (xs[0]) * z : Infinity, spY = ys.length ? (ys[0]) * z : Infinity;
    const sp = Math.min(spX, spY);
    const kx = Math.max(1, Math.ceil(4 / spX)), ky = Math.max(1, Math.ceil(4 / spY));
    const op = g.op == null ? 0.35 : g.op;
    ctx.globalAlpha = U.clamp((sp - 2) / 10, 0.2, 1);
    const px = v => Math.round(v) + 0.5;
    ctx.beginPath();
    for (let i = kx - 1; i < xs.length; i += kx) { const x = px(a.x + xs[i] * z); ctx.moveTo(x, a.y); ctx.lineTo(x, b.y); }
    for (let i = ky - 1; i < ys.length; i += ky) { const y = px(a.y + ys[i] * z); ctx.moveTo(a.x, y); ctx.lineTo(b.x, y); }
    ctx.strokeStyle = U.rgba(g.color || '#ffffff', op);
    ctx.stroke();
    ctx.setLineDash([2, 4]);
    ctx.strokeStyle = `rgba(0,0,0,${op})`;
    ctx.stroke();
    ctx.restore();
  }

  // Overlay yardımcıları: katman çerçevesini çiz
  App.drawLayerOutline = (ctx, L, color = '#4f8cff', dash) => {
    const pts = App.layerCorners(L).map(p => App.docToScreen(p.x, p.y));
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = 1.5;
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath(); ctx.stroke();
    ctx.restore();
    return pts;
  };

  /* ---------------------------------------------------------------- meşgul katmanı */
  // Yükleniyor ekranı. fn(progress) içinden progress(0..1, [ek yazı]) çağrılırsa çubuk dolar;
  // hiç çağrılmazsa çubuk kayan (belirsiz) biçimde kalır.
  /* İşlem penceresi. o.cancel verilirse köşede bir X çıkar; X ya da ESC "emin misiniz" diye sorar, onaylanırsa o.cancel çağrılır.
     İşlem sürerken klavye alttaki pencerelere ve araçlara ulaşmaz (ör. ESC alttaki pencereyi kapatmaz). */
  App.busy = async (msg, fn, o = {}) => {
    const el = document.getElementById('busy'), box = el.querySelector('.busy-box');
    const bar = el.querySelector('.busy-bar i'), pct = el.querySelector('.busy-pct');
    el.querySelector('.busy-msg').textContent = msg || 'Processing…';
    box.classList.remove('det'); bar.style.width = ''; pct.textContent = '';
    let asking = false, closeAsk = null, x = box.querySelector('.busy-x');
    const ask = async () => {
      if (asking || !o.cancel) return;
      asking = true;
      const r = await App.ui.modal({
        title: 'Cancel', width: 380, top: true, content: U.h('p', { class: 'modal-msg' }, o.ask || 'Are you sure you want to cancel?'),
        buttons: [{ label: 'Continue', value: null }, { label: 'Stop', value: true, danger: true }], enter: () => true,
        onOpen: (b, close) => { closeAsk = close; },
      });
      asking = false; closeAsk = null;
      if (r && el.classList.contains('show')) { o.cancel(); x.disabled = true; }
    };
    if (!x) { x = U.h('button', { class: 'busy-x icon-btn', title: 'Cancel', html: App.icon('close', 16) }); box.appendChild(x); }
    x.onclick = ask; x.disabled = false; x.style.display = o.cancel ? '' : 'none';
    const key = e => {
      if (asking) return; // onay penceresi kendi tuşlarını işler
      e.stopImmediatePropagation(); e.preventDefault();
      if (e.key === 'Escape') ask();
    };
    window.addEventListener('keydown', key, true);
    const progress = App.busy.progress = (f, extra) => {
      f = U.clamp(f || 0, 0, 1);
      box.classList.add('det');
      bar.style.width = (f * 100).toFixed(1) + '%';
      pct.textContent = Math.round(f * 100) + '%' + (extra ? ' · ' + extra : '');
    };
    el.classList.add('show');
    await U.nextFrame();
    try { return await fn(progress); }
    catch (e) { console.error(e); App.ui.toast('Error: ' + (e.message || e), 'error'); }
    finally { el.classList.remove('show'); App.busy.progress = () => {}; window.removeEventListener('keydown', key, true); if (closeAsk) closeAsk(null); }
  };
  App.busy.progress = () => {};

  /* ---------------------------------------------------------------- önizleme oturumu */
  // Ayarlama / efekt / filtre gibi araçlar düşük çözünürlüklü vekil üzerinde canlı önizleme yapar,
  // Uygula'da tam çözünürlükte işler.
  class PreviewSession {
    constructor(layer, maxSide) {
      this.layer = layer;
      this.base = layer.canvas;
      const scr = Math.max(R.cssW, R.cssH) * R.dpr;
      maxSide = maxSide || U.clamp(Math.round(scr * 1.1), 900, 2000);
      this.proxy = U.fit(layer.canvas, maxSide);
      this.scale = this.proxy.width / layer.canvas.width;
      this.fn = null;
      this.pending = false;
      this.lite = null; this.lastT = 0; this.fullT = 0;
    }
    /* Ayarlar > Performans'ta açıksa: kaydırıcı sürüklenirken (güncellemeler art arda gelirken) önizleme yarım çözünürlüklü vekilde hesaplanır,
       durunca kısa bir süre sonra tam vekilde yeniden hesaplanır. Görünen son sonuç ve Uygula etkilenmez. */
    liteProxy() {
      const p = this.proxy, side = Math.max(p.width, p.height);
      if (side < 1100) return null;
      if (!this.lite) this.lite = U.fit(p, Math.round(side / 2));
      return this.lite;
    }
    update(fn) {
      this.fn = fn;
      const now = performance.now(), quick = now - this.lastT < 220;
      this.lastT = now;
      clearTimeout(this.fullT);
      const lite = quick && App.prefs.fastPreview ? this.liteProxy() : null;
      if (lite) this.fullT = setTimeout(() => { if (this.fn === fn) this.render(false); }, 180);
      this.render(!!lite);
    }
    render(lite) {
      this.useLite = lite;
      if (this.pending) return;
      this.pending = true;
      requestAnimationFrame(() => {
        this.pending = false;
        if (!this.fn || App.preview === undefined) return;
        try {
          const src = this.useLite && this.lite ? this.lite : this.proxy;
          const out = this.fn(src, this.scale * src.width / this.proxy.width);
          App.preview = { layer: this.layer, canvas: out };
        } catch (e) { console.error(e); }
        App.requestRender();
      });
    }
    clear() { clearTimeout(this.fullT); this.fn = null; if (App.preview && App.preview.layer === this.layer) App.preview = null; App.requestRender(); }
    async apply(label) {
      if (!this.fn) return false;
      const fn = this.fn;
      await App.busy('Applying…', async () => {
        const out = await fn(this.layer.canvas, 1);
        this.layer.canvas = out;
      });
      this.fn = null;
      App.preview = null;
      App.commit(label);
      return true;
    }
    cancel() { this.clear(); }
  }
  App.PreviewSession = PreviewSession;

  /* ---------------------------------------------------------------- araç yönetimi */
  App.registerTool = def => {
    App.tools[def.id] = def;
    App.toolOrder.push(def.id);
  };

  App.setTool = async id => {
    const next = App.tools[id];
    if (!next || (App.tool && App.tool.id === id)) return;
    const cur = App.tool;
    if (cur) {
      if (cur.isDirty && cur.isDirty()) {
        const r = await App.ui.choice('There are pending changes. Apply them?', [['apply', 'Apply', true], ['discard', 'Discard'], ['stay', 'Cancel']]);
        if (r === 'stay' || r == null) return;
        if (r === 'apply') await cur.apply(); else cur.cancel && cur.cancel();
      } else if (cur.cancel) cur.cancel();
      cur.deactivate && cur.deactivate();
    }
    App.tool = next;
    App.brushCursor = null;
    App.emit('tool', next);
    try { next.activate && await next.activate(); } catch (e) { console.error(e); }
    if (App.tool === next) App.ui.buildPanel(next);
    App.updateCursor();
    App.requestRender();
  };

  App.updateCursor = () => {
    if (!R.stage) return;
    const t = App.tool;
    R.stage.style.cursor = App.keys.space ? 'grab' : (t && (typeof t.cursor === 'function' ? t.cursor() : t.cursor)) || 'default';
  };

  // Fırça imleci: araç brushSize (doküman px) tanımlar
  App.setBrushCursor = (sx, sy, docRadius) => {
    App.brushCursor = docRadius ? { x: sx, y: sy, r: docRadius * App.view.zoom } : null;
    App.requestRender();
  };

  /* ---------------------------------------------------------------- sahne etkileşimi */
  App.initStage = () => {
    const st = R.stage;
    let pan = null, dragging = false, last = null, hover = null;
    // Alt basılınca / bırakılınca fare kıpırdamasa da önizleme (ör. yapışma noktası) hemen güncellenir.
    // Tarayıcının Alt ile menüye odaklanması da engellenir.
    const altKey = e => {
      if (e.key !== 'Alt') return;
      e.preventDefault();
      const t = App.tool;
      if (!dragging && hover && t && t.onHover && App.doc) t.onHover(hover, { altKey: e.type === 'keydown', shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey });
    };
    window.addEventListener('keydown', altKey);
    window.addEventListener('keyup', altKey);
    // Ctrl tuşu gerçekten basılı mı (tekerlek olayındaki ctrlKey sıkıştırma hareketinde de gelir)
    let ctrlHeld = false;
    const ctrlState = e => { ctrlHeld = !!e.ctrlKey; };
    window.addEventListener('keydown', ctrlState, true);
    window.addEventListener('keyup', ctrlState, true);
    window.addEventListener('pointermove', ctrlState, true);
    window.addEventListener('blur', () => { ctrlHeld = false; });
    const pos = e => {
      const r = R.canvas.getBoundingClientRect();
      return { sx: e.clientX - r.left, sy: e.clientY - r.top };
    };
    /* Dokunmatik ekran: iki parmak sıkıştırarak yakınlaştırır ve sürükleyerek kaydırır. İkinci parmak gelince tek
       parmakla başlamış iş bitirilir; parmakların hepsi kalkana kadar yeni çizim başlamaz. */
    const touches = new Map();
    let pinch = null, pinchHold = false;
    const pinchState = () => {
      const [a, b] = [...touches.values()];
      return { c: { x: (a.sx + b.sx) / 2, y: (a.sy + b.sy) / 2 }, d: Math.max(1, Math.hypot(a.sx - b.sx, a.sy - b.sy)) };
    };
    st.addEventListener('pointerdown', e => {
      if (!App.doc) return;
      st.setPointerCapture(e.pointerId);
      const { sx, sy } = pos(e);
      if (e.pointerType === 'touch') {
        touches.set(e.pointerId, { sx, sy });
        if (touches.size === 2) {
          if (dragging) up(e);
          const s0 = pinchState();
          pinch = { ...s0, z0: App.view.zoom, vx: App.view.x, vy: App.view.y };
          pinchHold = true;
          return;
        }
        if (pinchHold || touches.size > 2) return;
      }
      if (e.button === 1 || (e.button === 0 && App.keys.space)) {
        pan = { sx, sy, vx: App.view.x, vy: App.view.y };
        st.style.cursor = 'grabbing';
        e.preventDefault();
        return;
      }
      if (e.button !== 0) return;
      const t = App.tool;
      if (t && t.onDown) {
        dragging = App.pointerDown = true;
        const p = App.screenToDoc(sx, sy);
        p.sx = sx; p.sy = sy;
        last = p;
        t.onDown(p, e);
      }
    });
    st.addEventListener('pointermove', e => {
      if (!App.doc) return;
      const { sx, sy } = pos(e);
      if (touches.has(e.pointerId)) touches.set(e.pointerId, { sx, sy });
      if (pinch && touches.size >= 2) {
        const s1 = pinchState(), z = U.clamp(pinch.z0 * s1.d / pinch.d, 0.02, 32);
        // iki parmağın ortasındaki doküman noktası parmakların ortasında kalır
        const px = (pinch.c.x - pinch.vx) / pinch.z0, py = (pinch.c.y - pinch.vy) / pinch.z0;
        App.view.zoom = z; App.view.x = s1.c.x - px * z; App.view.y = s1.c.y - py * z;
        App.emit('view'); App.requestRender();
        return;
      }
      if (pinchHold && e.pointerType === 'touch') return;
      if (pan) {
        App.view.x = pan.vx + sx - pan.sx;
        App.view.y = pan.vy + sy - pan.sy;
        App.requestRender();
        return;
      }
      const t = App.tool;
      // Ara noktalar (birleştirilmiş olaylar) yalnızca fırça izleri için gerekir. Taşıma / boyutlandırmada son nokta yeter;
      // yüksek yenileme hızlı farelerde karede onlarca olay gelir ve her biri için yeniden hesaplamak sürüklemeyi kasar.
      const fine = dragging && t && ((t.brushSize && t.brushSize() > 0) || t.coalesce) && e.getCoalescedEvents;
      const evs = fine ? e.getCoalescedEvents() : [e];
      for (const ev of (evs.length ? evs : [e])) {
        const q = pos(ev);
        const p = App.screenToDoc(q.sx, q.sy);
        p.sx = q.sx; p.sy = q.sy;
        if (dragging && t && t.onMove) t.onMove(p, ev, last);
        last = p;
      }
      const p = App.screenToDoc(sx, sy);
      p.sx = sx; p.sy = sy;
      if (!dragging && t && t.onHover) { t.onHover(p, e); hover = p; }
      if (t && t.brushSize) App.setBrushCursor(sx, sy, t.brushSize() / 2);
      App.emit('pointer', p);
    });
    const up = e => {
      if (touches.has(e.pointerId) && (e.type === 'pointerup' || e.type === 'pointercancel')) {
        touches.delete(e.pointerId);
        if (touches.size < 2) pinch = null;
        if (!touches.size) pinchHold = false;
        if (pinchHold) return;
      }
      if (pan) { pan = null; App.updateCursor(); return; }
      if (!dragging) return;
      dragging = App.pointerDown = false;
      const { sx, sy } = pos(e);
      const p = App.screenToDoc(sx, sy);
      p.sx = sx; p.sy = sy;
      const t = App.tool;
      if (t && t.onUp) t.onUp(p, e);
      App.snapDot = null;
      if (App.guides.length) { App.guides = []; App.requestRender(); }
    };
    st.addEventListener('pointerup', up);
    st.addEventListener('pointercancel', up);
    st.addEventListener('pointerleave', () => {
      if (App.brushCursor) { App.brushCursor = null; App.requestRender(); }
      if (!dragging) App.clearSnap();
      hover = null;
      if (App.tool && App.tool.onLeave) App.tool.onLeave();
    });
    st.addEventListener('dblclick', e => {
      const t = App.tool;
      if (!App.doc || !t || !t.onDblClick) return;
      const { sx, sy } = pos(e);
      const p = App.screenToDoc(sx, sy);
      t.onDblClick(p, e);
    });
    st.addEventListener('wheel', e => {
      if (!App.doc) return;
      e.preventDefault();
      const { sx, sy } = pos(e);
      // Alt + tekerlek: fırça boyutu / seçili katmanın boyutu
      if (e.altKey) { if (e.deltaY) App.stepSize(e.deltaY < 0 ? 1 : -1, true); return; }
      // Dokunmatik yüzeyde iki parmakla sıkıştırma da ctrlKey ile gelir; gerçek Ctrl basılı değilse o
      if (e.ctrlKey && !ctrlHeld) { App.setZoom(App.view.zoom * Math.exp(-e.deltaY * 0.01), sx, sy); return; }
      // Ctrl, tekerlek ayarındaki işin tersini yapar (yakınlaştır <-> kaydır)
      if ((App.prefs.wheel === 'pan') !== e.ctrlKey) {
        if (e.shiftKey) App.view.x -= e.deltaY; else { App.view.x -= e.deltaX; App.view.y -= e.deltaY; }
        App.requestRender();
        return;
      }
      if (e.shiftKey) { App.view.x -= e.deltaY; App.requestRender(); return; }
      App.setZoom(App.view.zoom * Math.exp(-e.deltaY * 0.0015), sx, sy);
    }, { passive: false });
    st.addEventListener('contextmenu', e => {
      e.preventDefault();
      if (!App.doc || dragging) return;
      const { sx, sy } = pos(e);
      const p = App.screenToDoc(sx, sy);
      App.emit('stagemenu', p, e);
    });
  };

  // Fırçalı araçlarda fırça boyutunu, diğerlerinde seçili katmanın boyutunu bir adım değiştirir
  App.stepSize = (dir, wheel) => {
    const t = App.tool;
    if (!t || !App.doc) return;
    if (t.onStepSize && t.onStepSize(dir) !== false) return;
    if (t.brushSize && t.brushSize() > 0) {
      const f = wheel ? 1.08 : 1.15;
      // Alt + tekerlek de kaydırıcının sınırında durur (kaydırıcıyla aynı en büyük boyut)
      const sl = t.sizeSl || t._size, rng = sl && sl.el && sl.el.querySelector('input[type=range]');
      const max = rng ? +rng.max : App.brushMax(300);
      const nv = Math.round(U.clamp(dir > 0 ? t.size * f + 1 : t.size / f - 1, 1, max));
      t.size = nv;
      if (sl) sl.set(nv);
      if (App.brushCursor) App.brushCursor.r = t.brushSize() / 2 * App.view.zoom;
      App.requestRender();
      return;
    }
    const L = App.activeLayer();
    if (!L || L.locked || !L.visible || L.type === 'frame' || L.type === 'overlay' || !['arrange', 'text', 'element'].includes(t.id)) return;
    App.scaleLayerBy(L, dir > 0 ? 1.05 : 1 / 1.05);
  };
  // Katmanı merkezinden ölçekle (kısa süre sonra geçmişe yazılır)
  let scaleTimer;
  App.scaleLayerBy = (L, k) => {
    L.sx *= k; L.sy *= k;
    if (App.bakeVector) App.bakeVector(L);
    App.requestRender();
    App.emit('transform', L);
    clearTimeout(scaleTimer);
    scaleTimer = setTimeout(() => { App.commit('Scale'); App.emit('transform', L); }, 350);
  };

  /* ---------------------------------------------------------------- fırça darbesi yardımcıları */
  // Darbe başında katman tuvalini kopyala (geçmişteki kopya bozulmasın)
  App.beginPixelEdit = L => {
    L.canvas = U.clone(L.canvas);
    return L.canvas;
  };

  // İki nokta arasında aralıklı damga noktaları üretir
  App.interp = (a, b, spacing, fn, state) => {
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    if (!d) return;
    spacing = Math.max(0.5, spacing);
    let pos = spacing - (state.rest || 0);
    if (pos < 0) pos = 0;
    while (pos <= d) {
      const t = pos / d;
      fn(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
      pos += spacing;
    }
    state.rest = d - (pos - spacing);
  };
})();
