'use strict';
/* Çizim aracı: fırça, fosforlu kalem, sprey, neon, silgi, kova ve şekiller */
(() => {
  const { U, ui: UI } = App;
  const h = U.h;

  const BRUSHES = [
    ['normal', 'Brush', 'brush'], ['marker', 'Highlighter', 'draw'], ['spray', 'Spray', 'spray'], ['neon', 'Neon', 'neon'],
    ['eraser', 'Eraser', 'eraser'], ['bucket', 'Bucket', 'bucket'],
  ];
  const SHAPE_LIST = [
    ['sline', 'Line', 'line'], ['sarrow', 'Arrow', 'arrow'], ['sdarrow', 'Double Arrow', 'dblarrow'], ['srect', 'Square', 'square'],
    ['sellipse', 'Circle', 'circle'], ['stri', 'Triangle', 'triangle'], ['sstar', 'Star', 'star'], ['sheart', 'Heart', 'heart'], ['sbubble', 'Speech Bubble', 'bubble'],
    ['sdiamond', 'Diamond', 'diamond'], ['spenta', 'Pentagon', 'pentagon'], ['shex', 'Hexagon', 'hexagon'],
  ];
  const SHAPES = new Set(SHAPE_LIST.map(s => s[0]));
  const LINES = new Set(['sline', 'sarrow', 'sdarrow']);
  const BOXES = new Set(['srect', 'sellipse', 'stri', 'sstar', 'sheart', 'sbubble', 'sdiamond', 'spenta', 'shex']);
  const PATHS = new Set(['marker', 'neon']); // tüm çizgi her karede tek yol olarak yeniden çizilir

  const T = {
    id: 'draw', name: 'Draw', icon: 'draw', key: 'B',
    brush: 'normal', color: App.prefs.drawColor || '#ff3b30', color2: '#ffffff', size: 18, opacity: 100, mOpacity: 75, hard: 80,
    newLayer: true, fill: false, outline: true, dashed: false, dashLen: 22, dashGap: 20, radius: 0, lineW: 6, center: false, tol: 30,
    density: 50, dot: 50, // sprey: yoğunluk ve damla boyutu
    gradOn: false, grad: null, fillGradOn: false, fillGrad: null, // şekillerde çizgi ve dolgu degradesi
    stroke: null, L: null,
    cursor() { return SHAPES.has(T.brush) || T.brush === 'bucket' ? 'crosshair' : 'none'; },
    brushSize() { return SHAPES.has(T.brush) || T.brush === 'bucket' ? 0 : T.brush === 'marker' ? T.size * 1.6 : T.size; },

    activate() { },
    deactivate() { App.strokePreview = null; T.stroke = null; App.clearSnap(); },
    // şekil çizmeden önce başlangıcın yapışacağı hizalama çizgisi gösterilir
    onHover(p, e) { if (SHAPES.has(T.brush)) App.hoverSnap(p, e); else App.clearSnap(); },
    setSize(v) { T.size = v; if (T.sizeSl) T.sizeSl.set(v); },

    target() {
      let L = App.activeLayer();
      const d = App.doc;
      const shape = SHAPES.has(T.brush);
      T.created = null;
      // Fırça darbeleri fotoğrafı bozmasın diye ayrı bir çizim katmanında toplanır.
      // Şekiller: "Yeni katmana çiz" açıkken her biri kendi katmanına, kapalıyken seçili katmana çizilir.
      const needNew = !L || L.type !== 'raster' || (T.brush !== 'eraser' && (shape ? T.newLayer : (!L.paint || L.shapeLayer)));
      if (needNew) {
        if (T.brush === 'eraser') {
          if (!L) return null;
          if (L.type !== 'raster') { UI.toast('The eraser only works on image layers. Rasterize the layer first.', 'warn'); return null; }
        } else {
          L = App.newLayer(U.canvas(d.w, d.h), shape ? { name: 'Shape', paint: true, shapeLayer: true } : { name: 'Draw', paint: true });
          App.addLayer(L);
          T.created = L;
        }
      }
      return L;
    },

    // Ok ucunun uzunluğu (katman pikseli)
    headLen(w) { return Math.max(w * 3.2, 14 / App.view.zoom); },

    // Yeni katmandaki şekil: katman şeklin kendi boyutuna küçültülür (çizgi ve ok kendi yönünde durur),
    // böylece Düzenle aracındaki kutu tuvalin tamamını değil yalnızca şekli sarar.
    fitShapeLayer(L, S, alpha) {
      const { a, b } = S.ends || {};
      if (!a) return;
      const w = T.lineW / S.sc;
      if (LINES.has(T.brush)) {
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        if (len < 1) return;
        const head = T.brush === 'sline' ? 0 : T.headLen(w);
        const pad = Math.ceil(Math.max(w / 2, head * Math.sin(0.5)) + 2);
        const c = U.canvas(Math.ceil(len + pad * 2), pad * 2), g = c.getContext('2d');
        g.globalAlpha = alpha;
        T.shape({ g, sc: S.sc }, { x: pad, y: pad }, { x: pad + len, y: pad });
        const m = App.layerToDoc(L, (a.x + b.x) / 2, (a.y + b.y) / 2);
        L.canvas = c; L.x = m.x; L.y = m.y;
        L.rot = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
      } else {
        const m = w / 2 + 2;
        const x0 = Math.floor(Math.min(a.x, b.x) - m), y0 = Math.floor(Math.min(a.y, b.y) - m);
        const x1 = Math.ceil(Math.max(a.x, b.x) + m), y1 = Math.ceil(Math.max(a.y, b.y) + m);
        const c = U.canvas(Math.max(1, x1 - x0), Math.max(1, y1 - y0));
        c.getContext('2d').drawImage(L.canvas, -x0, -y0);
        const ctr = App.layerToDoc(L, (x0 + x1) / 2, (y0 + y1) / 2);
        L.canvas = c; L.x = ctr.x; L.y = ctr.y;
      }
    },

    /* Çizim katmanı yalnızca çizilen kısmı kaplar (Düzenle aracındaki kutu çizimi sarar). Yeni bir darbe
       bu alanın dışına taşabilsin diye darbe başlarken katman tuvalin tamamını kaplayacak kadar büyütülür,
       darbe bitince yeniden çizime göre kırpılır. */
    growToDoc(L) {
      const d = App.doc, W = L.canvas.width, H = L.canvas.height;
      const pts = [[0, 0], [d.w, 0], [d.w, d.h], [0, d.h]].map(([x, y]) => App.docToLayer(L, x, y));
      const x0 = Math.floor(Math.min(0, ...pts.map(q => q.x))), y0 = Math.floor(Math.min(0, ...pts.map(q => q.y)));
      const x1 = Math.ceil(Math.max(W, ...pts.map(q => q.x))), y1 = Math.ceil(Math.max(H, ...pts.map(q => q.y)));
      if ((x0 === 0 && y0 === 0 && x1 === W && y1 === H) || (x1 - x0) * (y1 - y0) > 64e6) return;
      const c = U.canvas(x1 - x0, y1 - y0);
      c.getContext('2d').drawImage(L.canvas, -x0, -y0);
      const ctr = App.layerToDoc(L, (x0 + x1) / 2, (y0 + y1) / 2);
      L.canvas = c; L.x = ctr.x; L.y = ctr.y;
    },
    isDrawLayer: L => L.type === 'raster' && L.paint && !L.shapeLayer,

    onDown(p, e) {
      if (!App.doc) return;
      if (T.brush === 'bucket') { T.bucket(p); return; }
      const L = T.target();
      if (!L) return;
      T.L = L;
      if (T.isDrawLayer(L) && T.brush !== 'eraser') T.growToDoc(L);
      // şekillerde başlangıç noktası kılavuzlara yapışır
      const pp = SHAPES.has(T.brush) ? App.snapStart(p, e) : p;
      App.snapDot = null;
      const q = App.docToLayer(L, pp.x, pp.y);
      const sc = App.layerScale(L);
      const sk = U.canvas(L.canvas.width, L.canvas.height);
      const g = sk.getContext('2d');
      g.lineCap = 'round'; g.lineJoin = 'round';
      T.stroke = { canvas: sk, g, last: q, start: q, pts: [q], st: {}, sc, rng: U.rng(Date.now() & 0xffff) };
      const marker = T.brush === 'marker';
      const op = T.brush === 'eraser' ? 'destination-out' : marker ? 'multiply' : 'source-over';
      App.strokePreview = { layer: L, canvas: sk, alpha: (marker ? T.mOpacity : T.opacity) / 100, op };
      if (T.brush === 'normal' || T.brush === 'eraser') {
        T.tip = makeTip(T.size / sc, T.brush === 'eraser' ? '#000' : T.color, T.hard / 100);
        T.stamp(q.x, q.y);
      } else if (T.brush === 'spray') T.spray(q.x, q.y);
      else if (PATHS.has(T.brush)) T.pathDraw(T.stroke);
      App.requestRender();
    },
    onMove(p, e) {
      const S = T.stroke;
      if (!S) return;
      // kutu şekillerinde Alt merkezden çizmeyi değiştirir; hizalamayı yalnızca Ctrl tersine çevirir
      if (SHAPES.has(T.brush)) p = App.snapEnd(p, T.L, BOXES.has(T.brush) ? { ctrlKey: e.ctrlKey, metaKey: e.metaKey } : e);
      let q = App.docToLayer(T.L, p.x, p.y);
      const b = T.brush;
      // Shift: fırça yalnızca 45 derecenin katı olan yönlerde düz gider (ör. düzgün neon şerit)
      if (!SHAPES.has(b) && e && e.shiftKey && !App.prefs.free) {
        if (!S.lock) S.lock = { a: S.last, i: S.pts.length, dir: null };
        const k = S.lock, dx = q.x - k.a.x, dy = q.y - k.a.y;
        if (k.dir === null) {
          if (Math.hypot(dx, dy) * App.view.zoom * S.sc < 14) return; // yön, imleç biraz ilerleyince belirlenir
          k.dir = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
        }
        const ux = Math.cos(k.dir), uy = Math.sin(k.dir), t = dx * ux + dy * uy;
        q = { x: k.a.x + ux * t, y: k.a.y + uy * t };
        if (PATHS.has(b)) S.pts.length = k.i;
      } else if (S.lock) S.lock = null;
      if (b === 'normal' || b === 'eraser') {
        App.interp(S.last, q, Math.max(0.7, (T.size / S.sc) * 0.12), (x, y) => T.stamp(x, y), S.st);
      } else if (b === 'spray') {
        App.interp(S.last, q, Math.max(1, (T.size / S.sc) * 0.25), (x, y) => T.spray(x, y), S.st);
      } else if (PATHS.has(b)) {
        // tüm çizgi tek yol olarak her karede yeniden çizilir (üst üste binip koyulaşmaz, titremez)
        if (!S.lock && Math.hypot(q.x - S.last.x, q.y - S.last.y) < 0.5) return;
        S.pts.push(q);
        if (!S.raf) S.raf = requestAnimationFrame(() => { S.raf = 0; if (T.stroke === S) { T.pathDraw(S); App.requestRender(); } });
      } else if (SHAPES.has(b)) {
        S.g.clearRect(0, 0, S.canvas.width, S.canvas.height);
        const end = e.shiftKey && !App.prefs.free ? T.constrain(S.start, q, b) : q;
        // Merkezden çiz: başlangıç noktası şeklin merkezi olur; Alt ayarı tersine çevirir
        const fromC = (T.center !== e.altKey) && BOXES.has(b);
        S.ends = { a: fromC ? { x: 2 * S.start.x - end.x, y: 2 * S.start.y - end.y } : S.start, b: end };
        T.shape(S, S.ends.a, S.ends.b);
      }
      S.last = q;
      App.requestRender();
    },
    onUp() {
      const S = T.stroke;
      if (!S) return;
      if (S.raf) cancelAnimationFrame(S.raf);
      if (PATHS.has(T.brush)) T.pathDraw(S);
      T.stroke = null;
      const sp = App.strokePreview;
      App.strokePreview = null;
      const L = T.L;
      const shape = SHAPES.has(T.brush);
      // tek tıklama: boş kalan yeni şekil katmanını bırakma
      if (shape && !S.ends && T.created === L) { App.removeLayer(L.id); T.created = null; App.requestRender(); return; }
      App.beginPixelEdit(L);
      const x = L.canvas.getContext('2d');
      x.globalAlpha = sp.alpha; x.globalCompositeOperation = sp.op;
      x.drawImage(S.canvas, 0, 0);
      x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
      if (shape && T.created === L) { T.fitShapeLayer(L, S, sp.alpha); App.trimLayer(L); }
      else if (T.isDrawLayer(L) && !L.sheet) App.trimLayer(L); // elle eklenen boş katman tuval boyunda kalır
      T.created = null;
      App.commit(T.brush === 'eraser' ? 'Eraser' : shape ? 'Draw Shape' : T.brush === 'marker' ? 'Highlighter' : 'Draw');
    },

    constrain(a, b, kind) {
      const dx = b.x - a.x, dy = b.y - a.y;
      if (BOXES.has(kind)) {
        // üçgen, beşgen ve altıgen kendi doğal oranında çizilir (düzgün / eşkenar çıksın)
        const asp = kind === 'stri' || kind === 'shex' ? 2 / Math.sqrt(3) : kind === 'spenta' ? 2 * Math.sin(Math.PI * 2 / 5) / (1 + Math.cos(Math.PI / 5)) : 1;
        const m = Math.max(Math.abs(dx), Math.abs(dy) * asp);
        return { x: a.x + Math.sign(dx || 1) * m, y: a.y + Math.sign(dy || 1) * m / asp };
      }
      const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4), L = Math.hypot(dx, dy);
      return { x: a.x + Math.cos(ang) * L, y: a.y + Math.sin(ang) * L };
    },

    stamp(x, y) {
      const S = T.stroke, t = T.tip;
      S.g.drawImage(t, x - t.width / 2, y - t.height / 2);
    },
    // Sprey: fırça alanına rastgele küçük noktalar
    spray(x, y) {
      const S = T.stroke, g = S.g, r = T.size / 2 / S.sc, rnd = S.rng;
      const n = Math.max(2, Math.round(r * 0.9 * T.density / 50)), dot = Math.max(0.5, r * 0.035 * T.dot / 50);
      g.fillStyle = T.color;
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * r;
        g.beginPath(); g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, dot * (0.6 + rnd() * 0.8), 0, Math.PI * 2); g.fill();
      }
    },
    // Noktalardan yumuşatılmış tek bir yol çizer (fosforlu ve neon)
    pathDraw(S) {
      const g = S.g, pts = S.pts;
      g.clearRect(0, 0, S.canvas.width, S.canvas.height);
      const trace = () => {
        g.beginPath();
        g.moveTo(pts[0].x, pts[0].y);
        if (pts.length === 1) g.lineTo(pts[0].x + 0.01, pts[0].y);
        for (let i = 1; i < pts.length - 1; i++) {
          const mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2;
          g.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
        }
        if (pts.length > 1) g.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
      };
      g.lineCap = 'round'; g.lineJoin = 'round';
      if (T.brush === 'neon') {
        // renkli parıltı + açık renkli ince öz
        const w = T.size / S.sc;
        g.save();
        g.shadowColor = T.color; g.shadowBlur = w * 1.4;
        g.strokeStyle = T.color; g.lineWidth = w * 0.55;
        trace(); g.stroke(); g.stroke();
        g.restore();
        const [r, gg, b] = U.hex2rgb(T.color);
        g.strokeStyle = U.rgb2hex(r + (255 - r) * 0.75, gg + (255 - gg) * 0.75, b + (255 - b) * 0.75);
        g.lineWidth = Math.max(1, w * 0.18);
        trace(); g.stroke();
        return;
      }
      g.strokeStyle = T.color; g.lineWidth = T.size * 1.6 / S.sc;
      trace(); g.stroke();
    },

    // Kova: görünen görüntüde tıklanan yere benzer renkli bitişik alanı yeni bir katmanda doldurur
    bucket(p) {
      const d = App.doc, W = d.w, H = d.h, x = Math.floor(p.x), y = Math.floor(p.y);
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      const src = U.getData(App.composite()).data;
      const i0 = (y * W + x) * 4, r0 = src[i0], g0 = src[i0 + 1], b0 = src[i0 + 2], a0 = src[i0 + 3];
      const thr = (T.tol / 100) * 255 * 1.2;
      const ok = j => {
        const i = j * 4, dr = src[i] - r0, dg = src[i + 1] - g0, db = src[i + 2] - b0, da = src[i + 3] - a0;
        return Math.sqrt(dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11 + da * da * 0.5) <= thr;
      };
      const n = W * H, m = new Uint8Array(n), stack = new Int32Array(n);
      let sp = 0, x0 = x, x1 = x, y0 = y, y1 = y;
      m[y * W + x] = 1; stack[sp++] = y * W + x;
      while (sp) {
        const j = stack[--sp], jx = j % W, jy = (j - jx) / W;
        if (jx < x0) x0 = jx; if (jx > x1) x1 = jx; if (jy < y0) y0 = jy; if (jy > y1) y1 = jy;
        if (jx > 0 && !m[j - 1] && ok(j - 1)) { m[j - 1] = 1; stack[sp++] = j - 1; }
        if (jx < W - 1 && !m[j + 1] && ok(j + 1)) { m[j + 1] = 1; stack[sp++] = j + 1; }
        if (jy > 0 && !m[j - W] && ok(j - W)) { m[j - W] = 1; stack[sp++] = j - W; }
        if (jy < H - 1 && !m[j + W] && ok(j + W)) { m[j + W] = 1; stack[sp++] = j + W; }
      }
      // kenarlarda ince boşluk kalmasın diye alan 1 px genişletilir
      x0 = Math.max(0, x0 - 1); y0 = Math.max(0, y0 - 1); x1 = Math.min(W - 1, x1 + 1); y1 = Math.min(H - 1, y1 + 1);
      const cw = x1 - x0 + 1, ch = y1 - y0 + 1, c = U.canvas(cw, ch), id = c.getContext('2d').createImageData(cw, ch);
      const [fr, fg, fb] = U.hex2rgb(T.color), fa = Math.round(255 * T.opacity / 100);
      for (let yy = 0; yy < ch; yy++) for (let xx = 0; xx < cw; xx++) {
        const j = (y0 + yy) * W + x0 + xx;
        const hit = m[j] || (xx > 0 && m[j - 1]) || (xx < cw - 1 && m[j + 1]) || (yy > 0 && m[j - W]) || (yy < ch - 1 && m[j + W]);
        if (!hit) continue;
        const k = (yy * cw + xx) * 4;
        id.data[k] = fr; id.data[k + 1] = fg; id.data[k + 2] = fb; id.data[k + 3] = fa;
      }
      c.getContext('2d').putImageData(id, 0, 0);
      App.addLayer(App.newLayer(c, { name: 'Fill', paint: true, x: x0 + cw / 2, y: y0 + ch / 2 }));
      App.commit('Bucket Fill');
    },

    shape(S, a, b) {
      const g = S.g, k = T.brush;
      let w = T.lineW / S.sc;
      g.save();
      // degrade şeklin kutusuna yayılır (çizgide iki ucun kutusu, kalınlık kadar pay ile)
      const bx0 = Math.min(a.x, b.x) - w / 2, by0 = Math.min(a.y, b.y) - w / 2, bw = Math.abs(b.x - a.x) + w, bh = Math.abs(b.y - a.y) + w;
      // çizgi ve okta degrade baştan uca gider (yeni katmanda şekil yatay çizilip döndürülse de aynı görünür)
      const alongLine = gr => {
        const q = gr.type === 'radial' ? g.createRadialGradient((a.x + b.x) / 2, (a.y + b.y) / 2, 0, (a.x + b.x) / 2, (a.y + b.y) / 2, Math.max(1, Math.hypot(b.x - a.x, b.y - a.y) / 2))
          : g.createLinearGradient(a.x, a.y, b.x, b.y);
        for (const s of U.gradStops(gr)) q.addColorStop(U.clamp(s.p, 0, 1), U.rgba(s.c, s.a == null ? 1 : s.a));
        return q;
      };
      const lineCol = T.gradOn && T.grad ? (LINES.has(k) ? alongLine(T.grad) : U.gradFill(g, T.grad, bx0, by0, bw, bh)) : T.color;
      g.strokeStyle = lineCol;
      g.fillStyle = T.fillGradOn && T.fillGrad ? U.gradFill(g, T.fillGrad, bx0 + w / 2, by0 + w / 2, bw - w, bh - w) : T.color2;
      g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath();
      if (LINES.has(k)) {
        const ang = Math.atan2(b.y - a.y, b.x - a.x), len = Math.hypot(b.x - a.x, b.y - a.y);
        const hl = k === 'sline' ? 0 : Math.min(T.headLen(w), len * (k === 'sdarrow' ? 0.45 : 0.9));
        // kısa okta uç küçülür; çubuk da aynı oranda incelir (yoksa çubuk uçtan kalın görünür)
        if (hl) w = Math.min(w, hl / 3.2);
        g.lineWidth = w;
        if (T.dashed) g.setLineDash([w * T.dashLen / 10, w * T.dashGap / 10]);
        // Çizgi ok ucunun tabanında biter; aksi hâlde kalın çizginin yuvarlak ucu okun ucundan taşar
        const back = hl * Math.cos(0.5) * 0.85, ux = Math.cos(ang), uy = Math.sin(ang);
        const s0 = k === 'sdarrow' ? { x: a.x + ux * back, y: a.y + uy * back } : a;
        const s1 = k === 'sline' ? b : { x: b.x - ux * back, y: b.y - uy * back };
        if (k !== 'sline') g.lineCap = 'butt';
        g.moveTo(s0.x, s0.y); g.lineTo(s1.x, s1.y); g.stroke();
        g.setLineDash([]);
        const head = (tip, dir) => {
          g.beginPath();
          g.moveTo(tip.x, tip.y);
          g.lineTo(tip.x - Math.cos(dir - 0.5) * hl, tip.y - Math.sin(dir - 0.5) * hl);
          g.lineTo(tip.x - Math.cos(dir + 0.5) * hl, tip.y - Math.sin(dir + 0.5) * hl);
          g.closePath(); g.fillStyle = lineCol; g.fill();
        };
        if (k !== 'sline') head(b, ang);
        if (k === 'sdarrow') head(a, ang + Math.PI);
      } else {
        g.lineWidth = w;
        if (T.dashed) g.setLineDash([w * T.dashLen / 10, w * T.dashGap / 10]);
        const x0 = Math.min(a.x, b.x), y0 = Math.min(a.y, b.y), W = Math.abs(b.x - a.x), H = Math.abs(b.y - a.y);
        const cx = x0 + W / 2, cy = y0 + H / 2;
        if (k === 'srect') g.roundRect(x0, y0, W, H, Math.min(W, H) / 2 * T.radius / 100);
        else if (k === 'sellipse') g.ellipse(cx, cy, W / 2, H / 2, 0, 0, Math.PI * 2);
        else if (k === 'stri') { g.moveTo(cx, y0); g.lineTo(x0 + W, y0 + H); g.lineTo(x0, y0 + H); g.closePath(); }
        else if (k === 'sdiamond') { g.moveTo(cx, y0); g.lineTo(x0 + W, cy); g.lineTo(cx, y0 + H); g.lineTo(x0, cy); g.closePath(); }
        else if (k === 'spenta' || k === 'shex') {
          // düzgün çokgen, çizilen kutuyu dolduracak şekilde esnetilir
          const n = k === 'spenta' ? 5 : 6, a0 = k === 'spenta' ? -Math.PI / 2 : 0;
          const pts = Array.from({ length: n }, (_, i) => [Math.cos(a0 + i * 2 * Math.PI / n), Math.sin(a0 + i * 2 * Math.PI / n)]);
          const mx = Math.min(...pts.map(q => q[0])), Mx = Math.max(...pts.map(q => q[0])), my = Math.min(...pts.map(q => q[1])), My = Math.max(...pts.map(q => q[1]));
          pts.forEach(([u, v], i) => { const px = x0 + (u - mx) / (Mx - mx) * W, py = y0 + (v - my) / (My - my) * H; if (i) g.lineTo(px, py); else g.moveTo(px, py); });
          g.closePath();
        }
        else if (k === 'sstar') {
          for (let i = 0; i < 10; i++) {
            const t = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? 0.42 : 1;
            const px = cx + Math.cos(t) * W / 2 * rr, py = cy + 0.06 * H + Math.sin(t) * H / 2 * rr * 1.05;
            if (i) g.lineTo(px, py); else g.moveTo(px, py);
          }
          g.closePath();
        } else if (k === 'sheart') {
          const X = u => x0 + u * W, Y = v => y0 + v * H;
          g.moveTo(X(0.5), Y(0.28));
          g.bezierCurveTo(X(0.5), Y(0.08), X(0.18), Y(-0.02), X(0.04), Y(0.2));
          g.bezierCurveTo(X(-0.08), Y(0.42), X(0.12), Y(0.68), X(0.5), Y(1));
          g.bezierCurveTo(X(0.88), Y(0.68), X(1.08), Y(0.42), X(0.96), Y(0.2));
          g.bezierCurveTo(X(0.82), Y(-0.02), X(0.5), Y(0.08), X(0.5), Y(0.28));
          g.closePath();
        } else if (k === 'sbubble') {
          const bh = H * 0.78, r = Math.min(W, bh) * 0.22;
          g.moveTo(x0 + r, y0);
          g.arcTo(x0 + W, y0, x0 + W, y0 + bh, r);
          g.arcTo(x0 + W, y0 + bh, x0, y0 + bh, r);
          g.lineTo(x0 + W * 0.36, y0 + bh);
          g.lineTo(x0 + W * 0.18, y0 + H);
          g.lineTo(x0 + W * 0.2, y0 + bh);
          g.arcTo(x0, y0 + bh, x0, y0, r);
          g.arcTo(x0, y0, x0 + W, y0, r);
          g.closePath();
        }
        if (T.fill) g.fill();
        if (T.outline || !T.fill) g.stroke();
      }
      g.restore();
    },

    panel(body) {
      const pick = v => { T.brush = v; App.updateCursor(); App.brushCursor = null; App.requestRender(); vis(); T.settingsChanged(); };
      const bSeg = UI.seg({ label: 'Brushes', options: BRUSHES, value: T.brush, wrap: true, onChange: v => { sSeg.set(null); pick(v); } });
      const sSeg = UI.seg({ label: 'Shapes', options: SHAPE_LIST, value: T.brush, wrap: true, iconOnly: true, onChange: v => { bSeg.set(null); pick(v); } });
      body.appendChild(UI.section('Tool', [bSeg.el, sSeg.el]));
      // fırçalar düz renk kullanır; şekillerde aynı renk kutusu degradeye de geçebilir
      const c1 = UI.color({ label: 'Color', value: T.color, onInput: v => { T.color = v; c1s.set(v); T.settingsChanged(); } });
      const c1s = UI.color({
        label: 'Color', value: T.color, onInput: v => { T.color = v; c1.set(v); T.settingsChanged(); },
        grad: { on: T.gradOn, fresh: !T.grad, value: T.grad || U.gradDef(T.color, '#6c5cff', 135), onMode: on => { T.gradOn = on; if (!T.grad) T.grad = U.gradDef(T.color, '#6c5cff', 135); T.settingsChanged(); }, onInput: g => { T.grad = g; T.settingsChanged(); } },
      });
      T.sizeSl = UI.slider({ label: 'Size', min: 1, max: App.brushMax(300), value: T.size, onInput: v => { T.size = v; T.settingsChanged(); } });
      const hard = UI.slider({ label: 'Hardness', min: 0, max: 100, value: T.hard, def: 80, onInput: v => { T.hard = v; T.settingsChanged(); } });
      const tol = UI.slider({ label: 'Tolerance', min: 0, max: 100, value: T.tol, def: 30, info: 'How similar an area must be to the clicked color to be filled. A low value fills only the same color; a high value also fills similar shades.', onInput: v => { T.tol = v; T.settingsChanged(); } });
      const lw = UI.slider({ label: 'Line Width', min: 1, max: App.brushMax(100, 40), value: T.lineW, onInput: v => { T.lineW = v; T.settingsChanged(); } });
      const radius = UI.slider({ label: 'Corner Roundness', min: 0, max: 100, value: T.radius, def: 0, onInput: v => { T.radius = v; T.settingsChanged(); } });
      const dashed = UI.toggle({ label: 'Dashed Line', value: T.dashed, onChange: v => { T.dashed = v; T.settingsChanged(); vis(); } });
      // kesik çizginin parça ve boşluk uzunluğu (çizgi kalınlığına göre)
      const dLen = UI.slider({ label: 'Dash Length', min: 5, max: 100, value: T.dashLen, def: 22, onInput: v => { T.dashLen = v; T.settingsChanged(); } });
      const dGap = UI.slider({ label: 'Gap Length', min: 5, max: 100, value: T.dashGap, def: 20, onInput: v => { T.dashGap = v; T.settingsChanged(); } });
      const outline = UI.toggle({ label: 'Outline', value: T.outline, onChange: v => { T.outline = v; T.settingsChanged(); } });
      const fill = UI.optSection('Fill Inside', T.fill, v => { T.fill = v; T.settingsChanged(); }, [
        UI.color({
          label: 'Fill Color', value: T.color2, onInput: v => { T.color2 = v; T.settingsChanged(); },
          grad: { on: T.fillGradOn, fresh: !T.fillGrad, value: T.fillGrad || U.gradDef(T.color2, '#6c5cff', 135), onMode: on => { T.fillGradOn = on; if (!T.fillGrad) T.fillGrad = U.gradDef(T.color2, '#6c5cff', 135); T.settingsChanged(); }, onInput: g => { T.fillGrad = g; T.settingsChanged(); } },
        }).el,
      ]);
      // fosforlu kalemin kendi opaklığı var (varsayılan %75)
      const opSl = UI.slider({ label: 'Opacity', min: 1, max: 100, value: T.brush === 'marker' ? T.mOpacity : T.opacity, onInput: v => { if (T.brush === 'marker') T.mOpacity = v; else T.opacity = v; T.settingsChanged(); } });
      const center = UI.toggle({ label: 'Draw from Center', value: T.center, onChange: v => { T.center = v; T.settingsChanged(); } });
      const density = UI.slider({ label: 'Intensity', min: 5, max: 100, value: T.density, def: 50, info: 'How much paint the spray releases at once.', onInput: v => { T.density = v; T.settingsChanged(); } });
      const dot = UI.slider({ label: 'Droplet Size', min: 10, max: 100, value: T.dot, def: 50, onInput: v => { T.dot = v; T.settingsChanged(); } });
      body.appendChild(UI.section('Settings', [
        c1.el, c1s.el, T.sizeSl.el, density.el, dot.el, hard.el, tol.el, lw.el, radius.el, opSl.el, dashed.el, dLen.el, dGap.el, outline.el, center.el,
        fill,
      ]));
      // Katman seçeneği yalnızca şekillerde anlamlıdır (fırça her zaman çizim katmanına çizer)
      const layerSec = UI.section('Layer', [
        UI.toggle({ label: 'Draw on a New Layer', value: T.newLayer, info: 'When on, each shape gets its own layer and can be moved and resized separately with the Edit tool. When off, it is drawn on the selected layer.', onChange: v => { T.newLayer = v; T.settingsChanged(); } }).el,
      ]);
      const tip = UI.note('');
      const vis = () => {
        const b = T.brush, sh = SHAPES.has(b), box = BOXES.has(b);
        const show = (el, on) => { el.style.display = on ? '' : 'none'; };
        show(c1.el, b !== 'eraser' && !sh);
        show(c1s.el, sh);
        show(T.sizeSl.el, !sh && b !== 'bucket');
        show(hard.el, b === 'normal' || b === 'eraser');
        show(density.el, b === 'spray');
        show(dot.el, b === 'spray');
        show(tol.el, b === 'bucket');
        show(lw.el, sh);
        show(radius.el, b === 'srect');
        show(dashed.el, sh);
        show(dLen.el, sh && T.dashed);
        show(dGap.el, sh && T.dashed);
        show(outline.el, box && T.fill);
        show(fill, box);
        show(center.el, box);
        show(layerSec, sh);
        tip.textContent = App.t(sh
          ? 'Shift gives a square/circle and straight angles. Alt temporarily inverts the "Draw from center" setting. Ctrl reverses snapping while held.'
          : b === 'bucket' ? 'The area you click is filled with the selected color on a new layer.'
            : b === 'neon' || b === 'marker' ? 'While Shift is held, the brush only goes straight horizontally, vertically or at 45 degrees. Alt + wheel changes the size.'
            : b === 'eraser' ? 'The eraser works on the selected layer. Alt + wheel changes the size.'
              : 'Brush strokes are collected on a separate drawing layer so the photo stays intact. Hold Shift to draw straight lines (in 45 degree steps). Alt + wheel changes the size.');
        opSl.set(b === 'marker' ? T.mOpacity : T.opacity);
      };
      fill.querySelector('input').addEventListener('change', () => setTimeout(vis, 0));
      vis();
      body.appendChild(layerSec);
      body.appendChild(tip);
    },
  };

  function makeTip(d, color, hard) {
    d = Math.max(1, d);
    const s = Math.ceil(d) + 2, c = U.canvas(s, s), x = c.getContext('2d');
    const r = d / 2, cx = s / 2;
    if (hard >= 0.99 || d < 3) {
      x.fillStyle = color; x.beginPath(); x.arc(cx, cx, r, 0, Math.PI * 2); x.fill();
    } else {
      const g = x.createRadialGradient(cx, cx, 0, cx, cx, r);
      g.addColorStop(0, color); g.addColorStop(Math.max(0.01, hard), color); g.addColorStop(1, U.rgba(color.length === 7 ? color : '#000000', 0));
      x.fillStyle = g; x.beginPath(); x.arc(cx, cx, r, 0, Math.PI * 2); x.fill();
    }
    return c;
  }

  // Renk, boyut, fırça türü gibi ayar değişiklikleri Ctrl+Z ile geri alınabilir
  UI.toolSettingsHist(T, ['brush', 'color', 'color2', 'size', 'opacity', 'mOpacity', 'hard', 'newLayer', 'fill', 'outline', 'dashed', 'dashLen', 'dashGap', 'radius', 'lineW', 'center', 'tol', 'density', 'dot', 'gradOn', 'grad', 'fillGradOn', 'fillGrad'],
    () => { App.updateCursor(); App.brushCursor = null; UI.rebuildPanel(); });

  App.on('prefs', k => { if (k === 'drawColor') { T.color = App.prefs.drawColor; if (App.tool === T) UI.rebuildPanel(); } });
  App.registerTool(T);
})();
