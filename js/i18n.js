'use strict';
/* Pixtape - dil desteği
   Kaynak dil İngilizcedir; diğer diller (Türkçe, Çince, Rusça) lang/<kod>.json sözlüğünden çevrilir.
   İngilizce sözlük yalnızca eski sürümlerden kalan Türkçe adları (ör. katman adları) çevirir.
   Arayüze eklenen metinler (yazılar, title / placeholder öznitelikleri) otomatik çevrilir. */
(() => {
  // [kod, dilin kendi adıyla, bölge (tarih/sayı biçimi)]
  const LANGS = [['en', 'English', 'en-US'], ['tr', 'Türkçe', 'tr-TR'], ['zh', '中文', 'zh-CN'], ['ru', 'Русский', 'ru-RU']];
  const KEY = 'pixtape-lang';
  const I = App.i18n = { lang: 'en', dict: {}, patterns: [], LANGS, cache: {} };
  const ATTRS = ['title', 'placeholder', 'aria-label', 'label'];
  const SKIP = 'textarea, script, style, [contenteditable], [data-noi18n]';
  const origText = new WeakMap();  // metin düğümü → özgün (İngilizce) metin
  const origAttr = new WeakMap();  // öğe → { öznitelik: [özgün, çevrilmiş] }

  // Sözlükte yoksa kalıplarla (ör. "Ad: değer", "Katman 2", "Düzenle (V)") parçalara bölerek çevirir
  const viaPatterns = (key, depth) => {
    if (depth > 3) return null;
    for (const [re, tpl] of I.patterns) {
      const m = key.match(re);
      if (!m) continue;
      const out = tpl.replace(/\{(\d+)\}/g, (_, n) => {
        const g = m[+n] || '', k = g.trim();
        if (!k) return g;
        const r = I.dict[k] != null ? I.dict[k] : viaPatterns(k, depth + 1);
        return r != null ? g.replace(k, r) : g;
      });
      if (out !== key) return out;
    }
    return null;
  };
  const lookup = s => {
    if (typeof s !== 'string') return null;
    const key = s.trim();
    if (!key || key.length > 600) return null;
    let r = I.dict[key];
    if (r == null) r = viaPatterns(key, 0);
    if (r == null) return null;
    if (key === s) return r;
    const i = s.indexOf(key);
    return s.slice(0, i) + r + s.slice(i + key.length);
  };

  App.t = (s, ...a) => {
    const r = lookup(s);
    return App.fmt(r == null ? s : r, a);
  };
  I.locale = () => (LANGS.find(l => l[0] === I.lang) || LANGS[0])[2];

  // Bayraklar (bazı sistemler bayrak emojilerini göstermediği için SVG)
  let fid = 0;
  const star = (cx, cy, r, rot = 0) => {
    const p = [];
    for (let i = 0; i < 10; i++) {
      const a = rot + Math.PI / 2 * -1 + i * Math.PI / 5, rr = i % 2 ? r * 0.382 : r;
      p.push((cx + Math.cos(a) * rr).toFixed(2) + ',' + (cy + Math.sin(a) * rr).toFixed(2));
    }
    return `<polygon fill="#FFDE00" points="${p.join(' ')}"/>`;
  };
  I.flag = (code, w = 24) => {
    const hh = Math.round(w * 2 / 3), id = 'fl' + (++fid);
    const svg = (vb, body) => `<svg class="flag" width="${w}" height="${hh}" viewBox="${vb}" preserveAspectRatio="none">${body}</svg>`;
    if (code === 'tr') return svg('0 0 1200 800', '<rect width="1200" height="800" fill="#E30A17"/><circle cx="425" cy="400" r="200" fill="#fff"/><circle cx="475" cy="400" r="160" fill="#E30A17"/><polygon fill="#fff" points="583.3,400 764.2,458.8 652.4,304.9 652.4,495.1 764.2,341.2"/>');
    if (code === 'ru') return svg('0 0 9 6', '<rect width="9" height="2" fill="#fff"/><rect y="2" width="9" height="2" fill="#0039A6"/><rect y="4" width="9" height="2" fill="#D52B1E"/>');
    if (code === 'zh') return svg('0 0 30 20', '<rect width="30" height="20" fill="#DE2910"/>' + star(5, 5, 3) + star(10, 2, 1, 0.4) + star(12, 4, 1, 0.9) + star(12, 7, 1, 1.3) + star(10, 9, 1, 0.8));
    return svg('0 0 60 30', `<clipPath id="${id}a"><path d="M0,0v30h60V0z"/></clipPath><clipPath id="${id}b"><path d="M30,15h30v15zv15H0zH0V0zV0h30z"/></clipPath><g clip-path="url(#${id}a)"><path d="M0,0v30h60V0z" fill="#012169"/><path d="M0,0 60,30M60,0 0,30" stroke="#fff" stroke-width="6"/><path d="M0,0 60,30M60,0 0,30" clip-path="url(#${id}b)" stroke="#C8102E" stroke-width="4"/><path d="M30,0v30M0,15h60" stroke="#fff" stroke-width="10"/><path d="M30,0v30M0,15h60" stroke="#C8102E" stroke-width="6"/></g>`);
  };

  /* ------------------------------------------------ DOM çevirisi */
  const trText = n => {
    const o = origText.has(n) ? origText.get(n) : n.data;
    const r = lookup(o);
    if (r != null) {
      if (!origText.has(n)) origText.set(n, o);
      if (n.data !== r) n.data = r;
    } else if (origText.has(n) && n.data !== o) n.data = o;
  };
  const trEl = el => {
    for (const a of ATTRS) {
      if (!el.hasAttribute(a)) continue;
      if (a === 'label' && el.tagName !== 'OPTGROUP' && el.tagName !== 'OPTION') continue;
      const cur = el.getAttribute(a);
      let m = origAttr.get(el);
      const o = m && m[a] && cur === m[a][1] ? m[a][0] : cur;
      const r = lookup(o);
      const val = r == null ? o : r;
      if (!m) { m = {}; origAttr.set(el, m); }
      m[a] = [o, val];
      if (cur !== val) el.setAttribute(a, val);
    }
  };
  const reject = n => n.nodeType === 1 && n.matches(SKIP);
  const walk = root => {
    if (!root) return;
    if (root.nodeType === 3) { trText(root); return; }
    if (root.nodeType !== 1 || reject(root)) return;
    trEl(root);
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: n => (reject(n) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    let n;
    while ((n = tw.nextNode())) { if (n.nodeType === 3) trText(n); else trEl(n); }
  };
  const inSkipped = n => {
    const p = n.nodeType === 3 ? n.parentElement : n.parentElement || null;
    return !!(p && p.closest(SKIP));
  };
  const mo = new MutationObserver(list => {
    for (const m of list) {
      if (m.type === 'childList') {
        for (const n of m.addedNodes) if (!inSkipped(n)) walk(n);
      } else if (m.type === 'attributes' && m.target.nodeType === 1 && !m.target.closest(SKIP)) trEl(m.target);
    }
  });
  I.translateAll = () => walk(document.documentElement);
  // Yeni eklenen öğeyi hemen çevirir (gözlemci bir an sonra çevirir; ölçmeden önce metin yerinde olsun)
  I.translate = el => walk(el);

  /* ------------------------------------------------ yükleme / dil değiştirme */
  I.load = async lang => {
    if (!LANGS.some(l => l[0] === lang)) lang = 'en';
    if (!I.cache[lang]) {
      try {
        const r = await fetch('lang/' + lang + '.json', { cache: 'no-cache' });
        const j = await r.json();
        I.cache[lang] = {
          dict: j.strings || {},
          patterns: (j.patterns || []).map(([re, tpl]) => [new RegExp(re, 'u'), tpl]),
        };
      } catch (e) {
        console.warn('Language file could not be loaded:', lang, e);
        lang = 'en';
      }
    }
    I.lang = lang;
    const c = I.cache[lang] || { dict: {}, patterns: [] };
    I.dict = c.dict; I.patterns = c.patterns;
    document.documentElement.lang = lang;
    return lang;
  };
  I.saved = () => { try { return localStorage.getItem(KEY) || 'en'; } catch (e) { return 'en'; } };
  // Uygulama başlarken: kayıtlı dili (varsayılan İngilizce) yükle ve sayfayı çevir
  I.ready = (async () => {
    await I.load(I.saved());
    if (document.readyState === 'loading') await new Promise(r => document.addEventListener('DOMContentLoaded', r, { once: true }));
    I.translateAll();
    mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ATTRS });
  })();
  I.set = async lang => {
    await I.load(lang);
    try { localStorage.setItem(KEY, I.lang); } catch (e) { /* */ }
    I.translateAll();
    App.emit('lang', I.lang);
  };
})();
