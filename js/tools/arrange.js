'use strict';
/* Düzenle aracı: seç, taşı, ölçekle, döndür, hizala, gölge
   App.xform: tutamaçlı dönüştürme denetimi (Metin ve Öğe araçları da kullanır) */
(() => {
  const { U, ui: UI } = App;
  const h = U.h;
  const HS = 5; // tutamaç yarıçapı (ekran px)

  App.layerScalers = App.layerScalers || {};
  // Vektör katmanlarda ölçeği özelliklere işle (keskin kalsın)
  App.bakeVector = L => {
    const f = App.layerScalers[L.type];
    if (f && (Math.abs(L.sx - 1) > 1e-3 || Math.abs(L.sy - 1) > 1e-3)) f(L);
  };

  const box = L => {
    const W = L.canvas.width * Math.abs(L.sx), H = L.canvas.height * Math.abs(L.sy);
    const a = L.rot * Math.PI / 180;
    return { W, H, a, c: Math.cos(a), s: Math.sin(a), k: L.skew || 0, cx: L.x, cy: L.y };
  };
  const ortho = L => { const r = ((L.rot % 90) + 90) % 90; return r < 0.01 || r > 89.99; };
  // "Tuvale göre" modunda tutamaçlar katmanı saran, tuvale hizalı kutudadır
  const world = () => App.prefs.xformSpace === 'world';
  const WORLD_COL = '#14c08c';
  const frame = L => {
    // 90° katlarında iki eksen aynı kutuyu verir; nesneye göre işlem yeterli
    if (!world() || (ortho(L) && !L.skew)) return box(L);
    const pts = App.layerCorners(L), xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    return { W: x1 - x0, H: y1 - y0, a: 0, c: 1, s: 0, k: 0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, world: true };
  };
  // Kutu koordinatından (merkez 0,0) dokümana: önce eğme (skew), sonra döndürme
  const lin = (b, lx, ly) => { const u = lx + (b.k || 0) * ly; return { x: u * b.c - ly * b.s, y: u * b.s + ly * b.c }; };
  const toDoc = (L, b, lx, ly) => { const v = lin(b, lx, ly); return { x: b.cx + v.x, y: b.cy + v.y }; };
  // Metinler yalnızca orantılı büyür; sündürülmez. Eğik duran şekiller "Tuvale göre" modunda da serbestçe
  // sündürülebilir: sonuç döndürme + eğme + ölçek olarak saklanır, ölçek şeklin boyutuna işlenir (keskin kalır).
  const uniformOnly = L => L.type === 'text';

  const isLine = L => L.type === 'shape' && L.shape && L.shape.kind === 'line';
  const handles = L => {
    const b = frame(L), list = [], uni = uniformOnly(L, b), line = isLine(L) && !b.world;
    for (const hy of [-1, 0, 1]) for (const hx of [-1, 0, 1]) {
      if (!hx && !hy) continue;
      if (uni && (!hx || !hy)) continue;
      if (line && hy) continue; // çizgi: yalnızca iki uçtan uzatılır
      const p = toDoc(L, b, hx * b.W / 2, hy * b.H / 2);
      list.push({ hx, hy, p, s: App.docToScreen(p.x, p.y) });
    }
    const top = toDoc(L, b, 0, -b.H / 2);
    const ts = App.docToScreen(top.x, top.y);
    const rs = { x: ts.x + b.s * 26, y: ts.y - b.c * 26 };
    return { list, rot: rs, top: ts, b };
  };

  // "Tuvale göre" boyutlandırmayı katmana işler (L._world → katman özellikleri)
  const bakeWorld = L => {
    const w = L._world;
    delete L._world;
    if (!w) return;
    const { kx, ky, ax, ay } = w;
    const map = (x, y) => ({ x: ax + (x - ax) * kx, y: ay + (y - ay) * ky });
    const c = map(L.x, L.y);
    if (Math.abs(kx - ky) < 1e-9) { L.x = c.x; L.y = c.y; L.sx *= kx; L.sy *= kx; return; }
    if (ortho(L) && !L.skew) {
      const q = Math.round(((L.rot % 360) + 360) % 360 / 90) % 2;
      L.x = c.x; L.y = c.y;
      if (q) { L.sx *= ky; L.sy *= kx; } else { L.sx *= kx; L.sy *= ky; }
      return;
    }
    if (L.type === 'shape' && L.shape.kind === 'line') {
      // Çizginin iki ucu tuval eksenlerinde ölçeklenir; kalınlık aynı kalır
      const cw = L.canvas.width, ch = L.canvas.height, pad = (cw - L.shape.w) / 2;
      const p1 = App.layerToDoc(L, pad, ch / 2), p2 = App.layerToDoc(L, cw - pad, ch / 2);
      const a = map(p1.x, p1.y), b = map(p2.x, p2.y);
      L.shape.w = Math.max(2, Math.hypot(b.x - a.x, b.y - a.y));
      L.rot = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
      L.x = (a.x + b.x) / 2; L.y = (a.y + b.y) / 2; L.sx = L.sy = 1; L.flipX = L.flipY = false;
      App.layerRenderers.shape(L);
      return;
    }
    // Resim katmanı: yeni dönüşüm döndürme + eğme + ölçek olarak saklanır (pikseller yeniden örneklenmez).
    // Böylece eğik duran nesne "Nesneye göre" modunda kendi eksenlerinde boyutlandırılmaya devam eder.
    const m = new DOMMatrix().rotate(L.rot).multiply(new DOMMatrix([1, 0, L.skew || 0, 1, 0, 0])).scale((L.flipX ? -1 : 1) * L.sx, (L.flipY ? -1 : 1) * L.sy);
    const a = m.a * kx, bb = m.b * ky, cc = m.c * kx, d = m.d * ky;
    const sx = Math.hypot(a, bb), th = Math.atan2(bb, a), co = Math.cos(th), si = Math.sin(th);
    const sy = -cc * si + d * co, k = sy ? (cc * co + d * si) / sy : 0;
    L.x = c.x; L.y = c.y; L.rot = th * 180 / Math.PI;
    L.sx = sx; L.sy = sy; L.flipX = L.flipY = false;
    if (Math.abs(k) < 1e-6) delete L.skew; else L.skew = k;
  };
  const inside = (L, p) => {
    const q = App.docToLayer(L, p.x, p.y);
    return q.x >= 0 && q.y >= 0 && q.x <= L.canvas.width && q.y <= L.canvas.height;
  };

  // Tutamaçların çevrelediği kutu ("Tuvale göre" modunda tuvale hizalı kutu)
  const inFrame = (L, p) => {
    if (!world() || (ortho(L) && !L.skew)) return inside(L, p);
    const b = App.layerAABB(L);
    return p.x >= b.x0 && p.x <= b.x1 && p.y >= b.y0 && p.y <= b.y1;
  };
  /* Hiç pikseli olmayan resim katmanı (ör. yeni boş katman). Sonuç, katmanın tuvali ve geçmiş değişmedikçe saklanır;
     her değişiklik geçmişe yazıldığı için ('history') yeniden bakılır. */
  let histVer = 0;
  App.on('history', () => { histVer++; });
  const isBlank = L => {
    if (L.type !== 'raster') return false;
    const c = L._blank;
    if (c && c.cv === L.canvas && c.v === histVer) return c.r;
    let r = true;
    try {
      const d = L.canvas.getContext('2d').getImageData(0, 0, L.canvas.width, L.canvas.height).data;
      for (let i = 3; i < d.length; i += 4) if (d[i]) { r = false; break; }
    } catch (e) { r = false; }
    Object.defineProperty(L, '_blank', { value: { cv: L.canvas, v: histVer, r }, configurable: true, writable: true, enumerable: false });
    return r;
  };
  /* İmleç bir nesnenin tutamaç kutusunun içindeyse o nesne seçilir; kutular üst üste biniyorsa en üstteki gelir.
     Tamamen boş katmanlar tuvalden seçilmez (tıklama alttakilere geçer); Katmanlar panelinden seçilip içine çizilir,
     çizim yapılınca kutusu çizimi sarar ve tuvalden de seçilir. Boş arka plan (en alttaki katman) seçilebilir.
     Kilitli katmanlar ve tuvali kaplayan kaplamalar da atlanır (kaplama seçiliyse içinden sürüklenerek taşınır). */
  const pickAt = p => {
    const ly = App.doc.layers;
    for (let i = ly.length - 1; i >= 0; i--) {
      const L = ly[i];
      if (L.visible && !L.locked && L.type !== 'overlay' && inFrame(L, p) && (i === 0 || !isBlank(L))) return L;
    }
    return null;
  };

  /* ------------------------------------------------ ortak dönüştürme denetimi */
  const X = App.xform = {
    drag: null,
    inside,
    // Tutamaç yakalandıysa sürüklemeyi başlatır
    grab(L, p) {
      if (!L || !L.visible || L.locked) return false;
      const H = handles(L);
      if (Math.hypot(p.sx - H.rot.x, p.sy - H.rot.y) <= HS + 3) {
        X.drag = { mode: 'rot', L, start: Math.atan2(p.y - L.y, p.x - L.x), rot0: L.rot };
        return true;
      }
      for (const hd of H.list) {
        if (Math.abs(p.sx - hd.s.x) <= HS + 3 && Math.abs(p.sy - hd.s.y) <= HS + 3) {
          const b = H.b;
          X.drag = {
            mode: 'scale', L, hx: hd.hx, hy: hd.hy, W: b.W, H: b.H, b, fx: Math.sign(L.sx) || 1, fy: Math.sign(L.sy) || 1,
            A: toDoc(L, b, -hd.hx * b.W / 2, -hd.hy * b.H / 2), C: { x: b.cx, y: b.cy },
            uni: uniformOnly(L, b), L0: { x: L.x, y: L.y, sx: L.sx, sy: L.sy },
          };
          return true;
        }
      }
      return false;
    },
    startMove(L, p) { X.drag = { mode: 'move', L, ox: L.x - p.x, oy: L.y - p.y, moved: false }; },
    move(p, e) {
      const D = X.drag;
      if (!D) return false;
      const L = D.L;
      // Tamamen serbest modda Shift hiçbir şeyi değiştirmez
      const shift = e.shiftKey && !App.prefs.free;
      if (D.mode === 'move') {
        let nx = p.x + D.ox, ny = p.y + D.oy;
        if (shift && D.sx0 == null) { D.sx0 = L.x; D.sy0 = L.y; }
        if (shift) { if (Math.abs(nx - D.sx0) > Math.abs(ny - D.sy0)) ny = D.sy0; else nx = D.sx0; }
        App.snapSkip = D.others ? new Set(D.others.map(o => o.L)) : null;
        const s = App.snapMove(L, nx, ny, e);
        App.snapSkip = null;
        if (shift) { if (ny === D.sy0) s.y = ny; else s.x = nx; }
        L.x = s.x; L.y = s.y; D.moved = true;
        if (D.others) for (const o of D.others) { o.L.x = L.x + o.dx; o.L.y = L.y + o.dy; }
      } else if (D.mode === 'rot') {
        let a = D.rot0 + (Math.atan2(p.y - L.y, p.x - L.x) - D.start) * 180 / Math.PI;
        a = ((a + 540) % 360) - 180;
        // Shift (ya da "her zaman adım adım" açıksa Ctrl/Alt basılı değilken) açı, döndürmenin başladığı açıdan
        // ayarlanan adım kadar ilerler: 7° olan nesne 15°'lik adımla 22°, 37°... olur (15°, 30° değil)
        const step = +App.prefs.rotStep || 15;
        const stepOn = App.prefs.rotSnap ? !(e.ctrlKey || e.metaKey || e.altKey) : shift;
        if (stepOn) {
          const d = ((a - D.rot0 + 540) % 360) - 180;
          a = ((D.rot0 + Math.round(d / step) * step + 540) % 360) - 180;
        }
        else if (App.snapOn(e) && !App.prefs.free) for (const s of [-180, -90, 0, 90, 180]) if (Math.abs(a - s) < 2) a = s;
        L.rot = a; D.moved = true;
      } else if (D.mode === 'scale') {
        const b = D.b;
        // Sabit nokta: karşı kenar/köşe ya da merkez (Alt o an için tersine çevirir)
        const center = (App.prefs.xformPivot === 'center') !== !!e.altKey;
        const A = center ? D.C : D.A, m = center ? 2 : 1;
        const vy = -(p.x - A.x) * b.s + (p.y - A.y) * b.c, vx = (p.x - A.x) * b.c + (p.y - A.y) * b.s - (b.k || 0) * vy;
        let W = D.W, H = D.H;
        // Bütün programda aynı kural: serbest boyutlandırılır, Shift basılıyken oran korunur (metinler her zaman orantılı).
        // Kenar tutamacında Shift: diğer boyut da aynı oranda büyür.
        const corner = D.hx && D.hy, keep = D.uni || shift, free = !keep;
        if (corner && keep) {
          const k = Math.max(0.01, m * (D.hx * vx * D.W + D.hy * vy * D.H) / (D.W * D.W + D.H * D.H));
          W = D.W * k; H = D.H * k;
        } else {
          if (D.hx) W = Math.max(2, m * D.hx * vx);
          if (D.hy) H = Math.max(2, m * D.hy * vy);
          if (keep && !isLine(L)) { if (D.hx) H = D.H * W / D.W; else W = D.W * H / D.H; }
        }
        // Çizgi şeklinin kalınlığı tutamaçla değişmez (Kalınlık ayarıyla değişir)
        if (isLine(L) && !b.world) H = D.H;
        // Tuvale hizalı kutuda hareket eden kenarı kılavuzlara yapıştır
        App.guides = [];
        if (b.world || (Math.abs(L.rot) < 0.01 && !b.k)) {
          // Alt burada sabit noktayı değiştirir; hizalamayı yalnızca Ctrl tersine çevirir
          const s = App.snap(D.hx ? [A.x + D.hx * W / m] : [], D.hy ? [A.y + D.hy * H / m] : [], L, { ctrlKey: e.ctrlKey, metaKey: e.metaKey });
          if (corner && !free) {
            if (s.dx) { const nW = Math.max(2, W + D.hx * s.dx * m); H *= nW / W; W = nW; App.guides = App.guides.filter(g => g[0] === 'v'); }
            else if (s.dy) { const nH = Math.max(2, H + D.hy * s.dy * m); W *= nH / H; H = nH; }
          } else if (keep && !isLine(L)) {
            // kenardan orantılı: yalnızca sürüklenen kenar yapışır, diğer boyut onu izler
            if (D.hx && s.dx) { W = Math.max(2, W + D.hx * s.dx * m); H = D.H * W / D.W; }
            if (D.hy && s.dy) { H = Math.max(2, H + D.hy * s.dy * m); W = D.W * H / D.H; }
          } else {
            if (s.dx) W = Math.max(2, W + D.hx * s.dx * m);
            if (s.dy) H = Math.max(2, H + D.hy * s.dy * m);
          }
        }
        const off = lin(b, D.hx * W / 2, D.hy * H / 2);
        const c = center ? { x: A.x, y: A.y } : { x: A.x + off.x, y: A.y + off.y };
        if (b.world) {
          // Tuval eksenlerinde ölçek: sürüklerken geçici olarak uygulanır, bırakınca katmana işlenir
          const kx = W / D.W, ky = H / D.H;
          // c = sabit nokta + k * (kutunun ilk merkezi - sabit nokta)  →  sabit nokta
          const ax = Math.abs(kx - 1) < 1e-9 ? D.C.x : (c.x - kx * D.C.x) / (1 - kx);
          const ay = Math.abs(ky - 1) < 1e-9 ? D.C.y : (c.y - ky * D.C.y) / (1 - ky);
          L._world = { kx, ky, ax, ay };
        } else if (L.type === 'shape' && App.layerRenderers.shape) {
          // Vektör şekil sürüklerken de gerçek boyutunda çizilir (degrade ve kontur bozulmaz)
          const s = L.shape, pad = (L.canvas.width - s.w) / 2;
          s.w = Math.max(2, W - pad * 2);
          if (!(s.kind === 'line')) s.h = Math.max(2, H - pad * 2);
          App.layerRenderers.shape(L);
          L.x = c.x; L.y = c.y; L.sx = D.fx; L.sy = D.fy;
        } else {
          L.x = c.x; L.y = c.y;
          L.sx = D.fx * W / L.canvas.width; L.sy = D.fy * H / L.canvas.height;
        }
        D.moved = true;
      }
      App.requestRender();
      App.emit('transform', L);
      return true;
    },
    // Sürüklemeyi bitirir; değişiklik olduysa geçmişe yazar
    end() {
      const D = X.drag;
      X.drag = null;
      if (!D) return false;
      if (D.mode === 'scale' && D.L._world) { if (D.moved) bakeWorld(D.L); else delete D.L._world; }
      if (D.moved) {
        if (D.mode === 'scale') App.bakeVector(D.L);
        App.commit({ move: 'Move', rot: 'Rotate', scale: 'Scale' }[D.mode]);
        App.emit('transform', D.L);
      }
      App.requestRender();
      return D.moved;
    },
    cursor(L, p) {
      if (!L || !L.visible || L.locked) return null;
      const H = handles(L);
      if (Math.hypot(p.sx - H.rot.x, p.sy - H.rot.y) <= HS + 3) return 'grab';
      for (const hd of H.list) {
        if (Math.abs(p.sx - hd.s.x) <= HS + 3 && Math.abs(p.sy - hd.s.y) <= HS + 3) {
          const ang = (Math.atan2(hd.hy, hd.hx) * 180 / Math.PI + (H.b.world ? 0 : L.rot) + 360) % 180;
          return ang < 22.5 || ang >= 157.5 ? 'ew-resize' : ang < 67.5 ? 'nwse-resize' : ang < 112.5 ? 'ns-resize' : 'nesw-resize';
        }
      }
      return inside(L, p) ? 'move' : null;
    },
    draw(ctx, L) {
      if (!L || !L.visible) return;
      App.drawLayerOutline(ctx, L, L.locked ? '#ff9f43' : '#4f8cff');
      if (L.locked) return;
      const H = handles(L);
      // "Tuvale göre" modunda tutamaçlar farklı renkte ve tuvale hizalı kesikli kutudadır
      const col = world() ? WORLD_COL : '#4f8cff';
      ctx.save();
      if (H.b.world) {
        const b = H.b, p0 = App.docToScreen(b.cx - b.W / 2, b.cy - b.H / 2), p1 = App.docToScreen(b.cx + b.W / 2, b.cy + b.H / 2);
        ctx.strokeStyle = WORLD_COL; ctx.lineWidth = 1; ctx.setLineDash([5, 4]);
        ctx.strokeRect(Math.round(p0.x) + 0.5, Math.round(p0.y) + 0.5, Math.round(p1.x - p0.x), Math.round(p1.y - p0.y));
        ctx.setLineDash([]);
      }
      ctx.strokeStyle = col; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(H.top.x, H.top.y); ctx.lineTo(H.rot.x, H.rot.y); ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(H.rot.x, H.rot.y, HS + 1, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      for (const hd of H.list) {
        ctx.beginPath();
        ctx.rect(hd.s.x - HS, hd.s.y - HS, HS * 2, HS * 2);
        ctx.fill(); ctx.stroke();
      }
      ctx.restore();
    },
    screenBox(L) {
      const pts = App.layerCorners(L).map(q => App.docToScreen(q.x, q.y));
      const xs = pts.map(q => q.x), ys = pts.map(q => q.y);
      return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
    },
  };

  const T = {
    id: 'arrange', name: 'Edit', icon: 'arrange', key: 'V',
    cursor: 'default',
    hoverL: null,

    activate() { T.refresh(); },
    deactivate() { X.drag = null; T.pend = null; T.marq = null; },

    onDown(p, e) {
      const L = App.activeLayer();
      const add = e.ctrlKey || e.metaKey || e.shiftKey;
      // tutamaçlar önce gelir (Ctrl / Shift ile boyutlandırma ve döndürme olduğu gibi çalışır)
      if (X.grab(L, p)) return;
      // imlecin bulunduğu tutamaç kutusunun nesnesi (bkz. pickAt)
      let target = pickAt(p);
      const ly = App.doc.layers;
      // seçili katman kutusunun içinden sürüklenince taşınır (tuvalden seçilmeyen kaplama ya da içi tamamen silinmiş
      // boş katman da); üstünde görünen başka bir katman varsa o seçilir
      if (L && L.visible && !L.locked && inside(L, p) && (!target || ly.indexOf(L) > ly.indexOf(target))) target = L;
      // Ctrl / Shift + tıklama: katmanı seçime ekler ya da çıkarır. Fare sürüklenirse taşımadır
      // (Ctrl ile sürüklemek hizalamayı kapatır, Shift ile sürüklemek tek eksende taşır; bunlar bozulmasın)
      if (add) {
        X.drag = null;
        if (target) T.pend = { target, L, p0: { sx: p.sx, sy: p.sy }, p };
        return;
      }
      // Boş yerden (saydam alan ya da tuvalin dışı) sürükleyince seçim kutusu açılır, kutunun değdiği katmanlar seçilir;
      // sürüklemeden bırakılırsa seçim kalkar
      if (!target) { X.drag = null; T.marq = { a: p, b: p, L }; return; }
      const sel = UI.selectedLayers();
      if (target !== L && !(sel.length > 1 && sel.includes(target))) { App.setActive(target.id); T.refresh(); }
      else if (target !== L) UI.selectLayerKeep(target.id);
      T.beginMove(target, p);
    },
    beginMove(target, p) { T.moveSel(target, p); },
    // tıklanan katmanı taşımaya başlar; birden çok katman seçiliyse hepsi birlikte taşınır (Metin aracı da kullanır)
    moveSel(target, p) {
      X.startMove(target, p);
      // birden çok katman seçiliyse hepsi birlikte taşınır
      const group = UI.selectedLayers().filter(q => q !== target && !q.locked);
      if (group.length) X.drag.others = group.map(q => ({ L: q, dx: q.x - target.x, dy: q.y - target.y }));
    },
    onMove(p, e) {
      if (T.marq) { T.marq.b = p; App.requestRender(); return; }
      const pd = T.pend;
      if (pd && Math.hypot(p.sx - pd.p0.sx, p.sy - pd.p0.sy) > 3) {
        // Ctrl / Shift basılıyken sürükleme: tıklanan katman (seçimdeyse seçimle birlikte) taşınır
        T.pend = null;
        const sel = UI.selectedLayers();
        if (pd.target !== pd.L && !(sel.length > 1 && sel.includes(pd.target))) { App.setActive(pd.target.id); T.refresh(); }
        else if (pd.target !== pd.L) UI.selectLayerKeep(pd.target.id);
        T.beginMove(pd.target, pd.p);
      }
      if (X.move(p, e)) T.refreshFields();
    },
    onUp() {
      const M = T.marq;
      if (M) {
        T.marq = null;
        if (Math.hypot(M.b.sx - M.a.sx, M.b.sy - M.a.sy) < 4) { if (M.L) { App.setActive(null); T.refresh(); } App.requestRender(); return; }
        const x0 = Math.min(M.a.x, M.b.x), x1 = Math.max(M.a.x, M.b.x), y0 = Math.min(M.a.y, M.b.y), y1 = Math.max(M.a.y, M.b.y);
        // yalnızca kutunun içine tamamen sığan katmanlar seçilir (tuvali kaplayan bir şeye değmek onu seçmez)
        const hits = App.doc.layers.filter(q => {
          if (!q.visible || App.isBackdrop(q)) return false;
          const b = App.contentAABB(q) || App.layerAABB(q);
          return b.x0 >= x0 && b.x1 <= x1 && b.y0 >= y0 && b.y1 <= y1;
        });
        if (hits.length) UI.selectLayers(hits.map(q => q.id)); else App.setActive(null);
        T.refresh(); App.requestRender();
        return;
      }
      const pd = T.pend;
      T.pend = null;
      if (pd) { UI.toggleLayerSel(pd.target); T.refresh(); return; }
      if (X.end()) T.refreshFields();
    },

    onHover(p) {
      const L = App.activeLayer();
      let cur = X.cursor(L, p) || 'default';
      const hv = pickAt(p);
      if (hv !== T.hoverL) { T.hoverL = hv; App.requestRender(); }
      if (cur === 'default' && hv) cur = 'pointer';
      App.R.stage.style.cursor = App.keys.space ? 'grab' : cur;
    },

    // Çift tıklama: metne yazmaya başla (harflerin arasındaki boşluğa tıklansa da), şekilde Öğe aracını aç
    onDblClick(p) {
      const A = App.activeLayer(), ly = App.doc.layers;
      let L = App.hitLayer(p.x, p.y, q => !q.locked || q.type === 'text');
      if (!(L && L.type === 'text')) {
        const boxHit = [...ly].reverse().find(q => q.visible && q.type === 'text' && inside(q, p));
        if (A && A.type === 'text' && A.visible && inside(A, p)) L = A;
        else if (boxHit && (!L || ly.indexOf(boxHit) >= ly.indexOf(L))) L = boxHit;
      }
      if (L && L.type === 'text') {
        X.drag = null;
        App.setActive(L.id);
        App.setTool('text').then(() => { if (App.tool === App.tools.text) App.tools.text.startEdit(L, true); });
      } else if (L && L.type === 'shape') { App.setActive(L.id); App.setTool('element'); }
    },

    drawOverlay(ctx) {
      const L = App.activeLayer(), M = T.marq;
      if (M) {
        const x = Math.min(M.a.sx, M.b.sx), y = Math.min(M.a.sy, M.b.sy), w = Math.abs(M.b.sx - M.a.sx), hh = Math.abs(M.b.sy - M.a.sy);
        ctx.save(); ctx.fillStyle = 'rgba(79,140,255,.12)'; ctx.fillRect(x, y, w, hh);
        ctx.strokeStyle = '#4f8cff'; ctx.lineWidth = 1; ctx.setLineDash([4, 3]); ctx.strokeRect(x + 0.5, y + 0.5, w, hh); ctx.restore();
      }
      // tuvali kaplayan arka planın çerçevesi tuvalin kenarıyla aynıdır; üzerinde gezerken çizilmez
      if (T.hoverL && T.hoverL !== L && !App.isBackdrop(T.hoverL)) App.drawLayerOutline(ctx, T.hoverL, 'rgba(79,140,255,.7)', [4, 3]);
      for (const q of UI.selectedLayers()) if (q !== L && q.visible) App.drawLayerOutline(ctx, q, q.locked ? '#ff9f43' : '#4f8cff');
      X.draw(ctx, L);
    },

    /* --------------------------------------------------- panel */
    panel(body) {
      T.f = {};
      const L = App.activeLayer();
      body.appendChild(UI.section('Quick Add', [
        h('div', { class: 'quick-grid' },
          quick('text', 'Text', () => App.setTool('text').then(() => App.tools.text.addDefault())),
          quick('shape', 'Shape', () => App.setTool('element')),
          quick('image', 'Image', () => App.actions.addImageLayer()),
          quick('frame', 'Frame', () => App.setTool('element').then(() => App.tools.element.showTab('frame'))),
        ),
      ]));
      if (!L) { body.appendChild(UI.note('Select a layer in the Layers panel on the right, or add new text, an image or an element.')); return; }

      const name = h('input', { type: 'text', class: 'full', value: L.name, onchange: () => { L.name = name.value || L.name; App.commit('Rename'); } });
      body.appendChild(h('div', { class: 'field' }, h('label', { class: 'fld-label' }, 'Layer Name'), name));

      // Az ayarı olan katmanların (şekil, çerçeve, kaplama) kendi ayarları da burada; araç değiştirmeden düzenlenir
      const E = App.tools.element;
      const own = E && (L.type === 'shape' ? E.shapeProps(L) : L.type === 'frame' ? E.frameProps(L) : L.type === 'overlay' ? E.overlayProps(L) : null);
      if (own) body.appendChild(UI.section(own.title, own.kids));

      const num = (label, get, set) => {
        const n = UI.number({ label, value: Math.round(get()), onChange: v => { set(v); App.requestRender(); App.commit('Transform'); T.refreshFields(); } });
        n.get2 = get;
        return n;
      };
      let lockRatio = true;
      const b = () => box(App.activeLayer());
      T.f.x = num('X', () => App.activeLayer().x - b().W / 2, v => { const A = App.activeLayer(); A.x = v + b().W / 2; });
      T.f.y = num('Y', () => App.activeLayer().y - b().H / 2, v => { const A = App.activeLayer(); A.y = v + b().H / 2; });
      T.f.w = num('Width', () => b().W, v => {
        const A = App.activeLayer(), k = Math.max(1, v) / b().W;
        A.sx *= k; if (lockRatio || uniformOnly(A)) A.sy *= k; App.bakeVector(A);
      });
      T.f.h = num('Height', () => b().H, v => {
        const A = App.activeLayer(), k = Math.max(1, v) / b().H;
        A.sy *= k; if (lockRatio || uniformOnly(A)) A.sx *= k; App.bakeVector(A);
      });
      // oranı her zaman korunan katmanlarda (ör. metin) kilit sabittir ve tıklanamaz
      const lockBtn = h('button', { class: 'icon-btn on', type: 'button' });
      const syncLock = () => {
        const A = App.activeLayer(), fixed = !!A && uniformOnly(A);
        lockBtn.classList.toggle('fixed', fixed);
        lockBtn.classList.toggle('on', fixed || lockRatio);
        lockBtn.setAttribute('aria-disabled', fixed ? 'true' : 'false');
        lockBtn.innerHTML = App.icon(fixed ? 'lock' : lockRatio ? 'link' : 'unlink', 18);
        lockBtn.title = App.t(fixed ? 'This layer always keeps its aspect ratio' : 'Lock Aspect Ratio');
      };
      lockBtn.addEventListener('click', e => {
        e.preventDefault();
        if (lockBtn.classList.contains('fixed')) return;
        lockRatio = !lockRatio; syncLock();
      });
      syncLock();
      T.f.syncLock = syncLock;
      T.f.rot = UI.slider({ label: 'Angle', min: -180, max: 180, value: Math.round(L.rot), onInput: v => { App.activeLayer().rot = v; App.requestRender(); }, onChange: () => App.commit('Rotate') });
      const spaceSeg = UI.seg({
        label: 'Handles', options: [['local', 'Relative to Object'], ['world', 'Relative to Canvas']], value: App.prefs.xformSpace,
        info: 'Relative to object: a rotated object grows along its own direction and the handles are blue. Relative to canvas: the box is aligned to the canvas, the edges scale horizontally and vertically and the handles are green. Also switchable with the button in the bottom bar.',
        onChange: v => { App.setPref('xformSpace', v); App.requestRender(); },
      });
      const pivotSeg = UI.seg({
        label: 'Fixed Point When Resizing', options: [['edge', 'Opposite Edge'], ['center', 'Center']], value: App.prefs.xformPivot,
        info: 'The point that stays in place while resizing with a handle. Hold Alt to switch to the other one temporarily.',
        onChange: v => { App.setPref('xformPivot', v); },
      });
      T.f.space = spaceSeg; T.f.pivot = pivotSeg;
      body.appendChild(UI.section('Transform', [
        h('div', { class: 'grid2' }, T.f.x.el, T.f.y.el, T.f.w.el, T.f.h.el),
        h('div', { class: 'row end' }, h('span', { class: 'note' }, 'Lock Ratio'), lockBtn),
        T.f.rot.el,
        spaceSeg.el,
        pivotSeg.el,
        h('div', { class: 'btn-row' },
          UI.iconBtn('rotL', 'Left 90°', () => { const A = App.activeLayer(); A.rot = ((A.rot - 90 + 540) % 360) - 180; App.commit('Rotate'); T.refreshFields(); }),
          UI.iconBtn('rotR', 'Right 90°', () => { const A = App.activeLayer(); A.rot = ((A.rot + 90 + 540) % 360) - 180; App.commit('Rotate'); T.refreshFields(); }),
          UI.iconBtn('flipH', 'Flip Horizontal', () => { const A = App.activeLayer(); A.flipX = !A.flipX; App.commit('Flip Horizontal'); }),
          UI.iconBtn('flipV', 'Flip Vertical', () => { const A = App.activeLayer(); A.flipY = !A.flipY; App.commit('Flip Vertical'); }),
          UI.iconBtn('reset', 'Reset Transform', () => {
            const A = App.activeLayer(); A.rot = 0; A.flipX = A.flipY = false; delete A.skew;
            if (A.type === 'raster') { A.sx = A.sy = 1; }
            App.commit('Reset Transform'); T.refreshFields();
          }),
        ),
        h('div', { class: 'btn-row' },
          UI.button('Fit to Canvas', () => fitLayer('fit'), { small: true, title: 'The whole layer fits in the canvas; if the aspect ratio differs, empty space remains at the edges' }),
          UI.button('Fill Canvas', () => fitLayer('fill'), { small: true, title: 'The layer covers the whole canvas; if the aspect ratio differs, the overflowing parts are cut off' }),
        ),
      ], { info: 'Hold Shift while resizing to keep the ratio; text always keeps its ratio. While moving, Shift locks to an axis. Ctrl or Alt reverses snapping while held; while resizing, Alt switches the fixed point and only Ctrl reverses snapping. Arrow keys nudge by 1 px, with Shift by 10 px.' }));

      const al = (ic, t, fn) => UI.iconBtn(ic, t, () => { const A = App.activeLayer(); fn(A, box(A)); App.commit('Align'); T.refreshFields(); });
      const ext = A => { const q = App.layerAABB(A); return { ex: (q.x1 - q.x0) / 2, ey: (q.y1 - q.y0) / 2 }; };
      body.appendChild(UI.section('Align (to Canvas)', [
        h('div', { class: 'btn-row' },
          al('alignL', 'Left', (A, bb) => { A.x = ext(A, bb).ex; }),
          al('alignCH', 'Center Horizontally', A => { A.x = App.doc.w / 2; }),
          al('alignR', 'Right', (A, bb) => { A.x = App.doc.w - ext(A, bb).ex; }),
          al('alignT', 'Top', (A, bb) => { A.y = ext(A, bb).ey; }),
          al('alignCV', 'Center Vertically', A => { A.y = App.doc.h / 2; }),
          al('alignB', 'Bottom', (A, bb) => { A.y = App.doc.h - ext(A, bb).ey; }),
        ),
        h('div', { class: 'btn-row' },
          UI.iconBtn('front', 'To Front', () => App.actions.order('top')),
          UI.iconBtn('up', 'Bring Forward', () => App.actions.order('up')),
          UI.iconBtn('down', 'Send Backward', () => App.actions.order('down')),
          UI.iconBtn('back', 'To Back', () => App.actions.order('bottom')),
          UI.iconBtn('duplicate', 'Duplicate', () => App.actions.duplicate()),
          UI.iconBtn('trash', 'Delete', () => App.actions.deleteLayer()),
        ),
      ]));

      // Katman gölgesi (metin katmanında metin aracı çizer)
      const sh = () => { const A = App.activeLayer(); A.shadow = A.shadow || { on: false, color: '#000000', blur: 20, x: 8, y: 8, opacity: 0.6 }; return A.shadow; };
      const s0 = L.shadow || { on: false, color: '#000000', blur: 20, x: 8, y: 8, opacity: 0.6 };
      const live = () => { const A = App.activeLayer(); if (A && A.type === 'text') App.refreshLayer(A); else App.requestRender(); };
      const commit = () => { live(); App.commit('Shadow'); };
      let ct;
      body.appendChild(UI.optSection('Shadow', s0.on, v => { sh().on = v; commit(); }, [
        UI.color({ label: 'Color', value: s0.color, onInput: v => { sh().color = v; live(); clearTimeout(ct); ct = setTimeout(commit, 400); } }).el,
        UI.slider({ label: 'Blur', min: 0, max: 200, value: s0.blur, onInput: v => { sh().blur = v; live(); }, onChange: commit }).el,
        ...UI.shadowOffset(sh, s0, live, commit, 300),
        UI.slider({ label: 'Opacity', min: 0, max: 100, value: Math.round(s0.opacity * 100), onInput: v => { sh().opacity = v / 100; live(); }, onChange: commit }).el,
      ]));
    },

    refreshFields() {
      if (!T.f || !T.f.x) return;
      const L = App.activeLayer();
      if (!L) return;
      for (const k of ['x', 'y', 'w', 'h']) if (document.activeElement !== T.f[k].inp) T.f[k].set(Math.round(T.f[k].get2()));
      T.f.rot.set(Math.round(L.rot));
      if (T.f.syncLock) T.f.syncLock();
    },
    refresh() { App.ui.rebuildPanel(); },
  };

  function quick(icon, label, fn) {
    const b = h('button', { class: 'quick-btn', onclick: fn });
    b.innerHTML = App.icon(icon, 22) + `<span>${label}</span>`;
    return b;
  }

  function fitLayer(mode) {
    const A = App.activeLayer(), d = App.doc;
    if (!A) return;
    // Katmanın ekranda göründüğü oran kullanılır (orantısız uzatılmışsa o oran korunur)
    const W = A.canvas.width * Math.abs(A.sx || 1), H = A.canvas.height * Math.abs(A.sy || 1);
    const kFit = Math.min(d.w / W, d.h / H), kFill = Math.max(d.w / W, d.h / H);
    const k = mode === 'fit' ? kFit : kFill;
    A.sx *= k; A.sy *= k;
    A.rot = 0; delete A.skew; A.x = d.w / 2; A.y = d.h / 2;
    App.bakeVector(A);
    App.commit(mode === 'fit' ? 'Fit to Canvas' : 'Fill Canvas');
    T.refreshFields();
  }

  App.on('active', () => { if (App.tool === T) App.ui.rebuildPanel(); });
  App.on('history', () => { if (App.tool === T) T.refreshFields(); });
  App.on('transform', () => { if (App.tool === T) T.refreshFields(); });
  App.on('prefs', k => { if (App.tool === T && T.f && T.f.space && (k === 'xformSpace' || k === 'xformPivot')) { T.f.space.set(App.prefs.xformSpace); T.f.pivot.set(App.prefs.xformPivot); App.requestRender(); } });
  App.registerTool(T);
})();
