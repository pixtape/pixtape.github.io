'use strict';
/* Pixtape - arayüz bileşenleri, paneller, menüler, iletişim kutuları */
(() => {
  const { U } = App;
  const h = U.h;
  const UI = App.ui = {};
  const K = id => (App.shortcuts ? App.shortcuts.label(id) : '');

  /* ------------------------------------------------------------ temel bileşenler */
  UI.slider = o => {
    const min = o.min == null ? -100 : o.min, max = o.max == null ? 100 : o.max, step = o.step || 1;
    const def = o.def == null ? (min < 0 ? 0 : (o.value == null ? min : o.value)) : o.def;
    let val = o.value == null ? def : o.value;
    const range = h('input', { type: 'range', min, max, step, value: val });
    const num = h('input', { type: 'number', class: 'sl-num', min, max, step, value: val });
    const fmt = v => (step < 1 ? (+v).toFixed(String(step).split('.')[1].length) : Math.round(v));
    const paint = () => {
      const t = (val - min) / (max - min) * 100;
      if (min < 0 && max > 0) {
        const z = (0 - min) / (max - min) * 100;
        const a = Math.min(z, t), b = Math.max(z, t);
        range.style.background = `linear-gradient(90deg, var(--track) ${a}%, var(--accent) ${a}%, var(--accent) ${b}%, var(--track) ${b}%)`;
      } else range.style.background = `linear-gradient(90deg, var(--accent) ${t}%, var(--track) ${t}%)`;
    };
    const set = (v, fire) => {
      val = U.clamp(+v, min, max);
      range.value = val; num.value = fmt(val);
      paint();
      if (fire) { o.onInput && o.onInput(val); o.onChange && o.onChange(val); }
    };
    range.addEventListener('input', () => { val = +range.value; num.value = fmt(val); paint(); o.onInput && o.onInput(val); });
    range.addEventListener('change', () => o.onChange && o.onChange(val));
    num.addEventListener('change', () => set(num.value, true));
    const label = h('label', { class: 'sl-label', title: 'Double-click to Reset', ondblclick: () => set(def, true) }, o.label || '');
    const el = h('div', { class: 'slider' + (o.compact ? ' compact' : '') }, h('div', { class: 'sl-top' }, label, o.info ? UI.info(o.info) : null, num), range);
    paint();
    return { el, set: v => set(v, false), get: () => val, reset: () => set(def, true) };
  };

  // Gölge yönü: yatay / dikey kaydırma yerine açı ve mesafe. Değerler yine sh.x / sh.y olarak saklanır;
  // mesafe 0 olunca açı kaybolmasın diye sh.angle da tutulur. 0° sağ, 90° aşağı.
  UI.shadowOffset = (get, s0, live, commit, maxDist) => {
    const ang0 = s0.angle != null ? s0.angle : (Math.hypot(s0.x || 0, s0.y || 0) ? Math.round((Math.atan2(s0.y || 0, s0.x || 0) * 180 / Math.PI + 360) % 360) : 45);
    let ang = ang0, dist = Math.round(Math.hypot(s0.x || 0, s0.y || 0));
    const put = () => { const s = get(), a = ang * Math.PI / 180; s.angle = ang; s.x = Math.round(Math.cos(a) * dist * 10) / 10; s.y = Math.round(Math.sin(a) * dist * 10) / 10; live(); };
    return [
      UI.slider({ label: 'Angle', min: 0, max: 360, value: ang, def: 45, info: '0° casts the shadow to the right, 90° downward.', onInput: v => { ang = v; put(); }, onChange: commit }).el,
      UI.slider({ label: 'Distance', min: 0, max: maxDist, value: Math.min(maxDist, dist), onInput: v => { dist = v; put(); }, onChange: commit }).el,
    ];
  };

  /* ------------------------------------------------------------ açılır pencereler (renk, degrade) */
  const popStack = [];
  let lastClosed = { anchor: null, t: 0 };
  UI.popup = (anchor, content, o = {}) => {
    const el = h('div', { class: 'popup' + (o.cls ? ' ' + o.cls : '') }, content);
    document.body.appendChild(el);
    // boyut çevrilmiş metinle ölçülsün (konum ve pencere geçiş animasyonu bunu kullanır)
    if (App.i18n && App.i18n.translate) App.i18n.translate(el);
    const pop = {
      el, anchor,
      close() {
        const i = popStack.indexOf(pop);
        if (i < 0) return;
        popStack.splice(i).reverse().forEach(p => { p.el.remove(); p.onClose && p.onClose(); });
      },
      onClose: o.onClose,
    };
    popStack.push(pop);
    // konum: çapanın sağına; sığmazsa soluna ya da altına
    const r = anchor.getBoundingClientRect(), w = el.offsetWidth, hh = el.offsetHeight;
    let x = r.right + 12, y = r.top - 12;
    if (x + w > innerWidth - 8) x = r.left - w - 12;
    if (x < 8) { x = U.clamp(r.left, 8, innerWidth - w - 8); y = r.bottom + 6; }
    y = U.clamp(y, 8, Math.max(8, innerHeight - hh - 8));
    el.style.left = x + 'px'; el.style.top = y + 'px';
    return pop;
  };
  UI.popupOpen = () => popStack.length > 0;
  UI.closePopups = () => { if (popStack.length) popStack[0].close(); };
  document.addEventListener('mousedown', e => {
    if (UI.eyedropping) return;
    while (popStack.length) {
      const top = popStack[popStack.length - 1];
      if (top.el.contains(e.target)) return;
      if (top.anchor && top.anchor.contains(e.target)) lastClosed = { anchor: top.anchor, t: performance.now() };
      top.close();
    }
  }, true);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && popStack.length) { e.stopImmediatePropagation(); e.preventDefault(); popStack[popStack.length - 1].close(); }
  }, true);
  // Aynı kutuya tekrar tıklamak pencereyi kapatsın (yeniden açmasın)
  const justClosed = a => lastClosed.anchor === a && performance.now() - lastClosed.t < 500;

  const hsv2rgb = (hu, s, v) => {
    const f = n => { const k = (n + hu / 60) % 6; return (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255; };
    return [f(5), f(3), f(1)];
  };
  const rgb2hsv = (r, g, b) => {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let hu = 0;
    if (d) {
      if (mx === r) hu = ((g - b) / d) % 6; else if (mx === g) hu = (b - r) / d + 2; else hu = (r - g) / d + 4;
      hu *= 60; if (hu < 0) hu += 360;
    }
    return [hu, mx ? d / mx : 0, mx];
  };
  const isHex = v => /^#[0-9a-f]{6}$/i.test(v);
  const normHex = v => {
    v = String(v || '').trim().toLowerCase();
    if (!v.startsWith('#')) v = '#' + v;
    if (/^#[0-9a-f]{3}$/.test(v)) v = '#' + v.slice(1).split('').map(c => c + c).join('');
    return isHex(v) ? v : null;
  };

  UI.SWATCHES = [
    '#ffffff', '#d9d9d9', '#a6a6a6', '#737373', '#404040', '#000000',
    '#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#00c7be', '#007aff',
    '#5856d6', '#af52de', '#ff2d55', '#a2845e', '#ffd1dc', '#c7f0ff',
    '#8b0000', '#ff6f00', '#7cb342', '#006064', '#1a237e', '#4a148c',
  ];
  const RECENT_KEY = 'pixtape-recent-colors';
  const recentColors = () => { try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; } catch (e) { return []; } };
  const addRecent = c => { try { localStorage.setItem(RECENT_KEY, JSON.stringify([c, ...recentColors().filter(x => x !== c)].slice(0, 12))); } catch (e) { /* */ } };

  // Renk seçme penceresi: renk alanı, ton çubuğu, HEX, R G B, hazır ve son renkler, damlalık
  // o.head: pencerenin en üstüne konan öğe (ör. Düz renk / Degrade seçimi)
  UI.colorPopup = (anchor, value, onInput, o = {}) => {
    const start = normHex(value) || '#ffffff';
    let cur = start;
    let [hu, sa, va] = rgb2hsv(...U.hex2rgb(start));
    const SW = 240, SH = 150;
    const sv = h('canvas', { width: SW, height: SH });
    const hue = h('canvas', { width: SW, height: 14 });
    const svDot = h('i', { class: 'cp-dot' }), hueDot = h('i', { class: 'cp-hdot' });
    const svWrap = h('div', { class: 'cp-sv' }, sv, svDot), hueWrap = h('div', { class: 'cp-hue' }, hue, hueDot);
    const pvOld = h('button', { class: 'cp-old', title: 'Back to Previous Color', style: { background: start } });
    const pvNew = h('span', { class: 'cp-new' });
    const hex = h('input', { type: 'text', class: 'cp-hex', maxlength: 7, spellcheck: 'false' });
    const rgbIn = ['R', 'G', 'B'].map(() => h('input', { type: 'number', min: 0, max: 255, step: 1, class: 'cp-num' }));

    const hx = hue.getContext('2d'), hg = hx.createLinearGradient(0, 0, SW, 0);
    for (let i = 0; i <= 6; i++) hg.addColorStop(i / 6, `hsl(${i * 60},100%,50%)`);
    hx.fillStyle = hg; hx.fillRect(0, 0, SW, 14);
    const drawSV = () => {
      const x = sv.getContext('2d');
      x.fillStyle = `hsl(${hu},100%,50%)`; x.fillRect(0, 0, SW, SH);
      let g = x.createLinearGradient(0, 0, SW, 0); g.addColorStop(0, '#fff'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(0, 0, SW, SH);
      g = x.createLinearGradient(0, 0, 0, SH); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, '#000');
      x.fillStyle = g; x.fillRect(0, 0, SW, SH);
    };
    const show = skip => {
      svDot.style.left = sa * 100 + '%'; svDot.style.top = (1 - va) * 100 + '%';
      svDot.style.background = cur;
      hueDot.style.left = hu / 360 * 100 + '%';
      pvNew.style.background = cur;
      if (skip !== 'hex') hex.value = cur;
      if (skip !== 'rgb') U.hex2rgb(cur).forEach((v, i) => { rgbIn[i].value = v; });
    };
    const fromHSV = () => { cur = U.rgb2hex(...hsv2rgb(hu, sa, va)); show(); onInput(cur); };
    const setHex = (v, skip) => {
      v = normHex(v);
      if (!v) return;
      cur = v;
      const [h2, s2, v2] = rgb2hsv(...U.hex2rgb(v));
      if (s2 > 0 && v2 > 0) hu = h2;
      sa = s2; va = v2;
      drawSV(); show(skip); onInput(cur);
    };
    const drag = (el, fn) => {
      const mv = e => { const r = el.getBoundingClientRect(); fn(U.clamp((e.clientX - r.left) / r.width, 0, 1), U.clamp((e.clientY - r.top) / r.height, 0, 1)); };
      el.addEventListener('pointerdown', e => { try { el.setPointerCapture(e.pointerId); } catch (err) { /* */ } mv(e); el.onpointermove = mv; });
      el.addEventListener('pointerup', () => { el.onpointermove = null; });
    };
    drag(svWrap, (x, y) => { sa = x; va = 1 - y; fromHSV(); });
    drag(hueWrap, x => { hu = x * 359.9; drawSV(); fromHSV(); });
    hex.addEventListener('input', () => { if (normHex(hex.value) && hex.value.replace('#', '').length === 6) setHex(hex.value, 'hex'); });
    hex.addEventListener('change', () => setHex(hex.value));
    rgbIn.forEach(inp => inp.addEventListener('input', () => {
      const v = rgbIn.map(q => U.clamp(Math.round(+q.value || 0), 0, 255));
      setHex(U.rgb2hex(...v), 'rgb');
    }));
    pvOld.onclick = () => setHex(start);
    const dot = c => h('button', { class: 'cp-sw', style: { background: c }, title: c, onclick: () => setHex(c) });
    const rec = recentColors();
    const tools = [h('button', {
      class: 'icon-btn sm', title: 'Pick a color from the screen. Esc cancels.', html: App.icon('pipette', 16),
      onclick: async () => { const r = await App.eyedropper(); if (r) setHex(r.hex); },
    })];
    const content = h('div', { class: 'cp' },
      o.head || null,
      svWrap, hueWrap,
      h('div', { class: 'cp-row' },
        h('div', { class: 'cp-pv' }, pvOld, pvNew),
        h('label', { class: 'cp-f wide' }, h('span', null, 'HEX'), hex),
        ...tools),
      h('div', { class: 'cp-row' }, ['R', 'G', 'B'].map((l, i) => h('label', { class: 'cp-f' }, h('span', null, l), rgbIn[i]))),
      h('div', { class: 'cp-lbl' }, 'Preset Colors'),
      h('div', { class: 'cp-grid' }, UI.SWATCHES.map(dot)),
      rec.length ? h('div', { class: 'cp-lbl' }, 'Recently Used') : null,
      rec.length ? h('div', { class: 'cp-grid' }, rec.map(dot)) : null);
    drawSV(); show();
    return UI.popup(anchor, content, { onClose: () => { if (cur !== start) addRecent(cur); } });
  };

  /* Ekrandan renk seçme: pencerenin görüntüsü alınır, bütün arayüz devre dışı kalır ve imlecin yerinde
     yakınlaştırılmış yuvarlak bir büyüteç görünür. Tıklanan yerin rengi döner ({ hex, x, y }); Esc ya da sağ tık iptal eder (null).
     Programın kendi arayüzünden (düğmeler, paneller) de renk alınabilir. */
  UI.eyedropping = false;
  App.eyedropper = async () => {
    if (UI.eyedropping) return null;
    UI.eyedropping = true;
    const dpr = window.devicePixelRatio || 1;
    // tarayıcıda sayfanın görüntüsü alınamaz: renk resim alanından alınır
    const shot = U.canvas(innerWidth * dpr, innerHeight * dpr);
    const v = App.R && App.R.canvas;
    if (v && v.getClientRects().length) { const r = v.getBoundingClientRect(); shot.getContext('2d').drawImage(v, r.left * dpr, r.top * dpr, r.width * dpr, r.height * dpr); }
    const k = shot.width / innerWidth, sx = shot.getContext('2d', { willReadFrequently: true });
    // büyütme: büyüteçte görünen piksel sayısı (tekerlek ya da + / - ile değişir; az piksel = daha yakın)
    const LEVELS = [41, 29, 21, 15, 11, 7, 5];
    let li = Math.min(LEVELS.length - 1, Math.max(0, +(App.prefs.loupeLevel ?? 3) || 0)), N = LEVELS[li], half = (N - 1) / 2;
    const SZ = 148;
    const lc = h('canvas', { width: Math.round(SZ * dpr), height: Math.round(SZ * dpr), style: { width: SZ + 'px', height: SZ + 'px' } });
    const sw = h('i'), hexEl = h('b', { 'data-noi18n': '' }), zEl = h('span', { class: 'ed-zoom', 'data-noi18n': '' });
    const loupe = h('div', { class: 'ed-loupe' }, lc, h('div', { class: 'ed-lab' }, sw, hexEl, zEl));
    const ov = h('div', { class: 'eyedrop' }, loupe, h('div', { class: 'ed-hint' }, 'Click where you want to take the color from. Wheel or + / -: zoom, arrow keys: move one pixel, Enter: pick, Esc: cancel'));
    document.body.appendChild(ov);
    const colorAt = (cx, cy) => {
      const px = Math.floor(cx * k), py = Math.floor(cy * k);
      if (px < 0 || py < 0 || px >= shot.width || py >= shot.height) return null;
      const d = sx.getImageData(px, py, 1, 1).data;
      return d[3] < 10 ? null : U.rgb2hex(d[0], d[1], d[2]);
    };
    let cur = null;
    const draw = (cx, cy) => {
      cur = { x: cx, y: cy };
      zEl.textContent = Math.round(SZ / N) + '×';
      loupe.style.transform = `translate(${cx - SZ / 2}px, ${cy - SZ / 2}px)`;
      const x = lc.getContext('2d'), W = lc.width, cell = W / N;
      x.imageSmoothingEnabled = false;
      x.fillStyle = '#2a2c33'; x.fillRect(0, 0, W, W);
      x.drawImage(shot, Math.floor(cx * k) - half, Math.floor(cy * k) - half, N, N, 0, 0, W, W);
      x.strokeStyle = 'rgba(0,0,0,.18)'; x.lineWidth = 1;
      x.beginPath();
      for (let i = 1; i < N; i++) { const p = Math.round(i * cell) + 0.5; x.moveTo(p, 0); x.lineTo(p, W); x.moveTo(0, p); x.lineTo(W, p); }
      x.stroke();
      const c0 = Math.round(half * cell);
      x.lineWidth = 2 * dpr; x.strokeStyle = '#000'; x.strokeRect(c0, c0, Math.round(cell), Math.round(cell));
      x.lineWidth = 1 * dpr; x.strokeStyle = '#fff'; x.strokeRect(c0 + dpr, c0 + dpr, Math.round(cell) - 2 * dpr, Math.round(cell) - 2 * dpr);
      const c = colorAt(cx, cy);
      sw.style.background = c || 'transparent';
      hexEl.textContent = c ? c.toUpperCase() : App.t('No Color');
      loupe.style.borderColor = c || '';
    };
    return new Promise(resolve => {
      let done = false;
      const finish = v => {
        if (done) return;
        done = true;
        window.removeEventListener('keydown', key, true);
        window.removeEventListener('keyup', swallow, true);
        setTimeout(() => { ov.remove(); UI.eyedropping = false; }, 40);
        resolve(v);
      };
      const swallow = e => { e.preventDefault(); e.stopImmediatePropagation(); };
      const zoom = dir => {
        const n = U.clamp(li + dir, 0, LEVELS.length - 1);
        if (n === li) return;
        li = n; N = LEVELS[li]; half = (N - 1) / 2;
        App.setPref('loupeLevel', li);
        if (cur) draw(cur.x, cur.y);
      };
      const pick = (x, y) => {
        const c = colorAt(x, y);
        if (!c) { UI.toast('No color can be picked here', 'warn', 1500); return; }
        finish({ hex: c, x, y });
      };
      const key = e => {
        swallow(e);
        const ky = e.key;
        if (ky === 'Escape') finish(null);
        else if (ky === '+' || ky === '=' || ky === 'Add') zoom(1);
        else if (ky === '-' || ky === '_' || ky === 'Subtract') zoom(-1);
        else if (ky === 'Enter' || ky === ' ') { if (cur) pick(cur.x, cur.y); }
        else if (cur && ky.startsWith('Arrow')) {
          // ekran görüntüsünün bir pikseli kadar kaydır (Shift ile 10)
          const m = (e.shiftKey ? 10 : 1) / k;
          draw(cur.x + (ky === 'ArrowRight' ? m : ky === 'ArrowLeft' ? -m : 0), cur.y + (ky === 'ArrowDown' ? m : ky === 'ArrowUp' ? -m : 0));
        }
      };
      window.addEventListener('keydown', key, true);
      window.addEventListener('keyup', swallow, true);
      ov.addEventListener('pointermove', e => draw(e.clientX, e.clientY));
      ov.addEventListener('pointerdown', e => {
        e.preventDefault(); e.stopPropagation();
        if (e.button !== 0) { finish(null); return; }
        // ok tuşlarıyla ince ayar yapıldıysa ve fare kıpırdamadıysa büyüteçteki nokta seçilir
        const c = cur && Math.hypot(cur.x - e.clientX, cur.y - e.clientY) < 12 ? cur : { x: e.clientX, y: e.clientY };
        pick(c.x, c.y);
      });
      ov.addEventListener('contextmenu', e => e.preventDefault());
      ov.addEventListener('click', swallow);
      ov.addEventListener('wheel', e => { swallow(e); if (e.deltaY) zoom(e.deltaY < 0 ? 1 : -1); }, { passive: false });
      if (App.lastPointer) draw(App.lastPointer.x, App.lastPointer.y); else draw(innerWidth / 2, innerHeight / 2);
    });
  };
  window.addEventListener('pointermove', e => { App.lastPointer = { x: e.clientX, y: e.clientY }; }, { passive: true });
  // Ekrandan seçilen noktanın belgedeki yeri (resim alanının dışındaysa null)
  App.clientToDoc = (cx, cy) => {
    const st = App.R && App.R.stage;
    if (!st || !App.doc) return null;
    const r = st.getBoundingClientRect();
    if (cx < r.left || cy < r.top || cx > r.right || cy > r.bottom) return null;
    return App.screenToDoc(cx - r.left, cy - r.top);
  };

  /* Renk alanı: tek bir renk kutusu; tıklayınca renk seçme penceresi açılır.
     o.grad verilirse kutu degrade de olabilir: pencerenin üstünde "Düz renk / Degrade" seçimi çıkar.
       o.grad = { on, value, onMode(on), onInput(degrade) } */
  const CHECKER = ', repeating-conic-gradient(#cfd3da 0 25%, #fff 0 50%) 0 0 / 10px 10px';
  UI.color = o => {
    let val = normHex(o.value) || '#ffffff';
    const G = o.grad || null;
    let gOn = !!(G && G.on), gVal = G ? JSON.parse(JSON.stringify(G.value || U.gradDef(val, '#ffffff', 135))) : null;
    // G.fresh: degrade henüz kullanılmamış, yalnızca varsayılan. Kullanıcı degradeyi düzenleyene kadar
    // degradeye her geçişte ilk renk o anki düz renk olur (ör. kırmızı seçilip degradeye geçilince kırmızıdan başlar).
    let gFresh = !!(G && (G.fresh || !G.value));
    const sw = h('button', { class: 'cl-swatch', title: G ? 'Change Color or Gradient' : 'Change Color' });
    const paint = () => {
      sw.style.background = gOn ? U.gradCSS({ ...gVal, angle: gVal.type === 'radial' ? gVal.angle : 90 }) + CHECKER : val;
      sw.dataset.hex = val;
      sw.classList.toggle('is-grad', gOn);
    };
    const set = (v, fire) => {
      v = normHex(v);
      if (!v) return;
      val = v; paint();
      if (fire && o.onInput) o.onInput(val);
    };
    let pop = null, headEl = null;
    // Düz renk / Degrade seçimi. Geçişte bu öğe yeni pencereye taşınır, seçim göstergesi kayarak yer değiştirir.
    const head = () => {
      const s = UI.seg({ options: [['solid', 'Solid Color'], ['grad', 'Gradient']], value: gOn ? 'grad' : 'solid', onChange: v => {
        const on = v === 'grad';
        if (on === gOn) return;
        if (on && gFresh) {
          const st = U.gradStops(gVal);
          st[0].c = val;
          if (st.length > 1 && st[st.length - 1].c.toLowerCase() === val.toLowerCase()) st[st.length - 1].c = val.toLowerCase() === '#ffffff' ? '#6c5cff' : '#ffffff';
          G.onInput && G.onInput(JSON.parse(JSON.stringify(gVal)));
        }
        gOn = on; paint();
        s.el.classList.toggle('is-grad', on);
        G.onMode && G.onMode(on);
        morph();
      } });
      s.el.classList.add('cp-mode');
      s.el.classList.toggle('is-grad', gOn);
      return (headEl = s.el);
    };
    const open = reuse => {
      const hd = G ? (reuse ? headEl : head()) : null;
      if (gOn) pop = UI.gradientPopup(sw, gVal, g => { gVal = g; gFresh = false; paint(); G.onInput && G.onInput(JSON.parse(JSON.stringify(g))); }, { head: hd });
      else pop = UI.colorPopup(sw, val, v => set(v, true), hd ? { head: hd } : {});
    };
    /* Pencere değişimi: eski içerik yerinde solarken pencere yeni boyutuna büyür ya da küçülür,
       yeni içerik hafifçe kayarak belirir. Üstteki seçim yerinde kalır. */
    const morph = () => {
      const old = pop;
      if (!old || !old.el.isConnected) { open(); return; }
      const r0 = old.el.getBoundingClientRect(), body0 = old.el.firstElementChild;
      const ph = h('div', { style: { height: headEl.offsetHeight + 'px', marginBottom: getComputedStyle(headEl).marginBottom } });
      const gl = body0.offsetLeft, gt = body0.offsetTop, gw = body0.offsetWidth;
      body0.replaceChild(ph, headEl);
      old.close();
      open(true);
      const el = pop.el;
      if (!App.motion()) return;
      // yeni pencerenin açılış animasyonu (küçükten büyüme) kapatılır, sonra ölçülür: bitiş boyutu gerçek boyut olsun,
      // yoksa animasyonun sonunda pencere birden %4 büyür
      el.style.animation = 'none';
      const r1 = el.getBoundingClientRect();
      el.style.overflow = 'hidden';
      Object.assign(body0.style, { position: 'absolute', left: gl + 'px', top: gt + 'px', width: gw + 'px', margin: '0', pointerEvents: 'none' });
      el.appendChild(body0);
      const ease = 'cubic-bezier(.2,.8,.2,1)', T = 240;
      const box = el.animate([
        { left: r0.left + 'px', top: r0.top + 'px', width: r0.width + 'px', height: r0.height + 'px' },
        { left: r1.left + 'px', top: r1.top + 'px', width: r1.width + 'px', height: r1.height + 'px' },
      ], { duration: T, easing: ease });
      body0.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 130, easing: 'ease-out', fill: 'forwards' });
      // will-change kalıcı: animasyon bitince katman değişmez, yazılar son karede farklı çizilmez
      [...el.firstElementChild.children].filter(c => c !== headEl).forEach(c =>
        (c.style.willChange = 'opacity, transform') && c.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 200, delay: 70, easing: ease, fill: 'backwards' }));
      box.onfinish = box.oncancel = () => { body0.remove(); el.style.overflow = ''; };
    };
    sw.onclick = () => { if (!justClosed(sw)) open(); };
    paint();
    const el = h('div', { class: 'color-field' + (o.label ? '' : ' bare') }, o.label ? h('label', { class: 'fld-label' }, o.label) : null, sw);
    return {
      el, get: () => val,
      set: v => set(v, false),
      // degrade durumu dışarıdan değişince (ör. geri al, seçim değişti)
      setMode: on => { if (G) { gOn = !!on; paint(); } },
      setGrad: g => { if (G && g) { gVal = JSON.parse(JSON.stringify(g)); gFresh = false; paint(); } },
    };
  };

  /* ------------------------------------------------------------ degrade düzenleyici */
  UI.GRAD_PRESETS = [
    [['#ffffff', 1], ['#000000', 1]], [['#000000', 1], ['#000000', 0]], [['#ffffff', 1], ['#ffffff', 0]],
    [['#5b86e5', 1], ['#0b1a3b', 1]], [['#ff512f', 1], ['#dd2476', 1]], [['#7c5cff', 1], ['#00c2ff', 1]],
    [['#f7971e', 1], ['#ffd200', 1]], [['#11998e', 1], ['#38ef7d', 1]], [['#8e2de2', 1], ['#4a00e0', 1]],
    [['#ff0000', 1], ['#ff7f00', 1], ['#ffff00', 1], ['#00ff00', 1], ['#0000ff', 1], ['#8b00ff', 1]],
    [['#fbc2eb', 1], ['#a6c1ee', 1]], [['#232526', 1], ['#414345', 1]],
  ].map(st => st.map(([c, a], i) => ({ p: i / (st.length - 1), c, a })));

  UI.gradientPopup = (anchor, value, onInput, o = {}) => {
    const g = JSON.parse(JSON.stringify(value));
    let sel = 0;
    const emit = () => { paint(); onInput(JSON.parse(JSON.stringify(g))); };
    const barFill = h('div', { class: 'gp-fill' });
    const bar = h('div', { class: 'gp-bar', title: 'Click to add a new color stop' }, barFill);
    const marks = h('div', { class: 'gp-marks' });
    const colorAt = p => {
      const st = U.gradStops(g);
      let a = st[0], b = st[st.length - 1];
      for (let i = 0; i < st.length - 1; i++) if (p >= st[i].p && p <= st[i + 1].p) { a = st[i]; b = st[i + 1]; break; }
      const t = b.p === a.p ? 0 : U.clamp((p - a.p) / (b.p - a.p), 0, 1);
      const ca = U.hex2rgb(a.c), cb = U.hex2rgb(b.c);
      return { c: U.rgb2hex(...ca.map((v, i) => v + (cb[i] - v) * t)), a: (a.a == null ? 1 : a.a) + ((b.a == null ? 1 : b.a) - (a.a == null ? 1 : a.a)) * t };
    };
    const opSl = UI.slider({ label: 'Opacity', min: 0, max: 100, value: 100, def: 100, onInput: v => { g.stops[sel].a = v / 100; emit(); } });
    const stopCol = UI.color({ label: 'Color', value: g.stops[0].c, onInput: v => { g.stops[sel].c = v; emit(); } });
    const delStop = () => {
      if (g.stops.length <= 2) { UI.toast('A gradient needs at least two colors', 'warn', 1600); return; }
      g.stops.splice(sel, 1); sel = Math.max(0, sel - 1); emit(); syncStop();
    };
    const del = UI.iconBtn('trash', 'Delete Selected Stop (Delete)', delStop);
    const syncStop = () => {
      const s = g.stops[sel];
      opSl.set(Math.round((s.a == null ? 1 : s.a) * 100));
      stopCol.set(s.c);
      del.disabled = g.stops.length <= 2;
    };
    let away = false;
    const paint = () => {
      barFill.style.background = U.gradCSS({ type: 'linear', angle: 90, stops: g.stops });
      marks.innerHTML = '';
      g.stops.forEach((s, i) => {
        const m = h('div', { class: 'gp-mark' + (i === sel ? ' on' : '') + (i === sel && away ? ' away' : ''), style: { left: s.p * 100 + '%' } }, h('i', { style: { background: s.c } }));
        m.addEventListener('pointerdown', e => {
          e.stopPropagation();
          sel = i; syncStop(); paint();
          const r = bar.getBoundingClientRect();
          const mv = ev => {
            g.stops[sel].p = U.clamp((ev.clientX - r.left) / r.width, 0, 1);
            // aşağı çekip bırakınca sil
            away = ev.clientY - r.bottom > 46 && g.stops.length > 2;
            emit();
          };
          const up = () => {
            window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);
            if (away) { away = false; g.stops.splice(sel, 1); sel = 0; syncStop(); emit(); }
          };
          window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
        });
        marks.appendChild(m);
      });
      angWrap.style.display = g.type === 'radial' ? 'none' : '';
    };
    bar.addEventListener('pointerdown', e => {
      const r = bar.getBoundingClientRect(), p = U.clamp((e.clientX - r.left) / r.width, 0, 1);
      g.stops.push({ p, ...colorAt(p) });
      sel = g.stops.length - 1;
      syncStop(); emit();
    });
    const type = UI.seg({ options: [['linear', 'Linear'], ['radial', 'Radial']], value: g.type || 'linear', onChange: v => { g.type = v; emit(); } });
    const ang = UI.slider({ label: 'Direction', min: 0, max: 360, value: Math.round(g.angle || 0), def: 90, onInput: v => { g.angle = v; emit(); } });
    const dirs = h('div', { class: 'gp-dirs' }, [[0, '↑'], [45, '↗'], [90, '→'], [135, '↘'], [180, '↓'], [225, '↙'], [270, '←'], [315, '↖']].map(([a, t]) =>
      h('button', { class: 'gp-dir', title: a + '°', onclick: () => { g.angle = a; ang.set(a); emit(); } }, t)));
    const angWrap = h('div', null, ang.el, dirs);
    const presets = h('div', { class: 'gp-presets' }, UI.GRAD_PRESETS.map(st => h('button', {
      class: 'gp-pre', style: { background: U.gradCSS({ type: g.type, angle: 135, stops: st }) + ', repeating-conic-gradient(#cfd3da 0 25%, #fff 0 50%) 0 0 / 10px 10px' },
      onclick: () => { g.stops = JSON.parse(JSON.stringify(st)); sel = 0; syncStop(); emit(); },
    })));
    const content = h('div', { class: 'gp' },
      o.head || h('div', { class: 'gp-title' }, 'Gradient'),
      h('div', { class: 'gp-barwrap' }, bar, marks),
      h('div', { class: 'gp-stop' }, opSl.el, h('div', { class: 'gp-stoprow' }, stopCol.el, del)),
      UI.note('Click the bar to add a color and drag the stops to adjust them. To delete the selected stop, press Delete or drag it down.'),
      h('div', { class: 'gp-sep' }),
      type.el, angWrap,
      h('div', { class: 'gp-sep' }),
      h('div', { class: 'cp-lbl' }, 'Preset Gradients'), presets);
    syncStop(); paint();
    // Delete / Backspace: seçili durağı sil (yazı alanındayken değil)
    const key = e => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      if (popStack[popStack.length - 1] !== pop) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' && (t.type === 'text' || t.type === 'number') || t.tagName === 'TEXTAREA')) return;
      e.preventDefault(); e.stopImmediatePropagation();
      delStop();
    };
    document.addEventListener('keydown', key, true);
    const pop = UI.popup(anchor, content, { cls: 'wide', onClose: () => document.removeEventListener('keydown', key, true) });
    return pop;
  };

  // Degrade alanı: degradeyi gösteren kutu; tıklayınca düzenleyici açılır
  UI.gradient = o => {
    let val = JSON.parse(JSON.stringify(o.value || U.gradDef()));
    const sw = h('button', { class: 'gr-swatch', title: 'Edit Gradient' });
    const paint = () => { sw.style.background = U.gradCSS(val) + ', repeating-conic-gradient(#cfd3da 0 25%, #fff 0 50%) 0 0 / 10px 10px'; };
    sw.onclick = () => { if (!justClosed(sw)) UI.gradientPopup(sw, val, v => { val = v; paint(); o.onInput && o.onInput(JSON.parse(JSON.stringify(v))); }); };
    paint();
    const el = h('div', { class: 'color-field grad-field' }, o.label ? h('label', { class: 'fld-label' }, o.label) : null, sw);
    return { el, get: () => val, set: v => { val = JSON.parse(JSON.stringify(v)); paint(); } };
  };

  /* Arama kutusu (büyüteçli): çok seçenekli listelerde (filtre, efekt, şekil, çerçeve) adı yazılarak bulunur.
     Ekranda görünen ad (seçili dil) ve Türkçe asıl ad aranır; büyük/küçük harf ve Türkçe karakter farkı gözetilmez. */
  const fold = s => String(s || '').toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i');
  /* Aranan her kelime, addaki bir kelimenin başıyla eşleşmeli ("gli" Glitch'i bulur; "Yağlı" kelimesinin
     ortasındaki "gli" yüzünden Yağlı boya çıkmaz) */
  UI.matches = (el, q) => {
    if (!q) return true;
    const ws = fold(el.textContent + ' ' + (el.title || '') + ' ' + (el.dataset.q || '')).split(/[^\p{L}\p{N}]+/u);
    return q.split(/\s+/).filter(Boolean).every(t => ws.some(w => w.startsWith(t)));
  };
  UI.searchBox = (onSearch, placeholder = 'Search…') => {
    const inp = h('input', { type: 'search', class: 'srch-in', placeholder: App.t(placeholder), spellcheck: 'false' });
    const clr = h('button', { class: 'srch-x', title: 'Clear', html: App.icon('close', 13) });
    const el = h('div', { class: 'srch' }, h('span', { class: 'srch-ic', html: App.icon('search', 15) }), inp, clr);
    const fire = () => { el.classList.toggle('has', !!inp.value); onSearch(fold(inp.value.trim())); };
    inp.addEventListener('input', fire);
    inp.addEventListener('keydown', e => { if (e.key === 'Escape' && inp.value) { e.stopPropagation(); inp.value = ''; fire(); } });
    clr.onclick = () => { inp.value = ''; fire(); inp.focus(); };
    return { el, inp, get: () => fold(inp.value.trim()) };
  };
  // Bir kutudaki öğeleri aramaya göre gizler; hiç sonuç yoksa bilgi gösterir
  UI.filterItems = (box, sel, q) => {
    let n = 0;
    box.querySelectorAll(sel).forEach(el => { const ok = UI.matches(el, q); el.style.display = ok ? '' : 'none'; if (ok) n++; });
    let none = box.querySelector(':scope > .srch-none');
    if (!n && q) { if (!none) box.appendChild(none = h('div', { class: 'srch-none' }, 'No Results')); }
    else if (none) none.remove();
    return n;
  };

  UI.select = o => {
    const sel = h('select', { onchange: () => o.onChange && o.onChange(sel.value) },
      o.options.map(op => {
        const [v, t] = Array.isArray(op) ? op : [op, op];
        return h('option', { value: v, selected: String(v) === String(o.value) }, t);
      }));
    const el = h('div', { class: 'field' }, o.label ? h('label', { class: 'fld-label' }, o.label) : null, sel);
    return { el, sel, set: v => { sel.value = v; }, get: () => sel.value };
  };

  UI.toggle = o => {
    const inp = h('input', { type: 'checkbox', checked: !!o.value, onchange: () => o.onChange && o.onChange(inp.checked) });
    const el = h('label', { class: 'toggle' }, inp, h('span', { class: 'tg-track' }), h('span', { class: 'tg-label' }, o.label), o.info ? UI.info(o.info) : null);
    return { el, set: v => { inp.checked = !!v; }, get: () => inp.checked };
  };

  UI.seg = o => {
    let val = o.value;
    const btns = o.options.map(op => {
      const [v, t, ic] = op;
      const b = h('button', { class: 'seg-btn' + (v === val ? ' on' : ''), title: op[3] || (ic ? t : ''), onclick: () => { set(v); o.onChange && o.onChange(v); } });
      if (ic) b.innerHTML = App.icon(ic, 18) + (o.iconOnly ? '' : `<span>${t}</span>`);
      else b.textContent = t;
      b.dataset.v = v;
      return b;
    });
    const set = v => { val = v; btns.forEach(b => b.classList.toggle('on', b.dataset.v === String(v))); };
    const el = h('div', { class: 'field' }, o.label ? (o.info ? UI.infoLabel(o.label, o.info) : h('label', { class: 'fld-label' }, o.label)) : null, h('div', { class: 'seg' + (o.wrap ? ' wrap' : '') + (o.iconOnly ? ' icons' : '') }, btns));
    return { el, set, get: () => val };
  };

  UI.button = (label, onClick, o = {}) => {
    const b = h('button', { class: 'btn' + (o.primary ? ' primary' : '') + (o.small ? ' small' : '') + (o.block ? ' block' : '') + (o.danger ? ' danger' : '') + (o.cls ? ' ' + o.cls : ''), title: o.title || '', onclick: onClick });
    b.innerHTML = (o.icon ? App.icon(o.icon, 16) : '') + (label ? `<span>${label}</span>` : '');
    return b;
  };
  UI.iconBtn = (icon, title, onClick, cls = '') => {
    const b = h('button', { class: 'icon-btn ' + cls, title, onclick: onClick });
    b.innerHTML = App.icon(icon, 18);
    return b;
  };

  // Bölümlerin açık/kapalı durumu panel yeniden kurulduğunda korunur
  const secState = {};
  UI.section = (title, kids, o = {}) => {
    // o.toggle = { value, onChange }: başlıkta anahtar; açılınca bölüm aşağı doğru açılır, kapanınca kapanır
    if (o.toggle) {
      const tgl = o.toggle;
      const inp = h('input', { type: 'checkbox', checked: !!tgl.value });
      const d = h('details', { class: 'sec sec-tg' + (tgl.value ? ' on' : ''), open: !!tgl.value });
      const sum = h('summary', null, h('span', null, title), o.info ? UI.info(o.info) : null, o.extra || null, h('label', { class: 'toggle sec-switch', onclick: e => e.stopPropagation() }, inp, h('span', { class: 'tg-track' })));
      const set = v => { inp.checked = v; d.open = v; d.classList.toggle('on', v); tgl.onChange && tgl.onChange(v); };
      sum.addEventListener('click', e => { e.preventDefault(); set(!inp.checked); });
      inp.addEventListener('change', () => set(inp.checked));
      d.appendChild(sum);
      d.appendChild(h('div', { class: 'sec-body' }, kids));
      return d;
    }
    const key = (App.tool ? App.tool.id : '') + ':' + (o.key || title);
    const open = key in secState ? secState[key] : o.open !== false;
    const d = h('details', { class: 'sec', open });
    d.appendChild(h('summary', null, h('span', null, title), o.info ? UI.info(o.info) : null, o.extra || null));
    d.appendChild(h('div', { class: 'sec-body' }, kids));
    d.addEventListener('toggle', () => { secState[key] = d.open; });
    return d;
  };
  // Açma/kapama anahtarlı bölüm: kapalıyken seçenekler gizli, açılınca aşağı doğru açılır
  UI.optSection = (title, on, onToggle, kids) => {
    const inp = h('input', { type: 'checkbox', checked: !!on });
    const el = h('div', { class: 'opt-sec' + (on ? ' on' : '') },
      h('label', { class: 'opt-head' }, h('span', { class: 'opt-title' }, title), inp, h('span', { class: 'tg-track' })),
      h('div', { class: 'opt-wrap' }, h('div', { class: 'opt-body' }, kids)));
    inp.addEventListener('change', () => { el.classList.toggle('on', inp.checked); onToggle && onToggle(inp.checked); });
    return el;
  };
  UI.row = (...kids) => h('div', { class: 'row' }, kids);
  UI.note = t => h('p', { class: 'note' }, t);
  // Yuvarlak "i" simgesi: uzun açıklama yalnızca üzerine gelince görünür (panelde görüntü kirliliği olmasın)
  let tipEl = null;
  const hideTip = () => { if (tipEl) { tipEl.remove(); tipEl = null; } };
  UI.info = text => {
    const b = h('span', { class: 'info-i', tabindex: '0', html: App.icon('info', 15) });
    const show = () => {
      hideTip();
      tipEl = h('div', { class: 'info-tip' }, App.t(text));
      document.body.appendChild(tipEl);
      const r = b.getBoundingClientRect(), w = tipEl.offsetWidth, hh = tipEl.offsetHeight;
      let x = U.clamp(r.left + r.width / 2 - w / 2, 8, innerWidth - w - 8), y = r.bottom + 8;
      if (y + hh > innerHeight - 8) y = r.top - hh - 8;
      tipEl.style.left = x + 'px'; tipEl.style.top = y + 'px';
    };
    b.addEventListener('mouseenter', show); b.addEventListener('focus', show);
    b.addEventListener('mouseleave', hideTip); b.addEventListener('blur', hideTip);
    b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); });
    return b;
  };
  // Başlık + "i" simgesi (ör. bölüm içindeki küçük başlıklar)
  UI.infoLabel = (label, text) => h('label', { class: 'fld-label with-info' }, h('span', null, label), UI.info(text));
  // Damlalık imleci (fotoğraftan renk alırken)
  App.CURSOR_PIPETTE = `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><g stroke="#000" stroke-width="3.6"><path d="M2 22l1-1h3l9-9M3 21v-3l9-9"/><path d="M15 6l3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3z"/></g><g stroke="#fff" stroke-width="1.7"><path d="M2 22l1-1h3l9-9M3 21v-3l9-9"/><path d="M15 6l3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3z" fill="#fff"/></g></svg>')}") 2 22, crosshair`;
  UI.number = o => {
    const inp = h('input', { type: 'number', value: o.value, min: o.min, max: o.max, step: o.step || 1, onchange: () => o.onChange && o.onChange(+inp.value) });
    const el = h('div', { class: 'field num-field' }, h('label', { class: 'fld-label' }, o.label), inp);
    return { el, inp, set: v => { inp.value = Math.round(v * 100) / 100; }, get: () => +inp.value };
  };
  UI.tabs = (items, onChange, value) => {
    let cur = value || items[0][0];
    const btns = items.map(([v, t]) => h('button', { class: 'tab' + (v === cur ? ' on' : ''), onclick: () => { cur = v; btns.forEach(b => b.classList.toggle('on', b.dataset.v === v)); onChange(v); } }, t));
    btns.forEach((b, i) => (b.dataset.v = items[i][0]));
    return h('div', { class: 'tabs' }, btns);
  };

  /* ------------------------------------------------------------ bildirim / modallar */
  UI.toast = (msg, type = 'info', ms = 2600) => {
    const root = document.getElementById('toasts');
    const t = h('div', { class: 'toast ' + type }, msg);
    root.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, ms);
  };

  UI.modal = o => new Promise(resolve => {
    const root = document.getElementById('modals');
    const close = v => { wrap.remove(); document.removeEventListener('keydown', key, true); resolve(v); };
    const key = e => {
      // tuşları yalnızca en üstteki pencere işler (iç içe pencerede ESC ikisini birden kapatmasın)
      if (wrap !== root.lastElementChild) return;
      if (e.key === 'Escape') { e.stopPropagation(); close(null); }
      if (e.key === 'Enter' && o.enter && !(e.target && e.target.tagName === 'TEXTAREA')) { e.stopPropagation(); e.preventDefault(); close(o.enter()); }
    };
    const btns = (o.buttons || []).map(b => UI.button(b.label, () => {
      const v = typeof b.value === 'function' ? b.value() : b.value;
      if (v === false) return; // doğrulama başarısız
      close(v);
    }, { primary: b.primary, danger: b.danger }));
    const box = h('div', { class: 'modal' + (o.cls ? ' ' + o.cls : ''), style: { width: (o.width || 420) + 'px' } },
      h('div', { class: 'modal-head' }, h('h3', null, o.title || ''), UI.iconBtn('close', 'Close', () => close(null))),
      h('div', { class: 'modal-body' }, o.content),
      btns.length ? h('div', { class: 'modal-foot' }, btns) : null);
    const wrap = h('div', { class: 'modal-wrap' + (o.top ? ' top' : ''), onmousedown: e => { if (e.target === wrap && !o.sticky) close(null); } }, box);
    root.appendChild(wrap);
    /* Ortalanan pencere yarım piksele denk gelebiliyor; önizleme oynarken ya da imleç gezinirken ekran yeniden
       çizildikçe yazılar 1 px aşağı yukarı titriyordu. Pencere her boyut değişiminde tam piksele oturtulur. */
    if (window.ResizeObserver) {
      const snap = () => {
        const cs = getComputedStyle(box), bh = parseFloat(cs.height), bw = parseFloat(cs.width);
        const t = (wrap.clientHeight - bh) / 2, l = (wrap.clientWidth - bw) / 2;
        box.style.top = (t > 0 ? Math.round(t) - t : 0) + 'px';
        box.style.left = (l > 0 ? Math.round(l) - l : 0) + 'px';
      };
      box.style.position = 'relative';
      new ResizeObserver(snap).observe(box);
      new ResizeObserver(snap).observe(wrap);
    }
    document.addEventListener('keydown', key, true);
    if (o.onOpen) o.onOpen(box, close);
    const f = box.querySelector('input[autofocus], input[type=text], input[type=number]');
    if (f) setTimeout(() => f.focus(), 30);
  });

  UI.confirm = (msg, ok = 'OK', danger) => UI.modal({
    title: 'Confirm', width: 380, content: h('p', { class: 'modal-msg' }, msg),
    buttons: [{ label: 'Cancel', value: null }, { label: ok, value: true, primary: !danger, danger }],
    enter: () => true,
  }).then(v => !!v);

  UI.choice = (msg, opts) => UI.modal({
    title: 'Pixtape', width: 400, content: h('p', { class: 'modal-msg' }, msg),
    buttons: opts.map(([v, t, p]) => ({ label: t, value: v, primary: p })),
  });

  UI.prompt = (title, value = '', label = '') => {
    const inp = h('input', { type: 'text', value, class: 'full' });
    return UI.modal({
      title, width: 380, content: h('div', null, label ? h('label', { class: 'fld-label' }, label) : null, inp),
      buttons: [{ label: 'Cancel', value: null }, { label: 'OK', value: () => inp.value, primary: true }],
      enter: () => inp.value,
    });
  };

  // Menüyü açan düğmeye tekrar basmak menüyü kapatır (yeniden açmaz)
  let menuShut = { anchor: null, t: 0 };
  UI.menu = (anchor, items, o = {}) => {
    UI.closeMenus();
    if (anchor && menuShut.anchor === anchor && performance.now() - menuShut.t < 500) { menuShut.anchor = null; return null; }
    const r = anchor ? anchor.getBoundingClientRect() : { left: 0, right: 0, top: 0, bottom: 0 };
    const m = h('div', { class: 'menu' }, items.map(it => {
      if (it === '-') return h('div', { class: 'menu-sep' });
      if (it.header) return h('div', { class: 'menu-head' }, it.header);
      const b = h('button', {
        class: 'menu-item' + (it.checked ? ' checked' : ''), disabled: !!it.disabled,
        onclick: () => { UI.closeMenus(); it.onClick && it.onClick(); },
      });
      // o.checkRight: tik solda değil sağda (ör. bayraklı dil listesi)
      const chk = it.checked ? App.icon('check', 16) : '';
      const ico = it.iconHTML || (it.icon ? App.icon(it.icon, 16) : o.checkRight ? '' : chk);
      // ikonu olan seçilebilir öğede (ör. Izgara) tik işareti etiketin yanında görünür
      const chk2 = it.icon && it.checked && !o.checkRight ? `<span class="mi-chk">${App.icon('check', 14)}</span>` : '';
      // it.noi18n: etiket kullanıcı metni (ör. dosya adı); çevrilmez ve HTML olarak yorumlanmaz
      const lbl = it.noi18n ? String(it.label).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]) : it.label;
      // tik sağdayken ikonsuz öğenin etiketi en soldan başlar (boş ikon sütunu bırakılmaz)
      b.innerHTML = (ico || !o.checkRight ? `<span class="mi-ico">${ico}</span>` : '') + `<span class="mi-label"${it.noi18n ? ' data-noi18n=""' : ''}>${lbl}${chk2}</span><span class="mi-key">${it.key || (o.checkRight ? chk : '')}</span>`;
      return b;
    }));
    document.body.appendChild(m);
    const mw = m.offsetWidth, mh = m.offsetHeight;
    let x = o.right ? r.right - mw : r.left, y = o.up ? r.top - mh - 4 : r.bottom + 4;
    if (o.at) { x = o.at.x; y = o.at.y; if (y + mh > innerHeight - 4) y = o.at.y - mh; if (x + mw > innerWidth - 4) x = o.at.x - mw; }
    x = U.clamp(x, 4, innerWidth - mw - 4); y = U.clamp(y, 4, innerHeight - mh - 4);
    m.style.left = x + 'px'; m.style.top = y + 'px';
    setTimeout(() => document.addEventListener('mousedown', UI._menuAway = e => {
      if (m.contains(e.target)) return;
      if (anchor && anchor.contains(e.target)) menuShut = { anchor, t: performance.now() };
      UI.closeMenus();
    }), 0);
    return m;
  };
  UI.closeMenus = () => {
    document.querySelectorAll('.menu').forEach(m => m.remove());
    if (UI._menuAway) document.removeEventListener('mousedown', UI._menuAway);
    UI._menuAway = null;
  };

  /* ------------------------------------------------------------ araç çubuğu + panel */
  UI.buildToolbar = () => {
    const tb = document.getElementById('toolbar');
    tb.innerHTML = '';
    tb.onscroll = hideFly;
    // Kullanıcının sürükleyerek belirlediği sıra (yeni araçlar sona eklenir)
    const saved = (App.prefs.toolOrder || []).filter(id => App.tools[id]);
    const order = [...saved, ...App.toolOrder.filter(id => !saved.includes(id))];
    let dragId = null;
    for (const id of order) {
      const t = App.tools[id];
      if (t.hidden) continue;
      const b = h('button', { class: 'tool-btn' + (App.tool && App.tool.id === id ? ' on' : ''), 'data-tool': id, draggable: 'true', 'aria-label': t.name, onclick: e => {
        if (e.detail) b.blur();
        // açık araca yeniden basmak araç panelini kapatır / açar (başka bir araç seçmek paneli yine açar)
        if (App.tool && App.tool.id === id) { App.layout.toggleToolPanel(); return; }
        App.layout.toggleToolPanel(true);
        App.setTool(id);
      } });
      b.innerHTML = App.icon(t.icon, 24);
      b.addEventListener('mouseenter', () => toolFly(b, t, K('tool:' + id)));
      b.addEventListener('mouseleave', hideFly);
      b.addEventListener('dragstart', e => { hideFly(); dragId = id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id); b.classList.add('drag'); });
      b.addEventListener('dragend', () => { dragId = null; b.classList.remove('drag'); tb.querySelectorAll('.over-top,.over-bot').forEach(x => x.classList.remove('over-top', 'over-bot')); });
      b.addEventListener('dragover', e => {
        if (!dragId || dragId === id) return;
        e.preventDefault();
        const r = b.getBoundingClientRect(), after = e.clientY > r.top + r.height / 2;
        b.classList.toggle('over-bot', after); b.classList.toggle('over-top', !after);
      });
      b.addEventListener('dragleave', () => b.classList.remove('over-top', 'over-bot'));
      b.addEventListener('drop', e => {
        e.preventDefault();
        if (!dragId || dragId === id) return;
        const after = b.classList.contains('over-bot');
        const ids = [...tb.querySelectorAll('.tool-btn')].map(x => x.dataset.tool).filter(x => x !== dragId);
        ids.splice(ids.indexOf(id) + (after ? 1 : 0), 0, dragId);
        App.setPref('toolOrder', ids);
        UI.buildToolbar();
      });
      tb.appendChild(b);
    }
    tb.oncontextmenu = e => {
      e.preventDefault();
      UI.menu(null, [
        { header: 'Toolbar' },
        { label: 'Drag the Tools to Reorder Them', disabled: true },
        { label: 'Restore Default Order', icon: 'reset', disabled: !App.prefs.toolOrder, onClick: () => { App.setPref('toolOrder', null); UI.buildToolbar(); } },
        '-',
        ...App.layout.menuItems(),
      ], { at: { x: e.clientX, y: e.clientY } });
    };
    if (!UI._tbHooked) {
      UI._tbHooked = true;
      // araç değişince önceki aracın açık renk / degrade pencereleri kapanır
      App.on('tool', t => { UI.closePopups(); document.querySelectorAll('#toolbar .tool-btn').forEach(b => b.classList.toggle('on', b.dataset.tool === t.id)); });
      App.on('prefs', k => { if (k === 'keys') UI.buildToolbar(); });
    }
  };

  /* Araç düğmesinin üzerine gelince: düğmenin yerinde parlayan mor bir şerit açılır, içinde simge, aracın adı ve kısayolu.
     Araç çubuğu kaydırılabildiği için şerit gövdeye eklenir (çubuğun içinde kırpılmasın). */
  let flyEl = null;
  function hideFly() { if (flyEl) { flyEl.remove(); flyEl = null; } }
  function toolFly(b, t, key) {
    hideFly();
    const r = b.getBoundingClientRect();
    const bg = h('span', { class: 'tf-bg' });
    flyEl = h('div', { class: 'tool-fly' + (b.classList.contains('on') ? ' on' : '') }, bg,
      h('span', { class: 'tf-ico', html: App.icon(t.icon, 24) }), h('span', { class: 'tf-name' }, t.name), key ? h('kbd', null, key) : null);
    document.body.appendChild(flyEl);
    // araç çubuğu sağdaysa şerit sola doğru açılır
    const right = r.left > innerWidth / 2;
    Object.assign(flyEl.style, { top: r.top + 'px', height: r.height + 'px' });
    if (right) { flyEl.style.right = (innerWidth - r.right) + 'px'; flyEl.classList.add('rtl'); } else flyEl.style.left = r.left + 'px';
    /* Şerit düğmenin genişliğinden açılır: simge düğmedeki yerinde kalır, zemin parıltısıyla birlikte uzar,
       ad ve kısayol hafifçe kayarak belirir. Yalnızca transform ve opacity değiştiği için ekran kartında akıcı çalışır;
       katmanlar animasyon bitince de aynı kaldığından son karede görüntü sıçramaz. */
    if (!App.motion()) return;
    const w = flyEl.getBoundingClientRect().width, ease = 'cubic-bezier(.25,.8,.25,1)';
    bg.animate([{ transform: `scaleX(${r.width / w})` }, { transform: 'none' }], { duration: 220, easing: ease });
    [...flyEl.children].slice(2).forEach((c, i) => c.animate([{ opacity: 0, transform: `translateX(${right ? 10 : -10}px)` }, { opacity: 1, transform: 'none' }],
      { duration: 190, delay: 60 + i * 40, easing: ease, fill: 'backwards' }));
  }
  window.addEventListener('blur', hideFly);

  UI.buildPanel = tool => {
    const p = document.getElementById('toolpanel');
    p.innerHTML = '';
    const actions = h('div', { class: 'tp-actions' },
      UI.button('Cancel', () => App.cancelTool(), { small: true }),
      UI.button('Apply', () => App.applyTool(), { small: true, primary: true }));
    const head = h('div', { class: 'tp-head', title: App.t('Drag the header to move the panel') }, h('h3', null, tool.name), tool.actions ? actions : null);
    const body = h('div', { class: 'tp-body' });
    p.appendChild(head); p.appendChild(body);
    UI.panelBody = body;
    UI.panelActions = actions;
    UI._panelTool = tool;
    try { tool.panel && tool.panel(body); } catch (e) { console.error(e); }
    UI.setActionsEnabled(false);
  };
  UI.setActionsEnabled = on => {
    if (UI.panelActions) UI.panelActions.classList.toggle('dim', !on);
    UI.syncUndo();
  };
  UI.syncUndo = () => {
    const u = document.getElementById('btnUndo'), r = document.getElementById('btnRedo');
    if (u && App.doc) { u.disabled = !App.history.canUndo(); r.disabled = !App.history.canRedo(); }
  };
  // Paneli yeniden kurar; aynı araçtaysa kaydırma konumu korunur
  UI.rebuildPanel = () => {
    const t = App.tool;
    if (!t) return;
    const same = UI._panelTool === t, st = same && UI.panelBody ? UI.panelBody.scrollTop : 0;
    UI.buildPanel(t);
    UI._panelTool = t;
    if (same && st) UI.panelBody.scrollTop = st;
    if (t.isDirty) UI.setActionsEnabled(t.isDirty());
  };

  App.applyTool = async () => {
    const t = App.tool;
    if (t && t.apply) await t.apply();
    UI.setActionsEnabled(false);
  };
  App.cancelTool = () => {
    const t = App.tool;
    if (t && t.cancel) t.cancel();
    UI.setActionsEnabled(false);
    if (t && t.refresh) t.refresh();
  };

  // Araç içi geri al / yinele: uygulanmamış ayar adımlarını saklar (Ctrl+Z önce bunları geri alır)
  UI.localHist = (get, set) => {
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const H = {
      list: [], pos: 0,
      reset() { H.list = [get()]; H.pos = 0; UI.syncUndo(); },
      push() {
        const s = get();
        if (H.list.length && same(s, H.list[H.pos])) return;
        H.list.length = H.pos + 1;
        H.list.push(s);
        if (H.list.length > 60) H.list.splice(1, 1);
        H.pos = H.list.length - 1;
        UI.syncUndo();
      },
      canUndo: () => H.pos > 0,
      canRedo: () => H.pos < H.list.length - 1,
      undo() { if (!H.canUndo()) return false; H.pos--; set(JSON.parse(JSON.stringify(H.list[H.pos]))); return true; },
      redo() { if (!H.canRedo()) return false; H.pos++; set(JSON.parse(JSON.stringify(H.list[H.pos]))); return true; },
    };
    H.reset();
    return H;
  };

  // "Önce / Sonra": basılı tutulduğu sürece aracın önizlemesi gizlenir, katmanın değiştirilmemiş hâli görünür
  UI.peekBtn = () => {
    const b = UI.button('Before / After', null, { small: true, cls: 'ghost peek-btn', icon: 'compare', title: 'Hold to Show the Unedited Version' });
    const on = v => { App.peek = v; b.classList.toggle('on', v); App.requestRender(); };
    b.addEventListener('pointerdown', e => { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch (err) { /* */ } on(true); });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, () => on(false));
    return b;
  };

  // Araç ayarları (renk, boyut, fırça türü...) için geri al / yinele.
  // Ctrl+Z önce son ayar değişikliğini geri alır; belgede bir değişiklik olunca (ör. çizim) ayar geçmişi sıfırlanır,
  // böylece Ctrl+Z her zaman en son yapılan işi geri alır.
  UI.toolSettingsHist = (T, keys, restore) => {
    const get = () => { const o = {}; for (const k of keys) o[k] = T[k]; return o; };
    const H = UI.localHist(get, st => { Object.assign(T, st); restore && restore(); });
    T.canLocalUndo = () => H.canUndo();
    T.canLocalRedo = () => H.canRedo();
    T.localUndo = () => H.undo();
    T.localRedo = () => H.redo();
    let tm = 0;
    T.settingsChanged = () => { clearTimeout(tm); tm = setTimeout(() => { if (App.tool === T) H.push(); }, 250); };
    App.on('changed', () => { clearTimeout(tm); H.reset(); });
    App.on('tool', () => { clearTimeout(tm); H.reset(); });
    return H;
  };

  /* ------------------------------------------------------------ katmanlar paneli */
  const thumbCache = new WeakMap();
  const thumb = (L, size = 40) => {
    let c = thumbCache.get(L.canvas);
    if (!c) {
      c = U.canvas(size, size);
      const x = c.getContext('2d'), cw = L.canvas.width, ch = L.canvas.height;
      const s = Math.min(size / cw, size / ch);
      x.imageSmoothingQuality = 'high';
      x.drawImage(L.canvas, (size - cw * s) / 2, (size - ch * s) / 2, cw * s, ch * s);
      thumbCache.set(L.canvas, c);
    }
    const out = U.canvas(size, size);
    out.getContext('2d').drawImage(c, 0, 0);
    out.className = 'ly-thumb';
    return out;
  };

  const BLENDS = [
    ['source-over', 'Normal'], ['multiply', 'Multiply (darken)'], ['screen', 'Screen (lighten)'], ['overlay', 'Overlay'],
    ['soft-light', 'Soft Light'], ['color', 'Color'],
  ];
  UI.BLENDS = BLENDS;

  // Çoklu katman seçimi (Ctrl / Shift + tıklama) - birleştirme için
  const multi = new Set();
  let picking = false;
  UI.selectedLayers = () => {
    const d = App.doc;
    if (!d) return [];
    const ids = new Set(multi);
    if (d.active) ids.add(d.active);
    return d.layers.filter(l => ids.has(l.id));
  };
  const activate = id => { picking = true; App.setActive(id); picking = false; };
  // Birden çok katmanı seçili yapar (ör. grup çözülünce içindekilerin hepsi seçili kalır)
  UI.selectLayers = ids => { multi.clear(); ids.forEach(id => multi.add(id)); if (ids.length) activate(ids[ids.length - 1]); };
  App.on('active', () => { if (!picking) multi.clear(); });
  App.on('docopen', () => multi.clear());
  const pick = (L, e) => {
    const d = App.doc;
    if (e.ctrlKey || e.metaKey) {
      if (d.active) multi.add(d.active);
      if (multi.has(L.id) && L.id !== d.active) { multi.delete(L.id); UI.refreshLayers(); return; }
      multi.add(L.id);
      activate(L.id);
    } else if (e.shiftKey && d.active) {
      const a = d.layers.findIndex(l => l.id === d.active), b = d.layers.indexOf(L);
      multi.clear();
      for (let i = Math.min(a, b); i <= Math.max(a, b); i++) multi.add(d.layers[i].id);
      activate(L.id);
    } else { multi.clear(); App.setActive(L.id); }
  };
  const renameLayer = async L => {
    const n = await UI.prompt('Rename layer', L.name);
    if (n && n.trim()) { L.name = n.trim(); App.commit('Rename'); }
  };
  // Katman sağ tık menüsü (katmanlar paneli ve tuval)
  const layerMenuItems = L => {
    const A = App.actions;
    if (!L || !App.doc) return [{ label: 'Select a Layer First', disabled: true }];
    const sel = UI.selectedLayers();
    return [
      { label: 'Rename…', icon: 'rename', onClick: () => renameLayer(L) },
      { label: 'Duplicate', icon: 'duplicate', key: K('duplicate'), onClick: () => A.duplicate() },
      { label: 'Delete Layer', icon: 'trash', key: K('deleteLayer'), onClick: () => A.deleteLayer() },
      '-',
      { label: 'Group Layers', icon: 'folder', key: K('group'), disabled: sel.length < 2, onClick: () => A.groupLayers() },
      L.type === 'group' ? { label: 'Ungroup', icon: 'folder', key: K('ungroup'), onClick: () => A.ungroupLayer() } : null,
      { label: sel.length > 1 ? App.t('Merge {0} selected layers', sel.length) : 'Merge Selected Layers', icon: 'merge', disabled: sel.length < 2, onClick: () => A.mergeSelected() },
      { label: 'Merge Down', icon: 'mergeDown', key: K('mergeDown'), disabled: App.doc.layers.indexOf(L) <= 0, onClick: () => A.mergeDown() },
      { label: 'Merge Visible', icon: 'merge', key: K('mergeVisible'), onClick: () => A.mergeVisible() },
      { label: 'Flatten Image', icon: 'flatten', onClick: () => A.flatten() },
      '-',
      { label: L.visible ? 'Hide' : 'Show', icon: L.visible ? 'eyeOff' : 'eye', onClick: () => { L.visible = !L.visible; App.commit(L.visible ? 'Show Layer' : 'Hide Layer'); } },
      { label: L.locked ? 'Unlock' : 'Lock Position', icon: L.locked ? 'unlock' : 'lock', key: K('lockLayer'), onClick: () => A.toggleLock() },
      L.type !== 'raster' ? { label: 'Rasterize', icon: 'raster', onClick: () => A.rasterize() } : null,
      '-',
      { label: 'Bring to Front', icon: 'front', key: K('layerTop'), onClick: () => A.order('top') },
      { label: 'Bring Forward', icon: 'up', key: K('layerUp'), onClick: () => A.order('up') },
      { label: 'Send Backward', icon: 'down', key: K('layerDown'), onClick: () => A.order('down') },
      { label: 'Send to Back', icon: 'back', key: K('layerBottom'), onClick: () => A.order('bottom') },
      '-',
      { label: 'Save Layer as PNG', icon: 'save', onClick: () => A.exportLayer() },
    ].filter(Boolean);
  };
  UI.layerMenuItems = layerMenuItems;
  UI.selectLayerKeep = activate;
  // Tuvalde Ctrl + tıklama: katmanı seçime ekler ya da çıkarır
  // (seçiliyse çıkarır; çıkan etkin katmansa seçimde kalan son katman etkin olur)
  UI.toggleLayerSel = L => {
    const d = App.doc, sel = UI.selectedLayers();
    if (sel.includes(L) && sel.length > 1) {
      if (d.active) multi.add(d.active);
      multi.delete(L.id);
      if (L.id === d.active) { const rest = sel.filter(q => q !== L); activate(rest[rest.length - 1].id); }
    } else pick(L, { ctrlKey: true });
    UI.refreshLayers && UI.refreshLayers();
    App.requestRender();
  };
  UI.isMultiSelected = id => multi.has(id);

  UI.buildLayers = () => {
    const root = document.getElementById('layers');
    const list = h('div', { class: 'ly-list' });
    const blend = h('select', { class: 'ly-blend', title: 'Blend Mode' }, BLENDS.map(([v, t]) => h('option', { value: v }, t)));
    const op = UI.slider({ label: 'Opacity', min: 0, max: 100, value: 100, def: 100, compact: true });
    const props = h('div', { class: 'ly-props' }, h('div', { class: 'ly-blend-row' }, blend), op.el);
    const mergeMenu = anchor => UI.menu(anchor, [
      { label: 'Merge Selected Layers', icon: 'merge', key: 'Ctrl+click', disabled: UI.selectedLayers().length < 2, onClick: () => App.actions.mergeSelected() },
      { label: 'Merge Down', icon: 'mergeDown', key: K('mergeDown'), onClick: () => App.actions.mergeDown() },
      { label: 'Merge Visible', icon: 'merge', key: K('mergeVisible'), onClick: () => App.actions.mergeVisible() },
      { label: 'Flatten Image', icon: 'flatten', onClick: () => App.actions.flatten() },
    ], { up: true });
    const addItems = () => [
      { label: 'Empty Layer', icon: 'layers', key: K('newLayer'), onClick: () => App.actions.newEmptyLayer() },
      { label: 'Add Image…', icon: 'image', onClick: () => App.actions.addImageLayer() },
      { label: 'Text', icon: 'text', onClick: () => { App.setTool('text').then(() => App.tools.text.addDefault()); } },
      { label: 'Shape', icon: 'shape', onClick: () => { App.setTool('element'); } },
      { label: 'Solid Color Fill', icon: 'bucket', onClick: () => App.actions.fillLayer() },
    ];
    const addBtn = UI.iconBtn('plus', 'Add Layer', e => UI.menu(e.currentTarget, addItems(), { up: true }));
    // Listenin boş yerine sağ tık: katman ekleme menüsü; sol tık: seçimi kaldır
    list.addEventListener('contextmenu', e => {
      if (e.target.closest('.ly-row') || !App.doc) return;
      e.preventDefault();
      UI.menu(null, [{ header: 'New Layer' }, ...addItems(), '-',
        { label: 'Paste', icon: 'clipboard', key: 'Ctrl+V', onClick: () => App.actions.pasteFromClipboard() },
        { label: 'Merge Visible', icon: 'merge', key: K('mergeVisible'), onClick: () => App.actions.mergeVisible() },
      ], { at: { x: e.clientX, y: e.clientY } });
    });
    list.addEventListener('click', e => {
      if (e.target.closest('.ly-row') || !App.doc || !App.doc.active) return;
      multi.clear();
      App.setActive(null);
    });
    // Belgenin arka plan rengi: en alttaki sabit satır (varsayılan saydam)
    // düz renk (metin) ya da degrade (nesne)
    let pSolid = '#ffffff', pGrad = U.gradDef('#ffffff', '#6c5cff', 135), pGradOn = false;
    const pc = UI.color({
      value: pSolid, onInput: v => { pSolid = v; setPaper(v); },
      grad: { on: false, fresh: true, value: pGrad, onMode: on => { pGradOn = on; setPaper(on ? JSON.parse(JSON.stringify(pGrad)) : pSolid); }, onInput: g => { pGrad = g; if (pGradOn) setPaper(JSON.parse(JSON.stringify(g))); } },
    });
    const paperSw = pc.el.querySelector('.cl-swatch');
    paperSw.classList.add('ly-paper-sw');
    const paperSub = h('div', { class: 'ly-sub' });
    const paperClear = h('button', { class: 'ly-ic', title: 'Make Transparent', html: App.icon('close', 14) });
    const paper = h('div', { class: 'ly-paper', title: 'Click to Change the Background Color' },
      paperSw, h('div', { class: 'ly-info' }, h('div', { class: 'ly-name' }, 'Background Color'), paperSub), paperClear);
    let paperT = 0;
    const setPaper = (v, now) => {
      const d = App.doc;
      if (!d) return;
      d.bg = v; App.requestRender(); syncPaper(true);
      clearTimeout(paperT);
      paperT = setTimeout(() => App.commit(v ? 'Background Color' : 'Make Background Transparent'), now ? 0 : 400);
    };
    const syncPaper = own => {
      const c = App.doc && App.doc.bg, grad = !!c && typeof c === 'object';
      // geri al, sekme değişimi gibi dışarıdan gelen değişiklikte renk seçici de eşitlenir
      if (!own && c) {
        if (grad) { pGrad = JSON.parse(JSON.stringify(c)); pc.setGrad(pGrad); } else { pSolid = c; pc.set(c); }
        pGradOn = grad; pc.setMode(grad);
      }
      if (!c) { paperSw.style.background = ''; }
      paperSw.classList.toggle('none', !c);
      paperSub.textContent = !c ? App.t('Transparent') : grad ? App.t('Gradient') : c.toUpperCase();
      paperClear.style.visibility = c ? '' : 'hidden';
    };
    paper.addEventListener('click', e => {
      if (e.target.closest('.ly-ic') || e.target.closest('.cl-swatch') || !App.doc) return;
      paperSw.click();
    });
    paperClear.onclick = e => { e.stopPropagation(); setPaper(null, true); };
    const foot = h('div', { class: 'ly-foot' },
      addBtn,
      UI.iconBtn('duplicate', App.t('Duplicate') + (K('duplicate') ? ' (' + K('duplicate') + ')' : ''), () => App.actions.duplicate()),
      UI.iconBtn('merge', 'Merge', e => mergeMenu(e.currentTarget)),
      UI.iconBtn('trash', 'Delete (Del)', () => App.actions.deleteLayer()),
      UI.iconBtn('more', 'More', e => UI.menu(e.currentTarget, layerMenuItems(App.activeLayer()), { up: true, right: true })));
    root.innerHTML = '';
    root.append(list, paper, props, foot);

    let dragId = null, ph = null;
    /* Sıralama: sürüklenen satır listeden çekilir, bırakılacağı yerde kesik çizgili boş bir kutu açılır ve alttaki
       satırlar aşağı kayar; kullanıcı katmanın tam nereye gireceğini görür. Kutunun yeri imlecin, satırların ortasına
       göre konumuyla belirlenir. Listenin altındaki boşluğa bırakmak en alta koyar. */
    const clearMark = () => { if (ph) ph.remove(); ph = null; list.querySelectorAll('.drag-hide').forEach(r => r.classList.remove('drag-hide')); };
    const liveRows = () => [...list.querySelectorAll('.ly-row:not(.drag-hide)')];
    list.addEventListener('dragover', e => {
      if (!dragId || !ph) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      // yerleşimdeki konum (kayma animasyonu sürerken de titremesin diye animasyonun kaydırması çıkarılır)
      const topOf = r => { const q = r.getBoundingClientRect(), tf = getComputedStyle(r).transform; return q.top - (tf && tf !== 'none' ? new DOMMatrix(tf).m42 : 0); };
      const next = liveRows().find(r => e.clientY < topOf(r) + r.offsetHeight / 2) || null;
      if (next ? ph.nextElementSibling === next : ph === list.lastElementChild) return;
      // satırlar yeni yerlerine anında atlamaz, kısa bir kaydırmayla gider
      const rows = liveRows(), before = rows.map(r => r.getBoundingClientRect().top);
      list.insertBefore(ph, next);
      if (App.motion()) rows.forEach((r, k) => {
        const d = before[k] - r.getBoundingClientRect().top;
        if (d) r.animate([{ transform: `translateY(${d}px)` }, { transform: 'none' }], { duration: 140, easing: 'ease-out' });
      });
    });
    list.addEventListener('dragenter', e => { if (dragId) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } });
    list.addEventListener('drop', e => {
      e.preventDefault();
      const id = dragId, d = App.doc;
      if (!ph || !id || !d) { clearMark(); return; }
      // kutunun altındaki satırın üstüne; kutu en alttaysa son satırın altına
      let next = ph.nextElementSibling;
      while (next && !next.classList.contains('ly-row')) next = next.nextElementSibling;
      const rows = liveRows(), s = next ? { row: next, above: true } : rows.length ? { row: rows[rows.length - 1], above: false } : null;
      clearMark();
      if (!s) return;
      const i = d.layers.findIndex(l => l.id === id), j = d.layers.findIndex(l => l.id === s.row.dataset.id);
      if (i < 0 || j < 0 || i === j) return;
      // dizide üst = büyük indeks; i çıkarılınca j'den sonrakiler bir kayar
      const to = s.above ? (i < j ? j : j + 1) : (i < j ? j - 1 : j);
      if (to === i) return;
      App.moveLayer(id, to);
      App.commit('Layer Order');
    });
    const refresh = () => {
      list.innerHTML = '';
      const d = App.doc;
      if (!d) return;
      // silinmiş katmanları seçimden çıkar
      for (const id of [...multi]) if (!d.layers.some(l => l.id === id)) multi.delete(id);
      for (let i = d.layers.length - 1; i >= 0; i--) {
        const L = d.layers[i];
        const name = h('div', { class: 'ly-name' }, L.name);
        const sub = h('div', { class: 'ly-sub' }, L.type === 'group' ? App.t('Group, {0} layers', L.children.length)
          : { raster: 'Image', text: 'Text', shape: 'Shape', frame: 'Frame', overlay: 'Overlay' }[L.type] || '');
        const eye = h('button', { class: 'ly-ic' + (L.visible ? '' : ' off'), title: 'Show/Hide', html: App.icon(L.visible ? 'eye' : 'eyeOff', 16) });
        eye.onclick = e => { e.stopPropagation(); L.visible = !L.visible; App.commit(L.visible ? 'Show Layer' : 'Hide Layer'); refresh(); App.requestRender(); };
        const lock = h('button', { class: 'ly-ic' + (L.locked ? ' on' : ' dimmed'), title: 'Lock Position', html: App.icon(L.locked ? 'lock' : 'unlock', 15) });
        // simge hemen güncellensin (kayıt listeyi kendiliğinden yenilemez)
        lock.onclick = e => { e.stopPropagation(); L.locked = !L.locked; App.commit(L.locked ? 'Lock' : 'Unlock'); refresh(); App.requestRender(); };
        const row = h('div', {
          class: 'ly-row' + (L.id === d.active ? ' on' : '') + (multi.has(L.id) && L.id !== d.active ? ' sel' : '') + (L.visible ? '' : ' hidden'), draggable: 'true',
          onclick: e => pick(L, e),
          ondblclick: () => renameLayer(L),
          oncontextmenu: e => {
            e.preventDefault();
            if (multi.has(L.id)) activate(L.id);
            else if (L.id !== d.active) { multi.clear(); App.setActive(L.id); }
            UI.menu(null, layerMenuItems(L), { at: { x: e.clientX, y: e.clientY } });
          },
        }, thumb(L), h('div', { class: 'ly-info' }, name, sub), lock, eye);
        row.dataset.id = L.id;
        // veri yazılmazsa tarayıcı sürüklemeyi "bırakılamaz" sayar ve imleç yasak işaretine döner
        row.addEventListener('dragstart', e => {
          dragId = L.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', L.name || 'layer');
          // satır, sürükleme resmi alındıktan sonra gizlenir; yerinde aynı boyda kesik çizgili kutu açılır
          const hgt = row.offsetHeight;
          setTimeout(() => { if (dragId !== L.id) return; ph = h('div', { class: 'ly-ph' }); ph.style.height = hgt + 'px'; row.after(ph); row.classList.add('drag-hide'); }, 0);
        });
        row.addEventListener('dragend', () => { dragId = null; clearMark(); });
        list.appendChild(row);
      }
      syncPaper();
      const A = App.activeLayer();
      props.classList.toggle('dim', !A);
      if (A) { blend.value = A.blend || 'source-over'; op.set(Math.round(A.opacity * 100)); }
    };
    blend.onchange = () => { const A = App.activeLayer(); if (A) { A.blend = blend.value; App.commit('Blend Mode'); } };
    let opTimer;
    op.el.querySelector('input[type=range]').addEventListener('input', () => {
      const A = App.activeLayer(); if (!A) return;
      A.opacity = op.get() / 100; App.requestRender();
    });
    const opCommit = () => { const A = App.activeLayer(); if (A) { A.opacity = op.get() / 100; clearTimeout(opTimer); opTimer = setTimeout(() => App.commit('Opacity'), 50); } };
    op.el.querySelector('input[type=range]').addEventListener('change', opCommit);
    op.el.querySelector('input[type=number]').addEventListener('change', opCommit);
    const deb = U.debounce(refresh, 30);
    App.on('doc', deb); App.on('active', deb); App.on('docopen', deb);
    UI.refreshLayers = refresh;
  };

  UI.buildHistory = () => {
    const root = document.getElementById('historyList');
    const pane = document.getElementById('historyPane');
    if (!pane.querySelector('.ly-foot')) {
      pane.appendChild(h('div', { class: 'ly-foot hs-foot' },
        h('span', { class: 'note hs-count' }),
        UI.button('Clear History', () => App.actions.clearHistory(), { small: true, icon: 'trash', cls: 'ghost' })));
    }
    const refresh = () => {
      const cnt = pane.querySelector('.hs-count');
      if (cnt) cnt.textContent = App.t('{0} / {1} steps', Math.max(0, App.history.stack.length - 1), App.history.max);
      root.innerHTML = '';
      const H = App.history;
      H.stack.forEach((s, i) => {
        root.appendChild(h('button', { class: 'hs-row' + (i === H.index ? ' on' : '') + (i > H.index ? ' future' : ''), onclick: () => H.go(i) },
          h('span', { class: 'hs-ico', html: App.icon(i === 0 ? 'image' : 'history', 14) }), h('span', null, s.label)));
      });
      const on = root.querySelector('.on');
      if (on) on.scrollIntoView({ block: 'nearest' });
      UI.syncUndo();
    };
    App.on('history', refresh);
  };

  /* ------------------------------------------------------------ alt çubuk */
  UI.buildBottom = () => {
    const zl = document.getElementById('zoomLabel');
    App.on('view', () => { zl.textContent = Math.round(App.view.zoom * 100) + '%'; });
    const info = document.getElementById('docInfo');
    const upd = () => { const d = App.doc; info.textContent = d ? `${d.w} × ${d.h} px` : ''; };
    App.on('doc', upd); App.on('docopen', upd);
    const pos = document.getElementById('cursorPos');
    App.on('pointer', p => {
      const d = App.doc;
      pos.textContent = d && p.x >= 0 && p.y >= 0 && p.x <= d.w && p.y <= d.h ? `${Math.floor(p.x)}, ${Math.floor(p.y)}` : '';
    });
    zl.onclick = () => UI.menu(zl, [
      ...[1000, 800, 400, 300, 200, 150, 100, 75, 50, 33, 25, 10].map(z => ({ label: z + '%', onClick: () => App.setZoom(z / 100) })),
      '-',
      { label: 'Actual Pixels', icon: 'actual', key: K('actual'), onClick: () => App.fit('actual') },
      { label: 'Fill Screen', icon: 'fill', key: K('fill'), onClick: () => App.fit('fill') },
      { label: 'Fit to Screen', icon: 'fit', key: K('fit'), onClick: () => App.fit() },
    ], { up: true });
  };

  /* ------------------------------------------------------------ üst menüler */
  UI.buildMenus = () => {
    const A = () => App.actions;
    const menus = {
      'File': () => [
        { label: 'New…', icon: 'filePlus', key: K('new'), onClick: () => A().newDialog() },
        { label: 'Open…', icon: 'folder', key: K('open'), onClick: () => A().open() },
        { label: 'Add Image as Layer…', icon: 'image', key: K('addImage'), onClick: () => A().addImageLayer() },
        { label: 'Open from URL…', icon: 'link', onClick: () => A().openURL() },
        '-',
        { label: 'Save / Export…', icon: 'save', key: K('save'), onClick: () => A().exportDialog() },
        { label: 'Save Project (.pixtape)', icon: 'fileSave', key: K('saveProject'), onClick: () => A().saveProject() },
        { label: 'Copy to Clipboard', icon: 'clipboard', key: K('copyImage'), onClick: () => A().copyComposite() },
        '-',
        { label: 'Make Collage…', icon: 'collage', onClick: () => App.collage.open() },
        { label: 'Batch Editing…', icon: 'batch', onClick: () => App.batch.open() },
        { label: 'Make GIF…', icon: 'film', onClick: () => App.gif.open() },
        { label: 'Compress Images…', icon: 'compress', onClick: () => App.compress.open() },
        '-',
        { label: 'Close Tab', icon: 'close', key: K('closeTab'), onClick: () => A().close() },
      ],
      'Edit': () => [
        { label: 'Undo', icon: 'undo', key: K('undo'), disabled: !App.history.canUndo(), onClick: () => App.history.undo() },
        { label: 'Redo', icon: 'redo', key: K('redo'), disabled: !App.history.canRedo(), onClick: () => App.history.redo() },
        '-',
        { label: 'Copy Layer', icon: 'copy', key: K('copyLayer'), onClick: () => A().copyLayer() },
        { label: 'Paste', icon: 'clipboard', key: 'Ctrl+V', onClick: () => A().pasteFromClipboard() },
        { label: 'Duplicate', icon: 'duplicate', key: K('duplicate'), onClick: () => A().duplicate() },
        { label: 'Delete Layer', icon: 'trash', key: K('deleteLayer'), onClick: () => A().deleteLayer() },
        '-',
        { label: 'Settings…', icon: 'settings', onClick: () => A().settings() },
        { label: 'Clear History…', icon: 'trash', onClick: () => A().clearHistory() },
      ],
      'Image': () => [
        { label: 'Auto Enhance', icon: 'wand', onClick: () => A().autoFix() },
        '-',
        { label: 'Rotate Left 90°', icon: 'rotL', onClick: () => A().rotate(-90) },
        { label: 'Rotate Right 90°', icon: 'rotR', onClick: () => A().rotate(90) },
        { label: 'Flip Horizontal', icon: 'flipH', onClick: () => A().flip('h') },
        { label: 'Flip Vertical', icon: 'flipV', onClick: () => A().flip('v') },
        '-',
        { label: 'Image Size…', icon: 'scale', onClick: () => A().resizeDialog() },
        { label: 'Canvas Size…', icon: 'canvasSize', onClick: () => A().canvasDialog() },
        { label: 'Trim Transparent Edges', icon: 'crop', onClick: () => A().trim() },
      ],
      'Layer': () => [
        { label: 'New Empty Layer', icon: 'layerAdd', key: K('newLayer'), onClick: () => A().newEmptyLayer() },
        { label: 'Add Image…', icon: 'image', onClick: () => A().addImageLayer() },
        { label: 'Color Fill Layer', icon: 'bucket', onClick: () => A().fillLayer() },
        '-',
        { label: 'Duplicate', icon: 'duplicate', key: K('duplicate'), onClick: () => A().duplicate() },
        { label: 'Merge Selected Layers', icon: 'merge', disabled: UI.selectedLayers().length < 2, onClick: () => A().mergeSelected() },
        { label: 'Merge Down', icon: 'mergeDown', key: K('mergeDown'), onClick: () => A().mergeDown() },
        { label: 'Merge Visible', icon: 'merge', key: K('mergeVisible'), onClick: () => A().mergeVisible() },
        { label: 'Flatten Image', icon: 'flatten', onClick: () => A().flatten() },
        { label: 'Rasterize', icon: 'raster', onClick: () => A().rasterize() },
        '-',
        { label: 'Group Layers', icon: 'folder', key: K('group'), disabled: UI.selectedLayers().length < 2, onClick: () => A().groupLayers() },
        { label: 'Ungroup', icon: 'folder', key: K('ungroup'), disabled: !(App.activeLayer() && App.activeLayer().type === 'group'), onClick: () => A().ungroupLayer() },
        { label: 'Lock / Unlock Layer', icon: 'lock', key: K('lockLayer'), disabled: !App.activeLayer(), onClick: () => A().toggleLock() },
        '-',
        { label: 'Bring to Front', icon: 'front', key: K('layerTop'), onClick: () => A().order('top') },
        { label: 'Bring Forward', icon: 'up', key: K('layerUp'), onClick: () => A().order('up') },
        { label: 'Send Backward', icon: 'down', key: K('layerDown'), onClick: () => A().order('down') },
        { label: 'Send to Back', icon: 'back', key: K('layerBottom'), onClick: () => A().order('bottom') },
        '-',
        { label: 'Delete Layer', icon: 'trash', key: K('deleteLayer'), onClick: () => A().deleteLayer() },
      ],
      'View': () => [
        { label: 'Zoom In', icon: 'zoomIn', key: K('zoomIn'), onClick: () => App.setZoom(App.view.zoom * 1.25) },
        { label: 'Zoom Out', icon: 'zoomOut', key: K('zoomOut'), onClick: () => App.setZoom(App.view.zoom / 1.25) },
        { label: 'Fit to Screen', icon: 'fit', key: K('fit'), onClick: () => App.fit() },
        { label: 'Actual Pixels', icon: 'actual', key: K('actual'), onClick: () => App.fit('actual') },
        { label: 'Fill Screen', icon: 'fill', key: K('fill'), onClick: () => App.fit('fill') },
        '-',
        { label: 'Grid', icon: 'grid', checked: App.showGrid, key: K('grid'), onClick: () => A().toggleGrid() },
        { label: 'Grid Settings…', icon: 'grid', onClick: () => A().gridMenu(document.querySelector('#menubar .mb-item:nth-child(5)')) },
        { label: 'Hold for Before / After', icon: 'compare', key: K('compare'), onClick: () => UI.toast(App.t('Hold {0} to compare', K('compare'))) },
        { label: 'Show/Hide Layers and History', icon: 'panels', key: K('panels'), onClick: () => A().togglePanels() },
        { label: 'Full Screen', icon: 'fullscreen', key: 'F11', onClick: () => A().fullscreen() },
        '-',
        { label: 'Light Theme', icon: 'sun', checked: document.documentElement.dataset.theme === 'light', onClick: () => A().toggleTheme() },
        { header: 'Layout' },
        ...App.layout.menuItems(),
      ],
      'Help': () => [
        { label: 'Keyboard Shortcuts', icon: 'keyboard', key: K('help'), onClick: () => A().shortcuts() },
        { label: 'About Pixtape', icon: 'info', onClick: () => A().about() },
        { label: 'Support Pixtape', icon: 'heart', onClick: () => A().support() },
      ],
    };
    const bar = document.getElementById('menubar');
    bar.innerHTML = '';
    for (const name in menus) {
      const b = h('button', { class: 'mb-item', onclick: () => UI.menu(b, menus[name]()) }, name);
      b.addEventListener('mouseenter', () => { if (document.querySelector('.menu')) UI.menu(b, menus[name]()); });
      bar.appendChild(b);
    }
  };
})();
