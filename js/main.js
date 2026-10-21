'use strict';
/* Pixtape - eylemler, ana ekran, kısayollar, başlatma */
(() => {
  const { U, ui: UI, IMG } = App;
  const h = U.h;
  const K = id => (App.shortcuts ? App.shortcuts.label(id) : '');
  const $id = id => document.getElementById(id);

  /* ------------------------------------------------------------ ekranlar */
  App.showHome = async () => {
    UI.closePopups();
    document.body.classList.add('at-home');
    document.body.classList.remove('at-editor');
    await renderHome();
    // açık belge henüz kaydedilmediyse (ör. yeni oluşturulup hemen ana ekrana dönüldüyse) ya da son değişiklikleri
    // otomatik kayıt beklemesindeyse hemen kaydedilir ve listede görünür
    const d = App.doc, e = d && App.tabs && App.tabs.entry(d);
    if (d && App.prefs.autosave && ((e && e.dirty) || !(await App.storage.has(d.id)))) {
      if (e) e.dirty = false;
      await App.storage.saveCurrent();
      if (document.body.classList.contains('at-home')) await renderHome();
    }
  };
  // keepView: sekme değiştirirken yakınlaştırma ve konum korunur
  App.showEditor = keepView => {
    document.body.classList.remove('at-home');
    document.body.classList.add('at-editor');
    App.resizeView();
    if (App.doc && keepView !== true) App.fit('limit');
    App.tabs.render();
  };

  const QUICK = [
    // [görünen ad, genişlik, yükseklik, belge adı (dosya adı olarak kullanılır, her dilde İngilizce)]
    ['Instagram Post', 1080, 1080, 'Instagram post'], ['Instagram Story', 1080, 1920, 'Instagram story'], ['YouTube Thumbnail', 1280, 720, 'YouTube thumbnail'],
    ['Facebook Cover', 820, 312, 'Facebook cover'], ['Full HD', 1920, 1080, 'Full HD'], ['A4 Print', 2480, 3508, 'A4 print'],
  ];

  /* Özellik adresleri (js/pages.js): bir özelliğin penceresi açılınca adres (ör. /compress-image/) ve sekme başlığı
     onunkine döner, kapanınca eski hâline; tarayıcının geri / ileri tuşları pencereyi kapatıp açar. O adresle
     doğrudan gelinince pencere kendiliğinden açılır. open: kendi penceresi olan özellik. Resim gerektiren
     özelliklerde (tool / then) önce resim seçme penceresi gelir; resim açılınca araç başlar. */
  const HOME_TITLE = 'Pixtape - Easy Photo Editor';
  const FEATURES = {
    'remove-background': { sub: 'Remove Image Backgrounds for Free', name: 'Remove Background', icon: 'cutout', tool: 'cutout', then: t => t.L && t.ai(),
      note: 'The background is removed automatically as soon as the photo opens. Your photo never leaves your device.' },
    'compress-image': { sub: 'Compress Images Without Losing Quality', open: () => App.compress.open() },
    'resize-image': { sub: 'Resize Images to Any Size', name: 'Resize Image', icon: 'scale', then: () => App.actions.resizeDialog(),
      note: 'Choose a photo, then enter the new width and height or a percentage.' },
    'crop-image': { sub: 'Crop Photos in Your Browser', name: 'Crop Image', icon: 'crop', tool: 'crop',
      note: 'Choose a photo, then drag the frame or pick a ratio such as 1:1 or 16:9.' },
    'add-text-to-photo': { sub: 'Add Text to Your Photos', name: 'Add Text to Photo', icon: 'text', tool: 'text',
      note: 'Choose a photo, then add your own text or pick one of the ready-made templates.' },
    'collage-maker': { sub: 'Make Photo Collages for Free', open: () => App.collage.open() },
    'gif-maker': { sub: 'Make GIFs from Images or Video', open: () => App.gif.open() },
  };
  const slugOf = () => location.pathname.split('/').filter(Boolean)[0] || '';
  let feature = null;    // açık özellik penceresi: { slug, wrap, back, title }
  let startWith = null;  // seçilen resim açılınca başlayacak özellik
  const homeSub = () => FEATURES[slugOf()] ? FEATURES[slugOf()].sub : 'Easy Photo Editor';
  const syncSub = () => { const p = document.querySelector('.home-brand p'); if (p) p.textContent = App.t(homeSub()); };

  // Resim seçme penceresi: resim açılınca pencere kapanır ve özelliğin aracı başlar
  const startDialog = F => {
    let close = null;
    const go = async fs => {
      const f = fs && fs.find(x => !App.PROJECT_RE.test(x.name));
      if (!f) return;
      close(null);
      startWith = F;
      try { await App.actions.openFiles([f]); } finally { startWith = null; }
      if (App.doc) App.showEditor();
    };
    const drop = h('div', { class: 'home-drop start-drop' },
      h('span', { html: App.icon('upload', 28) }), h('b', null, 'Drag and Drop a Photo Here'),
      UI.button('Open Image', async () => go(await App.actions.pickFile('image/*')), { primary: true, icon: 'folder' }));
    drop.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); drop.classList.add('over'); } });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', e => { drop.classList.remove('over'); if (!e.dataTransfer.files.length) return; e.preventDefault(); e.stopPropagation(); go([...e.dataTransfer.files]); });
    UI.modal({ title: F.name, width: 460, content: h('div', null, drop, UI.note(F.note)), onOpen: (box, c) => { close = c; } });
    if (F.tool === 'cutout' && App.tools.cutout.canPrefetch()) App.tools.cutout.preloadAI().catch(() => {});
  };

  App.openFeature = (slug, push = true) => {
    const F = FEATURES[slug];
    if (!F) return;
    const root = document.getElementById('modals'), before = new Set(root.children);
    if (F.open) F.open(); else startDialog(F);
    const wrap = [...root.children].find(w => !before.has(w));
    if (!wrap) return;
    const here = slugOf() === slug;
    if (push && !here) history.pushState({ feature: slug }, '', '/' + slug + '/');
    // back: önceki adres geçmişte duruyor (geri gidilir); yoksa (doğrudan gelindiyse) adres ana sayfayla değiştirilir
    feature = { slug, wrap, back: !here || !!(history.state && history.state.feature === slug), title: here ? HOME_TITLE : document.title };
    const P = App.PAGES.find(p => p.slug === slug);
    if (P) document.title = P.title;
    syncSub();
  };
  // pencere nasıl kapanırsa kapansın (Kapat, Esc, Düzenleyicide Aç...) adres ve başlık geri döner
  const featureClosed = () => {
    const F = feature;
    feature = null;
    if (slugOf() === F.slug) { if (F.back) history.back(); else history.replaceState(null, '', '/'); }
    if (document.title === (App.PAGES.find(p => p.slug === F.slug) || {}).title) document.title = F.title;
    syncSub();
  };
  window.addEventListener('popstate', () => {
    const s = slugOf();
    if (feature && feature.slug !== s) {
      const F = feature;
      feature = null;
      const x = F.wrap.querySelector('.modal-head .icon-btn');
      if (x) x.click(); else F.wrap.remove();
      if (document.title === (App.PAGES.find(p => p.slug === F.slug) || {}).title) document.title = F.title;
    }
    if (!feature && FEATURES[s] && document.body.classList.contains('at-home')) App.openFeature(s, false);
    syncSub();
  });

  async function renderHome() {
    const root = document.getElementById('home');
    // Liste önce okunur, sonra sayfa tek seferde yeniden kurulur ve kaydırma konumu korunur (titreme olmaz)
    const list = await App.storage.list();
    const oldMain = root.querySelector('.home-main'), keepScroll = oldMain ? oldMain.scrollTop : 0;
    root.innerHTML = '';
    const A = App.actions, I = App.i18n;
    const big = (icon, title, sub, fn, primary) => {
      const b = h('button', { class: 'home-card' + (primary ? ' primary' : ''), onclick: fn });
      b.innerHTML = `<span class="hc-ico">${App.icon(icon, 26)}</span><span class="hc-t">${title}</span><span class="hc-s">${sub}</span>`;
      return b;
    };
    // Sol gezinme çubuğu
    const navBtn = (icon, label, fn, cls) => {
      const b = h('button', { class: 'hn-item' + (cls ? ' ' + cls : ''), onclick: fn });
      b.innerHTML = (icon === 'heart' ? App.heartIcon(18) : App.icon(icon, 18)) + `<span>${label}</span>`;
      return b;
    };
    const langBtn = h('button', { class: 'hn-item hn-lang', title: App.t('Language'), 'data-noi18n': '' });
    const curLang = I.LANGS.find(l => l[0] === I.lang) || I.LANGS[0];
    // bayrak diğer satırlardaki ikonlarla aynı genişlikte (18 px): yazılar aynı hizadan başlar
    langBtn.innerHTML = I.flag(curLang[0], 18) + `<span>${curLang[1]}</span>`;
    langBtn.onclick = () => UI.menu(langBtn, I.LANGS.map(([v, n]) => ({ label: n, iconHTML: I.flag(v, 18), checked: v === I.lang, onClick: () => I.set(v) })), { up: true, checkRight: true });
    const side = h('aside', { class: 'home-nav' },
      h('div', { class: 'hn-brand' }, h('div', { class: 'logo', html: logoSVG() }), h('b', null, 'Pixtape')),
      h('div', { class: 'hn-group' },
        navBtn('folder', 'Open Image', () => A.open()),
        navBtn('filePlus', 'Create New', () => A.newDialog())),
      h('div', { class: 'hn-label' }, 'Tools'),
      h('div', { class: 'hn-group' },
        navBtn('cutout', 'Remove Background', () => App.openFeature('remove-background')),
        navBtn('collage', 'Collage', () => App.openFeature('collage-maker')),
        navBtn('batch', 'Batch Editing', () => App.batch.open()),
        navBtn('film', 'Make GIF', () => App.openFeature('gif-maker')),
        navBtn('compress', 'Compress Images', () => App.openFeature('compress-image'))),
      h('div', { class: 'spacer' }),
      h('div', { class: 'hn-group' },
        langBtn,
        navBtn('settings', 'Settings', () => A.settings()),
        navBtn('keyboard', 'Keyboard Shortcuts', () => A.shortcuts()),
        navBtn('info', 'About', () => A.about()),
        navBtn('heart', 'Support Pixtape', () => A.support(), 'hn-support')));

    // Açık sekmeler (düzenlemeye dönüş)
    const open = App.tabs.list;
    const goTab = e => { if (e.doc === App.doc) App.showEditor(true); else App.tabs.switchTo(e); };
    // Çok sekme varsa ilk 5 tanesi görünür, kalanlar "+N" düğmesinin menüsünde
    const shown = open.length > 6 ? open.slice(0, 5) : open, rest = open.slice(shown.length);
    const more = rest.length ? h('button', {
      class: 'ho-chip ho-more', title: 'Other Open Tabs',
      onclick: ev => UI.menu(ev.currentTarget, rest.map(e => ({ label: e.doc.name, icon: 'image', checked: e.doc === App.doc, noi18n: true, onClick: () => goTab(e) }))),
    }, h('span', null, '+' + rest.length)) : null;
    const hero = h('div', { class: 'home-hero' },
      h('div', { class: 'home-brand' }, h('div', null, h('h1', null, 'Pixtape'), h('p', null, homeSub()))),
      open.length ? h('div', { class: 'home-open' },
        h('span', { class: 'note' }, App.t('Open Tabs ({0})', open.length)),
        h('div', { class: 'ho-list' }, shown.map(e => h('button', { class: 'ho-chip' + (e.doc === App.doc ? ' on' : ''), title: 'Back to Editing', onclick: () => goTab(e) },
          e.thumb ? h('img', { src: e.thumb, alt: '' }) : h('span', { html: App.icon('image', 14) }), h('span', { 'data-noi18n': '' }, e.doc.name))), more)) : null);
    const cards = h('div', { class: 'home-cards' },
      big('folder', 'Open Image', 'JPG, PNG, WEBP, GIF, BMP, SVG, .pixtape', () => A.open(), true),
      big('filePlus', 'Create New', 'Blank Canvas or Preset Size', () => A.newDialog()),
      big('collage', 'Make Collage', '16 Different Layouts', () => App.openFeature('collage-maker')),
      big('batch', 'Batch Editing', 'Process Many Photos at Once', () => App.batch.open()),
      big('film', 'Make GIF', 'From Images or Video', () => App.openFeature('gif-maker')),
      big('compress', 'Compress Images', 'Shrink While Keeping Quality', () => App.openFeature('compress-image')));
    const drop = h('div', { class: 'home-drop' }, h('span', { html: App.icon('upload', 28) }), h('b', null, 'Drag and Drop a Photo Here'), h('span', null, 'If you drop several images, you can open each in its own tab or all in one project'));
    const quick = h('div', { class: 'home-quick' }, QUICK.map(([n, w, hh, en]) => {
      const r = w / hh, bw = r >= 1 ? 54 : 54 * r, bh = r >= 1 ? 54 / r : 54;
      return h('button', { class: 'quick-size', onclick: () => { App.newDoc({ w, h: hh, name: App.i18n.lang === 'en' ? en : App.t(n), bg: '#ffffff' }); App.showEditor(); } },
        h('span', { class: 'qs-box' }, h('i', { style: { width: bw + 'px', height: bh + 'px' } })), h('b', null, n), h('small', null, `${w} x ${hh}`));
    }));
    const recentWrap = h('div', { class: 'home-recent' + (homeSel ? ' selecting' : '') });
    const recentActs = h('div', { class: 'rc-tools' });
    root.append(h('div', { class: 'home-shell' }, side, h('main', { class: 'home-main' }, h('div', { class: 'home-inner' }, hero, cards, drop,
      h('h2', null, 'Quick Start'), quick,
      h('div', { class: 'row between rc-head' }, h('div', { class: 'rc-title' }, h('h2', null, 'Recent Projects'), h('span', { class: 'note' }, !App.prefs.autosave ? 'Autosave Is Off (Settings)'
        : +App.prefs.keepProjects > 0 ? App.t('The last {0} projects are kept and older ones are deleted automatically. Pinned projects are never deleted.', App.prefs.keepProjects)
          : 'Projects are saved in this browser automatically and are kept until you delete them'),
        +App.prefs.keepProjects > 0 ? h('button', { class: 'link-btn', onclick: () => A.settings('History and Saving') }, 'Change') : null), recentActs),
      recentWrap))));
    const main = root.querySelector('.home-main');
    /* İçerik sığıyorsa sayfa kaymasın: taşan kısım yalnızca alttaki boşluk (ya da yarım piksel) ise boşluk o kadar azaltılır */
    const inner = main.firstElementChild;
    const fitPad = () => {
      inner.style.paddingBottom = '';
      const extra = main.scrollHeight - main.clientHeight, pb = parseFloat(getComputedStyle(inner).paddingBottom) || 0;
      if (extra > 0 && extra <= pb + 1) inner.style.paddingBottom = Math.max(0, pb - extra - 1) + 'px';
    };
    if (homeFit) homeFit.disconnect();
    homeFit = new ResizeObserver(fitPad);
    homeFit.observe(main); homeFit.observe(inner);
    requestAnimationFrame(() => { main.scrollTop = keepScroll; });
    main.scrollTop = keepScroll;
    if (!list.length) { homeSel = null; recentWrap.appendChild(h('div', { class: 'rc-empty' }, h('span', { html: App.icon('image', 30) }), h('p', null, 'No projects yet. They will appear here when you open an image.'))); fitPad(); return; }

    // Seçme modu: kartlara tıklayarak birden çok proje seçilip tek seferde silinir
    const delMany = async ids => {
      for (const id of ids) { await App.storage.remove(id); await App.tabs.forget(id); }
      homeSel = null;
      UI.toast(App.t('{0} projects deleted', ids.length), 'ok');
      renderHome();
    };
    // Seçme moduna girip çıkarken kartlar yeniden oluşturulmaz (sayfa kaymaz, resimler yeniden yüklenmez)
    const cardEls = [];
    const setSel = s => {
      homeSel = s;
      recentWrap.classList.toggle('selecting', !!homeSel);
      for (const [id, card, btn] of cardEls) {
        card.classList.toggle('sel', !!(homeSel && homeSel.has(id)));
        btn.draggable = !homeSel;
        btn.title = homeSel ? '' : App.t('Click to open. Drag and drop to open a copy.');
      }
      syncActs();
    };
    const syncActs = () => {
      recentActs.innerHTML = '';
      if (homeSel) {
        const n = homeSel.size;
        recentActs.append(
          h('span', { class: 'note' }, App.t('{0} selected', n)),
          UI.button(n === list.length ? 'Clear Selection' : 'Select All', () => setSel(n === list.length ? new Set() : new Set(list.map(p => p.id))), { small: true, cls: 'ghost' }),
          UI.button('Open Selected', () => openMany(), { small: true, icon: 'folder', title: 'Each Selected Project Opens in Its Own Tab (Enter)' }),
          UI.button('Delete Selected', async () => {
            if (!n) { UI.toast('First select the projects to delete', 'warn'); return; }
            if (await UI.confirm(App.t('Delete the {0} selected projects? This cannot be undone.', n), 'Delete', true)) delMany([...homeSel]);
          }, { small: true, danger: true, icon: 'trash' }),
          UI.button('Done', () => setSel(null), { small: true }));
      } else {
        recentActs.append(
          UI.button('Select', () => setSel(new Set()), { small: true, cls: 'ghost', icon: 'check', title: 'Select and Delete Several Projects' }),
          UI.button('Delete All', async () => {
            const pinned = list.filter(p => p.pinned).length;
            const msg = App.t('Delete all {0} recent projects? This cannot be undone.', list.length) + (pinned ? ' ' + App.t('{0} pinned projects will also be deleted.', pinned) : '');
            if (await UI.confirm(msg, 'Delete All', true)) delMany(list.map(p => p.id));
          }, { small: true, cls: 'ghost', icon: 'trash' }));
      }
    };
    syncActs();
    const openP = async p => { try { await App.busy('Opening project…', () => App.storage.load(p.id)); App.showEditor(); } catch (e) { UI.toast(e.message, 'error'); } };
    // Seçili projelerin her biri kendi sekmesinde açılır (liste sırasıyla)
    const openMany = async () => {
      const ids = list.filter(p => homeSel && homeSel.has(p.id)).map(p => p.id);
      if (!ids.length) { UI.toast('First select the projects to open', 'warn'); return; }
      homeSel = null;
      await App.busy('Opening project…', async prog => {
        for (let i = 0; i < ids.length; i++) {
          try { await App.storage.load(ids[i]); } catch (e) { UI.toast(e.message, 'error'); }
          if (ids.length > 1) prog((i + 1) / ids.length);
        }
      });
      if (App.doc) App.showEditor();
    };
    homeOpenSel = openMany;
    homeEndSel = () => setSel(null);
    for (const p of list) {
      const sel = homeSel && homeSel.has(p.id);
      const img = h('img', { src: p.thumb || '', alt: '', draggable: 'false' });
      const thumbBtn = h('button', {
        class: 'rc-thumb', draggable: homeSel ? 'false' : 'true', title: homeSel ? '' : 'Click to open. Drag and drop to open a copy.',
        onclick: () => {
          if (!homeSel) { openP(p); return; }
          if (homeSel.has(p.id)) homeSel.delete(p.id); else homeSel.add(p.id);
          card.classList.toggle('sel', homeSel.has(p.id));
          syncActs();
        },
      }, img, h('span', { class: 'rc-check', html: App.icon('check', 16) }));
      const card = h('div', { class: 'rc-card' + (p.pinned ? ' pinned' : '') + (sel ? ' sel' : '') },
        thumbBtn,
        p.pinned ? h('span', { class: 'rc-pinmark', title: 'Pinned', html: App.icon('pin', 14) }) : null,
        h('div', { class: 'rc-info' }, h('b', { 'data-noi18n': '' }, p.name), h('small', null, `${p.w}x${p.h} · ${new Date(p.updated).toLocaleString(I.locale(), { dateStyle: 'short', timeStyle: 'short' })}`)),
        h('div', { class: 'rc-acts' },
          UI.iconBtn(p.pinned ? 'pinOff' : 'pin', p.pinned ? 'Unpin' : 'Pin (won\'t Be Deleted Automatically)', async () => { await App.storage.pin(p.id, !p.pinned); renderHome(); }),
          UI.iconBtn('trash', 'Delete', async () => { if (await UI.confirm(App.t('Delete the project "{0}"?', p.name), 'Delete', true)) { await App.storage.remove(p.id); await App.tabs.forget(p.id); renderHome(); } })));
      // Sürükleyip bırakınca projenin kopyası yeni sekmede açılır; kartın üzerine geri bırakmak iptal eder
      thumbBtn.addEventListener('dragstart', e => {
        if (homeSel) { e.preventDefault(); return; }
        e.dataTransfer.setData(PROJ_MIME, p.id);
        e.dataTransfer.effectAllowed = 'copy';
        try { e.dataTransfer.setDragImage(img, img.width / 2, img.height / 2); } catch (err) { /* */ }
        projDrag = { id: p.id, card };
      });
      thumbBtn.addEventListener('dragend', () => { projDrag = null; dropOverlay().classList.remove('show'); });
      cardEls.push([p.id, card, thumbBtn]);
      recentWrap.appendChild(card);
    }
    fitPad();
  }
  let homeSel = null;         // seçme modunda seçilen proje kimlikleri
  let homeOpenSel = null;      // seçili projeleri açar (Enter)
  let homeFit = null;          // ana sayfanın gereksiz kaymasını önleyen gözlemci
  // Bir kenarın en fazla boyutu: tarayıcının oluşturabildiği en büyük kare tuval (16384 × 16384)
  const MAX_SIDE = 16384;
  let gridArgs = null;         // açık ızgara menüsünün konumu (G ile yenilenince aynı yerde açılır)
  let homeEndSel = null;       // seçme modundan çıkar (Esc)
  document.addEventListener('keydown', e => {
    if (!homeSel || !document.body.classList.contains('at-home')) return;
    if (document.querySelector('.modal-wrap') || (e.target.closest && e.target.closest('input, textarea, select, [contenteditable]'))) return;
    if (e.key === 'Enter' && homeSel.size && homeOpenSel) { e.preventDefault(); homeOpenSel(); }
    // Esc seçme modunu kapatır; odaklı kartın etrafında klavye odak çerçevesi kalmasın diye odak bırakılır
    else if (e.key === 'Escape' && homeEndSel) { e.preventDefault(); if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); homeEndSel(); }
  });
  let projDrag = null;         // son projelerden sürüklenen kart
  const PROJ_MIME = 'application/x-pixtape-project';
  App.renderHome = renderHome;

  let logoN = 0;
  const logoSVG = () => {
    const id = 'lg' + (++logoN);
    return `<svg viewBox="0 0 48 48" width="100%" height="100%"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7c5cff"/><stop offset="1" stop-color="#00c2ff"/></linearGradient></defs><rect x="2" y="2" width="44" height="44" rx="12" fill="url(#${id})"/><circle cx="24" cy="26.7" r="10" fill="none" stroke="#fff" stroke-width="3.2"/><circle cx="24" cy="26.7" r="3.6" fill="#fff"/><path d="M15 14.2h5l2.5-3h5" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  };
  App.logoSVG = logoSVG;
  App.VERSION = '1.2';
  // program içi sürüklemeler yalnızca bu türü taşır; tarayıcı sekme çubuğu onu metin sanıp aramaz
  App.DRAG_MIME = 'application/x-pixtape';
  // Proje dosyası uzantısı
  App.PROJECT_RE = /\.pixtape$/i;
  // Bağış bağlantısı ("Pixtape'i destekleyin" penceresindeki düğme). Boş bırakılırsa düğme gösterilmez.
  const DONATE_URL = 'https://github.com/sponsors/bcanusar';
  // Kaynak kodun bulunduğu depo (AGPL-3.0 gereği uygulamadan bağlantı verilir)
  const SOURCE_URL = 'https://github.com/pixtape/pixtape.github.io';

  /* ------------------------------------------------------------ eylemler */
  // Katman gerektiren bir işlemde seçili katman yoksa kullanıcı uyarılır
  const layerOrWarn = () => {
    const L = App.activeLayer();
    if (!L && App.doc) UI.toast('No layer selected', 'warn', 1800);
    return L;
  };
  App.layerOrWarn = layerOrWarn;
  const A = App.actions = {
    pickFile(accept = 'image/*', multiple = false) {
      return new Promise(res => {
        const inp = h('input', { type: 'file', accept, multiple, style: { display: 'none' } });
        inp.onchange = () => { res(inp.files.length ? [...inp.files] : null); inp.remove(); };
        window.addEventListener('focus', () => setTimeout(() => { if (!inp.files || !inp.files.length) res(null); }, 600), { once: true });
        document.body.appendChild(inp);
        inp.click();
      });
    },
    async open() {
      const fs = await A.pickFile('image/*,.pixtape,.svg', true);
      if (fs) await A.openFiles(fs);
    },
    async openFiles(fs) {
      // Birden çok resim seçilince sorulur: her biri ayrı sekmede mi, hepsi tek projede katman olarak mı
      const projects = fs.filter(f => App.PROJECT_RE.test(f.name)), imgs = fs.filter(f => !App.PROJECT_RE.test(f.name));
      let mode = 'one';
      if (imgs.length > 1) {
        mode = await UI.choice(App.t('{0} images selected. How should they open?', imgs.length), [['tabs', 'Each in Its Own Tab', true], ['one', 'All in One Project'], [null, 'Cancel']]);
        if (!mode) return;
      }
      for (const f of projects) await A.openFile(f);
      if (!imgs.length) return;
      if (mode === 'tabs') {
        // öncekiler yeni sekme açılırken kaydedilir; sonuncusu da hemen Son projeler listesine girer
        for (const f of imgs) await A.openFile(f);
        if (App.prefs.autosave) await App.storage.saveCurrent();
        return;
      }
      await A.openFile(imgs[0]);
      for (const f of imgs.slice(1)) await A.addImageLayer(f);
    },
    async openFile(file) {
      try {
        if (App.PROJECT_RE.test(file.name)) {
          await App.busy('Opening project…', () => App.storage.importFile(file));
          App.showEditor();
          return;
        }
        if (!file.type.startsWith('image/') && !/\.(jpe?g|png|webp|gif|bmp|svg|avif|ico)$/i.test(file.name)) { UI.toast('Unsupported file type: ' + file.name, 'error'); return; }
        let c = await App.busy('Loading image…', () => U.fileToCanvas(file));
        if (!c) return;
        c = await A.limitSize(c);
        App.openCanvas(c, file.name.replace(/\.[^.]+$/, ''));
        App.showEditor();
      } catch (e) { UI.toast('Could not open: ' + e.message, 'error'); }
    },
    async limitSize(c) {
      const mp = c.width * c.height / 1e6;
      if (mp > 40) {
        const ok = await UI.confirm(App.t('This image is very large ({0} MP). Reduce it to 24 MP for smoother editing?', mp.toFixed(0)), 'Reduce');
        if (ok) { const k = Math.sqrt(24 / mp); return U.scaled(c, c.width * k, c.height * k); }
      }
      return c;
    },
    async openURL() {
      const url = await UI.prompt('Open image from URL', 'https://', 'Image Address');
      if (!url) return;
      try {
        const c = await App.busy('Downloading…', () => U.urlToCanvas(url));
        if (!c) return;
        U.getData(c);
        if (App.doc) A.addCanvasLayer(c, 'URL Image'); else { App.openCanvas(c, App.t('URL image')); App.showEditor(); }
      } catch (e) { UI.toast('The image could not be loaded. The site may not allow it; try downloading the image and opening it.', 'error', 4500); }
    },
    addCanvasLayer(c, name) {
      const d = App.doc;
      // Resim kendi boyutunda eklenir; yalnızca tuvalden büyükse tuvale tam sığacak kadar küçültülür
      const k = Math.min(1, d.w / c.width, d.h / c.height);
      const L = App.newLayer(c, { name: name || 'Image', x: d.w / 2, y: d.h / 2, sx: k, sy: k });
      App.bakeScale(L);
      App.addLayer(L);
      App.commit('Add Image');
      return L;
    },
    async addImageLayer(file) {
      if (!App.doc) return A.open();
      let fs = file ? [file] : await A.pickFile('image/*', true);
      if (!fs) return;
      for (const f of fs) {
        try {
          const c = await U.fileToCanvas(f);
          A.addCanvasLayer(c, f.name.replace(/\.[^.]+$/, ''));
        } catch (e) { UI.toast('Could not add: ' + f.name, 'error'); }
      }
      if (App.tool && App.tool.id !== 'arrange') App.setTool('arrange');
    },
    /* Genişlik / yükseklik alanlarının altındaki kırmızı uyarı: yalnızca boyut geçersizken ya da sınır aşılınca görünür.
       ok(): boyut geçerli mi (değilse uyarı gösterir; pencere açık kalsın diye false döner) */
    sizeLimit(wI, hI) {
      const el = h('div', { class: 'note size-note bad' });
      const bad = () => {
        const w = wI.get(), hh = hI.get();
        return !(w >= 1 && hh >= 1) ? 'Invalid size' : w > MAX_SIDE || hh > MAX_SIDE ? 'Too large: each side can be at most 16384 px' : '';
      };
      const upd = () => { const b = bad(); el.hidden = !b; el.textContent = b ? App.t(b) : ''; };
      for (const f of [wI, hI]) { f.inp.max = MAX_SIDE; f.inp.addEventListener('input', upd); f.inp.addEventListener('change', upd); }
      upd();
      return { el, upd, ok: () => { upd(); const b = bad(); if (b) UI.toast(b, 'error'); return !b; } };
    },
    newDialog() {
      const st = { name: App.t('Untitled'), w: +App.prefs.newW || 1920, h: +App.prefs.newH || 1080, bg: 'white', color: '#6c5cff' };
      const name = h('input', { type: 'text', class: 'full', value: st.name, oninput: () => { st.name = name.value; } });
      const wI = UI.number({ label: 'Width (px)', value: st.w, min: 1, onChange: v => { st.w = v; } });
      const hI = UI.number({ label: 'Height (px)', value: st.h, min: 1, onChange: v => { st.h = v; } });
      const lim = A.sizeLimit(wI, hI);
      const pre = h('select', {
        onchange: () => { if (!pre.value) return; const [w, hh] = pre.value.split('x').map(Number); st.w = w; st.h = hh; wI.set(w); hI.set(hh); lim.upd(); },
      }, h('option', { value: '' }, 'Choose a Preset Size'), App.SIZE_PRESETS.map(([g, list]) => h('optgroup', { label: g }, list.map(([n, w, hh]) => h('option', { value: `${w}x${hh}` }, `${n} (${w}×${hh})`)))));
      const col = UI.color({ value: st.color, onInput: v => { st.color = v; }, grad: { on: false, fresh: true, value: U.gradDef(st.color, '#00c2ff', 135), onMode: on => { st.gradOn = on; }, onInput: g => { st.grad = g; } } });
      col.el.style.display = 'none';
      const bg = UI.seg({ options: [['white', 'White'], ['black', 'Black'], ['transparent', 'Transparent'], ['color', 'Color']], value: 'white', onChange: v => { st.bg = v; col.el.style.display = v === 'color' ? '' : 'none'; } });
      const swap = UI.iconBtn('reset', 'Swap Orientation', () => { [st.w, st.h] = [st.h, st.w]; wI.set(st.w); hI.set(st.h); lim.upd(); });
      const create = () => (lim.ok() ? 'ok' : false);
      UI.modal({
        title: 'Create New', width: 440, enter: create,
        content: h('div', null,
          h('div', { class: 'field' }, h('label', { class: 'fld-label' }, 'Name'), name),
          h('div', { class: 'field' }, h('label', { class: 'fld-label' }, 'Preset Sizes'), pre),
          h('div', { class: 'grid2 swap' }, wI.el, hI.el), lim.el, h('div', { class: 'row end' }, swap),
          h('div', { class: 'field' }, h('label', { class: 'fld-label' }, 'Background'), bg.el), col.el),
        buttons: [{ label: 'Cancel', value: null }, { label: 'Create', primary: true, value: create }],
      }).then(r => {
        if (r !== 'ok') return;
        const fill = st.bg === 'white' ? '#ffffff' : st.bg === 'black' ? '#000000' : st.bg === 'color' ? (st.gradOn ? st.grad || U.gradDef(st.color, '#00c2ff', 135) : st.color) : 'transparent';
        App.newDoc({ w: Math.round(st.w), h: Math.round(st.h), name: st.name || App.t('Untitled'), bg: fill });
        App.showEditor();
      });
    },
    exportDialog() { if (App.doc) App.exportDialog(); },
    async saveProject() {
      if (!App.doc) return;
      const blob = await App.busy('Preparing project…', () => App.storage.exportFile());
      if (!blob) return;
      const ok = await App.saveBlob(blob, (App.doc.name || 'project') + '.pixtape', [{ description: App.t('Pixtape Project'), accept: { 'application/json': ['.pixtape'] } }]);
      if (ok) UI.toast('Project saved', 'ok');
    },
    async copyComposite() {
      if (!App.doc) return;
      try {
        const b = await U.toBlob(App.composite(), 'image/png');
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]);
        UI.toast('Image copied to clipboard', 'ok');
      } catch (e) { UI.toast('Could not copy to clipboard', 'error'); }
    },
    async copyLayer() {
      const L = layerOrWarn();
      if (!L) return;
      App._clip = App.cloneLayer(L);
      App._clip.canvas = U.clone(L.canvas);
      // Sistem panosuna resim (başka programlar için) ve bir işaret yazılır. Yapıştırırken işaret aynıysa
      // katman aslıyla (metin metin, şekil şekil olarak) yapıştırılır; resme dönüşmez.
      App._clipMark = 'pixtape-layer:' + U.uid();
      App._clipSys = false; App._clipN = 0;
      try {
        const b = await U.toBlob(App.composite({ layers: [L] }), 'image/png');
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': b, 'text/plain': new Blob([App._clipMark], { type: 'text/plain' }) })]);
        App._clipSys = true;
      } catch (e) { /* sistem panosu yoksa dahili pano yeterli */ }
      UI.toast('Layer copied', 'ok', 1400);
    },
    // Panodaki içerik bizim kopyaladığımız katman mı? (sistem panosuna yazılamadıysa dahili pano geçerlidir)
    ownClip(text) { return !!(App._clip && App.doc && (!App._clipSys || (text && text.trim() === App._clipMark))); },
    async pasteFromClipboard() {
      let text = '';
      try {
        const items = await navigator.clipboard.read();
        for (const it of items) if (it.types.includes('text/plain')) text = await (await it.getType('text/plain')).text();
        if (A.ownClip(text)) { A.pasteInternal(); return; }
        for (const it of items) {
          const type = it.types.find(t => t.startsWith('image/'));
          if (type) { await A.pasteBlob(await it.getType(type)); return; }
        }
      } catch (e) { /* izin yok olabilir */ }
      if (App._clip && App.doc) { A.pasteInternal(); return; }
      UI.toast('No image found on the clipboard. Try pasting with Ctrl+V.', 'warn');
    },
    async pasteBlob(blob) {
      const c = await U.fileToCanvas(blob);
      if (App.doc && document.body.classList.contains('at-editor')) A.addCanvasLayer(c, 'Pasted');
      else { App.openCanvas(await A.limitSize(c), App.t('Pasted image')); App.showEditor(); }
    },
    // Kopyalanan katmanı aynı türde yapıştırır ve seçer; art arda yapıştırınca her kopya biraz daha kayar
    pasteInternal() {
      const c = App.cloneLayer(App._clip);
      c.id = U.uid(); c.canvas = U.clone(App._clip.canvas); c.name = c.name + ' copy';
      App._clipN = (App._clipN || 0) + 1;
      if (c.type !== 'frame' && c.type !== 'overlay') { c.x += 20 * App._clipN; c.y += 20 * App._clipN; }
      if (c.locked && c.type !== 'frame' && c.type !== 'overlay') c.locked = false;
      if (App.layerRenderers[c.type]) App.layerRenderers[c.type](c);
      App.addLayer(c);
      App.setActive(c.id, false);
      App.commit('Paste');
      if (App.tool && App.tool.refresh) App.tool.refresh();
    },
    // Etkin sekmeyi kapatır (proje otomatik kaydedilir)
    async close() {
      if (!App.doc) return;
      await App.tabs.close();
    },
    // Geçmişi temizle: büyük projelerde önce uyarır
    async clearHistory() {
      const H = App.history;
      if (!App.doc || H.stack.length <= 1) { UI.toast('No history to clear'); return; }
      const big = H.stack.length > 8 || App.doc.layers.length > 4 || App.doc.w * App.doc.h > 8e6;
      if (big && !(await UI.confirm(App.t('All {0} steps in the history will be deleted and these changes can no longer be undone. Continue?', H.stack.length - 1), 'Clear History', true))) return;
      if (App.tool && App.tool.cancel) App.cancelTool();
      H.reset('Start');
      UI.toast('History cleared', 'ok');
    },
    async autoFix() {
      const L = await App.pixelLayer();
      if (!L) return;
      await App.busy('Enhancing…', () => { L.canvas = IMG.adjust(L.canvas, IMG.autoParams(L.canvas)); });
      App.commit('Auto Enhance');
      if (App.tool && App.tool.refresh) App.tool.refresh();
    },
    docOp(label, fn) {
      if (!App.doc) return;
      if (App.tool && App.tool.cancel) App.tool.cancel();
      fn();
      App.commit(label);
      App.fit();
      if (App.tool && App.tool.refresh) App.tool.refresh();
    },
    rotate(deg) { A.docOp(deg < 0 ? 'Rotate Left' : 'Rotate Right', () => App.rotateDoc(deg)); },
    flip(axis) { A.docOp(axis === 'h' ? 'Flip Horizontal' : 'Flip Vertical', () => App.flipDoc(axis)); },
    resizeDialog() {
      const d = App.doc;
      if (!d) return;
      const st = { w: d.w, h: d.h, lock: true };
      const wI = UI.number({ label: 'Width (px)', value: d.w, min: 1, onChange: v => { st.w = v; if (st.lock) { st.h = Math.round(v * d.h / d.w); hI.set(st.h); } } });
      const hI = UI.number({ label: 'Height (px)', value: d.h, min: 1, onChange: v => { st.h = v; if (st.lock) { st.w = Math.round(v * d.w / d.h); wI.set(st.w); } } });
      const lim = A.sizeLimit(wI, hI);
      const pct = UI.slider({ label: 'Percent', min: 5, max: 400, value: 100, def: 100, onInput: v => { st.w = Math.round(d.w * v / 100); st.h = Math.round(d.h * v / 100); wI.set(st.w); hI.set(st.h); lim.upd(); } });
      const ok = () => (lim.ok() ? 'ok' : false);
      UI.modal({
        title: 'Image Size', width: 400,
        content: h('div', null, h('div', { class: 'grid2' }, wI.el, hI.el), lim.el, pct.el, UI.toggle({ label: 'Keep Ratio', value: true, onChange: v => { st.lock = v; } }).el),
        buttons: [{ label: 'Cancel', value: null }, { label: 'Apply', primary: true, value: ok }], enter: ok,
      }).then(async r => {
        if (r !== 'ok') return;
        await App.busy('Resizing…', () => App.resizeDoc(st.w, st.h));
        A.docOp('Image Size', () => {});
      });
    },
    canvasDialog() {
      const d = App.doc;
      if (!d) return;
      const st = { w: d.w, h: d.h, ax: 0.5, ay: 0.5, fill: 'transparent', color: '#ffffff' };
      const wI = UI.number({ label: 'Width (px)', value: d.w, min: 1, onChange: v => { st.w = v; } });
      const hI = UI.number({ label: 'Height (px)', value: d.h, min: 1, onChange: v => { st.h = v; } });
      const grid = h('div', { class: 'anchor-grid' });
      for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
        const b = h('button', { class: 'anc' + (i === 1 && j === 1 ? ' on' : ''), onclick: () => { st.ax = i / 2; st.ay = j / 2; grid.querySelectorAll('.anc').forEach(q => q.classList.remove('on')); b.classList.add('on'); } });
        grid.appendChild(b);
      }
      const col = UI.color({ value: st.color, onInput: v => { st.color = v; } });
      col.el.style.display = 'none';
      const fill = UI.seg({ options: [['transparent', 'Transparent'], ['white', 'White'], ['color', 'Color']], value: 'transparent', onChange: v => { st.fill = v; col.el.style.display = v === 'color' ? '' : 'none'; } });
      const lim = A.sizeLimit(wI, hI);
      const addPad = UI.slider({ label: 'Add to Each Side (px)', min: 0, max: 500, value: 0, onInput: v => { st.w = d.w + v * 2; st.h = d.h + v * 2; wI.set(st.w); hI.set(st.h); lim.upd(); } });
      const ok = () => (lim.ok() ? 'ok' : false);
      UI.modal({
        title: 'Canvas Size', width: 420,
        content: h('div', null, h('div', { class: 'grid2' }, wI.el, hI.el), lim.el, addPad.el, h('div', { class: 'row' }, h('div', null, h('label', { class: 'fld-label' }, 'Anchor'), grid), h('div', { style: { flex: 1 } }, h('label', { class: 'fld-label' }, 'New Area'), fill.el, col.el))),
        buttons: [{ label: 'Cancel', value: null }, { label: 'Apply', primary: true, value: ok }], enter: ok,
      }).then(r => {
        if (r !== 'ok') return;
        const f = st.fill === 'white' ? '#ffffff' : st.fill === 'color' ? st.color : 'transparent';
        A.docOp('Canvas Size', () => App.canvasSize(Math.max(1, st.w), Math.max(1, st.h), st.ax, st.ay, f));
      });
    },
    trim() {
      const d = App.doc;
      if (!d) return;
      const c = App.composite(), data = U.getData(c).data;
      let x0 = d.w, y0 = d.h, x1 = -1, y1 = -1;
      for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) if (data[(y * d.w + x) * 4 + 3] > 4) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (x1 < 0) { UI.toast('The image is fully transparent', 'warn'); return; }
      if (x0 === 0 && y0 === 0 && x1 === d.w - 1 && y1 === d.h - 1) { UI.toast('There are no transparent edges to trim'); return; }
      A.docOp('Trim Transparent Edges', () => App.cropDoc(x0, y0, x1 - x0 + 1, y1 - y0 + 1));
    },
    newEmptyLayer() {
      if (!App.doc) return;
      // sheet: içine çizilince kırpılmaz, tuval boyunda kalır (hizalama için)
      App.addLayer(App.newLayer(U.canvas(App.doc.w, App.doc.h), { name: 'Layer', paint: true, sheet: true }));
      App.commit('New Layer');
    },
    async fillLayer() {
      if (!App.doc) return;
      let color = '#6c5cff', gradOn = false, grad = U.gradDef(color, '#00c2ff', 135);
      const c = UI.color({ value: color, onInput: v => { color = v; }, grad: { on: false, fresh: true, value: grad, onMode: on => { gradOn = on; }, onInput: g => { grad = g; } } });
      const r = await UI.modal({ title: 'Color Fill Layer', width: 340, content: c.el, buttons: [{ label: 'Cancel', value: null }, { label: 'Add', primary: true, value: 'ok' }] });
      if (r !== 'ok') return;
      const cv = U.canvas(App.doc.w, App.doc.h), x = cv.getContext('2d');
      x.fillStyle = gradOn ? U.gradFill(x, grad, 0, 0, cv.width, cv.height) : color; x.fillRect(0, 0, cv.width, cv.height);
      App.addLayer(App.newLayer(cv, { name: gradOn ? 'Gradient Fill' : 'Color Fill' }));
      App.commit('Fill Layer');
    },
    // En alta düz renk ya da renk geçişi olarak arka plan ekler (ör. arka planı kaldırılmış fotoğrafın arkasına)
    async addBackground() {
      if (!App.doc) return;
      let color = '#ffffff', gradOn = false, grad = U.gradDef('#6c5cff', '#00c2ff', 135);
      const c = UI.color({ value: color, onInput: v => { color = v; }, grad: { on: false, fresh: true, value: grad, onMode: on => { gradOn = on; }, onInput: g => { grad = g; } } });
      const sw = (v, n) => h('button', { class: 'qc-btn', title: n, style: { background: v }, onclick: () => { color = v; c.set(v); gradOn = false; c.setMode(false); } });
      const presets = h('div', { class: 'bg-presets' },
        sw('#ffffff', 'White'), sw('#000000', 'Black'), sw('#808080', 'Gray'), sw('#f4efe6', 'Cream'),
        sw('#ffd6e0', 'Pink'), sw('#cdeccf', 'Mint'), sw('#cfe3ff', 'Light Blue'), sw('#6c5cff', 'Purple'), sw('#1e2a4a', 'Navy'));
      const r = await UI.modal({ title: 'Add Background', width: 360, content: h('div', null,
        h('div', { class: 'bg-add' }, c.el, h('span', { class: 'note' }, 'Presets:'), presets),
        UI.note("Added as the bottom layer, behind everything else. Useful after removing a photo's background.")),
        buttons: [{ label: 'Cancel', value: null }, { label: 'Add', primary: true, value: 'ok' }] });
      if (r !== 'ok') return;
      // Arka Planı Kaldır aracında uygulanmamış değişiklik varsa önce uygulanır
      if (App.tool && App.tool.id === 'cutout' && App.tool.dirty) await App.tool.apply();
      const d = App.doc, cv = U.canvas(d.w, d.h), x = cv.getContext('2d');
      x.fillStyle = gradOn ? U.gradFill(x, grad, 0, 0, d.w, d.h) : color; x.fillRect(0, 0, d.w, d.h);
      App.addLayer(App.newLayer(cv, { name: 'Background' }), { index: 0, select: false });
      App.commit('Add Background');
    },
    duplicate() { const L = layerOrWarn(); if (!L) return; App.duplicateLayer(L); App.commit('Duplicate Layer'); },
    // Seçili bütün katmanları siler (Ctrl / Shift ile seçilenler dahil)
    async deleteLayer() {
      if (!layerOrWarn()) return;
      const sel = UI.selectedLayers();
      if (sel.length === App.doc.layers.length && !(await UI.confirm(sel.length > 1 ? 'All layers will be deleted. Continue?' : 'This is the last layer. Delete it anyway?', 'Delete', true))) return;
      if (App.tool && App.tool.cancel) App.tool.cancel();
      for (const L of sel) App.removeLayer(L.id);
      App.commit(sel.length > 1 ? 'Delete Layers' : 'Delete Layer');
      if (App.tool && App.tool.refresh) App.tool.refresh();
    },
    mergeDown() {
      const L = layerOrWarn();
      if (!L) return;
      if (App.mergeDown(L)) { App.commit('Merge Down'); if (App.tool && App.tool.refresh) App.tool.refresh(); }
      else UI.toast('There is no layer below to merge with', 'warn');
    },
    mergeSelected() {
      const ids = UI.selectedLayers().map(l => l.id);
      if (ids.length < 2) { UI.toast('To merge, select several layers in the Layers panel with Ctrl', 'warn', 3500); return; }
      if (App.tool && App.tool.cancel) App.tool.cancel();
      if (App.mergeLayers(ids)) { App.commit('Merge Selected Layers'); if (App.tool && App.tool.refresh) App.tool.refresh(); }
    },
    groupLayers() { if (App.doc) App.groups.group(UI.selectedLayers()); },
    ungroupLayer() { if (App.doc) App.groups.ungroup(App.activeLayer()); },
    // Seçili katmanların kilidini açar / kapatır (biri bile açıksa hepsi kilitlenir)
    toggleLock() {
      if (!App.doc) return;
      const sel = UI.selectedLayers();
      if (!sel.length) { UI.toast('Select a layer first', 'warn'); return; }
      const lock = sel.some(L => !L.locked);
      for (const L of sel) L.locked = lock;
      App.commit(lock ? 'Lock' : 'Unlock');
      UI.toast(lock ? 'Layer Locked' : 'Layer Unlocked', 'info', 1200);
      App.requestRender();
      if (UI.refreshLayers) UI.refreshLayers();
    },
    mergeVisible() { if (App.mergeVisible()) { App.commit('Merge Visible'); if (App.tool && App.tool.refresh) App.tool.refresh(); } },
    flatten() { if (!App.doc) return; App.flatten(); App.commit('Flatten'); if (App.tool && App.tool.refresh) App.tool.refresh(); },
    rasterize() { const L = layerOrWarn(); if (L && L.type !== 'raster') { App.rasterize(L); App.commit('Rasterize'); UI.rebuildPanel(); } },
    order(dir) {
      const L = layerOrWarn();
      if (!L) return;
      const d = App.doc, i = d.layers.indexOf(L);
      const to = dir === 'top' ? d.layers.length - 1 : dir === 'bottom' ? 0 : dir === 'up' ? i + 1 : i - 1;
      App.moveLayer(L.id, to);
      App.commit('Layer Order');
    },
    async exportLayer() {
      const L = layerOrWarn();
      if (!L) return;
      const b = await U.toBlob(App.composite({ layers: [L], hidden: true }), 'image/png');
      App.saveBlob(b, (L.name || 'layer') + '.png');
    },
    toggleGrid() {
      App.showGrid = !App.showGrid; document.getElementById('btnGrid').classList.toggle('on', App.showGrid); App.requestRender();
      // ızgara menüsü açıkken (ör. G ile) açılıp kapanırsa menü de aynı yerde yenilenir
      const old = document.querySelector('.menu.grid-menu');
      if (old && gridArgs) { const { left, top } = old.style, m = A.gridMenu(...gridArgs); if (m) Object.assign(m.style, { left, top }); }
    },
    // c, r: hücre sayısı; ya da { mode: 'size', sx, sy } gibi ızgara ayarları
    setGrid(c, r) {
      App.grid = typeof c === 'object' ? { ...App.grid, ...c } : { ...App.grid, mode: 'count', c, r };
      try { localStorage.setItem('pixtape-grid', JSON.stringify(App.grid)); } catch (e) { /* */ }
      if (!App.showGrid) A.toggleGrid(); else App.requestRender();
    },
    gridLabel(g = App.grid) {
      if (g.mode !== 'size') return `${g.c} × ${g.r}`;
      return g.sx === g.sy ? App.t('{0} px squares', g.sx) : `${g.sx} × ${g.sy} px`;
    },
    gridMenu(anchor, at) {
      // tik yalnızca ızgara açıkken görünür; tikli seçeneğe yeniden tıklamak ızgarayı kapatır
      const g = App.grid, on = App.showGrid, cnt = g.mode !== 'size';
      const is = (c, r) => on && cnt && g.c === c && g.r === r, isSq = n => on && !cnt && g.sx === n && g.sy === n;
      const COUNTS = [2, 3, 4, 5, 6, 8, 10], SIZES = [10, 25, 50, 100];
      gridArgs = [anchor, at];
      const m = UI.menu(anchor, [
        { header: 'Grid' },
        { label: App.showGrid ? 'Hide Grid' : 'Show Grid', icon: 'grid', key: K('grid'), onClick: () => A.toggleGrid() },
        '-',
        { header: 'Number of Cells' },
        ...COUNTS.map(n => ({ label: `${n} × ${n}`, checked: is(n, n), onClick: () => is(n, n) ? A.toggleGrid() : A.setGrid(n, n) })),
        '-',
        { header: 'Square Cells' },
        ...SIZES.map(n => ({ label: App.t('{0} px squares', n), checked: isSq(n), onClick: () => isSq(n) ? A.toggleGrid() : A.setGrid({ mode: 'size', sx: n, sy: n }) })),
        '-',
        { label: 'Grid Settings…', icon: 'settings', checked: on && !COUNTS.some(n => is(n, n)) && !SIZES.some(isSq), onClick: () => A.customGrid() },
      ], at ? { at, checkRight: true } : { up: true, right: true, checkRight: true });
      if (m) m.classList.add('grid-menu');
      return m;
    },
    // Alt çubuktaki mıknatıs düğmesinin sağ tık menüsü
    snapMenu(at) {
      const P = App.prefs, dot = c => `<i class="mi-dot" style="background:${c}"></i>`;
      UI.menu(null, [
        { header: 'Snapping' },
        { label: P.snap ? 'Turn Snapping Off' : 'Turn Snapping On', icon: 'magnet', onClick: () => $id('btnSnap').click() },
        '-',
        { header: 'Snap Distance' },
        ...[[4, 'Low (4 Px)'], [7, 'Normal (7 Px)'], [12, 'High (12 Px)'], [20, 'Very High (20 Px)']].map(([v, l]) => ({ label: l, checked: P.snapDist === v, onClick: () => App.setPref('snapDist', v) })),
        '-',
        { header: 'Line Color' },
        ...[['#ff3bd0', 'Pink'], ['#00b8ff', 'Blue'], ['#2fd18b', 'Green'], ['#ffb547', 'Orange'], ['#ff5a6a', 'Red']].map(([c, l]) => ({ label: l, iconHTML: dot(c), key: P.guideColor === c ? App.icon('check', 14) : '', onClick: () => App.setPref('guideColor', c) })),
        '-',
        { label: 'All Editing Settings…', icon: 'settings', onClick: () => A.settings('Editing') },
      ], { at });
    },
    // Alt çubuktaki "nesneye göre / tuvale göre" düğmesinin sağ tık menüsü
    spaceMenu(at) {
      const P = App.prefs, set = (k, v) => { App.setPref(k, v); App.requestRender(); };
      UI.menu(null, [
        { header: 'Handles' },
        { label: 'Relative to Object', checked: P.xformSpace !== 'world', onClick: () => set('xformSpace', 'local') },
        { label: 'Relative to Canvas', checked: P.xformSpace === 'world', onClick: () => set('xformSpace', 'world') },
        '-',
        { header: 'Fixed Point When Resizing' },
        { label: 'Opposite Edge', checked: P.xformPivot !== 'center', onClick: () => set('xformPivot', 'edge') },
        { label: 'Center', checked: P.xformPivot === 'center', onClick: () => set('xformPivot', 'center') },
        { label: 'Hold Alt to Switch Temporarily', disabled: true },
      ], { at });
    },
    freeMenu(at) {
      const P = App.prefs;
      UI.menu(null, [
        { header: 'Fully Free Mode' },
        { label: P.free ? 'Turn Free Mode Off' : 'Turn Free Mode On', icon: 'free', onClick: () => $id('btnFree').click() },
        { label: 'When on: no ratio lock, Shift does nothing, angles do not snap', disabled: true },
        '-',
        { label: P.snap ? 'Also Turn Snapping Off' : 'Turn Snapping On', icon: 'magnet', onClick: () => $id('btnSnap').click() },
        { label: 'All Editing Settings…', icon: 'settings', onClick: () => A.settings('Editing') },
      ], { at });
    },
    /* Izgara ayarları: hücre sayısı ya da hücre boyutu (kare kare çalışmak için ör. 50 px kareler), çizgi rengi,
       opaklık ve nesnelerin ızgaraya yapışması. Değişiklikler tuvalde hemen görünür; Vazgeç eski hâline döndürür. */
    async customGrid() {
      const MAX = 500, d = App.doc, old = { ...App.grid }, wasOn = App.showGrid;
      const g = { ...App.grid };
      const live = () => { App.grid = { ...g }; App.showGrid = true; $id('btnGrid').classList.add('on'); App.requestRender(); };
      // Hücre sayısında kare hücreler: satır sayısı sütun sayısından ve tuvalin oranından hesaplanır
      let sqCount = false;
      const syncRows = () => { if (sqCount && d) { g.r = U.clamp(Math.round(g.c * d.h / d.w) || 1, 1, MAX); rI.set(g.r); } };
      const cI = UI.number({ label: 'Columns', value: g.c, min: 1, max: MAX, onChange: v => { g.c = U.clamp(Math.round(v) || 1, 1, MAX); syncRows(); live(); } });
      const rI = UI.number({ label: 'Rows', value: g.r, min: 1, max: MAX, onChange: v => { g.r = U.clamp(Math.round(v) || 1, 1, MAX); live(); } });
      const sqT = UI.toggle({ label: 'Square Cells', value: false, onChange: v => { sqCount = v; rI.el.querySelector('input').disabled = v; syncRows(); live(); } });
      // Hücre boyutu: genişlik ve yükseklik (bağlıyken ikisi aynı, yani kare)
      let link = g.sx === g.sy;
      const wI = UI.number({ label: 'Cell Width (px)', value: g.sx, min: 1, max: 10000, onChange: v => { g.sx = U.clamp(Math.round(v) || 1, 1, 10000); if (link) { g.sy = g.sx; hI.set(g.sy); } live(); syncInfo(); } });
      const hI = UI.number({ label: 'Cell Height (px)', value: g.sy, min: 1, max: 10000, onChange: v => { g.sy = U.clamp(Math.round(v) || 1, 1, 10000); if (link) { g.sx = g.sy; wI.set(g.sx); } live(); syncInfo(); } });
      const linkT = UI.toggle({ label: 'Square Cells', value: link, onChange: v => { link = v; if (v) { g.sy = g.sx; hI.set(g.sy); live(); syncInfo(); } } });
      const chips = h('div', { class: 'rs-presets' }, [8, 16, 25, 32, 50, 64, 100, 200].map(n => h('button', { class: 'rs-chip', onclick: () => { g.sx = g.sy = n; link = true; linkT.set && linkT.set(true); wI.set(n); hI.set(n); live(); syncInfo(); } }, n + ' px')));
      const info = h('div', { class: 'note' });
      const syncInfo = () => { info.textContent = d ? App.t('{0} × {1} cells on this canvas', Math.ceil(d.w / g.sx), Math.ceil(d.h / g.sy)) : ''; };
      syncInfo();
      const countBox = h('div', null, h('div', { class: 'grid2' }, cI.el, rI.el), d ? sqT.el : null);
      const sizeBox = h('div', null, chips, h('div', { class: 'grid2' }, wI.el, hI.el), linkT.el, info);
      const showMode = () => { countBox.style.display = g.mode === 'size' ? 'none' : ''; sizeBox.style.display = g.mode === 'size' ? '' : 'none'; };
      const modeSeg = UI.seg({ options: [['count', 'By Number of Cells'], ['size', 'By Cell Size']], value: g.mode === 'size' ? 'size' : 'count', onChange: v => { g.mode = v; showMode(); live(); } });
      showMode();
      const col = UI.color({ label: 'Line Color', value: g.color || '#ffffff', onInput: v => { g.color = v; live(); } });
      const opS = UI.slider({ label: 'Line Opacity', min: 5, max: 100, value: Math.round((g.op == null ? 0.35 : g.op) * 100), def: 35, onInput: v => { g.op = v / 100; live(); } });
      const snapT = UI.toggle({ label: 'Snap Objects to the Grid', value: g.snap !== false, onChange: v => { g.snap = v; live(); } });
      live();
      const r = await UI.modal({
        title: 'Grid Settings', width: 380,
        content: h('div', null, modeSeg.el, countBox, sizeBox, col.el, opS.el, snapT.el),
        buttons: [{ label: 'Cancel', value: null }, { label: 'Apply', primary: true, value: 'ok' }], enter: () => 'ok',
      });
      if (r !== 'ok') {
        App.grid = old;
        if (!wasOn) { App.showGrid = false; $id('btnGrid').classList.remove('on'); }
        App.requestRender();
        return;
      }
      A.setGrid(g);
    },
    togglePanels() { App.layout.toggleOthers(); },
    fullscreen() { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {}); },
    toggleTheme() { A.setTheme(A.themeNow() === 'light' ? 'dark' : 'light'); },
    themeNow: () => document.documentElement.dataset.theme,
    // 'dark' | 'light' | 'system' (sistem ayarını izler)
    setTheme(th) {
      try { localStorage.setItem('pixtape-theme', th); } catch (e) { /* */ }
      A.applyTheme(th);
    },
    applyTheme(th) {
      const sys = window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
      document.documentElement.dataset.theme = th === 'system' ? sys : th;
      document.documentElement.dataset.themePref = th;
    },
    async settings(start) {
      const I = App.i18n, P = App.prefs, set = (k, v) => App.setPref(k, v);
      const field = (label, el, hint) => h('div', { class: 'set-row' }, h('div', { class: 'set-l' }, h('b', null, label), hint ? h('small', null, hint) : null), h('div', { class: 'set-c' }, el));
      const tg = (k, label, hint, after) => field(label, UI.toggle({ label: '', value: !!P[k], onChange: v => { set(k, v); after && after(v); } }).el, hint);

      // Dil: bayraklı kartlar
      const langGrid = h('div', { class: 'lang-grid' }, I.LANGS.map(([v, n]) => {
        const b = h('button', { class: 'lang-card' + (I.lang === v ? ' on' : ''), 'data-noi18n': '', onclick: async () => {
          langGrid.querySelectorAll('.lang-card').forEach(x => x.classList.toggle('on', x === b));
          await I.set(v);
        } });
        b.innerHTML = I.flag(v, 30) + `<span>${n}</span>`;
        return b;
      }));
      const themePref = document.documentElement.dataset.themePref || A.themeNow();
      const pages = {
        'General': ['settings', () => [
          h('div', { class: 'set-block' }, h('div', { class: 'set-l' }, h('b', null, 'Language')), langGrid),
          field('Theme', UI.seg({ options: [['dark', 'Dark', 'moon'], ['light', 'Light', 'sun'], ['system', 'System', 'settings']], value: themePref, onChange: v => A.setTheme(v) }).el),
          field('Workspace Color', UI.seg({ options: [['auto', 'Theme'], ['dark', 'Dark'], ['gray', 'Gray'], ['light', 'Light']], value: P.stageBg, onChange: v => set('stageBg', v) }).el, 'Color of the area behind the photo'),
          tg('motion', 'Animations', 'When off, windows, menus and panels appear instantly without motion'),
        ]],
        'Editing': ['arrange', () => [
          tg('snap', 'Smart Guides', 'Snaps to edges and centers while moving and resizing (the magnet in the bottom bar)'),
          field('Snap Distance', UI.slider({ label: '', min: 2, max: 24, value: P.snapDist, def: 7, onChange: v => set('snapDist', v) }).el, 'Pixels (on Screen)'),
          field('Line Color', UI.color({ value: P.guideColor, onInput: v => set('guideColor', v) }).el),
          tg('free', 'Fully Free Mode', 'The aspect ratio is never locked and Shift has no effect'),
          field('Mouse Wheel', UI.seg({ options: [['zoom', 'Zooms'], ['pan', 'Pans']], value: P.wheel, onChange: v => set('wheel', v) }).el, 'Use with Ctrl for the other action'),
          field('Arrow Key Nudge', UI.number({ label: '', value: P.nudge, min: 1, max: 500, onChange: v => set('nudge', U.clamp(Math.round(v) || 1, 1, 500)) }).el, 'In the Edit tool, the selected object moves this many pixels per key press'),
          field('Nudge with Shift', UI.number({ label: '', value: P.nudgeBig, min: 1, max: 2000, onChange: v => set('nudgeBig', U.clamp(Math.round(v) || 10, 1, 2000)) }).el, 'Distance moved with the arrow keys while Shift is held (pixels)'),
          field('Grid', UI.button(App.t('{0}, change…', A.gridLabel()), e => A.gridMenu(e.currentTarget), { small: true, icon: 'grid' }), 'You can also right-click the grid button in the bottom bar'),
        ]],
        'History and Saving': ['history', () => [
          field('History Steps', UI.slider({ label: '', min: 10, max: 200, step: 5, value: P.histMax, def: 100, onChange: v => { set('histMax', v); App.emit('history'); } }).el, 'More Uses More Memory'),
          tg('autosave', 'Autosave', 'Projects are stored in this browser automatically and listed on the home screen'),
          field('Recent Projects to Keep', (() => {
            const sg = UI.seg({
              options: [[0, 'Unlimited'], [50, '50'], [20, '20'], [10, '10']], value: +P.keepProjects || 0,
              onChange: async v => {
                v = +v;
                const extra = v > 0 ? (await App.storage.list()).filter(p => !p.pinned).length - v : 0;
                if (extra > 0 && !(await UI.confirm(App.t('The oldest {0} projects will be deleted. Continue?', extra), 'Delete', true))) { sg.set(+P.keepProjects || 0); return; }
                set('keepProjects', v); App.storage.prune();
              },
            });
            return sg.el;
          })(),'Unlimited: no project is deleted unless you delete it. With a limit, the oldest projects are deleted automatically; pinned ones are never deleted.'),
          field('Clear Recent Projects', UI.button('Delete All…', async () => {
            if (await UI.confirm('Delete all recent projects stored in this browser? Pinned ones will be deleted too.', 'Delete', true)) { await App.storage.clear(); UI.toast('Recent projects deleted', 'ok'); }
          }, { small: true, danger: true, icon: 'trash' })),
        ]],
        'Defaults': ['text', () => {
          const fontSel = h('select', { onchange: () => set('textFont', fontSel.value) },
            (App.FONT_GROUPS || [['', ['Segoe UI']]]).map(([g, list]) => h('optgroup', { label: App.t(g) }, list.map(f => h('option', { value: f, selected: f === P.textFont, 'data-noi18n': '' }, f)))));
          return [
            field('Text Color', UI.color({ value: P.textColor, onInput: v => set('textColor', v) }).el, 'Color of Newly Added Text'),
            field('Font', fontSel, 'Font of Newly Added Text'),
            field('Bold Text', UI.toggle({ label: '', value: P.textBold !== false, onChange: v => set('textBold', v) }).el),
            field('Drawing Color', UI.color({ value: P.drawColor, onInput: v => set('drawColor', v) }).el, 'Starting Color of the Draw Tool'),
            field('Shape Color', App.shapeColorField().el, 'Fill color of shapes added with the Element tool'),
            field('New Document Size', h('div', { class: 'row' },
              UI.number({ label: 'Width (px)', value: P.newW, min: 1, max: MAX_SIDE, onChange: v => set('newW', U.clamp(Math.round(v) || 1920, 1, MAX_SIDE)) }).el,
              UI.number({ label: 'Height (px)', value: P.newH, min: 1, max: MAX_SIDE, onChange: v => set('newH', U.clamp(Math.round(v) || 1080, 1, MAX_SIDE)) }).el), 'Size shown first in the "New" dialog'),
            field('Save Format and Quality', UI.button('Save Settings…', () => show('Saving'), { small: true, icon: 'save' })),
          ];
        }],
        'Saving': ['save', () => [
          field('Default Format', UI.seg({ options: [['auto', 'Automatic'], ['jpg', 'JPG'], ['png', 'PNG'], ['webp', 'WEBP']], value: P.exportFmt, onChange: v => set('exportFmt', v) }).el, 'Automatic: PNG if there is transparency, otherwise JPG'),
          field('Default Quality', UI.slider({ label: '', min: 40, max: 100, value: P.exportQ, def: 90, onChange: v => set('exportQ', v) }).el, 'For JPG and WEBP'),
        ]],
        'Performance': ['speed', () => [
          tg('fastPreview', 'Faster Live Preview', 'While you drag a slider, the preview is calculated at half resolution and sharpens when you stop. Faster on large photos, but some filters such as Neon Edges look different while dragging. The saved result is not affected.'),
        ]],
        'Interface': ['panels', () => [
          field('Tool Panel', UI.seg({ options: [['left', 'Left'], ['right', 'Right']], value: App.layout.side('tool'), onChange: v => { if (v !== App.layout.side('tool')) App.layout.place('tool', v); } }).el, 'You can also move it by dragging the panel\'s title'),
          field('Layers Panel', UI.seg({ options: [['left', 'Left'], ['right', 'Right']], value: App.layout.side('layers'), onChange: v => { if (v !== App.layout.side('layers')) App.layout.place('layers', v); } }).el, 'Panels can also sit on the same side'),
          field('History Panel', UI.seg({ options: [['left', 'Left'], ['right', 'Right']], value: App.layout.side('history'), onChange: v => { if (v !== App.layout.side('history')) App.layout.place('history', v); } }).el, 'Drag panels by their headers to combine them as tabs or stack them'),
          field('Panel Widths', UI.button('Reset', () => App.layout.resetWidths(), { small: true, icon: 'reset' }), 'Change by Dragging the Panel Edges'),
          field('Panel Layout', UI.button('Restore Defaults', () => App.layout.reset(), { small: true, icon: 'reset' })),
          field('Tool Order', UI.button('Restore Defaults', () => { set('toolOrder', null); UI.buildToolbar(); }, { small: true, icon: 'reset' }), 'You can reorder the tool icons on the left by dragging them'),
        ]],
      };
      const names = Object.keys(pages);
      let cur = names.includes(start) ? start : names[0];
      const body = h('div', { class: 'set-body' });
      const nav = h('div', { class: 'set-nav' });
      const show = n => {
        cur = n;
        nav.querySelectorAll('.set-tab').forEach(b => b.classList.toggle('on', b.dataset.n === n));
        body.innerHTML = '';
        body.append(h('h4', { class: 'set-title' }, n), ...pages[n][1]());
      };
      names.forEach(n => {
        const b = h('button', { class: 'set-tab', onclick: () => show(n) });
        b.dataset.n = n;
        b.innerHTML = App.icon(pages[n][0], 17) + `<span>${n}</span>`;
        nav.appendChild(b);
      });
      show(cur);
      const resetAll = async () => {
        if (!(await UI.confirm('Reset all settings to default? Your projects won\'t be deleted.', 'Reset', true))) return;
        for (const k in App.PREF_DEFAULTS) App.prefs[k] = App.PREF_DEFAULTS[k];
        App.setPref('snap', App.prefs.snap);
        A.setTheme('dark');
        UI.buildToolbar(); App.layout.reset();
        show(cur);
        UI.toast('Settings reset', 'ok');
      };
      await UI.modal({
        title: 'Settings', width: 760, cls: 'settings-modal',
        content: h('div', { class: 'set-wrap' }, nav, body),
        buttons: [{ label: 'Reset All Settings', value: () => { resetAll(); return false; } }, { label: 'Done', value: null, primary: true }],
      });
    },
    shortcuts() { return App.shortcuts.dialog(); },
    about() {
      const feat = (icon, t) => h('div', { class: 'ab-feat' }, h('span', { html: App.icon(icon, 18) }), h('span', null, t));
      UI.modal({
        title: 'About Pixtape', width: 520, cls: 'about-modal',
        content: h('div', { class: 'about' },
          h('div', { class: 'ab-hero' },
            h('div', { class: 'logo big', html: logoSVG() }),
            h('h2', { class: 'ab-title' }, 'Pixtape'),
            h('span', { class: 'ab-ver' }, App.t('Version {0}', App.VERSION)),
            h('p', { class: 'ab-tag' }, 'A simple, fast photo editor that runs in your browser.')),
          h('div', { class: 'ab-feats' },
            feat('layers', 'Layers and Blend Modes'), feat('text', 'Text, Shapes and Stickers'),
            feat('cutout', 'AI Background Removal'), feat('effect', 'Effects and Filters'),
            feat('collage', 'Collage and Batch Editing'), feat('film', 'GIF Maker and Compression')),
          h('div', { class: 'ab-privacy' },
            h('span', { class: 'ab-shield', html: App.icon('shield', 22) }),
            h('div', null, h('b', null, 'Your Photos Stay with You'),
              h('p', null, 'Your photos are never uploaded. Only the AI background removal model is downloaded once, the first time you use it.'))),
          // AGPL-3.0: uygulamayı kullanan herkes kaynak koda ulaşabilmeli
          h('p', { class: 'note ab-src' }, 'Pixtape is free and open source software under the GNU AGPL-3.0 license.', ' ',
            h('a', { href: SOURCE_URL, target: '_blank', rel: 'noopener' }, 'Source Code'))),
        buttons: [{ label: 'Support', value: 'support' }, { label: 'Open Source Licenses', value: 'licenses' }, { label: 'Close', value: null, primary: true }],
      }).then(r => { if (r === 'support') A.support(); if (r === 'licenses') A.licenses(); });
    },
    // Pixtape'i destekleyin: yapımcının GitHub sayfası ve bağış bağlantısı
    support() {
      const link = (href, icon, title, sub, cls) => h('a', { class: 'sp-link' + (cls ? ' ' + cls : ''), href, target: '_blank', rel: 'noopener' },
        h('span', { class: 'sp-ico', html: App.icon(icon, 22) }),
        h('span', { class: 'sp-txt' }, h('b', null, title), h('small', { 'data-noi18n': '' }, sub)),
        h('span', { class: 'sp-go', html: App.icon('link', 16) }));
      UI.modal({
        title: 'Support Pixtape', width: 460, cls: 'support-modal',
        content: h('div', { class: 'support' },
          h('div', { class: 'sp-hero' }, h('span', { class: 'sp-heart', html: App.icon('heart', 30) }),
            h('p', null, 'Pixtape is free and has no ads. If you like it, you can support its development.')),
          DONATE_URL ? link(DONATE_URL, 'heart', 'Donate', DONATE_URL.replace(/^https?:\/\//, ''), 'primary') : null,
          link('https://github.com/bcanusar', 'globe', 'Developer', 'github.com/bcanusar'),
          link(SOURCE_URL, 'code', 'Source Code', SOURCE_URL.replace(/^https?:\/\//, ''))),
        buttons: [{ label: 'Close', value: null, primary: true }],
      });
    },
    // Kullanılan üçüncü taraf bileşenler ve lisansları
    licenses() {
      const row = (name, lic, note) => h('div', { class: 'lic-row' }, h('b', { 'data-noi18n': '' }, name), h('span', { class: 'lic-tag', 'data-noi18n': '' }, lic), note ? h('small', null, note) : null);
      UI.modal({
        title: 'Open Source Licenses', width: 520,
        content: h('div', { class: 'lic' },
          row('Pixtape', 'AGPL-3.0', 'Free and open source; you may use, study, share and change it under the same license.'),
          row('Feather Icons / Lucide', 'MIT / ISC', 'Some interface icons are adapted from these sets.'),
          row('@imgly/background-removal', 'AGPL-3.0', 'AI background removal; downloaded from the internet on first use.'),
          h('div', { class: 'lic-row' }, h('b', null, 'Fonts'), h('span', { class: 'lic-tag', 'data-noi18n': '' }, 'OFL 1.1 / Apache 2.0 / UFL 1.0'), h('small', null, 'Web fonts of the Text tool, served from this site; each is under its own author\'s license.')),
          h('p', { class: 'note' }, h('a', { href: SOURCE_URL + '/blob/main/LICENSE', target: '_blank', rel: 'noopener' }, 'Pixtape License'), ' · ',
            h('a', { href: 'THIRD-PARTY-NOTICES.txt', target: '_blank', rel: 'noopener' }, 'Full license texts'))),
        buttons: [{ label: 'Close', value: null, primary: true }],
      });
    },
  };

  /* ------------------------------------------------------------ kısayollar */
  const isTyping = e => {
    const t = e.target;
    return t && (t.tagName === 'INPUT' && !['range', 'checkbox', 'radio', 'button', 'color'].includes(t.type) || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  };
  // Metin yazılan alanlarda Ctrl+Z alanın kendi geri almasıdır; diğer denetimlerde (liste, sayı, kaydırıcı) genel geri al çalışsın
  const isTextEntry = t => t && (t.tagName === 'TEXTAREA' || t.isContentEditable || (t.tagName === 'INPUT' && t.type === 'text'));
  // Kısayol eylemleri (tuşları App.shortcuts belirler; kullanıcı değiştirebilir)
  const KS = App.shortcuts;
  const RUN_ANY = {
    open: () => A.open(), addImage: () => (App.doc ? A.addImageLayer() : A.open()), new: () => A.newDialog(), help: () => A.shortcuts(),
  };
  const RUN_ED = {
    save: () => A.exportDialog(), saveProject: () => A.saveProject(), closeTab: () => A.close(),
    nextTab: () => App.tabs.step(1), prevTab: () => App.tabs.step(-1),
    undo: () => App.history.undo(), redo: () => App.history.redo(),
    copyLayer: () => A.copyLayer(), copyImage: () => A.copyComposite(),
    duplicate: () => A.duplicate(), newLayer: () => A.newEmptyLayer(), deleteLayer: () => A.deleteLayer(),
    mergeDown: () => A.mergeDown(), mergeVisible: () => A.mergeVisible(),
    lockLayer: () => A.toggleLock(), group: () => A.groupLayers(), ungroup: () => A.ungroupLayer(),
    layerUp: () => A.order('up'), layerDown: () => A.order('down'), layerTop: () => A.order('top'), layerBottom: () => A.order('bottom'),
    sizeUp: () => App.stepSize(1), sizeDown: () => App.stepSize(-1),
    fit: () => App.fit(), actual: () => App.fit('actual'), fill: () => App.fit('fill'),
    zoomIn: () => App.setZoom(App.view.zoom * 1.25), zoomOut: () => App.setZoom(App.view.zoom / 1.25),
    compare: () => { if (!App.compare) { App.compare = true; App.requestRender(); } },
    grid: () => A.toggleGrid(), panels: () => A.togglePanels(),
  };
  document.addEventListener('keydown', async e => {
    if (document.querySelector('.modal-wrap')) return;
    const k = e.key, id = KS.match(e);
    // Fareyle tıklanan düğme odakta kalır; kısayola basınca etrafında odak çerçevesi belirmesin
    const ae = document.activeElement;
    if (id && ae && ae.tagName === 'BUTTON' && !ae.closest('.popup, .menu')) ae.blur();
    const undoKey = id === 'undo' || id === 'redo';
    if (UI.popupOpen() && !undoKey) return;
    if (isTyping(e)) {
      if (undoKey && !isTextEntry(e.target)) e.target.blur();
      else { if (k === 'Escape') e.target.blur(); return; }
    }
    const inEditor = !!App.doc && document.body.classList.contains('at-editor');
    const plain = !e.ctrlKey && !e.metaKey && !e.altKey;
    // Sabit tuşlar
    if (inEditor && plain) {
      if (k === ' ') { if (!App.keys.space) { App.keys.space = true; App.updateCursor(); } e.preventDefault(); return; }
      if (k === 'Enter') { if (App.tool && App.tool.isDirty && App.tool.isDirty()) { e.preventDefault(); App.applyTool(); } return; }
      if (k === 'Escape') { App.cancelTool(); UI.closeMenus(); return; }
      if (k === 'F11') { e.preventDefault(); A.fullscreen(); return; }
      const t = App.tool;
      if (k.startsWith('Arrow') && t && t.id === 'arrange') {
        const L = layerOrWarn();
        if (!L) return;
        if (L.locked) { UI.toast('The layer\'s position is locked', 'warn', 1800); return; }
        e.preventDefault();
        const s = e.shiftKey ? (+App.prefs.nudgeBig || 10) : (+App.prefs.nudge || 1);
        if (k === 'ArrowLeft') L.x -= s; if (k === 'ArrowRight') L.x += s; if (k === 'ArrowUp') L.y -= s; if (k === 'ArrowDown') L.y += s;
        App.requestRender();
        clearTimeout(A._nudge); A._nudge = setTimeout(() => { App.commit('Nudge'); t.refreshFields && t.refreshFields(); }, 400);
        return;
      }
    }
    if (!id) return;
    if (RUN_ANY[id]) { e.preventDefault(); RUN_ANY[id](); return; }
    if (!inEditor) return;
    if (RUN_ED[id]) { e.preventDefault(); RUN_ED[id](); return; }
    if (id.startsWith('tool:')) { const tid = id.slice(5); if (App.tools[tid]) { e.preventDefault(); App.setTool(tid); } }
  });
  document.addEventListener('keyup', e => {
    if (e.key === ' ') { App.keys.space = false; App.updateCursor(); }
    if (App.compare && KS.releases('compare', e)) { App.compare = false; App.requestRender(); }
  });
  window.addEventListener('blur', () => { App.keys.space = false; if (App.compare) { App.compare = false; App.requestRender(); } });

  /* Metin seçilince hemen Metin aracına geçilir (ayarları çok olduğu için); tıklayıp bırakmadan sürüklemeye başlanmışsa
     taşıma kesilmeden Metin aracında sürer, yani metin baştan Metin aracında seçilmiş gibi olur. Şekil, çerçeve ve
     kaplamanın az sayıdaki ayarı Düzenle panelinde de durduğundan onlarda araç değişmez. Uygulanmamış değişikliği
     olan araçtan geçilmez. */
  const TOOL_FOR = { text: 'text' };
  const switchKeepDrag = id => {
    const drag = App.pointerDown ? App.xform.drag : null;
    App.setTool(id);
    // önceki araç kapanırken sürüklemeyi sıfırlar; yeni araç aynı ortak taşıma denetimini kullanır
    if (drag && App.pointerDown && App.tool === App.tools[id]) App.xform.drag = drag;
  };
  App.on('picked', () => {
    const L = App.activeLayer(), id = L && TOOL_FOR[L.type], t = App.tool;
    if (!id || !App.tools[id] || (t && t.isDirty && t.isDirty()) || (t && t.id === id)) return;
    if (UI.selectedLayers().length > 1) return; // birden çok katman seçildiyse (ör. seçim kutusuyla) araç değişmez
    switchKeepDrag(id);
  });
  // Metin bırakılınca (seçim kalkınca ya da metin olmayan bir katman seçilince) her zaman Düzenle aracına geçilir
  let wasText = false;
  App.on('active', () => {
    const L = App.activeLayer(), isText = !!L && L.type === 'text', left = wasText && !isText;
    wasText = isText;
    const t = App.tool;
    if (!left || !t || t.id !== 'text' || (t.isDirty && t.isDirty())) return;
    // hemen geçilir: Metin aracının paneli (şablonlar) ekrana hiç çizilmeden Düzenle paneli gelir
    switchKeepDrag('arrange');
  });
  /* ------------------------------------------------------------ sürükle-bırak & yapıştır */
  const dropOverlay = () => document.getElementById('dropOverlay');
  let dragDepth = 0;
  const overlayText = t => { const b = dropOverlay().querySelector('b'); if (b) b.textContent = App.t(t); };
  // Son projeler kartı kendi üzerine geri getirilirse bırakma iptal edilir
  const overSource = e => {
    if (!projDrag) return false;
    const r = projDrag.card.getBoundingClientRect();
    return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  };
  /* Program içinden başlayan sürüklemeler (sekme, katman, sekmedeki küçük resim...) dosya bırakma sayılmaz:
     "Fotoğrafı bırakın" perdesi açılmaz ve bırakılınca resim eklenmez (tarayıcı resmi "download" adlı dosya gibi taşır). */
  let innerDrag = false;
  const hideDrop = () => { dragDepth = 0; if (!projDrag) dropOverlay().classList.remove('show'); };
  document.addEventListener('dragstart', e => {
    innerDrag = true;
    const el = e.target.nodeType === 1 ? e.target : e.target.parentElement;
    if (el && el.closest('input, textarea, [contenteditable]')) return;
    // resim, bağlantı ya da seçili yazı gibi kendiliğinden sürüklenen şeyler hiç sürüklenmez;
    // sürüklenebilir öğelerin tarayıcı verisi (yazı, adres) silinir ki sekme çubuğuna bırakınca arama açılmasın
    if (!el || !el.closest('[draggable="true"]')) { e.preventDefault(); innerDrag = false; return; }
    e.dataTransfer.clearData();
  }, true);
  document.addEventListener('dragend', () => { innerDrag = false; hideDrop(); }, true);
  // bırakma başka bir öğede durdurulsa da (ör. sekme çubuğu) perde kapanır
  window.addEventListener('drop', () => { setTimeout(() => { innerDrag = false; hideDrop(); }, 0); }, true);
  // güvenlik: sürükleme bitip fare kıpırdayınca perde açık kalmışsa kapanır
  window.addEventListener('mousemove', () => { if (dropOverlay().classList.contains('show') && !projDrag) hideDrop(); });
  window.addEventListener('dragenter', e => {
    // imleç yeni bir öğeye girdiği an da bırakılabilir sayılır; yoksa ilk dragover gelene kadar
    // "bırakılamaz" imleci bir anlığına görünür (ör. Katmanlar panelinde satırdan satıra geçerken)
    e.preventDefault();
    if (!e.dataTransfer || document.querySelector('.modal-wrap')) return;
    if (projDrag || innerDrag) return; // dragover yönetir
    if ([...e.dataTransfer.types].includes('Files')) { dragDepth++; overlayText('Drop the Photo'); dropOverlay().classList.add('show'); }
  });
  window.addEventListener('dragleave', () => { if (projDrag) return; dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) dropOverlay().classList.remove('show'); });
  window.addEventListener('dragover', e => {
    if (projDrag) {
      const back = overSource(e);
      dropOverlay().classList.toggle('show', !back);
      overlayText('Drop to open a copy in a new tab');
      if (back) { e.dataTransfer.dropEffect = 'none'; return; }
      e.dataTransfer.dropEffect = 'copy';
    }
    e.preventDefault();
  });
  window.addEventListener('drop', async e => {
    e.preventDefault();
    dragDepth = 0; dropOverlay().classList.remove('show');
    if (projDrag) {
      const pd = projDrag, back = overSource(e) || pd.card.contains(e.target);
      projDrag = null;
      if (back) return;
      try { await App.busy('Opening project…', () => App.storage.load(pd.id, { copy: true })); App.showEditor(); } catch (err) { UI.toast(err.message, 'error'); }
      return;
    }
    if (innerDrag || document.querySelector('.modal-wrap')) return;
    const files = [...(e.dataTransfer.files || [])];
    if (!files.length) return;
    if (App.doc && document.body.classList.contains('at-editor')) {
      for (const f of files) {
        if (App.PROJECT_RE.test(f.name)) { await A.openFile(f); return; }
        await A.addImageLayer(f);
      }
    } else await A.openFiles(files);
  });
  document.addEventListener('paste', async e => {
    if (isTyping(e) || document.querySelector('.modal-wrap')) return;
    const items = [...(e.clipboardData ? e.clipboardData.items : [])];
    const text = e.clipboardData ? e.clipboardData.getData('text/plain') : '';
    if (A.ownClip(text)) { e.preventDefault(); A.pasteInternal(); return; }
    const img = items.find(it => it.type.startsWith('image/'));
    if (img) { e.preventDefault(); await A.pasteBlob(img.getAsFile()); return; }
    if (App._clip && App.doc) { e.preventDefault(); A.pasteInternal(); }
  });

  /* ------------------------------------------------------------ başlatma */
  async function init() {
    try { A.applyTheme(localStorage.getItem('pixtape-theme') || 'dark'); } catch (e) { /* */ }
    if (window.matchMedia) matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => { if (document.documentElement.dataset.themePref === 'system') A.applyTheme('system'); });
    try { const g = JSON.parse(localStorage.getItem('pixtape-grid')); if (g && g.c > 0 && g.r > 0) App.grid = { ...App.grid, ...g }; } catch (e) { /* */ }
    try { await App.i18n.ready; } catch (e) { /* */ }
    if (window.__splash) window.__splash(1);
    document.documentElement.lang = App.i18n.lang;
    await new Promise(r => setTimeout(r, 0)); // açılış ekranı yeni metniyle çizilsin
    document.documentElement.classList.remove('i18n-wait');
    document.querySelectorAll('.logo-slot').forEach(e => { e.innerHTML = logoSVG(); });
    document.querySelectorAll('.ico-slot').forEach(e => { e.outerHTML = App.icon(e.dataset.ico, 18); });
    App.initView(document.getElementById('view'), document.getElementById('stage'));
    App.initStage();
    UI.buildToolbar();
    UI.buildLayers();
    UI.buildHistory();
    UI.buildBottom();
    UI.buildMenus();
    App.layout.init();
    App.tabs.init();

    const $ = id => document.getElementById(id);
    $('btnUndo').onclick = () => App.history.undo();
    $('btnRedo').onclick = () => App.history.redo();
    $('btnZoomIn').onclick = () => App.setZoom(App.view.zoom * 1.25);
    $('btnZoomOut').onclick = () => App.setZoom(App.view.zoom / 1.25);
    $('btnFit').onclick = () => App.fit();
    $('btnGrid').onclick = () => A.toggleGrid();
    $('btnGrid').oncontextmenu = e => { e.preventDefault(); A.gridMenu(null, { x: e.clientX, y: e.clientY }); };
    $('btnSettings').onclick = () => A.settings();
    $('btnSave2').onclick = () => A.exportDialog();
    const syncModes = () => {
      $('btnSnap').classList.toggle('on', !!App.prefs.snap);
      $('btnFree').classList.toggle('on', !!App.prefs.free);
      $('btnSpace').classList.toggle('on', App.prefs.xformSpace !== 'world');
      $('btnRotSnap').classList.toggle('on', !!App.prefs.rotSnap);
      $('btnRotStep').innerHTML = App.icon('angle', 15) + '<span>' + App.t('Angle: {0}', '<b>' + fmtDeg(App.prefs.rotStep) + '</b>') + '</span>' + App.icon('chevDown', 13);
    };
    const fmtDeg = v => String(+v || 15).replace('.', App.i18n.lang === 'en' || App.i18n.lang === 'zh' ? '.' : ',') + '°';
    const STEPS = [1, 5, 10, 15, 30, 45, 90];
    // Özel açı adımı: 0 ile 360 arasında, ondalıklı da olabilir
    const customStep = async () => {
      const inp = h('input', { type: 'number', min: 0, max: 360, step: 'any', value: +App.prefs.rotStep || 15, class: 'full' });
      const v = await UI.modal({
        title: 'Custom Angle Step', width: 340, content: h('div', null, h('label', { class: 'fld-label' }, 'Angle'), inp),
        buttons: [{ label: 'Cancel', value: null }, { label: 'OK', value: () => inp.value, primary: true }],
        enter: () => inp.value,
      });
      if (v == null || v === '') return;
      const n = Math.round(parseFloat(String(v).replace(',', '.')) * 100) / 100;
      if (!(n > 0 && n <= 360)) { UI.toast('Enter an angle between 0 and 360', 'warn', 2000); return; }
      App.setPref('rotStep', n);
    };
    $('btnRotStep').onclick = e => {
      const cur = +App.prefs.rotStep || 15, custom = !STEPS.includes(cur);
      UI.menu(e.currentTarget, [
        { header: 'Angle Step' },
        ...STEPS.map(v => ({ label: fmtDeg(v), icon: 'angle', checked: cur === v, onClick: () => App.setPref('rotStep', v) })),
        { label: custom ? App.t('Custom: {0}', fmtDeg(cur)) : 'Custom…', icon: 'rename', checked: custom, onClick: customStep },
        '-',
        { label: 'Always Rotate in Steps', icon: 'angle', checked: !!App.prefs.rotSnap, onClick: () => $('btnRotSnap').click() },
      ], { up: true });
    };
    $('btnRotSnap').onclick = () => { App.setPref('rotSnap', !App.prefs.rotSnap); UI.toast(App.prefs.rotSnap ? 'Rotating in angle steps' : 'Free rotation', 'info', 1600); };
    $('btnSnap').onclick = () => { App.setPref('snap', !App.prefs.snap); UI.toast(App.prefs.snap ? 'Snapping On' : 'Snapping Off', 'info', 1400); };
    $('btnFree').onclick = () => { App.setPref('free', !App.prefs.free); UI.toast(App.prefs.free ? 'Fully free mode on: no ratio lock, Shift has no effect' : 'Free Mode Off', 'info', 2200); };
    $('btnSpace').onclick = () => { App.setPref('xformSpace', App.prefs.xformSpace === 'world' ? 'local' : 'world'); App.requestRender(); UI.toast(App.prefs.xformSpace === 'world' ? 'Handles Relative to Canvas' : 'Handles Relative to Object', 'info', 1600); };
    $('btnSpace').oncontextmenu = e => { e.preventDefault(); A.spaceMenu({ x: e.clientX, y: e.clientY }); };
    $('btnSnap').oncontextmenu = e => { e.preventDefault(); A.snapMenu({ x: e.clientX, y: e.clientY }); };
    $('btnFree').oncontextmenu = e => { e.preventDefault(); A.freeMenu({ x: e.clientX, y: e.clientY }); };
    App.on('prefs', syncModes);
    syncModes();
    $('btnHome').onclick = () => App.showHome();
    $('btnHelp').onclick = () => A.shortcuts();
    const cmp = $('btnCompare');
    const on = () => { App.compare = true; App.requestRender(); }, off = () => { App.compare = false; App.requestRender(); };
    cmp.addEventListener('pointerdown', on); cmp.addEventListener('pointerup', off); cmp.addEventListener('pointerleave', off);

    App.on('docopen', async () => {
      const F = startWith;
      startWith = null;
      document.title = App.doc.name + ' - Pixtape';
      const t = App.tool;
      if (!t) await App.setTool('arrange');
      else {
        t.deactivate && t.deactivate();
        if (t.id === 'crop') t.rect = null;
        try { t.activate && await t.activate(); } catch (e) { console.error(e); }
        UI.rebuildPanel();
      }
      if (F) {
        try {
          if (F.tool) await App.setTool(F.tool);
          if (F.then) await F.then(App.tool);
        } catch (e) { UI.toast(e.message, 'error'); }
      }
    });
    App.on('doc', () => { if (App.doc) document.title = App.doc.name + ' - Pixtape'; });

    // Dil değişince dinamik olarak kurulan arayüzü yeniden oluştur
    App.on('lang', () => {
      document.documentElement.lang = App.i18n.lang;
      App.emit('prefs');
      UI.buildMenus();
      UI.rebuildPanel();
      if (UI.refreshLayers) UI.refreshLayers();
      App.emit('history');
      if (document.body.classList.contains('at-home')) renderHome();
    });

    // Tuvalde sağ tık: katman menüsü
    App.on('stagemenu', (p, e) => {
      const t = App.tool;
      if (t && ['arrange', 'text', 'element'].includes(t.id)) {
        const L = App.hitLayer(p.x, p.y);
        if (L && L.id !== App.doc.active) { if (UI.isMultiSelected(L.id)) UI.selectLayerKeep(L.id); else App.setActive(L.id); }
      }
      const L = App.activeLayer();
      UI.menu(null, [
        { label: 'Undo', icon: 'undo', key: K('undo'), disabled: !App.history.canUndo(), onClick: () => App.history.undo() },
        { label: 'Redo', icon: 'redo', key: K('redo'), disabled: !App.history.canRedo(), onClick: () => App.history.redo() },
        '-',
        { label: 'Copy Layer', icon: 'copy', key: K('copyLayer'), disabled: !L, onClick: () => A.copyLayer() },
        { label: 'Paste', icon: 'clipboard', key: 'Ctrl+V', onClick: () => A.pasteFromClipboard() },
        { label: 'Center on Canvas', icon: 'center', disabled: !L || L.locked, onClick: () => { L.x = App.doc.w / 2; L.y = App.doc.h / 2; App.commit('Align'); if (App.tool && App.tool.refreshFields) App.tool.refreshFields(); } },
        '-',
        ...UI.layerMenuItems(L),
      ], { at: { x: e.clientX, y: e.clientY } });
    });

    await App.showHome();
    if (window.__splash) setTimeout(() => window.__splash(2), 30);
    new MutationObserver(() => { if (feature && !feature.wrap.isConnected) featureClosed(); }).observe($('modals'), { childList: true });
    if (FEATURES[slugOf()]) App.openFeature(slugOf(), false);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
