'use strict';
/* Katman grupları: seçili katmanlar tek bir "grup" katmanında toplanır (Ctrl+G); grup çözülünce (Ctrl+Shift+G)
   katmanlar eski hâlleriyle geri gelir. Grup sıradan bir katman gibi taşınır, döndürülür ve boyutlandırılır;
   boyutlandırma bitince ölçek içindeki katmanlara işlenir (metin ve şekiller keskin kalır).
   İçindeki katmanlar (L.children, alttan üste) grubun ortasına göre konumlanır. */
(() => {
  const { U, ui: UI } = App;

  // Katmanın dönüşümü (tuvalinin ortasından dokümana): taşı, döndür, eğ, ölçekle
  const matOf = L => new DOMMatrix().translate(L.x, L.y).rotate(L.rot)
    .multiply(new DOMMatrix([1, 0, L.skew || 0, 1, 0, 0]))
    .scale((L.flipX ? -1 : 1) * L.sx, (L.flipY ? -1 : 1) * L.sy);
  // Matrisi katman özelliklerine ayırır: döndürme + eğme + ölçek (+ dikey ayna)
  const setMat = (L, m) => {
    const sx = Math.hypot(m.a, m.b), th = Math.atan2(m.b, m.a), co = Math.cos(th), si = Math.sin(th);
    const sy = -m.c * si + m.d * co, k = sy ? (m.c * co + m.d * si) / sy : 0;
    L.x = m.e; L.y = m.f; L.rot = th * 180 / Math.PI;
    L.sx = sx; L.sy = Math.abs(sy); L.flipX = false; L.flipY = sy < 0;
    if (Math.abs(k) < 1e-6) delete L.skew; else L.skew = k;
  };
  const shadowPad = L => {
    const s = L.shadow;
    return s && s.on && L.type !== 'text' ? (s.blur || 0) * 2 + Math.max(Math.abs(s.x || 0), Math.abs(s.y || 0)) : 0;
  };
  const MAX = 8000;

  /* Grubun görüntüsü: içindeki katmanlar kendi dönüşümleriyle tek tuvale çizilir. Görünen kısım ortalanır
     (grubun yeri buna göre kayar, ekranda hiçbir şey oynamaz). */
  function renderGroup(G) {
    // önceki çizimde tuval sınırı yüzünden ölçeğe eklenen pay geri alınır
    if (G._k) { G.sx *= G._k; G.sy *= G._k; delete G._k; }
    const kids = (G.children || []).filter(c => c.visible);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const c of kids) {
      const p = shadowPad(c);
      for (const q of App.layerCorners(c)) { x0 = Math.min(x0, q.x - p); x1 = Math.max(x1, q.x + p); y0 = Math.min(y0, q.y - p); y1 = Math.max(y1, q.y + p); }
    }
    if (!isFinite(x0)) { x0 = y0 = -0.5; x1 = y1 = 0.5; }
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    if (Math.abs(mx) > 0.01 || Math.abs(my) > 0.01) {
      for (const c of G.children) { c.x -= mx; c.y -= my; }
      const p = matOf(G).transformPoint(new DOMPoint(mx, my));
      G.x = p.x; G.y = p.y;
    }
    const W = Math.max(1, Math.ceil(x1 - x0) + 2), H = Math.max(1, Math.ceil(y1 - y0) + 2);
    const k = Math.min(1, MAX / Math.max(W, H)); // çok büyük grupta tuval sınırı
    const cv = U.canvas(Math.max(1, Math.round(W * k)), Math.max(1, Math.round(H * k))), x = cv.getContext('2d');
    x.translate(cv.width / 2, cv.height / 2); x.scale(k, k);
    for (const c of kids) App.drawLayer(x, c, k);
    G.canvas = cv;
    if (k < 1) { G.sx /= k; G.sy /= k; G._k = k; }
  }
  App.layerRenderers.group = renderGroup;
  App.layerScalers = App.layerScalers || {};
  // Boyutlandırma bitince ölçek içteki katmanlara işlenir, grup yeniden çizilir (bulanıklaşmaz)
  App.layerScalers.group = G => {
    const S = new DOMMatrix().scale(G.sx * (G._k || 1), G.sy * (G._k || 1));
    for (const c of G.children) { setMat(c, S.multiply(matOf(c))); App.bakeVector(c); }
    G.sx = G.sy = 1; delete G._k;
    renderGroup(G);
  };

  const G = App.groups = {
    // Seçili katmanları gruplar
    group(layers) {
      const d = App.doc;
      layers = layers.filter(L => d.layers.includes(L));
      if (layers.length < 2) { UI.toast('To group, select at least two layers in the Layers panel with Ctrl or Shift', 'warn', 3500); return null; }
      if (App.tool && App.tool.cancel) App.tool.cancel();
      // grubun ortası: katmanların kapladığı alanın ortası
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const L of layers) { const b = App.layerAABB(L); x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0); x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1); }
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      const top = Math.max(...layers.map(L => d.layers.indexOf(L)));
      const children = layers.map(L => { const c = App.cloneLayer(L); delete c._world; c.x -= cx; c.y -= cy; return c; });
      const g = App.newLayer(U.canvas(1, 1), { type: 'group', name: 'Group', children, x: cx, y: cy });
      renderGroup(g);
      const at = top - layers.length + 1;
      for (const L of layers) d.layers.splice(d.layers.indexOf(L), 1);
      App.addLayer(g, { index: at });
      App.commit('Group Layers');
      if (App.tool && App.tool.refresh) App.tool.refresh();
      return g;
    },
    // Grubu çözer: katmanlar grubun dönüşümü, saydamlığı ve görünürlüğüyle yerlerine konur
    ungroup(g) {
      const d = App.doc;
      if (!g || g.type !== 'group') { UI.toast('Select a group first', 'warn'); return; }
      if (App.tool && App.tool.cancel) App.tool.cancel();
      const M = matOf(g), at = d.layers.indexOf(g);
      if (g._k) M.scaleSelf(g._k, g._k);
      const out = g.children.map(c0 => {
        const c = App.cloneLayer(c0);
        c.id = U.uid();
        setMat(c, M.multiply(matOf(c0)));
        c.opacity *= g.opacity;
        if (!g.visible) c.visible = false;
        if ((g.blend || 'source-over') !== 'source-over' && (c.blend || 'source-over') === 'source-over') c.blend = g.blend;
        if (g.locked) c.locked = true;
        App.bakeVector(c);
        return c;
      });
      d.layers.splice(at, 1, ...out);
      d.active = out[out.length - 1].id;
      App.emit('doc');
      UI.selectLayers(out.map(c => c.id));
      App.commit('Ungroup');
      if (App.tool && App.tool.refresh) App.tool.refresh();
    },
  };

})();
