'use strict';
/* Metin aracı: tuval üzerinde yazma, yazı tipleri (önizlemeli), kontur, arka plan, eğri metin, degrade, gölge, hazır stiller */
(() => {
  const { U, ui: UI } = App;
  const h = U.h;
  // tıklama metinlere ulaşsın: üstteki kilitli katmanlar (ör. kaplama) atlanır
  // Noktanın altındaki en üstteki metin. Harfin üstüne denk gelmek gerekmez: yazının sınır kutusu sayılır
  // (kenar boşlukları, kontur ve gölge payı hariç), kutunun dışına tıklamak yeni metin ekler.
  const textAt = p => {
    const ls = App.doc ? App.doc.layers : [];
    for (let i = ls.length - 1; i >= 0; i--) {
      const q = ls[i];
      if (q.type !== 'text' || !q.visible || App.isBackdrop(q)) continue;
      const l = App.docToLayer(q, p.x, p.y), pad = q._pad || 0;
      if (l.x >= pad && l.y >= pad && l.x <= q.canvas.width - pad && l.y <= q.canvas.height - pad) return q;
    }
    return null;
  };

  /* ------------------------------------------------ yazı tipleri */
  // bilinen yaygın yazı tiplerinden yalnızca bu cihazda yüklü olanlar listelenir
  const SYSTEM_FONTS = ['Segoe UI', 'Helvetica', 'Helvetica Neue', 'Avenir', 'Futura', 'Gill Sans', 'Optima', 'Baskerville', 'Didot', 'Menlo', 'DejaVu Sans', 'Liberation Sans', 'Liberation Serif', 'Arial', 'Arial Black', 'Bahnschrift', 'Calibri', 'Cambria', 'Candara', 'Comic Sans MS', 'Consolas', 'Constantia', 'Corbel', 'Courier New', 'Franklin Gothic Medium', 'Gabriola', 'Georgia', 'Impact', 'Ink Free', 'Lucida Console', 'Palatino Linotype', 'Segoe Print', 'Segoe Script', 'Sitka Text', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana'].filter(f => U.hasFont(f)).sort((a, b) => a.localeCompare(b));
  // [grup adı, yazı tipleri]; kalın (700) ağırlığı olanlar BOLD kümesinde
  const WEB_GROUPS = [
    ['Modern', ['Montserrat', 'Poppins', 'Roboto', 'Open Sans', 'Lato', 'Inter', 'Nunito', 'Raleway', 'Oswald', 'Rubik', 'Work Sans', 'Quicksand', 'Josefin Sans', 'Barlow', 'Kanit', 'Ubuntu', 'Exo 2', 'Comfortaa', 'Fredoka', 'Archivo Black']],
    ['Display / Headline', ['Bebas Neue', 'Anton', 'Righteous', 'Bangers', 'Abril Fatface', 'Alfa Slab One', 'Bungee', 'Bungee Shade', 'Lobster', 'Monoton', 'Rubik Mono One', 'Press Start 2P', 'Russo One', 'Black Ops One', 'Titan One', 'Luckiest Guy', 'Passion One', 'Staatliches', 'Ultra', 'Creepster', 'Shrikhand', 'Chewy', 'Fugaz One', 'Bowlby One SC', 'Faster One']],
    ['Classic (serif)', ['Playfair Display', 'Merriweather', 'Lora', 'Cinzel', 'Cormorant Garamond', 'Libre Baskerville', 'EB Garamond', 'DM Serif Display', 'Bitter', 'Crimson Text', 'Prata', 'Yeseva One']],
    ['Handwriting', ['Pacifico', 'Dancing Script', 'Great Vibes', 'Satisfy', 'Sacramento', 'Caveat', 'Kalam', 'Permanent Marker', 'Shadows Into Light', 'Amatic SC', 'Lobster Two', 'Courgette', 'Kaushan Script', 'Parisienne', 'Allura', 'Alex Brush', 'Cookie', 'Yellowtail', 'Tangerine', 'Pinyon Script', 'Mr Dafoe', 'Marck Script', 'Rock Salt', 'Indie Flower', 'Gloria Hallelujah', 'Patrick Hand', 'Handlee', 'Homemade Apple', 'Leckerli One', 'Damion', 'Niconne', 'Berkshire Swash', 'Merienda', 'Style Script', 'Playball', 'Italianno', 'Bad Script', 'Mrs Saint Delafield', 'Ms Madi', 'Birthstone']],
    ['Fun / Decorative', ['Emilys Candy', 'Mystery Quest', 'Spirax', 'Henny Penny', 'Mountains of Christmas', 'Princess Sofia', 'Elsie', 'Fondamento', 'Cherry Swash', 'Delius Swash Caps', 'Sniglet', 'Margarine', 'Grand Hotel', 'Sail', 'Lemon', 'Ribeye', 'Oleo Script', 'Galada', 'Fontdiner Swanky', 'Sancreek']],
    ['Typewriter', ['Space Mono', 'Courier Prime', 'Source Code Pro']],
  ];
  const BOLD = new Set(['Montserrat', 'Poppins', 'Roboto', 'Open Sans', 'Lato', 'Inter', 'Nunito', 'Raleway', 'Oswald', 'Rubik', 'Work Sans', 'Quicksand', 'Josefin Sans', 'Barlow', 'Kanit', 'Ubuntu', 'Exo 2', 'Comfortaa', 'Fredoka', 'Playfair Display', 'Merriweather', 'Lora', 'Cinzel', 'Cormorant Garamond', 'Libre Baskerville', 'EB Garamond', 'Bitter', 'Crimson Text', 'Dancing Script', 'Caveat', 'Kalam', 'Lobster Two', 'Merienda', 'Space Mono', 'Courier Prime', 'Source Code Pro']);
  const WEB_FONTS = WEB_GROUPS.flatMap(g => g[1]);
  let webFontsCss = null;
  // Yazı tipleri bu siteden sunulur (fonts klasörü); tarayıcı her dosyayı yalnızca o yazı tipi kullanılınca indirir.
  // Dönen söz, yazı tipi listesi (fonts.css) yüklenince çözülür.
  const loadWebFonts = () => {
    if (webFontsCss) return webFontsCss;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'fonts/fonts.css';
    webFontsCss = new Promise(res => { link.onload = link.onerror = () => res(); });
    document.head.appendChild(link);
    return webFontsCss;
  };
  /* Hazır stil düğmelerinin yazı tipleri araç açılınca arka planda indirilir. Bölüm ilk kez açıldığında düğmeler önce
     düz yazıyla görünüp sonra değişiyordu; artık yazı tipleri hazır olana kadar düğmeler gizli bekler (en çok 2 sn). */
  let presetFontsP = null;
  const presetFonts = () => presetFontsP || (presetFontsP = loadWebFonts().then(() => Promise.all(PRESETS.map(([, pr]) =>
    pr.font ? document.fonts.load(`${pr.italic ? 'italic ' : ''}${pr.bold ? 700 : 400} 16px "${pr.font}"`).catch(() => {}) : null)))
    .then(() => { presetFontsP.done = true; }));

  /* Kullanıcının bilgisayarından yüklediği yazı tipleri (IndexedDB'de saklanır) */
  const FDB = 'pixtape-fonts';
  const fdb = () => new Promise((res, rej) => {
    const r = indexedDB.open(FDB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('fonts', { keyPath: 'name' });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  const fstore = async (mode, fn) => {
    const db = await fdb();
    return new Promise((res, rej) => {
      const t = db.transaction('fonts', mode), q = fn(t.objectStore('fonts'));
      t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error);
    });
  };
  const USER_FONTS = [];
  const registerFont = async (name, data) => {
    const ff = new FontFace(name, data);
    await ff.load();
    document.fonts.add(ff);
    if (!USER_FONTS.includes(name)) USER_FONTS.push(name);
  };
  const userFontsReady = (async () => {
    try {
      const all = await fstore('readonly', s => s.getAll());
      for (const f of all || []) { try { await registerFont(f.name, f.data); } catch (e) { /* bozuk dosya */ } }
    } catch (e) { /* IndexedDB yok */ }
  })();
  // .ttf / .otf / .woff / .woff2 dosyasından yazı tipi ekle
  const uploadFonts = async () => {
    const fs = await App.actions.pickFile('.ttf,.otf,.woff,.woff2,font/*', true);
    if (!fs) return [];
    const added = [];
    for (const f of fs) {
      const name = f.name.replace(/\.(ttf|otf|woff2?)$/i, '').replace(/[-_]+/g, ' ').trim();
      try {
        const data = await f.arrayBuffer();
        await registerFont(name, data);
        await fstore('readwrite', s => s.put({ name, data }));
        added.push(name);
      } catch (e) { UI.toast(App.t('Could not load font: {0}', f.name), 'error'); }
    }
    if (added.length) UI.toast(App.t('{0} fonts added', added.length), 'ok');
    return added;
  };
  const removeUserFont = async name => {
    const i = USER_FONTS.indexOf(name);
    if (i >= 0) USER_FONTS.splice(i, 1);
    try { await fstore('readwrite', s => s.delete(name)); } catch (e) { /* */ }
  };

  // Bu cihazda olmayan yazı tipinin yerine benzer bir web yazı tipi kullanılır (her cihazda aynı görünsün)
  const SUBST = { 'Segoe UI': 'Open Sans', 'Impact': 'Anton', 'Courier New': 'Courier Prime', 'Arial': 'Roboto', 'Georgia': 'Merriweather', 'Times New Roman': 'Crimson Text' };
  const pickFont = f => (WEB_FONTS.includes(f) || USER_FONTS.includes(f) || U.hasFont(f)) ? f : SUBST[f] || 'Open Sans';
  const DEF = () => ({
    value: App.t('Type Your Text'), font: pickFont(App.prefs.textFont || 'Segoe UI'), size: 96, color: App.prefs.textColor || '#000000', bold: App.prefs.textBold !== false, italic: false, underline: false, upper: false,
    align: 'center', spacing: 0, lineH: 1.15, curve: 0,
    stroke: { on: false, color: '#000000', w: 6 },
    bg: { on: false, color: '#000000', pad: 24, radius: 16, mode: 'all', opacity: 0.8 },
    grad: { on: false, ...U.gradDef('#ffb000', '#ff2d55', 180) },
  });

  const PRESETS = [
    ['White', { color: '#ffffff', shadow: { on: true, color: '#000000', blur: 10, x: 0, y: 3, opacity: 0.45 } }],
    ['Title', { font: 'Montserrat', bold: true, color: '#ffffff', upper: true, spacing: 2 }],
    ['Meme', { font: 'Impact', bold: false, color: '#ffffff', upper: true, stroke: { on: true, color: '#000000', w: 8 } }],
    ['Neon', { font: 'Righteous', bold: false, color: '#ffffff', shadow: { on: true, color: '#ff2bd6', blur: 40, x: 0, y: 0, opacity: 1 } }],
    ['Retro', { font: 'Bebas Neue', bold: false, color: '#ffd23f', shadow: { on: true, color: '#e63946', blur: 0, x: 10, y: 10, opacity: 1 } }],
    ['Label', { font: 'Poppins', bold: true, color: '#ffffff', bg: { on: true, color: '#6c5cff', pad: 28, radius: 999, mode: 'all', opacity: 1 } }],
    ['Subtitle', { font: 'Segoe UI', bold: true, color: '#ffffff', bg: { on: true, color: '#000000', pad: 14, radius: 6, mode: 'line', opacity: 0.7 } }],
    ['Handwriting', { font: 'Pacifico', bold: false, color: '#ffffff', shadow: { on: true, color: '#000000', blur: 12, x: 0, y: 4, opacity: 0.5 } }],
    ['Gradient', { font: 'Archivo Black', bold: false, color: '#ffb000', grad: { on: true, ...U.gradDef('#ffb000', '#ff2d55', 180) } }],
    ['Elegant', { font: 'Playfair Display', bold: false, italic: true, color: '#ffffff', spacing: 1 }],
    ['Outline', { font: 'Anton', bold: false, color: '#ffffff', stroke: { on: true, color: '#6c5cff', w: 10 } }],
    ['Typewriter', { font: 'Courier New', bold: true, color: '#111111', bg: { on: true, color: '#fff4c2', pad: 18, radius: 0, mode: 'line', opacity: 1 } }],
    ['Pixel', { font: 'Press Start 2P', bold: false, color: '#39ff14', size: 48 }],
    ['Calligraphy', { font: 'Great Vibes', bold: false, color: '#ffffff', shadow: { on: true, color: '#000000', blur: 8, x: 0, y: 3, opacity: 0.45 } }],
    ['Pop', { font: 'Luckiest Guy', bold: false, color: '#ffde00', stroke: { on: true, color: '#e4007c', w: 8 }, shadow: { on: true, color: '#000000', blur: 0, x: 6, y: 6, opacity: 1 } }],
  ].map(([n, pr]) => [n, pr.font ? { ...pr, font: pickFont(pr.font) } : pr]);

  const fontStr = t => `${t.italic ? 'italic ' : ''}${t.bold ? '700' : '400'} ${t.size}px "${t.font}", "Segoe UI", sans-serif`;

  /* ------------------------------------------------ metin şablonları
     Her şablon bir ya da birkaç metin katmanıdır. Ölçüler 100 = varsayılan yazı boyu olacak şekilde verilir; eklenirken
     tuvalin boyuna göre büyütülür. dx / dy: katmanın şablonun ortasına uzaklığı. Metinler çevrilmez (her dilde aynı). */
  const SH = (blur = 12, y = 4, o = 0.45, color = '#000000') => ({ color, blur, x: 0, y, opacity: o });
  const TEMPLATES = [
    [{ v: 'Big sale', upper: 1, font: 'Anton', size: 150, color: '#ffffff', bg: { color: '#e63946', padX: 34, padY: 8, radius: 8 }, dy: -40 },
      { v: 'Up to 50% off', upper: 1, font: 'Montserrat', bold: 1, size: 44, spacing: 8, color: '#ffffff', shadow: SH(10, 3), dy: 78 }],
    [{ v: 'Happy Birthday', font: 'Great Vibes', size: 170, grad: ['#ff9ad5', '#ffd36e', 90], shadow: SH(12, 4, 0.4), dy: -25 },
      { v: 'Have a wonderful day', upper: 1, font: 'Montserrat', bold: 1, size: 40, spacing: 6, color: '#ffffff', shadow: SH(8, 2), dy: 75 }],
    [{ v: 'New post', upper: 1, font: 'Poppins', bold: 1, size: 70, spacing: 4, color: '#ffffff', bg: { color: '#6c5cff', padX: 48, padY: 20, radius: 999 } }],
    [{ v: 'Grand', upper: 1, font: 'Bebas Neue', size: 160, spacing: 12, grad: ['#f9d976', '#c7902e', 180], shadow: SH(10, 4, 0.4), dy: -58 },
      { v: 'Opening', upper: 1, font: 'Bebas Neue', size: 84, spacing: 24, color: '#ffffff', shadow: SH(8, 3), dy: 50 },
      { v: 'this Saturday', font: 'Pacifico', size: 46, color: '#f9d976', shadow: SH(8, 3), dy: 118 }],
    [{ v: 'Thank You', font: 'Great Vibes', size: 160, color: '#ffffff', shadow: SH(14, 4, 0.5), dy: -22 },
      { v: 'For watching', upper: 1, font: 'Montserrat', bold: 1, size: 40, spacing: 12, color: '#ffffff', shadow: SH(8, 2), dy: 72 }],
    [{ v: 'Breaking', upper: 1, font: 'Anton', size: 92, spacing: 2, color: '#ffffff', bg: { color: '#d90429', padX: 26, padY: 4, radius: 0 }, dy: -42 },
      { v: 'News', upper: 1, font: 'Anton', size: 92, spacing: 2, color: '#111111', bg: { color: '#ffffff', padX: 26, padY: 4, radius: 0 }, dy: 62 }],
    [{ v: 'Coming Soon', font: 'Righteous', size: 110, color: '#ffffff', shadow: SH(40, 0, 1, '#ff2bd6') }],
    [{ v: "don't forget to", font: 'Kaushan Script', size: 52, color: '#ffffff', shadow: SH(8, 3), dy: -72 },
      { v: 'Subscribe', upper: 1, font: 'Luckiest Guy', size: 120, color: '#ffde00', stroke: { color: '#e4007c', w: 9 }, shadow: { color: '#000000', blur: 0, x: 6, y: 6, opacity: 1 }, dy: 18 }],
    [{ v: 'Summer Vibes', font: 'Pacifico', size: 120, grad: ['#ffb000', '#ff4d6d', 180], stroke: { color: '#ffffff', w: 6 }, curve: 20 }],
    [{ v: '“Be the energy you\\nwant to attract.”', font: 'Playfair Display', italic: 1, size: 72, lineH: 1.2, color: '#ffffff', shadow: SH(10, 3), dy: -22 },
      { v: '— Author name', upper: 1, font: 'Montserrat', size: 34, spacing: 6, color: '#ffffff', shadow: SH(6, 2), dy: 100 }],
    [{ v: 'Limited offer', upper: 1, font: 'Black Ops One', size: 92, color: '#ffffff', stroke: { color: '#111111', w: 6 }, dy: -22 },
      { v: 'only today', font: 'Satisfy', size: 60, color: '#ffd23f', shadow: SH(8, 3), dy: 62 }],
    [{ v: 'Game over', upper: 1, font: 'Press Start 2P', size: 64, color: '#39ff14', shadow: { color: '#006b2e', blur: 0, x: 6, y: 6, opacity: 1 }, dy: -24 },
      { v: 'Press start', upper: 1, font: 'Press Start 2P', size: 24, color: '#ffffff', dy: 56 }],
    [{ v: 'Merry Christmas', font: 'Mountains of Christmas', bold: 1, size: 112, color: '#e63946', stroke: { color: '#ffffff', w: 6 }, dy: -22 },
      { v: 'and a happy new year', upper: 1, font: 'Montserrat', bold: 1, size: 34, spacing: 7, color: '#ffffff', shadow: SH(8, 2), dy: 64 }],
    [{ v: "Don't stop", upper: 1, font: 'Anton', size: 130, color: '#ffffff', shadow: SH(12, 4), dy: -40 },
      { v: "until you're proud", upper: 1, font: 'Montserrat', bold: 1, size: 38, spacing: 4, color: '#111111', bg: { color: '#ffd23f', padX: 20, padY: 8, radius: 4 }, dy: 62 }],
    [{ v: 'Free shipping', upper: 1, font: 'Poppins', bold: 1, size: 64, color: '#ffffff', bg: { color: '#2a9d8f', padX: 38, padY: 16, radius: 14 }, dy: -20 },
      { v: 'on all orders', font: 'Poppins', size: 34, color: '#ffffff', shadow: SH(8, 2), dy: 60 }],
    [{ v: 'Sunday', upper: 1, font: 'Bebas Neue', size: 120, spacing: 4, color: '#ffd23f', shadow: { color: '#e63946', blur: 0, x: 8, y: 8, opacity: 1 }, dy: -48 },
      { v: 'Funday', upper: 1, font: 'Bebas Neue', size: 120, spacing: 4, color: '#ffd23f', shadow: { color: '#e63946', blur: 0, x: 8, y: 8, opacity: 1 }, dy: 52 }],
  ];
  const tplFontStr = it => `${it.italic ? 'italic ' : ''}${it.bold ? 700 : 400} 32px "${pickFont(it.font)}"`;
  let tplFontsP = null;
  const templateFonts = () => tplFontsP || (tplFontsP = loadWebFonts().then(() => Promise.all(TEMPLATES.flat().map(it => document.fonts.load(tplFontStr(it)).catch(() => {}))))
    .then(() => { tplFontsP.done = true; }));
  // Şablonun katmanları (k: ölçek; 1 = 100 birim yazı boyu 100 px)
  const templateLayers = (tp, k) => tp.map(it => {
    const t = DEF();
    Object.assign(t, {
      value: it.v.replace(/\\n/g, '\n'), font: pickFont(it.font), size: it.size * k, color: it.color || '#ffffff', bold: !!it.bold, italic: !!it.italic,
      upper: !!it.upper, spacing: (it.spacing || 0) * k, lineH: it.lineH || 1.1, curve: it.curve || 0, align: 'center', lang: 'en',
    });
    t.stroke = it.stroke ? { on: true, color: it.stroke.color, w: it.stroke.w * k } : { on: false, color: '#000000', w: Math.max(2, t.size * 0.06) };
    t.bg = it.bg ? { on: true, mode: 'all', opacity: 1, color: it.bg.color, radius: (it.bg.radius || 0) * k, pad: (it.bg.padX || 20) * k, padX: (it.bg.padX || 20) * k, padY: (it.bg.padY || 10) * k }
      : { on: false, color: '#000000', pad: t.size * 0.25, padX: t.size * 0.25, padY: t.size * 0.15, radius: 16 * k, mode: 'all', opacity: 0.8 };
    if (it.grad) t.grad = { on: true, ...U.gradDef(it.grad[0], it.grad[1], it.grad[2] == null ? 180 : it.grad[2]) };
    const L = App.newLayer(U.canvas(1, 1), { type: 'text', name: t.value.split('\n')[0].slice(0, 30), text: t });
    if (it.shadow) L.shadow = { on: true, ...it.shadow, blur: it.shadow.blur * k, x: it.shadow.x * k, y: it.shadow.y * k };
    render(L);
    L._tdx = (it.dx || 0) * k; L._tdy = (it.dy || 0) * k;
    return L;
  });
  // Şablonun küçük önizlemesi
  const templateThumb = (tp, cv) => {
    const ls = templateLayers(tp, 0.5), x = cv.getContext('2d');
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const L of ls) {
      const p = (L._pad || 0) * 0.6;
      x0 = Math.min(x0, L._tdx - L.canvas.width / 2 + p); x1 = Math.max(x1, L._tdx + L.canvas.width / 2 - p);
      y0 = Math.min(y0, L._tdy - L.canvas.height / 2 + p); y1 = Math.max(y1, L._tdy + L.canvas.height / 2 - p);
    }
    const s = Math.min((cv.width - 16) / (x1 - x0), (cv.height - 16) / (y1 - y0), 1);
    x.clearRect(0, 0, cv.width, cv.height);
    x.save(); x.translate(cv.width / 2, cv.height / 2); x.scale(s, s); x.translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
    for (const L of ls) x.drawImage(L.canvas, L._tdx - L.canvas.width / 2, L._tdy - L.canvas.height / 2);
    x.restore();
  };

  /* ------------------------------------------------ karışık stil (metnin bir bölümüne ayrı stil)
     t.runs: [{ s, e, b, i, u, f, c }]: t.value içindeki [s, e) aralığına kalın (b), italik (i), altı çizili (u),
     yazı tipi (f) ve renk (c). Yalnızca verilen özellikler metnin genel stilini ezer. Aralıklar sıralı ve çakışmasızdır. */
  const RUN_KEYS = { b: 'bold', i: 'italic', u: 'underline', f: 'font', c: 'color' };
  const styleAt = (t, idx) => {
    const st = { bold: !!t.bold, italic: !!t.italic, underline: !!t.underline, font: t.font, color: null };
    if (t.runs) for (const r of t.runs) {
      if (idx < r.s) break;
      if (idx < r.e) { for (const k in RUN_KEYS) if (r[k] != null) st[RUN_KEYS[k]] = r[k]; break; }
    }
    return st;
  };
  const styleFont = (st, size) => `${st.italic ? 'italic ' : ''}${st.bold ? '700' : '400'} ${size}px "${st.font}", "Segoe UI", sans-serif`;
  const styleKey = st => [st.bold, st.italic, st.underline, st.font, st.color].join('|');
  // Satırları stil parçalarına böler: [{ segs: [{ text, st, font }], start }]. Büyük harf ayarı karakter karakter uygulanır.
  const textRows = t => {
    // t.lang: metnin kendi dili (ör. şablonlar İngilizce: büyük harfte i → I); yoksa arayüz dili
    const loc = t.lang || App.i18n.locale(), rows = [];
    let off = 0;
    for (const line of t.value.split('\n')) {
      const segs = [];
      let i = off;
      for (const ch of line) {
        const st = styleAt(t, i), key = styleKey(st);
        const shown = t.upper ? ch.toLocaleUpperCase(loc) : ch;
        const last = segs[segs.length - 1];
        if (last && last.key === key) { last.text += shown; last.chars.push(shown); }
        else segs.push({ text: shown, chars: [shown], st, key, font: styleFont(st, t.size) });
        i += ch.length;
      }
      rows.push({ segs, start: off });
      off += line.length + 1;
    }
    return rows;
  };
  // Metin değişince stil aralıklarını kaydır: [a, a+del) silindi, yerine ins karakter geldi.
  // Eklenen metin, hemen önündeki karakterin stilini alır.
  const shiftRuns = (t, a, del, ins) => {
    if (!t.runs || !t.runs.length) return;
    const out = [];
    const cut = x => (x <= a ? x : x >= a + del ? x - del : a);
    for (const r of t.runs) {
      const s1 = cut(r.s), e1 = cut(r.e);
      let s = s1 > a ? s1 + ins : s1, e = e1 > a ? e1 + ins : e1;
      if (ins) {
        if (e1 === a && s1 < a) e = a + ins;                 // aralık imleçte bitiyor: yazılan onun stilini alır
        if (s1 === a && e1 > a && a > 0) s = a + ins;         // imleçte başlıyor: yazılan önceki karakterin stilinde
      }
      if (e > s) out.push({ ...r, s, e });
    }
    t.runs = normRuns(out);
  };
  // Aynı stildeki komşu aralıkları birleştirir, boşları atar
  const normRuns = runs => {
    const out = [];
    for (const r of runs.filter(q => q.e > q.s).sort((p, q) => p.s - q.s)) {
      const props = Object.keys(RUN_KEYS).filter(k => r[k] != null);
      if (!props.length) continue;
      const last = out[out.length - 1];
      if (last && last.e === r.s && props.length === Object.keys(RUN_KEYS).filter(k => last[k] != null).length && props.every(k => last[k] === r[k])) last.e = r.e;
      else out.push({ ...r });
    }
    return out.length ? out : null;
  };
  // [a, b) aralığına bir özellik verir (val null ise o özelliği kaldırır)
  const setRunProp = (t, a, b, key, val) => {
    if (b <= a) return;
    const cuts = new Set([a, b]);
    for (const r of t.runs || []) { cuts.add(r.s); cuts.add(r.e); }
    const pts = [...cuts].filter(x => x >= 0 && x <= t.value.length).sort((p, q) => p - q);
    const out = [];
    for (let k = 0; k < pts.length - 1; k++) {
      const s = pts[k], e = pts[k + 1];
      const r = (t.runs || []).find(q => q.s <= s && q.e >= e);
      const seg = r ? { ...r, s, e } : { s, e };
      if (s >= a && e <= b) { if (val == null) delete seg[key]; else seg[key] = val; }
      out.push(seg);
    }
    t.runs = normRuns(out);
  };
  // Aralıkta özellik her karakterde aynı mı? (düğmenin açık / kapalı görünmesi için)
  const rangeProp = (t, a, b, key) => {
    let v;
    for (let i = a; i < b; i++) { const x = styleAt(t, i)[RUN_KEYS[key]]; if (i === a) v = x; else if (x !== v) return undefined; }
    return v;
  };
  // Eski projelerdeki iki renkli degradeyi yeni biçime çevirir
  const gradOf = t => {
    if (!t.grad.stops) Object.assign(t.grad, U.gradDef(t.color, t.grad.c2 || '#ff3bd0', 180));
    return t.grad;
  };
  // Arka plan kutusunun yatay / dikey payı. Eski projelerde tek "pad" vardı; kutu o zamanki boyuna yakın kalsın.
  const bgPads = t => [t.bg.padX != null ? t.bg.padX : t.bg.pad, t.bg.padY != null ? t.bg.padY : t.bg.pad * 0.4 + t.size * 0.075];
  const shadowOf = L => (L.shadow && L.shadow.on ? L.shadow : null);
  const shadowExtent = sh => (sh ? Math.ceil(sh.blur + Math.max(Math.abs(sh.x), Math.abs(sh.y))) : 0);

  /* ------------------------------------------------ çizim
     Sıra: arka plan kutusu → metnin gölgesi → metin. Böylece kutu gölge üretmez,
     ama metnin gölgesi kutunun üzerine düşer. */
  const measurer = U.canvas(1, 1).getContext('2d');
  const setSpacing = (ctx, v) => { try { ctx.letterSpacing = v + 'px'; } catch (e) { /* eski tarayıcı */ } };
  // Tuvaldeki her şeyi (saydamlığı korunarak) degradeyle boyar; box: [x, y, w, h]
  const recolor = (k, grad, box) => {
    const [bx, by, bw, bh] = box || [0, 0, k.canvas.width, k.canvas.height];
    k.save(); k.globalCompositeOperation = 'source-in';
    k.fillStyle = U.gradFill(k, grad, bx, by, Math.max(1, bw), Math.max(1, bh));
    k.fillRect(0, 0, k.canvas.width, k.canvas.height);
    k.restore();
  };
  // Bir parçanın dolgusu: kendi rengi varsa o, yoksa degrade ya da metnin rengi
  const segFill = (seg, t, grad) => seg.st.color || grad || t.color;
  // Arka plan kutusu ayrı bir katmana tam opak çizilip saydamlığıyla yerleştirilir: çakışan satır kutuları ve
  // köşe yuvarlatma konturu üst üste binince daha koyu görünmez
  // box: [x, y, w, h] degradenin yayılacağı alan (kutunun kendisi)
  const bgLayer = (x, t, draw, box) => {
    const B = U.canvas(x.canvas.width, x.canvas.height), b = B.getContext('2d');
    b.fillStyle = b.strokeStyle = t.bg.color;
    draw(b);
    if (t.bg.gradOn && t.bg.grad) recolor(b, t.bg.grad, box);
    x.save(); x.globalAlpha = t.bg.opacity == null ? 1 : t.bg.opacity; x.drawImage(B, 0, 0); x.restore();
  };

  function render(L) {
    const t = L.text;
    const rows = textRows(t);
    const lh = t.size * t.lineH;
    const sh = shadowOf(L);
    let c;
    if (t.curve && Math.abs(t.curve) > 0.5) c = renderCurved(L, t, rows, lh, sh);
    else {
      const m = measurer;
      setSpacing(m, t.spacing);
      for (const r of rows) {
        r.w = 0;
        for (const s of r.segs) { m.font = s.font; s.w = m.measureText(s.text).width; r.w += s.w; }
        if (!r.segs.length) { m.font = fontStr(t); r.w = m.measureText(' ').width; }
      }
      const maxW = Math.max(1, ...rows.map(r => r.w));
      const sw = t.stroke.on ? t.stroke.w : 0;
      const [bpx, bpy] = bgPads(t);
      const pad = Math.ceil(Math.max(sw, t.bg.on ? Math.max(bpx, bpy) : 0) + t.size * 0.25 + shadowExtent(sh));
      L._pad = pad;
      c = U.canvas(maxW + pad * 2, rows.length * lh + pad * 2);
      const x = c.getContext('2d');
      const G = U.canvas(c.width, c.height), g = G.getContext('2d');
      setSpacing(g, t.spacing);
      g.textBaseline = 'middle'; g.textAlign = 'left';
      const left = t.align === 'left' || t.align === 'justify';
      const rowX = r => (left ? pad : t.align === 'right' ? c.width - pad - r.w : (c.width - r.w) / 2);
      if (t.bg.on) bgLayer(x, t, x => {
        // Kutu satır aralığına değil yazı boyuna göre: her satırın kutusu o satırın ortasında durur,
        // satır aralığı açılınca kutular uzamaz, satırlarla birlikte aralanır.
        // oy: "middle" hizası harflerin biraz üstüne düşer; kutu yazının görsel ortasına gelsin
        const rr = t.bg.radius, gh = t.size, oy = t.size * 0.05;
        if (t.bg.mode === 'line') {
          const bh = gh + bpy * 2;
          rows.forEach((r, i) => {
            if (!r.segs.length) return; // boş satırın arkasına kutu çizilmez
            const cy = pad + lh * (i + 0.5) + oy;
            x.beginPath(); x.roundRect(rowX(r) - bpx, cy - bh / 2, r.w + bpx * 2, bh, Math.min(rr, bh / 2, r.w / 2 + bpx)); x.fill();
          });
        } else {
          const by = pad + lh / 2 - gh / 2 - bpy + oy, bw = maxW + bpx * 2, bh = (rows.length - 1) * lh + gh + bpy * 2;
          x.beginPath(); x.roundRect(pad - bpx, by, bw, bh, Math.min(rr, bh / 2, bw / 2)); x.fill();
        }
      }, [pad - bpx, pad + lh / 2 - t.size / 2 - bpy, maxW + bpx * 2, (rows.length - 1) * lh + t.size + bpy * 2]);
      const grad = t.grad && t.grad.on ? U.gradFill(g, gradOf(t), pad, pad, c.width - pad * 2, c.height - pad * 2) : null;
      const strokeFill = sw && t.stroke.gradOn && t.stroke.grad ? U.gradFill(g, t.stroke.grad, pad - sw, pad - sw, c.width - (pad - sw) * 2, c.height - (pad - sw) * 2) : t.stroke.color;
      rows.forEach((r, i) => {
        const y = pad + lh * (i + 0.5), x0 = rowX(r);
        // önce satırın bütün konturları, sonra dolgular (bir parçanın konturu yanındakinin üstüne binmesin)
        if (sw) {
          g.lineJoin = 'round'; g.miterLimit = 2;
          g.strokeStyle = strokeFill; g.lineWidth = sw * 2;
          let cx = x0;
          for (const s of r.segs) { g.font = s.font; g.strokeText(s.text, cx, y); cx += s.w; }
        }
        let cx = x0;
        for (const s of r.segs) {
          g.font = s.font; g.fillStyle = segFill(s, t, grad);
          g.fillText(s.text, cx, y);
          if (s.st.underline) g.fillRect(cx, y + t.size * 0.42, s.w, Math.max(1, t.size * 0.06));
          cx += s.w;
        }
      });
      drawGlyphs(x, G, sh);
    }
    L.canvas = c;
  }
  // Metin katmanını (G) gölgesiyle birlikte ana tuvale çiz
  function drawGlyphs(x, G, sh) {
    if (sh) {
      x.save();
      x.shadowColor = U.rgba(sh.color || '#000000', sh.opacity == null ? 0.6 : sh.opacity);
      x.shadowBlur = sh.blur || 0; x.shadowOffsetX = sh.x || 0; x.shadowOffsetY = sh.y || 0;
      x.drawImage(G, 0, 0);
      x.restore();
    } else x.drawImage(G, 0, 0);
  }

  /* Eğri metin: harfler yay üzerine tek tek döndürülerek dizilir. Satır düzeni aşağıda: aynı yarıçaplı, alt alta
     çemberler; eğri miktarı 100 = en uzun satır tam çember. Hizalama yay üzerinde açıyla yapılır. */
  function renderCurved(L, t, rows, lh, sh) {
    const a = t.curve / 100, sgn = a > 0 ? 1 : -1, span = Math.abs(a) * 2 * Math.PI;
    const m = measurer;
    setSpacing(m, 0);
    /* Harflerin yeri düz metindeki gibi harf çifti aralığı (kerning) dahil ölçülür: harfin sonu, başından o harfe kadar
       olan yazının genişliğidir. Harfler tek tek ölçülünce "Te" gibi sıkışık çiftler açılıyor, kelime uzuyor ve
       eğri verilince ilk harf yana kayıyordu. c: harfin satır başından ortasına uzaklığı. */
    const lines = rows.map(r => {
      const gl = [];
      let base = 0, k = 0;
      for (const s of r.segs) {
        m.font = s.font;
        let acc = '', end = 0;
        for (const ch of s.chars) {
          acc += ch;
          const adv = m.measureText(ch).width;
          end = m.measureText(acc).width;
          gl.push({ ch, seg: s, w: adv + t.spacing, c: base + end - adv / 2 + t.spacing * (k + 0.5) });
          k++;
        }
        base += end;
      }
      return { gl, total: base + t.spacing * k };
    });
    /* Bütün satırlar aynı yarıçaplı çemberlerde, çemberler satır aralığı kadar alt alta: her satır aynı miktarda
       kıvrılır ve hizalama düz metindeki gibi kalır. (Eskiden ortak merkezli çemberler kullanılıyordu; küçük çembere
       düşen satır daha çok kıvrılıyor, sağa / sola dayalı kısa satır ortaya doğru kayıyordu.) Yarıçap, en uzun satır
       eğri miktarı kadar dönecek şekilde seçilir. */
    const R0 = Math.max(...lines.map(q => Math.max(q.total / span + t.size * 0.5, t.size * 0.8)));
    lines.forEach(q => { q.R = R0; q.half = q.total / 2 / q.R; });
    // Hizalama yay üzerinde açıyla yapılır: sola dayalı satırlar en çok dönen satırın başladığı açıdan başlar,
    // sağa dayalılar onun bittiği açıda biter (yol üzerindeki metin gibi)
    const halfMax = Math.max(0, ...lines.map(q => q.half));
    lines.forEach((q, li) => {
      const off = t.align === 'left' || t.align === 'justify' ? q.half - halfMax : t.align === 'right' ? halfMax - q.half : 0;
      Object.assign(q, { a0: off - q.half, a1: off + q.half, cx: 0, apex: li * lh, empty: !q.gl.length });
    });
    // çember merkezinin yeri: tepe noktası apex'te; yay aşağı (kemer) ya da yukarı (gülümseme) kıvrılır
    const center = q => ({ x: q.cx, y: q.apex + sgn * q.R });
    const glyphs = [];
    for (const q of lines) {
      const o = center(q);
      for (const g of q.gl) {
        const th = q.a0 + g.c / q.R;
        g.th = th; g.t0 = q.a0 + (g.c - g.w / 2) / q.R; g.t1 = q.a0 + (g.c + g.w / 2) / q.R; g.px = o.x + q.R * Math.sin(th); g.py = o.y - sgn * q.R * Math.cos(th);
        glyphs.push(g);
      }
    }
    const sw = t.stroke.on ? t.stroke.w : 0;
    const [bpx, bpy] = bgPads(t);
    /* Sınırlar: her harfin döndürülmüş kutusunun köşeleri, düz metindeki payla (kontur, gölge). Eskiden her harfin
       çevresine yazı boyu kadar pay bırakıldığı için az bir eğri verilince bile seçim kutusu birden büyüyordu. */
    const P = Math.ceil(sw + t.size * 0.25 + shadowExtent(sh));
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const add = (px, py, m) => { x0 = Math.min(x0, px - m); x1 = Math.max(x1, px + m); y0 = Math.min(y0, py - m); y1 = Math.max(y1, py + m); };
    const corners = (g, hy, m) => {
      const co = Math.cos(sgn * g.th), si = Math.sin(sgn * g.th), hx = Math.max(g.w, 1) / 2;
      for (const [u, v] of [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]]) add(g.px + u * co - v * si, g.py + u * si + v * co, m);
    };
    for (const g of glyphs) corners(g, t.size * 0.5, 0);
    const gb = { x0, y0, x1, y1 }; // degradenin yayılacağı alan: harflerin kapladığı kutu
    for (const g of glyphs) corners(g, lh / 2, P);
    if (t.bg.on) for (const [q, r, a, b, m] of curvedBgArcs(t, lines, bpx, bpy)) {
      const o = center(q), n = Math.max(2, Math.ceil(Math.abs(b - a) / 0.05));
      for (let k = 0; k <= n; k++) { const th = a + (b - a) * k / n; add(o.x + r * Math.sin(th), o.y - sgn * r * Math.cos(th), m + 2); }
    }
    if (!isFinite(x0)) { x0 = y0 = 0; x1 = y1 = 1; }
    x0 = Math.floor(x0); y0 = Math.floor(y0);
    const c = U.canvas(Math.ceil(x1 - x0), Math.ceil(y1 - y0)), x = c.getContext('2d');
    const ox = -x0, oy = -y0; // doküman koordinatından tuvale kaydırma
    L._pad = P;
    const around = m => !isFinite(gb.x0) ? undefined : [gb.x0 + ox - m, gb.y0 + oy - m, gb.x1 - gb.x0 + m * 2, gb.y1 - gb.y0 + m * 2];
    if (t.bg.on) bgLayer(x, t, b => curvedBackground(b, t, lines, center, ox, oy, bpx, bpy), around(Math.max(bpx, bpy)));
    const G = U.canvas(c.width, c.height), g = G.getContext('2d');
    g.textAlign = 'center'; g.textBaseline = 'middle';
    // Harfler tek tek döndürülerek çizilir; degrade her harfin kendi koordinatına kaymasın diye
    // degradeli harfler ayrı bir katmana düz renkle çizilip degrade bütün metne birden uygulanır
    const grad = t.grad && t.grad.on;
    const F = grad ? U.canvas(c.width, c.height) : null, f = F && F.getContext('2d');
    if (f) { f.textAlign = 'center'; f.textBaseline = 'middle'; }
    const put = (k, q, fn) => { k.save(); k.translate(q.px + ox, q.py + oy); k.rotate(sgn * q.th); k.font = q.seg.font; fn(k); k.restore(); };
    if (sw) {
      // degradeli kontur: harfler döndürülerek çizildiği için önce tek renkle ayrı katmana, sonra bütünü degradeyle boyanır
      const sg = t.stroke.gradOn && t.stroke.grad;
      const S = sg ? U.canvas(c.width, c.height) : G, s = S.getContext('2d');
      if (sg) { s.textAlign = 'center'; s.textBaseline = 'middle'; }
      for (const q of glyphs) put(s, q, k => { k.lineJoin = 'round'; k.strokeStyle = t.stroke.color; k.lineWidth = sw * 2; k.strokeText(q.ch, 0, 0); });
      if (sg) { recolor(s, t.stroke.grad, around(sw)); g.drawImage(S, 0, 0); }
    }
    const own = [];
    for (const q of glyphs) {
      const col = q.seg.st.color;
      if (grad && !col) put(f, q, k => { k.fillStyle = '#000'; k.fillText(q.ch, 0, 0); });
      else own.push(q);
    }
    if (grad) curvedUnderline(f, t, lines, center, ox, oy, q => !q.seg.st.color && '#000');
    if (grad) {
      f.globalCompositeOperation = 'source-in';
      f.fillStyle = isFinite(gb.x0) ? U.gradFill(f, gradOf(t), gb.x0 + ox, gb.y0 + oy, gb.x1 - gb.x0, gb.y1 - gb.y0) : t.color;
      f.fillRect(0, 0, c.width, c.height);
      f.globalCompositeOperation = 'source-over';
      g.drawImage(F, 0, 0);
    }
    for (const q of own) put(g, q, k => { k.fillStyle = q.seg.st.color || t.color; k.fillText(q.ch, 0, 0); });
    curvedUnderline(g, t, lines, center, ox, oy, q => grad && !q.seg.st.color ? null : q.seg.st.color || t.color);
    drawGlyphs(x, G, sh);
    return c;
  }
  /* Eğri metnin alt çizgisi: altı çizili ardışık harfler için harflerin altından geçen tek bir yay. Harf başına
     düz çizgi çizilince güçlü eğride çizgiler uçlardan dışa taşıp birbirini kesiyordu. colorOf(harf) çizginin
     rengini verir; boş dönerse o harfin çizgisi bu katmana çizilmez. */
  function curvedUnderline(k, t, lines, center, ox, oy, colorOf) {
    const sgn = t.curve > 0 ? 1 : -1, th = Math.max(1, t.size * 0.06);
    k.save(); k.lineWidth = th; k.lineCap = 'butt';
    for (const q of lines) {
      const o = center(q), r = Math.max(0.5, q.R - sgn * (t.size * 0.42 + th / 2));
      let run = null;
      const flush = () => {
        if (!run) return;
        k.strokeStyle = run.col; k.beginPath();
        if (sgn > 0) k.arc(o.x + ox, o.y + oy, r, run.a - Math.PI / 2, run.b - Math.PI / 2, false);
        else k.arc(o.x + ox, o.y + oy, r, Math.PI / 2 - run.a, Math.PI / 2 - run.b, true);
        k.stroke(); run = null;
      };
      for (const g of q.gl) {
        const col = g.seg.st.underline ? colorOf(g) : null;
        if (run && col === run.col) { run.b = g.t1; continue; }
        flush();
        if (col) run = { col, a: g.t0, b: g.t1 };
      }
      flush();
    }
    k.restore();
  }

  // Arka plan kutusunun kenar yayları [satır, yarıçap, başlangıç açısı, bitiş açısı, kalınlık payı]: tuvalin sınırlarını
  // hesaplamak için (kutu harflerden geniş olabilir; kırpılmasın)
  function curvedBgArcs(t, lines, bpx, bpy) {
    const sgn = t.curve > 0 ? 1 : -1, rr = Math.max(0, t.bg.radius || 0), gh = t.size, vc = t.size * 0.05;
    const full = lines.filter(q => !q.empty), out = [];
    if (!full.length) return out;
    if (t.bg.mode === 'line') {
      const hw = gh / 2 + bpy;
      for (const q of full) {
        const mg = (bpx + t.size * 0.1) / q.R;
        const rc = q.R - sgn * vc;
        out.push([q, rc + hw, q.a0 - mg, q.a1 + mg, 0], [q, Math.max(0.5, rc - hw), q.a0 - mg, q.a1 + mg, 0]);
      }
      return out;
    }
    const top = full[0], bot = full[full.length - 1];
    const mg = (bpx + t.size * 0.1) / Math.min(top.R, bot.R);
    const a0 = Math.min(...full.map(q => q.a0)) - mg, a1 = Math.max(...full.map(q => q.a1)) + mg;
    out.push([top, top.R - sgn * vc + sgn * (gh / 2 + bpy), a0, a1, 0], [bot, Math.max(0.5, bot.R - sgn * vc - sgn * (gh / 2 + bpy)), a0, a1, 0]);
    return out;
  }

  /* Eğri metnin arka plan kutusu.
     "Each line": her satırın arkasında kendi yayı boyunca bir şerit.
     "All": ilk satırın üst kenarından son satırın alt kenarına kadar tek parça, kavisli bir kutu. */
  function curvedBackground(x, t, lines, center, ox, oy, bpx, bpy) {
    const sgn = t.curve > 0 ? 1 : -1, rr = Math.max(0, t.bg.radius || 0), gh = t.size;
    const vc = t.size * 0.05; // "middle" hizası harflerin biraz üstüne düşer; kutu yazının görsel ortasına gelsin
    const full = lines.filter(q => !q.empty);
    if (!full.length) return;
    // bir satırın yayı: [a0, a1] açı aralığında, yarıçapı r olan yay (kemer: üst yarım çember, gülümseme: alt)
    const arc = (q, r, a0, a1, ccw) => {
      const o = center(q), base = sgn > 0 ? -Math.PI / 2 : Math.PI / 2;
      // kemerde açı saat yönünde artar; gülümsemede ters
      if (sgn > 0) x.arc(o.x + ox, o.y + oy, Math.max(0.5, r), base + a0, base + a1, ccw);
      else x.arc(o.x + ox, o.y + oy, Math.max(0.5, r), base - a0, base - a1, !ccw);
    };
    /* Kavisli kutu: top satırının harf üstünden bot satırının harf altına kadar, [a0, a1] açı aralığında.
       Köşe yuvarlaklığı için şekil önce yuvarlaklık kadar içeriden çizilir, sonra o kalınlıkta yuvarlak birleşimli
       konturla dışa doğru büyütülür; yuvarlaklık kutunun yarı yüksekliğinden büyük olamaz (tam yuvarlak uç). */
    const box = (top, bot, a0, a1) => {
      const half = (Math.abs(bot.apex - top.apex) + gh) / 2 + bpy;
      const ri = Math.min(rr, half), py = bpy - ri;
      const mg = (bpx - ri + t.size * 0.1) / Math.min(top.R, bot.R), mid = (a0 + a1) / 2;
      const b0 = Math.min(mid, a0 - mg), b1 = Math.max(mid, a1 + mg);
      // Kemerde harfin üstü dışa (büyük yarıçap), gülümsemede merkeze bakar
      const rTop = top.R - sgn * vc + sgn * (gh / 2 + py), rBot = bot.R - sgn * vc - sgn * (gh / 2 + py);
      x.beginPath();
      arc(top, rTop, b0, b1, false);
      arc(bot, rBot, b1, b0, true);
      x.closePath();
      x.fill();
      if (ri > 0) { x.lineJoin = 'round'; x.lineWidth = ri * 2; x.stroke(); }
    };
    if (t.bg.mode === 'line') { for (const q of full) box(q, q, q.a0, q.a1); return; }
    // Tek kutu: bütün satırların kapladığı açı aralığında
    box(full[0], full[full.length - 1], Math.min(...full.map(q => q.a0)), Math.max(...full.map(q => q.a1)));
  }

  App.layerRenderers.text = render;
  // Yeniden çizerken hizalamaya göre kenarı sabit tut: sola dayalı metin sağa doğru, sağa dayalı metin sola doğru
  // genişler (ör. harf aralığı, yazı tipi ya da yazılan metin değişince); ortalı metin iki yana büyür.
  function rerender(L) {
    const t = L.text, curved = t.curve && Math.abs(t.curve) > 0.5;
    const sx = Math.abs(L.sx) || 1, before = L.canvas.width * sx / 2 - (L._pad || 0) * sx;
    render(L);
    if (curved || t.align === 'center' || L.canvas.width <= 1) return;
    const after = L.canvas.width * sx / 2 - (L._pad || 0) * sx;
    const d = (after - before) * (t.align === 'right' ? -1 : 1) * (L.flipX ? -1 : 1), a = L.rot * Math.PI / 180;
    L.x += d * Math.cos(a); L.y += d * Math.sin(a);
  }
  App.layerScalers = App.layerScalers || {};
  // Tekdüze ölçek yazı boyutuna işlenir; Shift ile yapılan orantısız germe katman ölçeğinde kalır
  const scaleProps = (L, k) => {
    const t = L.text;
    t.size = Math.max(4, t.size * k); t.spacing *= k;
    t.stroke.w *= k; t.bg.pad *= k; t.bg.radius *= k;
    if (t.bg.padX != null) t.bg.padX *= k;
    if (t.bg.padY != null) t.bg.padY *= k;
    if (L.shadow) { L.shadow.blur *= k; L.shadow.x *= k; L.shadow.y *= k; }
  };
  App.layerScalers.text = L => {
    const k = Math.sqrt(Math.abs(L.sx * L.sy));
    if (Math.abs(k - 1) < 1e-3) return;
    scaleProps(L, k);
    L.sx /= k; L.sy /= k;
    if (Math.abs(Math.abs(L.sx) - 1) < 1e-3 && Math.abs(Math.abs(L.sy) - 1) < 1e-3) { L.sx = Math.sign(L.sx); L.sy = Math.sign(L.sy); }
    render(L);
  };

  /* ------------------------------------------------ tuval üstü öğeler (yazma alanı, boyut çubuğu) */
  let overlay = null;
  const stageOverlay = () => {
    if (!overlay) {
      overlay = h('div', { class: 'stage-ui' });
      document.getElementById('stage').appendChild(overlay);
    }
    return overlay;
  };

  /* ------------------------------------------------ yazma alanı yardımcıları */
  // Alanın metni: metin düğümleri, araya giren <br> satır sonu sayılır (sondaki işaret <br> sayılmaz)
  const domText = el => {
    let s = '';
    const walk = n => {
      for (const c of n.childNodes) {
        if (c.nodeType === 3) s += c.nodeValue;
        else if (c.nodeName === 'BR') { if (!(c.dataset && c.dataset.end)) s += '\n'; }
        else { if ((c.nodeName === 'DIV' || c.nodeName === 'P') && s && !s.endsWith('\n')) s += '\n'; walk(c); }
      }
    };
    walk(el);
    return s.replace(/\r\n?/g, '\n');
  };
  // Seçimin metin içindeki konumu (alan içinde değilse null)
  const selOf = el => {
    const sel = getSelection();
    if (!sel.rangeCount || !el.contains(sel.anchorNode)) return null;
    const r = sel.getRangeAt(0), pre = document.createRange();
    pre.selectNodeContents(el); pre.setEnd(r.startContainer, r.startOffset);
    const a = pre.toString().length;
    return { s: a, e: a + r.toString().length };
  };
  const nodeAt = (el, pos) => {
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n, last = null;
    while ((n = w.nextNode())) { if (pos <= n.nodeValue.length) return [n, pos]; pos -= n.nodeValue.length; last = n; }
    return last ? [last, last.nodeValue.length] : [el, 0];
  };
  const setSel = (el, a, b) => {
    const sel = getSelection(), r = document.createRange();
    const [n1, o1] = nodeAt(el, a), [n2, o2] = nodeAt(el, b);
    try { r.setStart(n1, o1); r.setEnd(n2, o2); sel.removeAllRanges(); sel.addRange(r); } catch (e) { /* */ }
  };
  // Eski ve yeni metin arasındaki tek değişiklik: a konumunda del karakter silindi, ins karakter eklendi.
  // cur: değişiklikten sonraki imleç. Yanındaki harfle aynı bir harf eklenince ("es" arasına "s") değişiklik
  // imlecin olduğu yerde sayılır; yoksa kelimenin sonuna eklenmiş gibi görünür ve imleç oraya atlar.
  const diffText = (o, n, cur) => {
    let a = 0;
    const m = Math.min(o.length, n.length);
    const ma = cur == null ? m : Math.max(0, Math.min(m, cur - Math.max(0, n.length - o.length)));
    while (a < ma && o[a] === n[a]) a++;
    let k = 0;
    const mk = cur == null ? m - a : Math.min(m - a, n.length - Math.max(cur, a));
    while (k < mk && o[o.length - 1 - k] === n[n.length - 1 - k]) k++;
    return { a, del: o.length - a - k, ins: n.length - a - k };
  };
  // Alanı stil parçalarıyla yeniden kurar. E.pend: panelde ayar yapılırken seçili kalan bölüm (işaretlenir).
  const fillEditor = E => {
    const t = E.L.text, v = t.value, el = E.ta, mark = E.pend;
    el.textContent = '';
    const cuts = new Set([0, v.length]);
    for (const r of t.runs || []) { cuts.add(r.s); cuts.add(r.e); }
    if (mark) { cuts.add(mark.s); cuts.add(mark.e); }
    const pts = [...cuts].filter(x => x >= 0 && x <= v.length).sort((p, q) => p - q);
    for (let k = 0; k < pts.length - 1; k++) {
      const s = pts[k], e = pts[k + 1];
      if (e <= s) continue;
      const st = styleAt(t, s), sp = document.createElement('span');
      sp.textContent = v.slice(s, e);
      sp.style.fontFamily = `"${st.font}", "Segoe UI", sans-serif`;
      sp.style.fontWeight = st.bold ? '700' : '400';
      sp.style.fontStyle = st.italic ? 'italic' : 'normal';
      if (mark && s >= mark.s && e <= mark.e) sp.className = 'sel-pend';
      el.appendChild(sp);
    }
    // son satır boşsa da görünsün diye işaret (metne sayılmaz)
    const br = document.createElement('br'); br.dataset.end = '1';
    el.appendChild(br);
  };
  // Alanın harfleri tuvalde çizilenlerle aynı genişlikte olsun: tarayıcı bir yazı tipini tuvalden farklı ölçerse
  // (yedek yazı tipi, ekran ölçeği) her parçanın harf aralığı farkı kapatacak kadar düzeltilir, imleç kaymaz.
  let fitBox = null;
  const fitEditor = (el, t, px, sp) => {
    if (!fitBox) {
      fitBox = document.createElement('span');
      fitBox.style.cssText = 'position:fixed;left:-99999px;top:0;visibility:hidden;white-space:pre;letter-spacing:0;pointer-events:none';
      document.body.appendChild(fitBox);
    }
    const loc = t.lang || App.i18n.locale();
    // ölçüm harf aralığı olmadan yapılır (aralık sp olarak ayrıca eklenir; çizim ölçücüye kendi aralığını yazar)
    setSpacing(measurer, 0);
    for (const s of el.children) {
      if (s.nodeName !== 'SPAN') continue;
      const key = `${s.textContent}|${s.style.fontFamily}|${s.style.fontWeight}|${s.style.fontStyle}|${px}|${sp}|${t.upper}`;
      if (s._fit === key) continue;
      s._fit = key;
      const parts = s.textContent.split('\n').map(q => (t.upper ? q.toLocaleUpperCase(loc) : q)).filter(Boolean);
      const n = parts.reduce((a, q) => a + [...q].length, 0);
      if (!n) { s.style.letterSpacing = ''; continue; }
      measurer.font = `${s.style.fontStyle} ${s.style.fontWeight} ${px}px ${s.style.fontFamily}`;
      fitBox.style.font = measurer.font;
      let cw = 0, dw = 0;
      for (const q of parts) {
        cw += measurer.measureText(q).width;
        fitBox.textContent = q; dw += fitBox.getBoundingClientRect().width;
      }
      const d = (cw - dw) / n;
      s.style.letterSpacing = Math.abs(d) < 0.01 ? '' : (sp + d) + 'px';
    }
  };

  /* İmleç ve seçim, tarayıcının yazma alanına göre değil, metni çizen ölçümle hesaplanır ve ayrıca çizilir.
     Böylece tarayıcı yazı tipini farklı ölçse de (ekran ölçeği, yazı tipi sürümü) imleç harflerin tam üstünde durur.
     caretMap: satır başına { s, e, y, xs }; xs[k], satırdaki s + k konumunun (UTF-16) katman tuvalindeki x'i. */
  // Bir yazı tipi yüklendikçe artar: yüklenmeden (yedek yazı tipiyle) ölçülen harita yeniden hesaplansın
  let fontGen = 0;
  if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', () => { fontGen++; });
  const caretMap = L => {
    const t = L.text, pad = L._pad || 0, W = L.canvas.width;
    const key = [fontGen, t.value, JSON.stringify(t.runs || null), t.font, t.size, t.bold, t.italic, t.spacing, t.upper, t.align, t.lineH, W, pad, t.lang || App.i18n.locale()].join('|');
    if (L._cmap && L._cmap.key === key) return L._cmap;
    const m = measurer, lh = t.size * t.lineH;
    setSpacing(m, t.spacing);
    const rows = textRows(t).map((r, i) => {
      const line = t.value.slice(r.start, t.value.indexOf('\n', r.start) < 0 ? t.value.length : t.value.indexOf('\n', r.start));
      const cps = [...line], xs = [0];
      let base = 0, ci = 0;
      for (const sg of r.segs) {
        m.font = sg.font;
        let acc = '', end = 0;
        for (const ch of sg.chars) {
          acc += ch; end = m.measureText(acc).width;
          const u = (cps[ci++] || ch).length;
          for (let k = 1; k < u; k++) xs.push(xs[xs.length - 1]); // vekil çiftin ortası: harfin başı
          xs.push(base + end);
        }
        base += end;
      }
      let w = base;
      if (!r.segs.length) { m.font = fontStr(t); w = m.measureText(' ').width; }
      const x0 = t.align === 'right' ? W - pad - w : t.align === 'center' ? (W - w) / 2 : pad;
      return { s: r.start, e: r.start + line.length, y: pad + lh * (i + 0.5), xs: xs.map(x => x + x0) };
    });
    return (L._cmap = { key, rows, lh });
  };
  const rowOf = (map, i) => map.rows.find(r => i >= r.s && i <= r.e) || map.rows[map.rows.length - 1];
  // Ekrandaki bir noktaya en yakın harf sınırı
  const hitIndex = (L, cx, cy) => {
    const st = App.R.stage.getBoundingClientRect();
    const p = App.screenToDoc(cx - st.left, cy - st.top), q = App.docToLayer(L, p.x, p.y);
    const map = caretMap(L), n = map.rows.length;
    const r = map.rows[Math.max(0, Math.min(n - 1, Math.floor((q.y - (L._pad || 0)) / map.lh)))];
    let best = 0;
    r.xs.forEach((x, k) => { if (Math.abs(x - q.x) < Math.abs(r.xs[best] - q.x)) best = k; });
    return r.s + best;
  };
  // Alan içindeki bir DOM konumunun metin konumu
  const idxOf = (el, node, off) => {
    if (!node || !el.contains(node)) return null;
    const pre = document.createRange();
    pre.selectNodeContents(el); pre.setEnd(node, off);
    return pre.toString().length;
  };
  // Yönlü seçim: a sabit uç, b imlecin olduğu uç
  const setSelDir = (el, a, b) => {
    const [n1, o1] = nodeAt(el, a), [n2, o2] = nodeAt(el, b);
    try { getSelection().setBaseAndExtent(n1, o1, n2, o2); } catch (e) { /* */ }
  };
  // Kelimenin sınırları (harf / rakam dizisi; boşlukta boşluk dizisi)
  const wordAt = (v, i) => {
    const isW = c => /[\p{L}\p{N}_'’]/u.test(c), ref = v[i] && v[i] !== '\n' ? v[i] : v[i - 1] || '';
    if (!ref || ref === '\n') return [i, i];
    const same = c => c && c !== '\n' && (isW(ref) ? isW(c) : !isW(c) && /\s/.test(c) === /\s/.test(ref));
    let a = v[i] && v[i] !== '\n' ? i : i - 1, b = a + 1;
    while (a > 0 && same(v[a - 1])) a--;
    while (b < v.length && same(v[b])) b++;
    return [a, b];
  };
  // İmlecin altında (çevresindeki dar bir şeritte) ekranda görünen parlaklığın ortancası: açıksa siyah, koyuysa beyaz
  const caretInk = el => {
    try {
      const cv = App.R.canvas, cr = cv.getBoundingClientRect(), r = el.getBoundingClientRect(), k = cv.width / cr.width;
      const x0 = Math.max(0, Math.floor((r.left - cr.left - 4) * k)), y0 = Math.max(0, Math.floor((r.top - cr.top) * k));
      const w = Math.min(cv.width - x0, Math.ceil((r.width + 8) * k)), hh = Math.min(cv.height - y0, Math.ceil(r.height * k));
      if (w < 1 || hh < 1) return null;
      const px = cv.getContext('2d').getImageData(x0, y0, w, hh).data, lum = [];
      for (let i = 0; i < px.length; i += 4) lum.push(0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]);
      lum.sort((a, b) => a - b);
      return lum[lum.length >> 1] > 150 ? '#000000' : '#ffffff';
    } catch (e) { return null; }
  };
  // İmleci ve seçimi çizer; yalnızca bir şey değişince yeniden kurulur (imleç yanıp sönmeye baştan başlar)
  const drawDeco = E => {
    const d = E.deco, ta = E.ta, L = E.L, t = L.text;
    if (!d) return;
    const plain = ta.classList.contains('plain'), focused = document.activeElement === ta;
    const s = plain ? null : focused ? selOf(ta) : E.pend;
    const map = s ? caretMap(L) : null, z = App.view.zoom;
    const key = s ? [s.s, s.e, focused, map.key, z, d.style.left, d.style.width, window.devicePixelRatio].join('|') : '';
    if (key === E.decoKey) return;
    E.decoKey = key;
    d.textContent = '';
    if (!s) return;
    const box = (x, y, w, hgt, cls, bg) => {
      const b = document.createElement('div');
      b.className = cls;
      b.style.cssText = `left:${x * z}px;top:${y * z}px;width:${w * z}px;height:${hgt * z}px`;
      if (bg) b.style.background = bg;
      d.appendChild(b);
    };
    if (s.s === s.e) {
      if (!focused) return;
      const r = rowOf(map, s.s), hgt = t.size * 1.2;
      // Tarayıcının imleci gibi: ekranda her zaman ince (1 piksel) ve ekran piksellerine oturur; yarım piksele düşüp
      // bulanık / kalın görünmez. Rengi imlecin durduğu yerin ekranda görünen parlaklığına göre siyah ya da beyazdır
      // (beyaz zeminde beyaz metinde de görünür).
      const dpr = window.devicePixelRatio || 1, tw = Math.max(1, Math.round(dpr)) / dpr, k = (L.flipX ? -1 : 1) * (L.sx || 1);
      let cx = r.xs[Math.min(r.xs.length - 1, s.s - r.s)] * z;
      if (!(L.rot % 360)) {
        const Wd = parseFloat(d.style.width) || 0, o = d.parentElement.getBoundingClientRect().left + (parseFloat(d.style.left) || 0) + Wd / 2;
        const scr = o + (cx - Wd / 2) * k;
        cx = (Math.round((scr - tw / 2) * dpr) / dpr + tw / 2 - o) / k + Wd / 2;
      }
      const c = document.createElement('div'), lw = tw / Math.abs(k);
      c.className = 'txt-caret';
      c.style.cssText = `left:${cx - lw / 2}px;top:${(r.y - hgt / 2) * z}px;width:${lw}px;height:${hgt * z}px`;
      d.appendChild(c);
      // renk yalnızca imleç başka bir yere geçince ölçülür (taşırken her karede ekran okunmaz, sürükleme takılmaz)
      const ik = [s.s, map.key, z].join('|');
      if (E.inkKey !== ik || !E.ink) { E.ink = caretInk(c) || (t.grad && t.grad.on ? '#ffffff' : t.color); E.inkKey = ik; }
      c.style.background = E.ink;
      return;
    }
    for (const r of map.rows) {
      const a = Math.max(s.s, r.s), b = Math.min(s.e, r.e);
      if (a > b) continue;
      const x1 = r.xs[a - r.s], x2 = r.xs[b - r.s] + (s.e > r.e ? t.size * 0.25 : 0);
      if (x2 - x1 > 0.01) box(x1, r.y - map.lh / 2, x2 - x1, map.lh, 'txt-selbox');
    }
  };
  // Son basılan öğe: yazma alanından panele geçilince yazma sürsün diye
  let lastDown = null;
  // Seçimi koruyan tıklama: araç panelindeki bir kontrol ya da açık bir açılır pencere (panelin boş yeri değil)
  const keepsSel = el => !!(el && el.closest && (el.closest('.popup') ||
    (el.closest('#toolpanel') && el.closest('button, input, select, textarea, label, [contenteditable]'))));
  document.addEventListener('pointerdown', e => {
    lastDown = e.target;
    // yazma kapalıyken paneldeki metin kutusunda yapılan seçim de boş bir yere tıklanınca unutulur
    const el = e.target;
    if ((!T.lastSel && !T.edit) || keepsSel(el)) return;
    // kaydırma çubuğuna tıklamak (paneli kaydırmak) seçimi bozmaz
    if (el && el.clientWidth && (e.offsetX > el.clientWidth || e.offsetY > el.clientHeight)) return;
    const E = T.edit;
    if (E && E.ta.contains(el)) return;
    // boş bir yere tıklandı: yazma biter, seçili bölüm unutulur (ayarlar yine metnin tamamına uygulanır)
    T.lastSel = null;
    if (E) { E.pend = null; T.finishEdit(); }
    requestAnimationFrame(() => T.syncStyle());
  }, true);
  let selRaf = 0;
  document.addEventListener('selectionchange', () => {
    const E = T.edit;
    if (!E || document.activeElement !== E.ta) return;
    const s = selOf(E.ta);
    if (s) T.lastSel = { L: E.L, s: s.s, e: s.e, v: E.L.text.value };
    drawDeco(E);
    if (!selRaf) selRaf = requestAnimationFrame(() => { selRaf = 0; T.syncStyle(); });
  });

  App.FONT_GROUPS = [['Fonts on This Computer', SYSTEM_FONTS], ...WEB_GROUPS];
  const T = {
    id: 'text', name: 'Text', icon: 'text', key: 'T', cursor: 'default',
    edit: null, bar: null, pendingEdit: null,

    activate() { loadWebFonts(); presetFonts(); T.toArrange = false; },
    deactivate() { T.finishEdit(); App.xform.drag = null; T.toArrange = false; },
    cur() { const L = App.activeLayer(); return L && L.type === 'text' ? L : null; },

    addDefault(at, noEdit) {
      const d = App.doc;
      if (!d) return;
      T.finishEdit();
      const t = DEF();
      t.size = Math.max(16, Math.round(Math.min(d.w, d.h) * 0.09));
      t.stroke.w = Math.max(2, Math.round(t.size * 0.06));
      t.bg.pad = t.bg.padX = Math.round(t.size * 0.25);
      t.bg.padY = Math.round(t.size * 0.15);
      const L = App.newLayer(U.canvas(1, 1), { type: 'text', name: 'Text', text: t });
      render(L);
      L.x = at ? at.x : d.w / 2; L.y = at ? at.y : d.h / 2;
      App.addLayer(L);
      App.commit('Add Text');
      // ilk yazma sırasında hiçbir şey yazmadan Esc'ye basılırsa ekleme geri alınır (Ctrl+Z gibi)
      T.added = { L, at: App.history.index - 1 };
      UI.rebuildPanel();
      if (!noEdit) setTimeout(() => T.startEdit(L, true), 20);
      return L;
    },
    focusEditor(selectAll) { const L = T.cur(); if (L) T.startEdit(L, selectAll); },
    // Şablonu tuvalin ortasına ekler; katmanları birlikte seçili gelir (hemen birlikte taşınabilir)
    async addTemplate(tp) {
      const d = App.doc;
      if (!d) return;
      T.finishEdit();
      await templateFonts();
      let k = Math.max(0.16, Math.min(d.w, d.h) * 0.09 / 100) * 1.2;
      let ls = templateLayers(tp, k);
      // tuvalin genişliğine sığsın
      const wide = Math.max(...ls.map(L => L.canvas.width - 2 * (L._pad || 0)));
      if (wide > d.w * 0.9) { k *= d.w * 0.9 / wide; ls = templateLayers(tp, k); }
      for (const L of ls) { L.x = d.w / 2 + L._tdx; L.y = d.h / 2 + L._tdy; delete L._tdx; delete L._tdy; App.addLayer(L); }
      App.commit('Add Template');
      UI.selectLayers(ls.map(L => L.id));
      UI.rebuildPanel();
    },

    /* ---------------- tuval üzerinde yazma
       Yazma alanı, metnin üstüne aynı yazı tipleriyle yerleştirilen saydam bir düzenlenebilir alandır (metin tuvalde
       çizilir; alan yalnızca imleci ve seçimi gösterir). Her stil aralığı ayrı bir parça olarak kurulur, böylece
       karışık yazı tiplerinde de imleç harflerin tam üstünde durur. Seçili bölüme kalın / italik / yazı tipi / renk
       verilebilir; seçim yokken ayarlar metnin tamamına uygulanır. */
    // moved: metin kenarından taşınıp bırakıldı; yazmaya geçmeden basılan Delete metnin kendisini siler
    startEdit(L, selectAll, moved) {
      if (!L || L.type !== 'text') return;
      if (T.edit && T.edit.L === L) { T.edit.ta.focus(); if (selectAll) setSel(T.edit.ta, 0, L.text.value.length); return; }
      T.finishEdit();
      const t = L.text;
      const ta = h('div', { class: 'txt-inline', contenteditable: 'plaintext-only', spellcheck: 'false', lang: t.lang || App.i18n.lang });
      // deco: imleç ve seçimin çizildiği katman (alanla aynı yerde ve dönüşümde, tıklamaları geçirir)
      const deco = h('div', { class: 'txt-deco' });
      const E = T.edit = { L, ta, deco, moved: !!moved, start: t.value, startRuns: JSON.stringify(t.runs || null), undo: [], redo: [], pend: null };
      fillEditor(E);
      // Yazarken kutunun kenarından tutup sürükleyerek metin taşınabilir (iç kısma tıklamak imleci yerleştirir)
      const nearEdge = e => {
        const m = Math.max(8, Math.min(22, (L._pad || 0) * App.view.zoom * 0.8)), r = ta.getBoundingClientRect();
        const x = e.clientX - r.left, y = e.clientY - r.top;
        return !ta.classList.contains('plain') && (x < m || y < m || x > r.width - m || y > r.height - m);
      };
      ta.addEventListener('pointermove', e => { if (!e.buttons) ta.style.cursor = nearEdge(e) ? 'move' : 'text'; });
      ta.addEventListener('pointerdown', e => {
        if (e.button === 0 && nearEdge(e) && !L.locked) { e.preventDefault(); T.resumeEdit = L; return; } // olay tuvale geçer: taşıma başlar
        e.stopPropagation();
      });
      // Tıklama ve sürükleme imleci çizimdeki harf sınırlarına göre yerleştirir (tarayıcının kendi yerleşimine göre değil).
      // Çift tık kelimeyi, üç tık satırı seçer; Shift ile tıklama seçimi uzatır.
      ta.addEventListener('mousedown', e => {
        if (e.button !== 0 || ta.classList.contains('plain') || nearEdge(e)) return;
        e.preventDefault();
        E.moved = false;
        const cur = document.activeElement === ta ? getSelection() : null;
        if (!cur) ta.focus({ preventScroll: true });
        const v = t.value, i = hitIndex(L, e.clientX, e.clientY);
        let span = null, anchor = i;
        if (e.detail === 2) span = wordAt(v, i);
        else if (e.detail >= 3) { const r = rowOf(caretMap(L), i); span = [r.s, r.e]; }
        else if (e.shiftKey && cur) { const a = idxOf(ta, cur.anchorNode, cur.anchorOffset); if (a != null) anchor = a; }
        const pick = j => {
          if (!span) { setSelDir(ta, anchor, j); return; }
          const w = e.detail === 2 ? wordAt(t.value, j) : (r => [r.s, r.e])(rowOf(caretMap(L), j));
          if (j < span[0]) setSelDir(ta, span[1], Math.min(w[0], span[0])); else setSelDir(ta, span[0], Math.max(w[1], span[1]));
        };
        pick(i);
        drawDeco(E);
        const move = ev => { if (T.edit !== E) return up(); pick(hitIndex(L, ev.clientX, ev.clientY)); drawDeco(E); };
        const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', up);
      });
      ta.addEventListener('beforeinput', e => {
        // satır sonu her zaman düz "\n" olarak eklenir (tarayıcı kendi blok öğelerini eklemesin)
        if (e.inputType === 'insertParagraph' || e.inputType === 'insertLineBreak') { e.preventDefault(); T.typeText(E, '\n'); }
        else if (/^format/.test(e.inputType)) e.preventDefault();
        else if (e.inputType === 'historyUndo' || e.inputType === 'historyRedo') e.preventDefault();
      });
      ta.addEventListener('input', e => { if (!e.isComposing) T.syncEditor(E); });
      ta.addEventListener('compositionend', () => T.syncEditor(E));
      ta.addEventListener('focus', () => {
        if (!E.pend) return;
        const p = E.pend; E.pend = null;
        fillEditor(E); setSel(ta, p.s, p.e);
        drawDeco(E);
      });
      ta.addEventListener('keydown', e => {
        e.stopPropagation();
        const ctrl = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
        if (E.moved && e.key === 'Delete' && !ctrl && !e.altKey && !e.shiftKey && !L.locked) {
          e.preventDefault();
          T.finishEdit();
          App.actions.deleteLayer();
          return;
        }
        if (!/^(Shift|Control|Alt|Meta)$/.test(e.key)) E.moved = false; // yazmaya geçti
        const untouched = t.value === E.start && JSON.stringify(t.runs || null) === E.startRuns;
        if (e.key === 'Escape' && T.added && T.added.L === L && untouched) {
          e.preventDefault();
          const at = T.added.at;
          T.added = null; T.edit = null; ta.remove(); deco.remove();
          App.history.go(at);
          return;
        }
        if (e.key === 'Escape' || (e.key === 'Enter' && ctrl)) { e.preventDefault(); T.finishEdit(); return; }
        // Ctrl+B / I / U: seçili bölüme (seçim yoksa tümüne) kalın / italik / altı çizili
        if (ctrl && !e.shiftKey && !e.altKey && (k === 'b' || k === 'i' || k === 'u')) { e.preventDefault(); T.toggleStyle(L, k); return; }
        if (ctrl && (k === 'z' || k === 'y')) {
          e.preventDefault();
          const redo = k === 'y' || e.shiftKey;
          if (T.editorHist(E, redo)) return;
          // Henüz bir şey yazılmadıysa genel geçmişte çalışsın (ör. yeni eklenen metni kaldırır)
          if (untouched) { T.finishEdit(); if (redo) App.history.redo(); else App.history.undo(); }
        }
      });
      ta.addEventListener('blur', () => setTimeout(() => {
        if (T.edit !== E || document.activeElement === ta) return;
        // Araç panelindeki bir ayara (yazı tipi, renk...) geçildiyse yazma sürer; seçili bölüm işaretli kalır
        if (keepsSel(lastDown) || UI.popupOpen()) {
          const s = T.lastSel && T.lastSel.L === L && T.lastSel.e > T.lastSel.s ? T.lastSel : null;
          if (s) { E.pend = { s: s.s, e: s.e }; fillEditor(E); }
          drawDeco(E);
          return;
        }
        // başka bir yere (panelin boş bir yerine de) tıklanınca yazma biter ve seçim unutulur
        T.lastSel = null;
        T.finishEdit();
      }, 0));
      stageOverlay().appendChild(deco);
      stageOverlay().appendChild(ta);
      T.place();
      ta.focus();
      if (selectAll) setSel(ta, 0, t.value.length); else setSel(ta, t.value.length, t.value.length);
      drawDeco(E);
      // Kayıttan açılan metnin görüntüsü, yazı tipi tam yüklenmeden ya da eski bir ölçümle çizilmiş olabilir; imleç
      // ancak görüntü güncel ölçümle çizilmişse harflerin üstüne oturur. Yazı tipleri hazır olunca bir kez yeniden çizilir.
      const fonts = new Set([styleFont(t, 32), ...(t.runs || []).map(r => styleFont(styleAt(t, r.s), 32))]);
      loadWebFonts().then(() => Promise.all([...fonts].map(f => document.fonts.load(f).catch(() => {})))).then(() => {
        if (T.edit !== E) return;
        L._cmap = null; E.decoKey = null;
        rerender(L); App.requestRender(); T.place();
      });
      App.requestRender();
    },
    // Tarayıcının yaptığı düzenlemeyi (yazma, silme, yapıştırma) metne işler; stil aralıkları kaydırılır
    syncEditor(E) {
      const t = E.L.text, nv = domText(E.ta);
      if (nv === t.value) return;
      const cs = selOf(E.ta), ch = diffText(t.value, nv, cs && cs.s === cs.e ? cs.e : null);
      T.editorSnap(E, ch.ins === 1 && !ch.del);
      shiftRuns(t, ch.a, ch.del, ch.ins);
      t.value = nv;
      fillEditor(E);
      setSel(E.ta, ch.a + ch.ins, ch.a + ch.ins);
      T.editorChanged(E);
    },
    typeText(E, str) {
      const t = E.L.text, s = selOf(E.ta) || { s: t.value.length, e: t.value.length };
      T.editorSnap(E, false);
      shiftRuns(t, s.s, s.e - s.s, str.length);
      t.value = t.value.slice(0, s.s) + str + t.value.slice(s.e);
      fillEditor(E);
      setSel(E.ta, s.s + str.length, s.s + str.length);
      T.editorChanged(E);
    },
    editorChanged(E) {
      rerender(E.L); App.requestRender();
      if (T.panelTa && T.panelTa !== document.activeElement) T.panelTa.value = E.L.text.value;
      T.place();
    },
    // Yazarken kendi geri alma adımları (art arda yazılan harfler tek adımdır)
    editorSnap(E, typing) {
      const now = Date.now();
      if (typing && E.lastType && now - E.lastType < 800) { E.lastType = now; return; }
      E.lastType = typing ? now : 0;
      const t = E.L.text, s = selOf(E.ta);
      E.undo.push({ value: t.value, runs: JSON.stringify(t.runs || null), sel: s });
      if (E.undo.length > 200) E.undo.shift();
      E.redo = [];
    },
    editorHist(E, redo) {
      const from = redo ? E.redo : E.undo, to = redo ? E.undo : E.redo;
      if (!from.length) return false;
      const t = E.L.text, st = from.pop();
      to.push({ value: t.value, runs: JSON.stringify(t.runs || null), sel: selOf(E.ta) });
      t.value = st.value; t.runs = JSON.parse(st.runs);
      E.lastType = 0;
      fillEditor(E);
      const s = st.sel || { s: t.value.length, e: t.value.length };
      setSel(E.ta, Math.min(s.s, t.value.length), Math.min(s.e, t.value.length));
      T.editorChanged(E);
      return true;
    },
    finishEdit() {
      const E = T.edit;
      if (!E) return;
      T.edit = null; T.added = null;
      E.ta.remove(); E.deco.remove();
      const L = E.L, t = L.text;
      if (!App.doc || !App.doc.layers.includes(L)) return;
      if (!t.value.trim()) {
        // boş metin kalmasın
        App.removeLayer(L.id);
        App.commit('Delete Text');
        UI.rebuildPanel();
      } else if (t.value !== E.start || JSON.stringify(t.runs || null) !== E.startRuns) {
        clearTimeout(T._timer);
        App.commit('Edit Text');
      }
      App.requestRender();
    },
    // Yazma alanını metnin tuvaldeki yerine, aynı yazı tipi ve boyutla yerleştir
    place() {
      const E = T.edit;
      if (!E) return;
      const L = E.L, t = L.text, ta = E.ta, z = App.view.zoom;
      if (!App.doc || !App.doc.layers.includes(L)) { T.finishEdit(); return; }
      const c = App.docToScreen(L.x, L.y);
      const curved = t.curve && Math.abs(t.curve) > 0.5;
      ta.classList.toggle('plain', !!curved);
      if (curved) {
        // eğri metin: harflerin üstünde yazılamaz; metnin altında düz bir kutuda yazılır
        const bx = App.xform.screenBox(L);
        Object.assign(ta.style, { left: (c.x - 140) + 'px', top: (bx.y1 + 10) + 'px', width: '280px', height: 'auto', minHeight: '40px', transform: '', font: '', lineHeight: '', letterSpacing: '', padding: '', textAlign: 'center', caretColor: '', textTransform: t.upper ? 'uppercase' : 'none' });
        for (const s of ta.children) { s.style.letterSpacing = ''; s._fit = null; }
        E.deco.hidden = true; drawDeco(E);
        return;
      }
      const sx = Math.abs(L.sx), sy = Math.abs(L.sy);
      const W = L.canvas.width * z, H = L.canvas.height * z, pad = (L._pad || 0) * z;
      Object.assign(ta.style, {
        left: (c.x - W / 2) + 'px', top: (c.y - H / 2) + 'px', width: (W + 2) + 'px', height: H + 'px', minHeight: '',
        transform: `rotate(${L.rot}deg) scale(${(L.flipX ? -1 : 1) * sx}, ${(L.flipY ? -1 : 1) * sy})`,
        font: `${t.italic ? 'italic ' : ''}${t.bold ? 700 : 400} ${t.size * z}px "${t.font}", "Segoe UI", sans-serif`,
        lineHeight: (t.size * t.lineH * z) + 'px', letterSpacing: (t.spacing * z) + 'px',
        padding: `${pad}px ${pad}px`, textAlign: t.align === 'justify' ? 'left' : t.align,
        textTransform: t.upper ? 'uppercase' : 'none',
        caretColor: 'transparent', // imleç ayrıca çizilir (drawDeco)
      });
      Object.assign(E.deco.style, { left: ta.style.left, top: ta.style.top, width: W + 'px', height: ta.style.height, transform: ta.style.transform });
      E.deco.hidden = false;
      fitEditor(ta, t, t.size * z, t.spacing * z);
      drawDeco(E);
      ta.scrollLeft = 0; ta.scrollTop = 0;
    },

    /* ---------------- seçili bölüme stil */
    // Stilin uygulanacağı aralık: yazma alanındaki ya da paneldeki metin kutusundaki seçim (boşsa metnin tamamı)
    rangeFor(L) {
      const t = L.text, E = T.edit && T.edit.L === L ? T.edit : null;
      let s = null;
      if (E && document.activeElement === E.ta) s = selOf(E.ta);
      else if (E && E.pend) s = E.pend;
      else if (T.lastSel && T.lastSel.L === L && T.lastSel.v === t.value) s = T.lastSel;
      // metnin tamamı seçiliyse (ör. yeni eklenen metin) ayar zaten tümüne uygulanır
      return s && s.e > s.s && (s.s > 0 || s.e < t.value.length) ? { s: s.s, e: s.e } : null;
    },
    // key: b / i / u / f / c. Seçim varsa yalnızca o bölüme, yoksa metnin tamamına uygulanır.
    applyStyle(L, key, val, commit = 'now') {
      const t = L.text, prop = RUN_KEYS[key], r = T.rangeFor(L);
      if (r) setRunProp(t, r.s, r.e, key, val === t[prop] ? null : val);
      else {
        t[prop] = val;
        // tümüne uygulanınca bu özellik parçalardan kalkar (metin tek tip olur)
        if (t.runs) t.runs = normRuns(t.runs.map(q => { const o = { ...q }; delete o[key]; return o; }));
      }
      const E = T.edit && T.edit.L === L ? T.edit : null;
      if (E) {
        const keep = document.activeElement === E.ta ? selOf(E.ta) : null;
        fillEditor(E);
        if (keep) setSel(E.ta, keep.s, keep.e);
      }
      rerender(L); App.requestRender(); T.place();
      // yazı tipi henüz yüklenmediyse yüklenince yeniden çiz
      if ((key === 'f' || key === 'b' || key === 'i') && document.fonts && document.fonts.load) {
        const st = r ? styleAt(t, r.s) : t;
        document.fonts.load(styleFont({ ...st, font: st.font || t.font }, 32)).then(() => { rerender(L); App.requestRender(); T.place(); }).catch(() => {});
      }
      clearTimeout(T._timer);
      const done = () => { App.commit('Text Style'); if (E && T.edit === E) { E.start = t.value; E.startRuns = JSON.stringify(t.runs || null); } };
      if (commit === 'now') done(); else if (commit === 'later') T._timer = setTimeout(done, 400);
      T.syncStyle();
    },
    toggleStyle(L, key) {
      const t = L.text, r = T.rangeFor(L);
      const cur = r ? rangeProp(t, r.s, r.e, key) : t[RUN_KEYS[key]];
      T.applyStyle(L, key, !cur);
    },
    // Paneldeki kalın / italik / altı çizili düğmeleri, yazı tipi ve renk seçimin durumunu gösterir
    syncStyle() {
      const L = T.cur(), P = T.styleUI;
      if (!L || !P || P.L !== L) return;
      const t = L.text, r = T.rangeFor(L);
      const get = k => (r ? rangeProp(t, r.s, r.e, k) : t[RUN_KEYS[k]]);
      for (const k of ['b', 'i', 'u']) P[k].classList.toggle('on', !!get(k));
      const f = get('f');
      P.font.textContent = f || App.t('Mixed');
      P.font.style.fontFamily = f ? `"${f}", sans-serif` : '';
      const c = r ? rangeProp(t, r.s, r.e, 'c') : null;
      P.color.set(c === undefined ? t.color : c || t.color);
      // seçili bölümün kendi rengi varsa düz renk, yoksa metnin degradesi görünür
      P.color.setMode(!!t.grad.on && !c);
      P.scope.style.display = r ? '' : 'none';
    },


    /* ---------------- fare */
    onDown(p, e) {
      if (T.edit) T.finishEdit();
      T.lastSel = null; // tuvale tıklanınca önceki seçim unutulur (ayarlar yine tüm metne uygulanır)
      const L = T.cur();
      if (App.xform.grab(L, p)) return;
      // Ctrl / Shift + tıklama: metni seçime ekler ya da çıkarır (birden çok metin birlikte taşınabilir)
      if (e && (e.ctrlKey || e.metaKey || e.shiftKey)) {
        const q = textAt(p) || (L && App.xform.inside(L, p) ? L : null);
        if (q) { UI.toggleLayerSel(q); App.requestRender(); }
        return;
      }
      let target = null;
      if (L && App.xform.inside(L, p)) target = L;
      if (!target) target = textAt(p);
      if (target) {
        // birden çok katman seçiliyse (ör. eklenen şablon) seçim korunur ve hepsi birlikte taşınır
        const sel = UI.selectedLayers();
        if (target !== L && !(sel.length > 1 && sel.includes(target))) App.setActive(target.id);
        else if (target !== L) UI.selectLayerKeep(target.id);
        if (!target.locked) App.tools.arrange.moveSel(target, p);
        return;
      }
      // Metin olmayan bir katmana tıklanırsa o seçilip taşınır, bırakınca Düzenle aracına geçilir. Boş yere tıklamak
      // yalnızca seçimi kaldırır; metin "Yeni Metin Ekle" düğmesiyle ya da bir şablonla eklenir.
      const ly = App.doc.layers;
      const other = [...ly].reverse().find(q => q.visible && !q.locked && q.type !== 'overlay' && q.type !== 'text' && !App.isBackdrop(q) && App.xform.inside(q, p));
      if (other) { App.setActive(other.id); App.xform.startMove(other, p); T.toArrange = true; return; }
      if (L) App.setActive(null);
    },
    onMove(p, e) { App.xform.move(p, e); T.place(); },
    onUp() {
      App.xform.end();
      const N = T.pendingEdit, R = T.resumeEdit;
      T.pendingEdit = null; T.resumeEdit = null;
      if (T.toArrange) { T.toArrange = false; App.setTool('arrange'); return; }
      if (N) T.startEdit(N, true);
      else if (R && App.doc.layers.includes(R)) T.startEdit(R, false, true);
    },
    onDblClick(p) {
      const L = textAt(p) || (T.cur() && App.xform.inside(T.cur(), p) ? T.cur() : null);
      if (L) { if (L !== App.activeLayer()) App.setActive(L.id); T.startEdit(L, true); }
    },
    onHover(p) {
      const L = T.cur();
      let c = App.xform.cursor(L, p);
      if (!c) c = textAt(p) ? 'pointer' : 'default';
      App.R.stage.style.cursor = App.keys.space ? 'grab' : c;
    },
    onStepSize(dir) {
      const L = T.cur();
      if (!L || L.locked) return false;
      App.scaleLayerBy(L, dir > 0 ? 1.05 : 1 / 1.05);
      if (T.sizeSl) T.sizeSl.set(Math.round(L.text.size));
      T.place();
      return true;
    },
    drawOverlay(ctx) {
      const L = T.cur();
      for (const q of UI.selectedLayers()) if (q !== L && q.visible) App.drawLayerOutline(ctx, q, q.locked ? '#ff9f43' : '#4f8cff');
      if (L) App.xform.draw(ctx, L);
    },
    refresh() { T.finishEdit(); UI.rebuildPanel(); },

    /* ---------------- panel */
    panel(body) {
      const L = T.cur();
      T.panelTa = null; T.sizeSl = null;
      body.appendChild(UI.button('Add New Text', () => T.addDefault(), { block: true, primary: true, icon: 'plus' }));
      // şablonlar yalnızca metin ayarları görünmüyorken (seçili metin yokken) gösterilir; önizlemeler yazı tipleri yüklenince çizilir
      if (!L) {
        const tGrid = h('div', { class: 'tpl-grid' }, TEMPLATES.map(tp => {
          const cv = U.canvas(280, 180), b = h('button', { class: 'tpl-btn', title: tp[0].v.replace(/\\n/g, ' '), onclick: () => T.addTemplate(tp) }, cv);
          const draw = () => { try { templateThumb(tp, cv); } catch (e) { /* */ } };
          if (templateFonts().done) draw(); else templateFonts().then(draw);
          return b;
        }));
        body.appendChild(UI.section('Templates', [tGrid]));
        body.appendChild(UI.note('Add text with the button above or pick a template. Double-click a text to edit it.'));
        return;
      }
      const t = L.text;
      const upd = (label = 'Edit Text', fast) => {
        rerender(L); App.requestRender(); T.place();
        clearTimeout(T._timer);
        T._timer = setTimeout(() => App.commit(label || 'Edit Text'), fast ? 0 : 400);
      };
      const ensureFont = () => {
        if (document.fonts && document.fonts.load) document.fonts.load(fontStr({ ...t, size: 32 })).then(() => { rerender(L); App.requestRender(); T.place(); App.emit('doc'); }).catch(() => {});
      };
      const ta = T.panelTa = h('textarea', { class: 'txt-input', rows: 2, spellcheck: 'false' });
      ta.value = t.value;
      ta.addEventListener('input', () => {
        const nv = ta.value.replace(/\r\n?/g, '\n');
        if (nv === t.value) return;
        const ch = diffText(t.value, nv, ta.selectionStart === ta.selectionEnd ? ta.selectionEnd : null);
        shiftRuns(t, ch.a, ch.del, ch.ins);
        t.value = nv;
        if (T.edit && T.edit.L === L) fillEditor(T.edit);
        upd();
      });
      ta.addEventListener('keydown', e => e.stopPropagation());
      // paneldeki kutuda seçilen bölüme de stil verilebilir
      // Kutu odakta değilken gelen olaylar sayılmaz: tarayıcı, kutu odağını kaybederken de "select" gönderiyor; boş bir
      // yere tıklanıp seçim unutulduktan hemen sonra seçim geri geliyor ve "seçili bölüme uygulanır" uyarısı kalıyordu
      const panelSel = () => { if (document.activeElement !== ta) return; T.lastSel = { L, s: ta.selectionStart, e: ta.selectionEnd, v: t.value }; T.syncStyle(); };
      for (const ev of ['select', 'keyup', 'mouseup']) ta.addEventListener(ev, panelSel);
      body.appendChild(UI.section('Text', [ta, UI.note('Tip: double-click text on the canvas to type directly.')]));

      // Hazır stiller (seçince bölüm açık kalır). Başlıktaki düğme metni varsayılan stile döndürür (Ayarlar > Varsayılanlar).
      const applyPreset = pr => {
          const base = DEF();
          const keep = { value: t.value, size: pr.size ? Math.round(t.size * pr.size / 96) : t.size, align: t.align };
          Object.assign(t, base, JSON.parse(JSON.stringify(pr)), keep);
          delete t.shadow;
          t.stroke.w = pr.stroke ? Math.max(2, Math.round(t.size * pr.stroke.w / 96)) : Math.max(2, Math.round(t.size * 0.06));
          t.bg.pad = t.bg.padX = Math.round(t.size * (pr.bg ? 0.28 : 0.25));
          t.bg.padY = Math.round(t.size * 0.15);
          L.shadow = pr.shadow ? { ...pr.shadow, blur: pr.shadow.blur * t.size / 96, x: pr.shadow.x * t.size / 96, y: pr.shadow.y * t.size / 96 } : null;
          ensureFont(); render(L); App.commit(Object.keys(pr).length ? 'Text Style' : 'Back to Default Style'); UI.rebuildPanel();
      };
      const resetBtn = h('button', { class: 'icon-btn sm sec-act', title: 'Back to Default Style', html: App.icon('reset', 15), onclick: e => { e.preventDefault(); e.stopPropagation(); applyPreset({}); } });
      const pGrid = h('div', { class: 'preset-grid' + (presetFonts().done ? '' : ' wait') }, PRESETS.map(([name, pr]) => {
        const b = h('button', { class: 'preset-btn', onclick: () => applyPreset(pr) });
        b.textContent = name;
        b.style.fontFamily = `"${pr.font || pickFont('Segoe UI')}", sans-serif`;
        return b;
      }));
      if (!presetFonts().done) {
        const show = () => pGrid.classList.remove('wait');
        presetFonts().then(show); setTimeout(show, 2000);
      }
      body.appendChild(UI.section('Preset Styles', [pGrid], { open: false, extra: resetBtn }));

      // Yazı tipi: üzerine gelince önizleme, tıklayınca seçim
      // Yazı tipi, kalın / italik / altı çizili ve renk: metinde bir bölüm seçiliyse yalnızca o bölüme uygulanır
      const fontBtn = h('button', { class: 'font-pick', title: 'Choose Font', 'data-noi18n': '', style: { fontFamily: `"${t.font}", sans-serif` } }, t.font);
      fontBtn.onclick = () => T.fontPopup(fontBtn, L, f => T.applyStyle(L, 'f', f));
      const sb = (label, title, key, css) => {
        const b = h('button', { class: 'seg-btn', title, style: css, 'data-noi18n': '' });
        b.textContent = label;
        b.onmousedown = e => e.preventDefault(); // yazma alanındaki seçim kaybolmasın
        b.onclick = () => T.toggleStyle(L, key);
        return b;
      };
      const bB = sb('B', 'Bold (Ctrl+B)', 'b', 'font-weight:800'), bI = sb('I', 'Italic (Ctrl+I)', 'i', 'font-style:italic'), bU = sb('U', 'Underline (Ctrl+U)', 'u', 'text-decoration:underline');
      const style = h('div', { class: 'seg icons' }, bB, bI, bU,
        tg('AA', 'Uppercase', t.upper, v => { t.upper = v; upd(); }, 'font-size:11px'));
      // Renk kutusu: düz renk seçili bölüme (yoksa tümüne), degrade metnin tamamına uygulanır
      const colF = UI.color({
        label: 'Color', value: t.color, onInput: v => T.applyStyle(L, 'c', v, 'later'),
        grad: {
          on: !!t.grad.on, value: gradOf(t),
          onMode: on => {
            t.grad.on = on;
            // degradeye geçince seçili bölümün kendi rengi kalkar, degrade orada da görünür
            const r = T.rangeFor(L);
            if (on && r) setRunProp(t, r.s, r.e, 'c', null);
            if (T.edit && T.edit.L === L) fillEditor(T.edit);
            upd('Gradient', true);
          },
          onInput: g => { const on = t.grad.on; Object.assign(t.grad, g); t.grad.on = on; upd('Gradient'); },
        },
      });
      const scope = h('p', { class: 'note txt-scope' }, 'Applies to the selected part of the text.');
      const align = UI.seg({ options: [['left', 'Left', 'alignL'], ['center', 'Center', 'alignCH'], ['right', 'Right', 'alignR']], iconOnly: true, value: t.align, onChange: v => { t.align = v; upd(); } });
      // hizalama metnin tamamına uygulanır; düğmeye basmak metin kutusundaki seçimi kaldırmasın (uyarı da seçimle tutarlı kalır)
      align.el.addEventListener('mousedown', e => e.preventDefault());
      T.sizeSl = UI.slider({ label: 'Size', min: 6, max: Math.max(400, Math.round(t.size * 1.5)), value: Math.round(t.size), onInput: v => { scaleProps(L, v / t.size); rerender(L); App.requestRender(); T.place(); }, onChange: () => upd('Size', true) });
      body.appendChild(UI.section('Font', [
        scope,
        h('div', { class: 'field' }, fontBtn),
        T.sizeSl.el,
        UI.row(style, align.el),
        colF.el,
        UI.slider({ label: 'Letter Spacing', min: -20, max: 100, value: Math.round(t.spacing), onInput: v => { t.spacing = v; rerender(L); App.requestRender(); T.place(); }, onChange: () => upd('Letter Spacing', true) }).el,
        UI.slider({ label: 'Line Height', min: 0.6, max: 3, step: 0.05, value: t.lineH, def: 1.15, onInput: v => { t.lineH = v; render(L); App.requestRender(); T.place(); }, onChange: () => upd('Line Spacing', true) }).el,
      ]));
      T.styleUI = { L, b: bB, i: bI, u: bU, font: fontBtn, color: colF, scope };
      T.syncStyle();

      body.appendChild(UI.section('Curve', [
        UI.slider({ label: 'Curve Amount', min: -100, max: 100, value: t.curve, onInput: v => { t.curve = v; render(L); App.requestRender(); T.place(); }, onChange: () => upd('Curve', true) }).el,
        UI.note('Positive: arch, negative: smile. 100 = full circle.'),
      ], { open: !!t.curve }));

      // kontur ve arka plan kutusunun degradesi: o.gradOn / o.grad
      const subGrad = (o, label) => ({
        on: !!o.gradOn, fresh: !o.grad, value: o.grad || U.gradDef(o.color, '#00c2ff', 135),
        onMode: on => { o.gradOn = on; if (!o.grad) o.grad = U.gradDef(o.color, '#00c2ff', 135); upd(label, true); },
        onInput: g => { o.grad = g; upd(label); },
      });
      const opts = h('div', { class: 'opt-list' });
      body.appendChild(UI.section('View', [opts]));
      opts.appendChild(UI.optSection('Outline', t.stroke.on, v => { t.stroke.on = v; upd('Outline', true); }, [
        UI.color({ label: 'Color', value: t.stroke.color, onInput: v => { t.stroke.color = v; upd('Outline'); }, grad: subGrad(t.stroke, 'Outline') }).el,
        UI.slider({ label: 'Thickness', min: 1, max: Math.max(60, Math.round(t.size * 0.3)), value: Math.round(t.stroke.w), onInput: v => { t.stroke.w = v; render(L); App.requestRender(); }, onChange: () => upd('Outline', true) }).el,
      ]));

      opts.appendChild(UI.optSection('Background Box', t.bg.on, v => { t.bg.on = v; upd('Text Background', true); }, [
        UI.seg({ options: [['all', 'All'], ['line', 'Each Line']], value: t.bg.mode, onChange: v => { t.bg.mode = v; upd(); } }).el,
        UI.color({ label: 'Color', value: t.bg.color, onInput: v => { t.bg.color = v; upd(); }, grad: subGrad(t.bg, 'Text Background') }).el,
        UI.slider({ label: 'Opacity', min: 0, max: 100, value: Math.round((t.bg.opacity == null ? 1 : t.bg.opacity) * 100), onInput: v => { t.bg.opacity = v / 100; render(L); App.requestRender(); }, onChange: () => upd('', true) }).el,
        UI.slider({ label: 'Horizontal Padding', min: 0, max: 200, value: Math.round(bgPads(t)[0]), onInput: v => { t.bg.padY = bgPads(t)[1]; t.bg.padX = v; render(L); App.requestRender(); T.place(); }, onChange: () => upd('', true) }).el,
        UI.slider({ label: 'Vertical Padding', min: 0, max: 200, value: Math.round(bgPads(t)[1]), onInput: v => { t.bg.padX = bgPads(t)[0]; t.bg.padY = v; render(L); App.requestRender(); T.place(); }, onChange: () => upd('', true) }).el,
        UI.slider({ label: 'Corner Roundness', min: 0, max: 200, value: Math.min(200, Math.round(t.bg.radius)), onInput: v => { t.bg.radius = v; render(L); App.requestRender(); }, onChange: () => upd('', true) }).el,
      ]));

      const sh = () => (L.shadow = L.shadow || { on: false, color: '#000000', blur: 12, x: 4, y: 4, opacity: 0.6 });
      const s0 = L.shadow || { on: false, color: '#000000', blur: 12, x: 4, y: 4, opacity: 0.6 };
      const liveSh = () => { render(L); App.requestRender(); T.place(); };
      opts.appendChild(UI.optSection('Shadow / Glow', s0.on, v => { sh().on = v; upd('Shadow', true); }, [
        UI.color({ label: 'Color', value: s0.color, onInput: v => { sh().color = v; upd(); } }).el,
        UI.slider({ label: 'Blur', min: 0, max: 100, value: s0.blur, onInput: v => { sh().blur = v; liveSh(); }, onChange: () => upd('', true) }).el,
        ...UI.shadowOffset(sh, s0, liveSh, () => upd('', true), Math.max(150, Math.round(t.size * 0.6))),
        UI.slider({ label: 'Opacity', min: 0, max: 100, value: Math.round(s0.opacity * 100), onInput: v => { sh().opacity = v / 100; liveSh(); }, onChange: () => upd('', true) }).el,
      ]));
    },

    // Yazı tipi listesi: 0,3 sn üzerinde durunca metin geçici olarak o yazı tipiyle gösterilir
    fontPopup(anchor, L, onPick) {
      loadWebFonts();
      // Önizleme seçili bölüme (seçim yoksa tümüne) uygulanır; vazgeçilince eski hâline döner
      const t = L.text, rng = T.rangeFor(L), orig = rng ? rangeProp(t, rng.s, rng.e, 'f') : t.font;
      const snap = { font: t.font, runs: JSON.stringify(t.runs || null) };
      const restore = () => { t.font = snap.font; t.runs = JSON.parse(snap.runs); };
      let timer = null, picked = false, previewing = null;
      const redraw = () => { if (T.edit && T.edit.L === L) fillEditor(T.edit); rerender(L); App.requestRender(); T.place(); };
      const preview = f => {
        if (previewing === f) return;
        previewing = f;
        restore();
        if (rng) setRunProp(t, rng.s, rng.e, 'f', f === t.font ? null : f); else t.font = f;
        const go = () => { if (previewing === f && !picked) redraw(); };
        go();
        if (document.fonts && document.fonts.load) document.fonts.load(fontStr({ ...t, font: f, size: 32 })).then(go).catch(() => {});
      };
      const revert = () => {
        clearTimeout(timer);
        if (previewing !== null && !picked) { previewing = null; restore(); redraw(); }
      };
      const search = h('input', { type: 'text', class: 'full fp-search', placeholder: 'Search Fonts…', spellcheck: 'false' });
      const list = h('div', { class: 'fp-list' });
      const item = (f, user) => {
        const b = h('button', { class: 'fp-item' + (f === orig ? ' on' : ''), 'data-noi18n': '', style: { fontFamily: `"${f}", "Segoe UI", sans-serif` } }, f);
        b.addEventListener('mouseenter', () => { clearTimeout(timer); timer = setTimeout(() => preview(f), 300); });
        b.addEventListener('mouseleave', () => clearTimeout(timer));
        b.onclick = () => { clearTimeout(timer); picked = true; restore(); onPick(f); pop.close(); };
        if (!user) return b;
        const del = h('button', { class: 'fp-del', title: 'Remove from List', html: App.icon('close', 14) });
        del.onclick = async e => { e.stopPropagation(); await removeUserFont(f); fill(); };
        return h('div', { class: 'fp-user' }, b, del);
      };
      const groups = () => [['My Uploaded Fonts', USER_FONTS.slice(), 'user'], ['System Fonts', SYSTEM_FONTS, 'sys'], ...WEB_GROUPS.map(([g, l]) => [g, l, 'web'])];
      // Arama, yazı tipi adının başından eşleşir ("e" yalnızca E ile başlayanları gösterir)
      const norm = s => s.toLocaleLowerCase('tr').replace(/\s+/g, '');
      const fill = () => {
        const q = norm(search.value.trim());
        list.innerHTML = '';
        let n = 0;
        for (const [g, fonts, kind] of groups()) {
          const fs = fonts.filter(f => !q || norm(f).startsWith(q)).sort((a, b) => (q ? a.localeCompare(b) : 0));
          if (!fs.length) continue;
          n += fs.length;
          list.appendChild(h('div', { class: 'fp-head' }, g, kind === 'web' ? h('small', null, ' · Internet') : null));
          fs.forEach(f => list.appendChild(item(f, kind === 'user')));
        }
        if (!n) list.appendChild(h('p', { class: 'note', style: { padding: '0 8px' } }, 'No font starts with these letters.'));
      };
      const upBtn = UI.button('Load Font from Computer', async () => {
        const added = await uploadFonts();
        if (added.length) { search.value = ''; fill(); }
      }, { small: true, block: true, icon: 'upload', title: '.ttf, .otf, .woff veya .woff2 dosyası' });
      search.addEventListener('input', fill);
      search.addEventListener('keydown', e => e.stopPropagation());
      list.addEventListener('mouseleave', revert);
      fill();
      userFontsReady.then(() => { if (USER_FONTS.length && !search.value) fill(); });
      const pop = UI.popup(anchor, h('div', { class: 'fp' }, search, list, upBtn), { cls: 'fontpop', onClose: revert });
      const on = list.querySelector('.fp-item.on');
      if (on) on.scrollIntoView({ block: 'center' });
      setTimeout(() => search.focus(), 30);
      return pop;
    },
  };

  function tg(label, title, val, on, css) {
    const b = h('button', { class: 'seg-btn' + (val ? ' on' : ''), title, style: css, 'data-noi18n': '' });
    b.textContent = label;
    b.onmousedown = e => e.preventDefault(); // metindeki seçim kaybolmasın
    b.onclick = () => { val = !val; b.classList.toggle('on', val); on(val); };
    return b;
  }

  App.on('active', () => { if (App.tool === T) { if (T.edit && T.edit.L !== App.activeLayer()) T.finishEdit(); UI.rebuildPanel(); } });
  App.on('frame', () => { if (App.tool === T) T.place(); });
  App.on('transform', L => { if (App.tool === T && L.type === 'text' && T.sizeSl) T.sizeSl.set(Math.round(L.text.size)); });
  App.on('history', () => { if (App.tool === T && T.edit && !App.doc.layers.includes(T.edit.L)) T.finishEdit(); });
  App.registerTool(T);
})();
