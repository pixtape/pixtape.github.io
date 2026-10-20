'use strict';
/* Öğe aracı: şekiller, çıkartmalar, çerçeveler, kaplamalar */
(() => {
  const { U, ui: UI, IMG } = App;
  const h = U.h;
  // tuvali kaplayan kilitli kaplama, alttaki şekillerin tıklanarak seçilmesini engellemesin
  // Kaplamalar tuvalin tamamını kapladığı için tıklama alttaki katmana geçer; seçiliyken içinden sürüklenince taşınır
  const pickable = q => q.type !== 'overlay';
  // Tuvalde tutamaçlarıyla taşınıp boyutlandırılabilen katmanlar (Düzenle aracıyla aynı; kilitliyse yalnızca seçilir)
  const movable = L => !!L && ['shape', 'raster', 'text', 'overlay', 'frame'].includes(L.type);

  /* ------------------------------------------------ şekil yolları (w×h kutusunda) */
  // Köşe noktaları kutuya tam oturtulur (yıldızın alt uçları ve altıgenin yanları kutunun kenarına değsin;
  // böylece tutamaçlar şeklin hemen kenarından başlar)
  const fitPts = (x, w, hh, pts) => {
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    pts.forEach(([px, py], i) => {
      const qx = (px - x0) / (x1 - x0 || 1) * w, qy = (py - y0) / (y1 - y0 || 1) * hh;
      i ? x.lineTo(qx, qy) : x.moveTo(qx, qy);
    });
    x.closePath();
  };
  const star = (x, w, hh, n, inner) => {
    const pts = [];
    for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + i * Math.PI / n, r = i % 2 ? inner : 1; pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
    fitPts(x, w, hh, pts);
  };
  // Düzgün çokgenin (inner < 1 ise yıldızın) köşelerini saran kutunun en / boy oranı
  const polyAspect = (n, inner) => {
    const xs = [], ys = [], k = inner < 1 ? 2 : 1;
    for (let i = 0; i < n * k; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / (n * k), r = i % 2 && k === 2 ? inner : 1; xs.push(Math.cos(a) * r); ys.push(Math.sin(a) * r); }
    return (Math.max(...xs) - Math.min(...xs)) / (Math.max(...ys) - Math.min(...ys));
  };
  const poly = (x, w, hh, n) => {
    const pts = [];
    for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / n; pts.push([Math.cos(a), Math.sin(a)]); }
    fitPts(x, w, hh, pts);
  };
  const SHAPES = {
    rect: { name: 'Rectangle', path: (x, w, hh, s) => { x.roundRect(0, 0, w, hh, Math.min(s.radius || 0, w / 2, hh / 2)); } },
    rounded: { name: 'Rounded Corners', path: (x, w, hh) => { x.roundRect(0, 0, w, hh, Math.min(w, hh) * 0.18); } },
    ellipse: { name: 'Ellipse', path: (x, w, hh) => { x.ellipse(w / 2, hh / 2, w / 2, hh / 2, 0, 0, Math.PI * 2); } },
    triangle: { name: 'Triangle', path: (x, w, hh) => { x.moveTo(w / 2, 0); x.lineTo(w, hh); x.lineTo(0, hh); x.closePath(); } },
    diamond: { name: 'Diamond', path: (x, w, hh) => { x.moveTo(w / 2, 0); x.lineTo(w, hh / 2); x.lineTo(w / 2, hh); x.lineTo(0, hh / 2); x.closePath(); } },
    star: { name: 'Star', path: (x, w, hh, s) => star(x, w, hh, s.points || 5, 0.45) },
    burst: { name: 'Burst', path: (x, w, hh) => star(x, w, hh, 16, 0.78) },
    hexagon: { name: 'Hexagon', path: (x, w, hh, s) => poly(x, w, hh, s.points || 6) },
    heart: {
      name: 'Heart', path: (x, w, hh) => {
        x.moveTo(w / 2, hh * 0.28);
        x.bezierCurveTo(w * 0.5, hh * 0.05, w * 0.05, hh * -0.05, w * 0.03, hh * 0.32);
        x.bezierCurveTo(0, hh * 0.6, w * 0.35, hh * 0.78, w / 2, hh);
        x.bezierCurveTo(w * 0.65, hh * 0.78, w, hh * 0.6, w * 0.97, hh * 0.32);
        x.bezierCurveTo(w * 0.95, hh * -0.05, w * 0.5, hh * 0.05, w / 2, hh * 0.28);
        x.closePath();
      },
    },
    arrow: { name: 'Arrow', path: (x, w, hh) => { x.moveTo(0, hh * 0.3); x.lineTo(w * 0.6, hh * 0.3); x.lineTo(w * 0.6, 0); x.lineTo(w, hh / 2); x.lineTo(w * 0.6, hh); x.lineTo(w * 0.6, hh * 0.7); x.lineTo(0, hh * 0.7); x.closePath(); } },
    darrow: { name: 'Double Arrow', path: (x, w, hh) => { x.moveTo(0, hh / 2); x.lineTo(w * 0.25, 0); x.lineTo(w * 0.25, hh * 0.3); x.lineTo(w * 0.75, hh * 0.3); x.lineTo(w * 0.75, 0); x.lineTo(w, hh / 2); x.lineTo(w * 0.75, hh); x.lineTo(w * 0.75, hh * 0.7); x.lineTo(w * 0.25, hh * 0.7); x.lineTo(w * 0.25, hh); x.closePath(); } },
    // Kutu ve kuyruk tek bir çizgi: üst üste binen parça olmaz (evenodd dolguda boşluk, konturda ek yeri çizgisi kalmaz)
    bubble: {
      name: 'Speech Bubble', path: (x, w, hh) => {
        const b = hh * 0.78, r = Math.min(w, b) * 0.2;
        x.moveTo(r, 0);
        x.arcTo(w, 0, w, b, r); x.arcTo(w, b, 0, b, r);
        x.lineTo(w * 0.42, b); x.lineTo(w * 0.18, hh); x.lineTo(w * 0.22, b);
        x.arcTo(0, b, 0, 0, r); x.arcTo(0, 0, w, 0, r);
        x.closePath();
      },
    },
    thought: { name: 'Thought', path: (x, w, hh) => { x.ellipse(w / 2, hh * 0.4, w / 2, hh * 0.4, 0, 0, Math.PI * 2); x.moveTo(w * 0.3, hh * 0.86); x.ellipse(w * 0.25, hh * 0.86, w * 0.06, hh * 0.06, 0, 0, Math.PI * 2); x.moveTo(w * 0.18, hh * 0.97); x.ellipse(w * 0.15, hh * 0.97, w * 0.03, hh * 0.03, 0, 0, Math.PI * 2); } },
    plus: { name: 'Plus', path: (x, w, hh) => { const a = 0.33, b = 0.67; x.moveTo(w * a, 0); x.lineTo(w * b, 0); x.lineTo(w * b, hh * a); x.lineTo(w, hh * a); x.lineTo(w, hh * b); x.lineTo(w * b, hh * b); x.lineTo(w * b, hh); x.lineTo(w * a, hh); x.lineTo(w * a, hh * b); x.lineTo(0, hh * b); x.lineTo(0, hh * a); x.lineTo(w * a, hh * a); x.closePath(); } },
    ring: { name: 'Ring', path: (x, w, hh) => { x.ellipse(w / 2, hh / 2, w / 2, hh / 2, 0, 0, Math.PI * 2); x.moveTo(w * 0.8, hh / 2); x.ellipse(w / 2, hh / 2, w * 0.3, hh * 0.3, 0, 0, Math.PI * 2, true); } },
    line: { name: 'Line', line: true, path: (x, w, hh) => { x.moveTo(0, hh / 2); x.lineTo(w, hh / 2); } },
    banner: { name: 'Band', path: (x, w, hh) => { x.moveTo(0, 0); x.lineTo(w, 0); x.lineTo(w * 0.92, hh / 2); x.lineTo(w, hh); x.lineTo(0, hh); x.lineTo(w * 0.08, hh / 2); x.closePath(); } },
    pentagon: { name: 'Pentagon', path: (x, w, hh) => poly(x, w, hh, 5) },
    octagon: { name: 'Octagon', path: (x, w, hh) => { const pts = []; for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; pts.push([Math.cos(a), Math.sin(a)]); } fitPts(x, w, hh, pts); } },
    parallel: { name: 'Parallelogram', path: (x, w, hh) => { x.moveTo(w * 0.25, 0); x.lineTo(w, 0); x.lineTo(w * 0.75, hh); x.lineTo(0, hh); x.closePath(); } },
    trapezoid: { name: 'Trapezoid', path: (x, w, hh) => { x.moveTo(w * 0.22, 0); x.lineTo(w * 0.78, 0); x.lineTo(w, hh); x.lineTo(0, hh); x.closePath(); } },
    moon: { name: 'Crescent', path: (x, w, hh) => fitPts(x, w, hh, moonPts()) },
    bolt: { name: 'Lightning Bolt', path: (x, w, hh) => fitPts(x, w, hh, [[0.56, 0], [0.12, 0.56], [0.44, 0.56], [0.3, 1], [0.88, 0.38], [0.56, 0.38], [0.76, 0]]) },
    drop: {
      name: 'Drop', path: (x, w, hh) => {
        x.moveTo(w / 2, 0);
        x.bezierCurveTo(w * 0.62, hh * 0.2, w, hh * 0.42, w, hh * 0.66);
        x.bezierCurveTo(w, hh * 0.86, w * 0.78, hh, w / 2, hh);
        x.bezierCurveTo(w * 0.22, hh, 0, hh * 0.86, 0, hh * 0.66);
        x.bezierCurveTo(0, hh * 0.42, w * 0.38, hh * 0.2, w / 2, 0);
        x.closePath();
      },
    },
  };
  // Hilal: dış dairenin, içine kaydırılmış ikinci dairenin dışında kalan kısmı (tek kapalı yol)
  function moonPts() {
    const cx = 0.42, cy = -0.2, r = 0.82, N = 180, P = [], Q = [];
    const ac = Math.atan2(cy, cx), bc = Math.atan2(-cy, -cx);
    for (let i = 0; i <= N; i++) { const a = ac + 2 * Math.PI * i / N, px = Math.cos(a), py = Math.sin(a); if (Math.hypot(px - cx, py - cy) >= r) P.push([px, py]); }
    for (let i = 0; i <= N; i++) { const b = bc - Math.PI + 2 * Math.PI * i / N, px = cx + Math.cos(b) * r, py = cy + Math.sin(b) * r; if (Math.hypot(px, py) <= 1) Q.push([px, py]); }
    const e = P[P.length - 1], d = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
    if (d(e, Q[0]) > d(e, Q[Q.length - 1])) Q.reverse();
    return [...P, ...Q];
  }

  // Eski projelerdeki iki renkli degradeyi yeni biçime çevirir
  const shapeGrad = s => {
    if (!s.grad) s.grad = U.gradDef(s.fill, s.fill2 || '#ffffff', 135);
    return s.grad;
  };

  // Dolgu türü: düz renk, degrade ya da resim (eski projelerde resim varsa resim)
  const fillMode = L => {
    const s = L.shape;
    if (s.fillMode) return s.fillMode;
    return L.fillImg ? 'image' : s.gradOn ? 'grad' : 'solid';
  };

  function renderShape(L) {
    const s = L.shape, def = SHAPES[s.kind] || SHAPES.rect;
    const sw = s.strokeOn || def.line ? Math.max(1, s.strokeW) : 0;
    // tutamaçlar şeklin kenarından başlasın: yalnızca kontur kalınlığının yarısı kadar pay bırakılır
    const pad = sw ? Math.ceil(sw / 2) + 1 : 0;
    const w = Math.max(2, s.w), hh = Math.max(2, def.line ? Math.max(sw, 2) : s.h);
    const c = U.canvas(w + pad * 2, hh + pad * 2), x = c.getContext('2d');
    x.translate(pad, pad);
    x.beginPath();
    def.path(x, w, def.line ? hh : hh, s);
    if (!def.line && s.fillOn !== false) {
      if (fillMode(L) === 'image' && L.fillImg) {
        x.save(); x.clip('evenodd');
        const im = L.fillImg, k = Math.max(w / im.width, hh / im.height) * (s.imgZoom || 1);
        const iw = im.width * k, ih = im.height * k;
        x.drawImage(im, (w - iw) / 2 + (s.imgX || 0) * w, (hh - ih) / 2 + (s.imgY || 0) * hh, iw, ih);
        x.restore();
      } else {
        x.fillStyle = fillMode(L) === 'grad' ? U.gradFill(x, shapeGrad(s), 0, 0, w, hh) : s.fill;
        x.fill('evenodd');
      }
    }
    if (sw) {
      x.lineJoin = 'round'; x.lineCap = 'round';
      // çizginin rengi dolgu rengidir; konturun kendi degradesi olabilir
      x.strokeStyle = def.line ? (fillMode(L) === 'grad' ? U.gradFill(x, shapeGrad(s), 0, 0, w, hh) : s.fill)
        : s.strokeGradOn && s.strokeGrad ? U.gradFill(x, s.strokeGrad, 0, 0, w, hh) : s.stroke;
      x.lineWidth = sw;
      if (s.dash) x.setLineDash([sw * (s.dashLen || 25) / 10, sw * (s.dashGap || 15) / 10]);
      x.stroke();
    }
    L.canvas = c;
  }
  App.layerRenderers.shape = renderShape;
  App.layerScalers = App.layerScalers || {};
  App.layerScalers.shape = L => {
    L.shape.w *= Math.abs(L.sx); L.shape.h *= Math.abs(L.sy);
    // eksi ölçek ayna demektir; boyut işlenirken yön kaybolmasın
    if (L.sx < 0) L.flipX = !L.flipX;
    if (L.sy < 0) L.flipY = !L.flipY;
    L.sx = 1; L.sy = 1;
    renderShape(L);
  };
  // Çıkartmalar (emoji) - ölçek raster olarak kalır ama yüksek çözünürlükle çizilir

  /* ------------------------------------------------ çerçeveler */
  const FRAMES = [
    ['solid', 'Plain'], ['double', 'Double Line'], ['rounded', 'Rounded Corners'], ['polaroid', 'Instant Photo'], ['film', 'Film Strip'], ['shadow', 'Inner Shadow'],
    ['dashed', 'Dashed'], ['neon', 'Neon'], ['vintage', 'Aging'], ['circle', 'Circle'], ['stamp', 'Stamp'], ['corners', 'Corners'], ['inset', 'Inner Line'],
  ];
  function renderFrame(L) {
    const d = App.doc, f = L.frame, W = d.w, H = d.h, M = Math.min(W, H);
    // eski "Degrade" çerçevesi: degradeli düz çerçeveyle aynıdır
    if (f.style === 'gradient') { frameGrad(f); f.style = 'solid'; f.gradOn = true; }
    const bw = Math.max(1, M * f.width / 100);
    const c = U.canvas(W, H), x = c.getContext('2d');
    const col = f.color, col2 = f.color2 || '#ffffff';
    // Düz renkli çerçeveler degradeyle de boyanabilir (renk kutusundaki "Degrade" seçimi)
    const paint = f.gradOn && GRAD_FRAMES.has(f.style) ? U.gradFill(x, frameGrad(f), 0, 0, W, H) : col;
    const rad = (f.radius || 0) / 100 * M * 0.25;
    // çizgi çerçeveleri (kesikli, neon, köşeler, iç çizgi): kalınlık, kenar boşluğu ve büyüme yönü ayrı ayarlanır
    let lw = 0, lp = 0;
    if (LINE_FRAMES.has(f.style)) {
      lineDefaults(f);
      lw = Math.max(1, M * f.lw / 100);
      const m = M * f.margin / 100;
      // çizginin ortasının kenardan uzaklığı: içe büyürken dış kenarı sabit kalır, dışa büyürken iç kenarı
      lp = f.grow === 'out' ? m - lw / 2 : f.grow === 'center' ? m : m + lw / 2;
    }
    const lineRect = () => { x.beginPath(); x.roundRect(lp, lp, Math.max(0, W - lp * 2), Math.max(0, H - lp * 2), rad); };
    const hole = (r = 0, inset = bw) => { x.globalCompositeOperation = 'destination-out'; x.beginPath(); x.roundRect(inset, inset, W - inset * 2, H - inset * 2, r); x.fill(); x.globalCompositeOperation = 'source-over'; };
    switch (f.style) {
      case 'solid': x.fillStyle = paint; x.fillRect(0, 0, W, H); hole(rad); break;
      case 'double':
        x.fillStyle = paint; x.fillRect(0, 0, W, H); hole(rad, bw * 0.45);
        x.strokeStyle = paint; x.lineWidth = bw * 0.25;
        x.beginPath(); x.roundRect(bw * 0.8, bw * 0.8, W - bw * 1.6, H - bw * 1.6, Math.max(0, rad - bw * 0.35)); x.stroke();
        break;
      case 'rounded': x.fillStyle = paint; x.fillRect(0, 0, W, H); hole(Math.max(bw, rad), bw); break;
      case 'polaroid': x.fillStyle = paint; x.fillRect(0, 0, W, H); x.globalCompositeOperation = 'destination-out'; x.fillRect(bw, bw, W - bw * 2, H - bw * 4.5); x.globalCompositeOperation = 'source-over'; break;
      case 'film': {
        const fb = bw * 2.2;
        x.fillStyle = '#111'; x.fillRect(0, 0, W, fb); x.fillRect(0, H - fb, W, fb);
        x.fillStyle = paint !== col ? paint : col === '#000000' ? '#f4f1e8' : col;
        const hw = fb * 0.42, hh2 = fb * 0.5, gap = hw * 1.9;
        for (let px = gap / 2; px < W; px += gap) { x.beginPath(); x.roundRect(px, (fb - hh2) / 2, hw, hh2, hw * 0.2); x.roundRect(px, H - fb + (fb - hh2) / 2, hw, hh2, hw * 0.2); x.fill(); }
        break;
      }
      case 'shadow': {
        const g1 = x.createRadialGradient(W / 2, H / 2, M * 0.25, W / 2, H / 2, Math.hypot(W, H) / 2);
        g1.addColorStop(0, U.rgba(col, 0)); g1.addColorStop(1, U.rgba(col, Math.min(1, f.width / 10)));
        x.fillStyle = g1; x.fillRect(0, 0, W, H);
        break;
      }
      case 'dashed':
        x.strokeStyle = paint; x.lineWidth = lw; x.setLineDash([lw * f.dashLen, lw * f.dashGap]);
        lineRect(); x.stroke();
        break;
      case 'neon':
        x.strokeStyle = paint; x.lineWidth = lw;
        if (paint !== col) {
          // degradeli neon: parıltı da degradenin renklerini alsın (gölge tek renk olabildiği için bulanık kopya)
          x.save(); x.filter = `blur(${lw * (f.glow == null ? 4 : f.glow / 25) / 2}px)`;
          for (let i = 0; i < 2; i++) { lineRect(); x.stroke(); }
          x.restore();
          lineRect(); x.stroke();
        } else {
          x.shadowColor = col; x.shadowBlur = lw * (f.glow == null ? 4 : f.glow / 25);
          for (let i = 0; i < 2; i++) { lineRect(); x.stroke(); }
        }
        x.shadowBlur = 0; x.strokeStyle = '#ffffff'; x.lineWidth = Math.max(1, lw * 0.3);
        lineRect(); x.stroke();
        break;
      case 'vintage': {
        const rnd = U.rng(42);
        x.fillStyle = paint;
        x.beginPath();
        x.rect(0, 0, W, H);
        const pts = [], N = 220;
        for (let i = 0; i < N; i++) {
          const t = i / N, per = 2 * (W + H), dpos = t * per;
          let px, py;
          if (dpos < W) { px = dpos; py = 0; } else if (dpos < W + H) { px = W; py = dpos - W; } else if (dpos < 2 * W + H) { px = W - (dpos - W - H); py = H; } else { px = 0; py = H - (dpos - 2 * W - H); }
          const inset = bw * (0.6 + rnd() * 0.9);
          const cx = W / 2 - px, cy = H / 2 - py, l = Math.hypot(cx, cy) || 1;
          pts.push([px + cx / l * inset, py + cy / l * inset]);
        }
        pts.reverse().forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py)));
        x.closePath();
        x.fill('evenodd');
        const g = x.createRadialGradient(W / 2, H / 2, M * 0.3, W / 2, H / 2, Math.hypot(W, H) / 2);
        g.addColorStop(0, 'rgba(90,50,10,0)'); g.addColorStop(1, 'rgba(90,50,10,.45)');
        x.fillStyle = g; x.fillRect(0, 0, W, H);
        break;
      }
      case 'circle':
        x.fillStyle = paint; x.fillRect(0, 0, W, H);
        x.globalCompositeOperation = 'destination-out';
        x.beginPath(); x.ellipse(W / 2, H / 2, W / 2 - bw, H / 2 - bw, 0, 0, Math.PI * 2); x.fill();
        x.globalCompositeOperation = 'source-over';
        break;
      case 'stamp': {
        x.fillStyle = paint; x.fillRect(0, 0, W, H); hole(0, bw * 1.6);
        x.globalCompositeOperation = 'destination-out';
        const r = bw * 0.45, step = r * 2.6;
        for (let px = step / 2; px < W; px += step) { x.beginPath(); x.arc(px, 0, r, 0, Math.PI * 2); x.arc(px, H, r, 0, Math.PI * 2); x.fill(); }
        for (let py = step / 2; py < H; py += step) { x.beginPath(); x.arc(0, py, r, 0, Math.PI * 2); x.arc(W, py, r, 0, Math.PI * 2); x.fill(); }
        x.globalCompositeOperation = 'source-over';
        break;
      }
      case 'corners': {
        // köşe çizgisi lp konumunda; kare uç sayesinde dış kenarı köşeden taşmaz
        x.strokeStyle = paint; x.lineWidth = lw; x.lineCap = 'square';
        const o = lp, Lc = M * f.cornerLen / 100;
        x.beginPath();
        x.moveTo(o, o + Lc); x.lineTo(o, o); x.lineTo(o + Lc, o);
        x.moveTo(W - o - Lc, o); x.lineTo(W - o, o); x.lineTo(W - o, o + Lc);
        x.moveTo(W - o, H - o - Lc); x.lineTo(W - o, H - o); x.lineTo(W - o - Lc, H - o);
        x.moveTo(o + Lc, H - o); x.lineTo(o, H - o); x.lineTo(o, H - o - Lc);
        x.stroke();
        break;
      }
      case 'inset':
        x.strokeStyle = paint; x.lineWidth = lw;
        lineRect(); x.stroke();
        break;
    }
    L.canvas = c;
    L.x = W / 2; L.y = H / 2; L.sx = 1; L.sy = 1; L.rot = 0;
  }
  App.layerRenderers.frame = renderFrame;
  // Degrade çerçeve: eski projelerdeki iki renk yeni degrade biçimine çevrilir
  const frameGrad = f => {
    if (!f.grad) f.grad = U.gradDef(f.color, f.color2 || '#6c5cff', 135);
    return f.grad;
  };
  /* Çizgi çerçeveleri: eskiden tek "Kalınlık" ayarı hem çizgiyi kalınlaştırıp hem de içeri itiyordu.
     Artık çizgi kalınlığı, kenardan uzaklık ve büyüme yönü ayrıdır. Eski projelerdeki değerler aynı görünüme çevrilir. */
  const LINE_FRAMES = new Set(['dashed', 'neon', 'corners', 'inset']);
  const LINE_K = { dashed: 0.3, neon: 0.35, corners: 0.4, inset: 0.15 };
  function lineDefaults(f) {
    const w = f.width == null ? 4 : f.width;
    if (f.lw == null) f.lw = Math.max(0.1, Math.round(w * (LINE_K[f.style] || 0.3) * 10) / 10);
    if (f.margin == null) f.margin = Math.max(0, Math.round((w * (f.style === 'neon' ? 1.2 : 1) - f.lw / 2) * 10) / 10);
    if (!f.grow) f.grow = 'in';
    if (f.dashLen == null) f.dashLen = 4;
    if (f.dashGap == null) f.dashGap = 2.7;
    if (f.cornerLen == null) f.cornerLen = 12;
  }
  // Köşe yuvarlaklığının işe yaradığı çerçeveler
  const FRAME_RADIUS = new Set(['solid', 'double', 'rounded', 'dashed', 'neon', 'inset']);
  // Rengi degrade de olabilen çerçeveler (gölge kendi geçişini kullanır)
  const GRAD_FRAMES = new Set(['solid', 'double', 'rounded', 'polaroid', 'film', 'dashed', 'neon', 'vintage', 'circle', 'stamp', 'corners', 'inset']);

  /* ------------------------------------------------ kaplamalar */
  const OVERLAYS = [
    ['leak1', 'Light Leak 1', 'screen'], ['leak2', 'Light Leak 2', 'screen'], ['leak3', 'Light Leak 3', 'screen'],
    ['bokeh', 'Bokeh', 'screen'], ['sunset', 'Sunset', 'soft-light'], ['rainbow', 'Rainbow', 'screen'],
    ['rays', 'Sunbeams', 'screen'], ['dust', 'Dust & Scratches', 'screen'], ['grain', 'Grain', 'overlay'],
    ['vignette', 'Vignette', 'multiply'], ['snow', 'Snow', 'source-over'], ['confetti', 'Confetti', 'source-over'],
    ['hearts', 'Hearts', 'source-over'], ['stars', 'Stars', 'screen'], ['haze', 'Fog', 'screen'], ['duo', 'Purple Teal', 'color'],
  ];
  function renderOverlay(L) {
    const d = App.doc, o = L.overlay, W = d.w, H = d.h, M = Math.max(W, H), m = Math.min(W, H);
    const c = U.canvas(W, H), x = c.getContext('2d'), rnd = U.rng(o.seed || 11);
    const radial = (cx, cy, r, col, a = 1) => { const g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, U.rgba(col, a)); g.addColorStop(1, U.rgba(col, 0)); x.fillStyle = g; x.fillRect(0, 0, W, H); };
    switch (o.kind) {
      case 'leak1': x.fillStyle = '#000'; x.fillRect(0, 0, W, H); radial(W * 0.05, H * 0.1, M * 0.6, '#ff6a00'); radial(W * 0.25, 0, M * 0.35, '#ff0080', 0.8); break;
      case 'leak2': x.fillStyle = '#000'; x.fillRect(0, 0, W, H); radial(W, H * 0.5, M * 0.55, '#ffd000'); radial(W * 0.9, H, M * 0.4, '#ff3d00', 0.9); break;
      case 'leak3': x.fillStyle = '#000'; x.fillRect(0, 0, W, H); radial(0, H, M * 0.5, '#00e1ff'); radial(W, 0, M * 0.5, '#b000ff'); break;
      case 'bokeh':
        x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
        for (let i = 0; i < 60; i++) {
          const r = m * (0.02 + rnd() * 0.07), cx = rnd() * W, cy = rnd() * H;
          x.fillStyle = `hsla(${30 + rnd() * 40},100%,${60 + rnd() * 25}%,${0.15 + rnd() * 0.35})`;
          x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
        }
        break;
      case 'sunset': { const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#ff4e50'); g.addColorStop(0.5, '#f9d423'); g.addColorStop(1, '#6a3093'); x.fillStyle = g; x.fillRect(0, 0, W, H); break; }
      case 'rainbow': {
        x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
        const cols = ['#ff0000', '#ff8000', '#ffff00', '#00ff00', '#0080ff', '#8000ff'];
        x.globalAlpha = 0.5; x.lineWidth = m * 0.035;
        cols.forEach((col, i) => { x.strokeStyle = col; x.beginPath(); x.arc(W * 0.7, H * 1.1, M * 0.75 - i * x.lineWidth, Math.PI, Math.PI * 2); x.stroke(); });
        x.globalAlpha = 1; x.filter = `blur(${m * 0.01}px)`; const t = U.clone(c); x.clearRect(0, 0, W, H); x.drawImage(t, 0, 0); x.filter = 'none';
        break;
      }
      case 'rays': {
        x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
        const cx = W * 0.85, cy = -H * 0.1;
        x.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 14; i++) {
          const a = Math.PI * 0.5 + (rnd() - 0.2) * 1.2, wd = 0.02 + rnd() * 0.05;
          const g = x.createRadialGradient(cx, cy, 0, cx, cy, M * 1.3); g.addColorStop(0, 'rgba(255,240,200,.35)'); g.addColorStop(1, 'rgba(255,240,200,0)');
          x.fillStyle = g; x.beginPath(); x.moveTo(cx, cy); x.arc(cx, cy, M * 1.4, a - wd, a + wd); x.closePath(); x.fill();
        }
        x.globalCompositeOperation = 'source-over';
        radial(cx, cy + H * 0.1, M * 0.3, '#fff2c0', 0.6);
        break;
      }
      case 'dust':
        x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
        x.fillStyle = 'rgba(255,255,255,.7)';
        for (let i = 0; i < 400; i++) { const r = rnd() * m * 0.003 + 0.5; x.beginPath(); x.arc(rnd() * W, rnd() * H, r, 0, Math.PI * 2); x.fill(); }
        x.strokeStyle = 'rgba(255,255,255,.35)';
        for (let i = 0; i < 18; i++) { x.lineWidth = rnd() * 1.5 + 0.5; const sx = rnd() * W; x.beginPath(); x.moveTo(sx, 0); x.bezierCurveTo(sx + (rnd() - 0.5) * 40, H * 0.3, sx + (rnd() - 0.5) * 40, H * 0.6, sx + (rnd() - 0.5) * 60, H); x.stroke(); }
        break;
      case 'grain': {
        const sc = 2, gw = Math.ceil(W / sc), gh = Math.ceil(H / sc), gc = U.canvas(gw, gh), gx = gc.getContext('2d'), id = gx.createImageData(gw, gh);
        for (let i = 0; i < id.data.length; i += 4) { const v = 128 + (rnd() + rnd() - 1) * 120; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
        gx.putImageData(id, 0, 0); x.drawImage(gc, 0, 0, W, H);
        break;
      }
      case 'vignette': { x.fillStyle = '#fff'; x.fillRect(0, 0, W, H); const g = x.createRadialGradient(W / 2, H / 2, m * 0.3, W / 2, H / 2, Math.hypot(W, H) / 2); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.85)'); x.fillStyle = g; x.fillRect(0, 0, W, H); break; }
      case 'snow':
        for (let i = 0; i < 500; i++) { const r = (rnd() ** 3) * m * 0.012 + 1; x.fillStyle = `rgba(255,255,255,${0.4 + rnd() * 0.6})`; x.beginPath(); x.arc(rnd() * W, rnd() * H, r, 0, Math.PI * 2); x.fill(); }
        break;
      case 'confetti': {
        const cols = ['#ff3b30', '#ffcc00', '#34c759', '#007aff', '#af52de', '#ff2d55', '#00c7be'];
        for (let i = 0; i < 260; i++) { x.save(); x.translate(rnd() * W, rnd() * H); x.rotate(rnd() * Math.PI); x.fillStyle = cols[i % cols.length]; const s = m * (0.006 + rnd() * 0.012); x.fillRect(-s, -s / 3, s * 2, s * 0.7); x.restore(); }
        break;
      }
      case 'hearts':
        for (let i = 0; i < 40; i++) {
          const s = m * (0.02 + rnd() * 0.05); x.save(); x.translate(rnd() * W, rnd() * H); x.rotate((rnd() - 0.5) * 0.8);
          x.fillStyle = `hsla(${340 + rnd() * 30},90%,${55 + rnd() * 20}%,${0.6 + rnd() * 0.4})`; x.beginPath(); SHAPES.heart.path(x, s, s); x.fill(); x.restore();
        }
        break;
      case 'stars':
        x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
        for (let i = 0; i < 300; i++) { const r = (rnd() ** 4) * m * 0.006 + 0.6; x.fillStyle = `rgba(255,255,255,${0.3 + rnd() * 0.7})`; x.beginPath(); x.arc(rnd() * W, rnd() * H, r, 0, Math.PI * 2); x.fill(); }
        for (let i = 0; i < 8; i++) { const cx = rnd() * W, cy = rnd() * H, s = m * 0.02; x.save(); x.translate(cx - s / 2, cy - s / 2); x.fillStyle = '#fff'; x.beginPath(); star(x, s, s, 4, 0.18); x.fill(); x.restore(); }
        break;
      case 'haze': { x.fillStyle = '#000'; x.fillRect(0, 0, W, H); const g = x.createLinearGradient(0, H, 0, 0); g.addColorStop(0, 'rgba(255,255,255,.75)'); g.addColorStop(0.6, 'rgba(255,255,255,.15)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, W, H); break; }
      case 'duo': { const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#7b2ff7'); g.addColorStop(1, '#00d2c4'); x.fillStyle = g; x.fillRect(0, 0, W, H); break; }
    }
    L.canvas = c;
    L.x = W / 2; L.y = H / 2; L.sx = 1; L.sy = 1; L.rot = 0;
  }
  App.layerRenderers.overlay = renderOverlay;

  /* ------------------------------------------------ çıkartmalar */
  const STICKERS = {
    'Faces': '😀 😂 🤣 😍 🥰 😘 😎 🤩 😜 🤔 😭 😡 🥳 😴 🤯 😇 🙃 😉 😱 🤗 🥺 😈 💀 👻 🤖 👽',
    'Hearts': '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 💖 💘 💝 💕 💞 💓 💗 💔 ❣️ 💌',
    'Nature': '🌸 🌹 🌻 🌺 🌷 🍀 🌿 🌴 🌈 ⭐ 🌟 🌙 ☀️ ⚡ 🔥 ❄️ 🌊 🍁 🍂 ☁️ 🌵 🌼',
    'Food': '🍕 🍔 🍟 🌭 🍩 🍦 🍰 🎂 🍓 🍉 🍒 🍑 🥑 ☕ 🍹 🍺 🥂 🍿 🍫 🍪',
    'Celebration': '🎉 🎊 🎈 🎁 👑 💎 🎵 🎶 📷 💡 🎯 🚀 ✨ 💯 🏆 🥇 🎄 🎃 🕯️ 🪅',
    'Hands': '👍 👎 👏 🙌 ✌️ 👌 🤞 💪 👋 🙏 🤘 👉 👈 👆 👇 ✋ 🫶 🤝',
    'Animals': '🐶 🐱 🦊 🐻 🐼 🦁 🐯 🐸 🦄 🐝 🦋 🐢 🐙 🐬 🐳 🦜 🐧 🐣',
    'Symbols': '➡️ ⬅️ ⬆️ ⬇️ ✅ ❌ ❗ ❓ 💬 💭 🔔 📍 🔗 ⚠️ 🆕 🆒 🔝 💲 ♻️ ⏰',
  };
  const stickerCanvas = em => {
    const S = 512, c = U.canvas(S, S), x = c.getContext('2d');
    x.font = `${S * 0.82}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(em, S / 2, S / 2 + S * 0.04);
    return c;
  };

  /* ------------------------------------------------ araç */
  const T = {
    id: 'element', name: 'Elements', icon: 'element', key: 'O',
    tab: 'shape', drag: null,
    // yeni şekillerin varsayılanları; dolgu rengi / degradesi ayarlarda saklanır
    sdef: {
      fill: App.prefs.shapeColor || '#6c5cff', gradOn: !!App.prefs.shapeGradOn,
      grad: App.prefs.shapeGrad || U.gradDef(App.prefs.shapeColor || '#6c5cff', '#00c2ff', 135),
      stroke: '#ffffff', strokeW: 8, strokeOn: false, radius: 0,
    },
    fdef: { color: '#ffffff', color2: '#6c5cff', width: 4, radius: 0 },

    showTab(t) { T.tab = t; UI.rebuildPanel(); },
    cur(type) { const L = App.activeLayer(); return L && L.type === type ? L : null; },

    // Şeklin varsayılan en-boy oranı (genişlik / yükseklik)
    // Shift ile çizerken korunan en / boy oranı: çokgen ve yıldızlar düzgün (eşkenar) çıksın diye kendi doğal oranları
    aspect(kind, s = T.sdef) {
      if (kind === 'arrow' || kind === 'darrow') return 2.5;
      if (kind === 'banner') return 3.75;
      if (kind === 'triangle') return 2 / Math.sqrt(3);
      if (kind === 'hexagon') return polyAspect(s.points || 6, 1);
      if (kind === 'star') return polyAspect(s.points || 5, 0.45);
      if (kind === 'burst') return polyAspect(16, 0.78);
      return 1;
    },
    newShapeLayer(kind, w, hh) {
      const s = { kind, w, h: hh, ...JSON.parse(JSON.stringify(T.sdef)) };
      if (kind === 'line') s.strokeW = Math.max(4, Math.min(App.doc.w, App.doc.h) * 0.35 * 0.03);
      return App.newLayer(U.canvas(1, 1), { type: 'shape', name: SHAPES[kind].name, shape: s });
    },
    addShape(kind, at) {
      const d = App.doc, M = Math.min(d.w, d.h) * 0.35;
      const a = T.aspect(kind);
      const L = T.newShapeLayer(kind, kind === 'line' ? M * 1.4 : M * Math.min(1.5, a), kind === 'line' ? 1 : M * Math.min(1.5, a) / a);
      renderShape(L);
      L.x = at ? at.x : d.w / 2; L.y = at ? at.y : d.h / 2;
      App.addLayer(L);
      App.commit('Add Shape');
      UI.rebuildPanel();
      return L;
    },
    // Şekil seçildi: kullanıcı tuvalde sürükleyerek çizer
    arm(kind) {
      T.armed = T.armed === kind ? null : kind;
      document.querySelectorAll('.shape-btn').forEach(b => b.classList.toggle('on', b.dataset.k === T.armed));
      if (T.armHint) T.armHint.style.display = T.armed ? '' : 'none';
      if (!T.armed) App.clearSnap();
      App.updateCursor();
    },
    addSticker(em) {
      const d = App.doc, c = stickerCanvas(em);
      const k = Math.min(d.w, d.h) * 0.25 / c.width;
      App.addLayer(App.newLayer(c, { name: 'Sticker ' + em, x: d.w / 2, y: d.h / 2, sx: k, sy: k }));
      App.commit('Add Sticker');
    },
    addFrame(style) {
      let L = T.cur('frame');
      if (!L) L = App.doc.layers.find(l => l.type === 'frame');
      if (L) { L.frame.style = style; if (style === 'rounded' && (L.frame.radius || 0) < 10) L.frame.radius = 32; renderFrame(L); App.setActive(L.id, false); App.commit('Frame'); UI.rebuildPanel(); return; }
      L = App.newLayer(U.canvas(1, 1), { type: 'frame', name: 'Frame', frame: { style, ...JSON.parse(JSON.stringify(T.fdef)) }, locked: true });
      if (style === 'rounded' && (L.frame.radius || 0) < 10) L.frame.radius = 32;
      renderFrame(L);
      App.addLayer(L, { index: App.doc.layers.length });
      App.commit('Add Frame');
      UI.rebuildPanel();
    },
    addOverlay(kind, blend) {
      const L = App.newLayer(U.canvas(1, 1), { type: 'overlay', name: OVERLAYS.find(o => o[0] === kind)[1], overlay: { kind, seed: Math.floor(Math.random() * 1e5) }, blend, opacity: 0.8, locked: true });
      renderOverlay(L);
      App.addLayer(L);
      App.commit('Add Overlay');
      UI.rebuildPanel();
    },

    cursor() { return T.armed ? 'crosshair' : 'default'; },
    cancel() { if (T.armed) T.arm(null); },
    fromCenter: false,
    deactivate() { T.armed = null; T.make = null; App.xform.drag = null; App.clearSnap(); },

    onDown(p, e) {
      if (T.armed) {
        const s = App.snapStart(p, e);
        App.snapDot = null;
        T.make = { kind: T.armed, a: s, L: null };
        return;
      }
      const L = App.activeLayer();
      const editable = movable(L);
      if (editable && App.xform.grab(L, p)) return;
      const hit = App.pickLayer(p.x, p.y, pickable);
      let target = hit;
      if (editable && App.xform.inside(L, p)) target = L;
      // boş yere tıklanınca seçim kalkar
      if (!target) { if (L) App.setActive(null); return; }
      if (target !== L) App.setActive(target.id);
      if (!target.locked && movable(target)) App.xform.startMove(target, p);
    },
    onMove(p, e) {
      const M = T.make;
      if (!M) { App.xform.move(p, e); return; }
      // Alt burada merkezden büyütmeyi değiştirir; hizalamayı yalnızca Ctrl tersine çevirir
      let b = App.snapEnd(p, M.L, M.kind === 'line' ? e : { ctrlKey: e.ctrlKey, metaKey: e.metaKey });
      const a = M.a, kind = M.kind;
      if (!M.L && Math.hypot(b.x - a.x, b.y - a.y) * App.view.zoom < 4) return;
      if (!M.L) { M.L = T.newShapeLayer(kind, 2, 2); App.addLayer(M.L); }
      const L = M.L, s = L.shape;
      // Alt, "Merkezden büyüt" ayarını o an için tersine çevirir
      const center = T.fromCenter !== e.altKey, free = App.prefs.free;
      if (kind === 'line') {
        let dx = b.x - a.x, dy = b.y - a.y;
        if (e.shiftKey && !free) { const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4), len = Math.hypot(dx, dy); dx = Math.cos(ang) * len; dy = Math.sin(ang) * len; }
        const len = Math.hypot(dx, dy) * (center ? 2 : 1);
        s.w = Math.max(2, len);
        L.rot = Math.atan2(dy, dx) * 180 / Math.PI;
        L.x = center ? a.x : a.x + dx / 2; L.y = center ? a.y : a.y + dy / 2;
      } else {
        let dx = b.x - a.x, dy = b.y - a.y;
        // varsayılan: serbest çizilir; Shift basılıyken şeklin oranı korunur (tamamen serbest modda Shift etkisizdir)
        if (e.shiftKey && !free) {
          const asp = T.aspect(kind, s);
          const w = Math.max(Math.abs(dx), Math.abs(dy) * asp);
          dx = Math.sign(dx || 1) * w; dy = Math.sign(dy || 1) * w / asp;
        }
        const W = Math.abs(dx) * (center ? 2 : 1), H = Math.abs(dy) * (center ? 2 : 1);
        s.w = Math.max(2, W); s.h = Math.max(2, H);
        L.x = center ? a.x : a.x + dx / 2; L.y = center ? a.y : a.y + dy / 2;
      }
      renderShape(L);
      App.requestRender();
    },
    onUp(p, e) {
      const M = T.make;
      if (!M) { App.xform.end(); return; }
      T.make = null;
      if (!M.L) T.addShape(M.kind, M.a);
      else { App.commit('Add Shape'); }
      if (!(e && e.ctrlKey)) T.arm(null);
      UI.rebuildPanel();
    },
    onHover(p, e) {
      if (T.armed) { App.R.stage.style.cursor = 'crosshair'; App.hoverSnap(p, e); return; }
      const L = App.activeLayer();
      const c = movable(L) ? App.xform.cursor(L, p) : null;
      App.R.stage.style.cursor = App.keys.space ? 'grab' : c || (App.pickLayer(p.x, p.y, pickable) ? 'pointer' : 'default');
    },
    drawOverlay(ctx) {
      const L = App.activeLayer();
      if (T.make) return;
      if (movable(L)) App.xform.draw(ctx, L);
    },
    refresh() { UI.rebuildPanel(); },

    panel(body) {
      const S = T.cur('shape'), F = T.cur('frame'), O = T.cur('overlay');
      // Seçili öğenin ayarları yalnızca kendi sekmesinde ve panelin altında (yapışkan) durur;
      // böylece öğe seçilip ayarlar değişince üstteki ızgara yerinden oynamaz
      const props = T.tab === 'shape' && S ? T.shapeProps(S) : T.tab === 'frame' && F ? T.frameProps(F) : T.tab === 'overlay' && O ? T.overlayProps(O) : null;
      body.appendChild(UI.tabs([['shape', 'Shape'], ['sticker', 'Sticker'], ['frame', 'Frame'], ['overlay', 'Overlay'], ['image', 'Image']], v => { T.tab = v; UI.rebuildPanel(); }, T.tab));
      const box = h('div', { class: 'el-box' });
      if (T.tab === 'shape' || T.tab === 'frame' || T.tab === 'overlay') {
        const q = (T.q || {})[T.tab] || '';
        const search = UI.searchBox(v => { (T.q = T.q || {})[T.tab] = v; UI.filterItems(box.firstChild, '.shape-btn, .frame-btn', v); }, { shape: 'Search Shapes…', frame: 'Search Frames…', overlay: 'Search Overlays…' }[T.tab]);
        if (q) { search.inp.value = q; search.el.classList.add('has'); setTimeout(() => UI.filterItems(box.firstChild, '.shape-btn, .frame-btn', q), 0); }
        body.appendChild(search.el);
      }
      body.appendChild(box);
      if (T.tab === 'shape') {
        // çizilecek şeklin rengi baştan seçilir (sonradan seçmeye gerek kalmaz)
        box.appendChild(App.shapeColorField('Color for New Shapes').el);
        box.appendChild(h('div', { class: 'shape-grid' }, Object.entries(SHAPES).map(([k, def]) => {
          const c = U.canvas(56, 56), x = c.getContext('2d');
          x.translate(8, 8); x.beginPath(); def.path(x, 40, 40, { radius: 0 });
          if (def.line) { x.strokeStyle = '#cfd3dc'; x.lineWidth = 4; x.stroke(); } else { x.fillStyle = '#cfd3dc'; x.fill('evenodd'); }
          const b = h('button', { class: 'shape-btn' + (T.armed === k ? ' on' : ''), title: def.name, onclick: () => T.arm(k) }, c);
          b.dataset.k = k; b.dataset.q = def.name + ' ' + App.t(def.name);
          return b;
        })));
        T.armHint = UI.note('Now drag on the canvas to draw the shape.');
        T.armHint.classList.add('hint-on');
        T.armHint.style.display = T.armed ? '' : 'none';
        box.appendChild(T.armHint);
        box.appendChild(UI.toggle({ label: 'Draw from Center', value: T.fromCenter, onChange: v => { T.fromCenter = v; } }).el);
        box.appendChild(UI.note('Pick a shape and drag on the canvas to draw it. Hold Shift to keep the shape\'s proportions. Alt temporarily reverses the "Draw from center" setting. Ctrl reverses snapping to alignment lines while held. A single click adds it at the default size. If you start near an alignment line, the shape starts exactly on the line.'));
      } else if (T.tab === 'sticker') {
        for (const [cat, list] of Object.entries(STICKERS)) {
          box.appendChild(UI.section(cat, [h('div', { class: 'emoji-grid' }, list.split(' ').map(em => h('button', { class: 'emoji-btn', onclick: () => T.addSticker(em) }, em)))], { open: cat === 'Faces' || cat === 'Hearts' }));
        }
      } else if (T.tab === 'frame') {
        box.appendChild(h('div', { class: 'frame-grid' }, FRAMES.map(([k, n]) => h('button', { class: 'frame-btn' + (F && F.frame.style === k ? ' on' : ''), 'data-q': n + ' ' + App.t(n), onclick: () => T.addFrame(k) }, framePreview(k), h('span', null, n)))));
      } else if (T.tab === 'overlay') {
        box.appendChild(h('div', { class: 'frame-grid' }, OVERLAYS.map(([k, n, bl]) => h('button', { class: 'frame-btn', 'data-q': n + ' ' + App.t(n), onclick: () => T.addOverlay(k, bl) }, overlayPreview(k), h('span', null, n)))));
        box.appendChild(UI.note('Overlays are added with a blend mode; you can change the opacity and mode in the Layers panel.'));
      } else {
        box.appendChild(UI.button('Add Image from Computer…', () => App.actions.addImageLayer(), { block: true, primary: true, icon: 'upload' }));
        box.appendChild(UI.note('The added image becomes a new layer. You can move and resize it with the Edit tool. You can also drag images onto the canvas or paste them with Ctrl+V.'));
      }
      if (props) {
        body.appendChild(h('div', { class: 'fx-head at-bottom el-props' },
          h('div', { class: 'fx-head-row' }, h('b', { class: 'fx-head-title' }, props.title), props.extra || null),
          h('div', { class: 'fx-scroll' }, props.kids)));
      }
    },

    shapeProps(L) {
      const s = L.shape;
      const upd = (label, now) => { renderShape(L); App.requestRender(); clearTimeout(T._t); T._t = setTimeout(() => App.commit(label || 'Edit Shape'), now ? 0 : 300); };
      const def = SHAPES[s.kind] || SHAPES.rect;
      const kids = [];
      // kesikli çizgi: açıkken parça ve boşluk uzunluğu da ayarlanır (çizgi kalınlığına göre)
      const dashCtl = () => {
        const dl = UI.slider({ label: 'Dash Length', min: 5, max: 100, value: s.dashLen || 25, def: 25, onInput: v => { s.dashLen = v; renderShape(L); App.requestRender(); }, onChange: () => upd('', 1) }).el;
        const dg = UI.slider({ label: 'Gap Length', min: 5, max: 100, value: s.dashGap || 15, def: 15, onInput: v => { s.dashGap = v; renderShape(L); App.requestRender(); }, onChange: () => upd('', 1) }).el;
        const vis = () => { dl.style.display = dg.style.display = s.dash ? '' : 'none'; };
        vis();
        return [UI.toggle({ label: 'Dashed Line', value: !!s.dash, onChange: v => { s.dash = v; vis(); upd('', 1); } }).el, dl, dg];
      };
      // Dolgu rengi kutusu: düz renk ya da degrade. Yalnızca bu şekli değiştirir; yeni şekillerin rengi ayrı seçilir.
      const fillField = () => UI.color({
        label: 'Color', value: s.fill, onInput: v => { s.fill = v; upd(); },
        grad: {
          on: fillMode(L) === 'grad', fresh: !s.grad, value: shapeGrad(s),
          onMode: on => { s.gradOn = on; s.fillMode = on ? 'grad' : 'solid'; upd('', 1); },
          onInput: g => { s.grad = g; upd(); },
        },
      });
      if (def.line) {
        kids.push(fillField().el);
        kids.push(UI.slider({ label: 'Thickness', min: 1, max: 200, value: Math.round(s.strokeW), onInput: v => { s.strokeW = v; renderShape(L); App.requestRender(); }, onChange: () => upd('', 1) }).el);
        kids.push(...dashCtl());
      } else {
        const colF = fillField();
        // Resim dolgusu: şeklin içi resimle doldurulur; renk/degrade bu sırada kullanılmaz
        const pickImg = async () => {
          const f = await App.actions.pickFile('image/*');
          if (!f) return false;
          L.fillImg = U.fit(await U.fileToCanvas(f[0]), 3000); s.imgZoom = 1; s.imgX = 0; s.imgY = 0;
          return true;
        };
        const imgF = h('div', null,
          h('div', { class: 'btn-row' },
            UI.button(L.fillImg ? 'Replace Image' : 'Choose Image…', async () => { if (await pickImg()) { s.fillMode = 'image'; upd('Image in Shape', 1); UI.rebuildPanel(); } }, { small: true, icon: 'image' }),
            L.fillImg ? UI.button('Remove Image', () => { L.fillImg = null; s.fillMode = s.gradOn ? 'grad' : 'solid'; upd('Remove Image', 1); UI.rebuildPanel(); }, { small: true, icon: 'trash' }) : null),
          L.fillImg ? UI.slider({ label: 'Zoom Image', min: 1, max: 4, step: 0.05, value: s.imgZoom || 1, def: 1, onInput: v => { s.imgZoom = v; renderShape(L); App.requestRender(); }, onChange: () => upd('', 1) }).el : null,
          L.fillImg ? UI.slider({ label: 'Image Landscape', min: -0.5, max: 0.5, step: 0.01, value: s.imgX || 0, def: 0, onInput: v => { s.imgX = v; renderShape(L); App.requestRender(); }, onChange: () => upd('', 1) }).el : null,
          L.fillImg ? UI.slider({ label: 'Image Portrait', min: -0.5, max: 0.5, step: 0.01, value: s.imgY || 0, def: 0, onInput: v => { s.imgY = v; renderShape(L); App.requestRender(); }, onChange: () => upd('', 1) }).el : null);
        // dolgu türü: renk (düz ya da degrade, renk kutusundan seçilir) veya resim
        const kindOf = () => (fillMode(L) === 'image' ? 'image' : 'color');
        const vis = m => { colF.el.style.display = m === 'color' ? '' : 'none'; imgF.style.display = m === 'image' ? '' : 'none'; };
        const kind = UI.seg({
          options: [['color', 'Color'], ['image', 'Image']], value: kindOf(),
          onChange: async v => {
            if (v === 'image' && !L.fillImg) {
              // resim yoksa önce resim seçtir; vazgeçilirse eski dolguda kal
              if (!(await pickImg())) { kind.set && kind.set(kindOf()); return; }
              s.fillMode = 'image'; upd('Image in Shape', 1); UI.rebuildPanel(); return;
            }
            s.fillMode = v === 'image' ? 'image' : s.gradOn ? 'grad' : 'solid';
            vis(v); upd('', 1);
          },
        });
        vis(kindOf());
        kids.push(UI.optSection('Fill', s.fillOn !== false, v => { s.fillOn = v; upd('', 1); }, [kind.el, colF.el, imgF]));
        kids.push(UI.optSection('Outline', !!s.strokeOn, v => { s.strokeOn = v; upd('', 1); }, [
          UI.color({
            label: 'Color', value: s.stroke, onInput: v => { s.stroke = v; upd(); },
            grad: { on: !!s.strokeGradOn, fresh: !s.strokeGrad, value: s.strokeGrad || U.gradDef(s.stroke, '#00c2ff', 135), onMode: on => { s.strokeGradOn = on; if (!s.strokeGrad) s.strokeGrad = U.gradDef(s.stroke, '#00c2ff', 135); upd('', 1); }, onInput: g => { s.strokeGrad = g; upd(); } },
          }).el,
          UI.slider({ label: 'Thickness', min: 1, max: 200, value: Math.round(s.strokeW), onInput: v => { s.strokeW = v; renderShape(L); App.requestRender(); }, onChange: () => upd('', 1) }).el,
          ...dashCtl(),
        ]));
      }
      if (s.kind === 'rect') kids.push(UI.slider({ label: 'Corner Radius', min: 0, max: Math.round(Math.min(s.w, s.h) / 2), value: s.radius || 0, onInput: v => { s.radius = v; renderShape(L); App.requestRender(); }, onChange: () => upd('', 1) }).el);
      if (s.kind === 'star' || s.kind === 'hexagon') kids.push(UI.slider({ label: s.kind === 'star' ? 'Number of Points' : 'Number of Sides', min: 3, max: 16, value: s.points || (s.kind === 'star' ? 5 : 6), onInput: v => { s.points = v; renderShape(L); App.requestRender(); }, onChange: () => upd('', 1) }).el);
      return { title: App.t('Selected shape: {0}', App.t((SHAPES[s.kind] || {}).name || '')), kids };
    },
    frameProps(L) {
      const f = L.frame;
      const upd = now => { renderFrame(L); App.requestRender(); clearTimeout(T._t); T._t = setTimeout(() => App.commit('Edit Frame'), now ? 0 : 300); };
      const sl = (label, k, min, max, step, info) => UI.slider({ label, min, max, step, value: f[k], info, onInput: v => { f[k] = v; renderFrame(L); App.requestRender(); }, onChange: () => upd(1) }).el;
      const line = LINE_FRAMES.has(f.style);
      if (line) lineDefaults(f);
      return { title: App.t('Selected frame: {0}', App.t((FRAMES.find(q => q[0] === f.style) || [0, ''])[1])), extra: UI.iconBtn('trash', 'Remove Frame', () => { App.removeLayer(L.id); App.commit('Remove Frame'); UI.rebuildPanel(); }), kids: [
        UI.color({
          label: 'Color', value: f.color, onInput: v => { f.color = v; T.fdef.color = v; upd(); },
          grad: GRAD_FRAMES.has(f.style) ? { on: !!f.gradOn, value: frameGrad(f), onMode: on => { f.gradOn = T.fdef.gradOn = on; upd(1); }, onInput: g => { f.grad = g; T.fdef.grad = JSON.parse(JSON.stringify(g)); upd(); } } : null,
        }).el,
        line ? [
          sl('Line Width', 'lw', 0.1, 10, 0.1),
          sl('Edge Margin', 'margin', 0, 30, 0.1, 'How far in from the canvas edge the line sits.'),
          UI.seg({
            label: 'Growth Direction', info: 'Which way the line grows as it gets thicker. Inward: its outer edge stays in place. Outward: its inner edge stays in place. Both ways: its middle stays in place.',
            options: [['in', 'Inward'], ['center', 'Both Ways'], ['out', 'Outward']], value: f.grow, onChange: v => { f.grow = v; upd(1); },
          }).el,
          f.style === 'dashed' ? [sl('Dash Length', 'dashLen', 0.5, 20, 0.1), sl('Gap Length', 'dashGap', 0.5, 20, 0.1)] : null,
          f.style === 'corners' ? sl('Corner Length', 'cornerLen', 2, 50, 0.5) : null,
          f.style === 'neon' ? UI.slider({ label: 'Glow', min: 0, max: 200, value: f.glow == null ? 100 : f.glow, def: 100, onInput: v => { f.glow = v; renderFrame(L); App.requestRender(); }, onChange: () => upd(1) }).el : null,
        ].flat().filter(Boolean) : UI.slider({ label: f.style === 'shadow' ? 'Intensity' : 'Thickness', min: 0.2, max: 20, step: 0.1, value: f.width, onInput: v => { f.width = v; T.fdef.width = v; renderFrame(L); App.requestRender(); }, onChange: () => upd(1) }).el,
        FRAME_RADIUS.has(f.style) ? UI.slider({ label: 'Corner Roundness', min: 0, max: 100, value: f.radius || 0, onInput: v => { f.radius = v; renderFrame(L); App.requestRender(); }, onChange: () => upd(1) }).el : null,
      ].flat().filter(Boolean) };
    },
    overlayProps(L) {
      return { title: App.t('Selected overlay: {0}', App.t(L.name)), extra: UI.iconBtn('trash', 'Remove Overlay', () => { App.removeLayer(L.id); App.commit('Remove Overlay'); UI.rebuildPanel(); }), kids: [
        UI.slider({ label: 'Opacity', min: 0, max: 100, value: Math.round(L.opacity * 100), onInput: v => { L.opacity = v / 100; App.requestRender(); }, onChange: () => { App.commit('Overlay Opacity'); } }).el,
        UI.select({ label: 'Mix', options: UI.BLENDS, value: L.blend, onChange: v => { L.blend = v; App.commit('Blend Mode'); } }).el,
        UI.button('New Random Layout', () => { L.overlay.seed = Math.floor(Math.random() * 1e5); renderOverlay(L); App.commit('Overlay'); }, { small: true, icon: 'dice' }),
      ] };
    },
  };

  function framePreview(style) {
    const c = U.canvas(64, 64), x = c.getContext('2d');
    x.fillStyle = '#3a3f4b'; x.fillRect(0, 0, 64, 64);
    const fake = { frame: { style, color: '#e8eaf0', color2: '#6c5cff', width: 6, radius: 20 } };
    const save = App.doc;
    App.doc = { w: 64, h: 64 };
    try { renderFrame(fake); x.drawImage(fake.canvas, 0, 0); } catch (e) { /* */ }
    App.doc = save;
    return c;
  }
  function overlayPreview(kind) {
    const c = U.canvas(64, 64), x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 64, 64); g.addColorStop(0, '#3b5b7a'); g.addColorStop(1, '#7a5b3b');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    const o = OVERLAYS.find(q => q[0] === kind);
    const fake = { overlay: { kind, seed: 5 } };
    const save = App.doc;
    App.doc = { w: 64, h: 64 };
    try { renderOverlay(fake); x.globalCompositeOperation = o[2]; x.globalAlpha = 0.85; x.drawImage(fake.canvas, 0, 0); } catch (e) { /* */ }
    App.doc = save;
    return c;
  }

  // Tuvalde ya da katmanlarda şekil / çerçeve / kaplama seçilince onun sekmesine geçilir (ayarları orada görünür)
  App.on('active', () => {
    if (App.tool !== T) return;
    const L = App.activeLayer();
    if (L && (L.type === 'shape' || L.type === 'frame' || L.type === 'overlay')) T.tab = L.type;
    UI.rebuildPanel();
  });
  App.on('prefs', k => {
    const P = App.prefs;
    if (k === 'shapeColor') { T.sdef.fill = P.shapeColor; if (!P.shapeGrad) T.sdef.grad = U.gradDef(P.shapeColor, '#00c2ff', 135); }
    if (k === 'shapeGradOn') T.sdef.gradOn = !!P.shapeGradOn;
    if (k === 'shapeGrad' && P.shapeGrad) T.sdef.grad = JSON.parse(JSON.stringify(P.shapeGrad));
  });
  // Yeni şekillerin rengi (düz ya da degrade): şekil sekmesinde ve ayarlarda aynı alan. Ctrl+Z ile geri alınabilir.
  const prefProp = (name, key) => Object.defineProperty(T, name, { get: () => App.prefs[key], set: v => App.setPref(key, v), enumerable: true });
  prefProp('newFill', 'shapeColor'); prefProp('newGradOn', 'shapeGradOn'); prefProp('newGrad', 'shapeGrad');
  UI.toolSettingsHist(T, ['newFill', 'newGradOn', 'newGrad'], () => UI.rebuildPanel());
  const changed = () => T.settingsChanged && T.settingsChanged();
  App.shapeColorField = label => UI.color({
    label, value: T.sdef.fill, onInput: v => { T.newFill = v; changed(); },
    grad: { on: T.sdef.gradOn, value: T.sdef.grad, onMode: on => { T.newGradOn = on; changed(); }, onInput: g => { T.newGrad = g; changed(); } },
  });
  App.registerTool(T);
})();
