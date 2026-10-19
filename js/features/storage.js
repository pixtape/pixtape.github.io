'use strict';
/* Proje kaydetme: IndexedDB (otomatik kayıt / son projeler) ve .pixtape dosyaları */
(() => {
  const { U } = App;
  const DB = 'pixtape', STORE = 'projects';
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
  const tx = async (mode, fn) => {
    const db = await open();
    return new Promise((res, rej) => {
      const t = db.transaction(STORE, mode), s = t.objectStore(STORE);
      const r = fn(s);
      t.oncomplete = () => res(r && r.result);
      t.onerror = () => rej(t.error);
    });
  };

  const blobCache = new WeakMap();
  const canvasBlob = async c => {
    let b = blobCache.get(c);
    if (!b) { b = await U.toBlob(c, 'image/png'); blobCache.set(c, b); }
    return b;
  };
  const blobToCanvas = b => U.fileToCanvas(b);

  // Belgeyi serileştir (tuvaller PNG blob olarak)
  // Grupların içindeki katmanlar da aynı biçimde (iç içe) saklanır
  const serLayers = async (list, toDataURL) => {
    const layers = [];
    for (const L of list) {
      const o = App.cloneLayer(L);
      delete o.canvas; delete o.fillImg;
      o.png = toDataURL ? L.canvas.toDataURL('image/png') : await canvasBlob(L.canvas);
      if (L.fillImg) o.fillPng = toDataURL ? L.fillImg.toDataURL('image/png') : await canvasBlob(L.fillImg);
      if (L.children) o.children = await serLayers(L.children, toDataURL);
      layers.push(o);
    }
    return layers;
  };
  const serialize = async (doc, toDataURL) => {
    const layers = await serLayers(doc.layers, toDataURL);
    return { v: 1, id: doc.id, name: doc.name, w: doc.w, h: doc.h, bg: doc.bg || null, active: doc.active, created: doc.created, layers };
  };
  const deserLayers = async list => {
    const layers = [];
    for (const o of list) {
      const src = o.png;
      const c = typeof src === 'string' ? await U.urlToCanvas(src) : await blobToCanvas(src);
      const L = { ...o, canvas: c };
      delete L.png; delete L.fillPng;
      if (o.fillPng) L.fillImg = typeof o.fillPng === 'string' ? await U.urlToCanvas(o.fillPng) : await blobToCanvas(o.fillPng);
      if (o.children) L.children = await deserLayers(o.children);
      layers.push(L);
    }
    return layers;
  };
  const deserialize = data => deserLayers(data.layers);

  const S = App.storage = {
    enabled: true,
    async saveCurrent(force) {
      const d = App.doc;
      if (!d || !S.enabled || (!App.prefs.autosave && !force)) return;
      try {
        // küçük resim hemen alınır (bu sırada başka sekmeye geçilse bile doğru belge kaydedilsin)
        const th = App.composite({ scale: Math.min(1, 320 / Math.max(d.w, d.h)) });
        const thumb = th.toDataURL('image/jpeg', 0.75);
        const data = await serialize(d);
        data.thumb = thumb;
        data.updated = Date.now();
        await tx('readwrite', s => s.put(data));
        App.emit('saved', d);
        S.prune();
      } catch (e) { console.warn('Autosave Failed', e); }
    },
    async list() {
      try {
        const all = await tx('readonly', s => s.getAll());
        return (all || []).map(p => ({ id: p.id, name: p.name, w: p.w, h: p.h, thumb: p.thumb, updated: p.updated, pinned: p.pinned })).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.updated - a.updated);
      } catch (e) { return []; }
    },
    // o.copy: projenin kopyası yeni bir proje olarak açılır (asıl proje değişmez)
    async load(id, o = {}) {
      const p = await tx('readonly', s => s.get(id));
      if (!p) throw new Error(App.t('Project Not Found'));
      const layers = await deserialize(p);
      if (o.copy) App.newDoc({ w: p.w, h: p.h, name: p.name + ' ' + App.t('copy'), layers, label: 'Project Opened', paper: p.bg || null });
      else App.newDoc({ w: p.w, h: p.h, name: p.name, layers, label: 'Project Opened', id: p.id, paper: p.bg || null });
      if (p.active && App.layerById(p.active)) App.setActive(p.active);
    },
    async has(id) { try { return (await tx('readonly', s => s.getKey(id))) !== undefined; } catch (e) { return true; } },
    async remove(id) { await tx('readwrite', s => s.delete(id)); },
    async pin(id, v) {
      const p = await tx('readonly', s => s.get(id));
      if (p) { p.pinned = v; await tx('readwrite', s => s.put(p)); }
    },
    async clear() { await tx('readwrite', s => s.clear()); },
    async prune() {
      const keep = +App.prefs.keepProjects || 0;
      if (keep <= 0) return; // sınırsız: hiçbir proje kendiliğinden silinmez
      const all = await S.list();
      const extra = all.filter(p => !p.pinned).slice(U.clamp(keep, 1, 200));
      for (const p of extra) await S.remove(p.id);
    },

    // .pixtape proje dosyası (JSON + gömülü PNG'ler)
    async exportFile() {
      const d = App.doc;
      const data = await serialize(d, true);
      data.app = 'Pixtape';
      return new Blob([JSON.stringify(data)], { type: 'application/json' });
    },
    async importFile(file) {
      const data = JSON.parse(await file.text());
      if (!data.layers || !data.w) throw new Error('Invalid Pixtape project file');
      const layers = await deserialize(data);
      App.newDoc({ w: data.w, h: data.h, name: data.name || file.name.replace(App.PROJECT_RE, ''), layers, label: 'Project Opened', id: U.uid(), paper: data.bg || null });
    },
  };

  const auto = U.debounce(() => S.saveCurrent(), 2500);
  App.on('changed', auto);
  App.on('docopen', auto);

  // Sayfa kapanırken ya da arka plana geçerken son durumu hemen kaydet
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') S.saveCurrent(); });
})();
