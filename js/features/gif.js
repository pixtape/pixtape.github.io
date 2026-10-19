'use strict';
/* GIF oluşturucu: resimlerden veya videodan hareketli GIF (isteğe bağlı MP4 video) */
(() => {
  const { U, ui: UI } = App;
  const h = U.h;

  App.gif = {
    open() {
      const st = {
        frames: [],          // { canvas, delay, name }
        delay: 200, loop: 0, fit: 'contain', bg: '#ffffff', transparentBg: false,
        size: 'first', width: 480, colors: 256, dither: true, optimize: true,
        fade: 0, playMode: 'normal', // normal | reverse | boomerang
        sel: -1, playing: true,
      };
      let result = null; // { blob, url }

      /* ---------------- çıktı boyutu ve kare çizimi */
      const outSize = () => {
        const f = st.frames[0];
        if (!f) return { w: 1, h: 1 };
        let w = f.canvas.width, hh = f.canvas.height;
        if (st.size === 'largest') { for (const g of st.frames) { w = Math.max(w, g.canvas.width); hh = Math.max(hh, g.canvas.height); } }
        if (st.size === 'custom') { const k = st.width / w; w = st.width; hh = hh * k; }
        // GIF'ler çok büyük olmasın (en fazla 1600 px)
        const k = Math.min(1, 1600 / Math.max(w, hh));
        return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(hh * k)) };
      };
      const drawFrame = (src, W, H, ctx) => {
        ctx.clearRect(0, 0, W, H);
        if (!st.transparentBg) { ctx.fillStyle = st.bg; ctx.fillRect(0, 0, W, H); }
        const sw = src.width, sh = src.height;
        let k;
        if (st.fit === 'stretch') { ctx.drawImage(src, 0, 0, W, H); return; }
        k = st.fit === 'cover' ? Math.max(W / sw, H / sh) : Math.min(W / sw, H / sh);
        const dw = sw * k, dh = sh * k;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(src, (W - dw) / 2, (H - dh) / 2, dw, dh);
      };
      // Oynatma sırası (ters / bumerang) ve geçiş kareleri dahil son kare listesi
      const sequence = () => {
        let seq = st.frames.map(f => ({ src: f.canvas, delay: f.delay }));
        if (st.playMode === 'reverse') seq.reverse();
        if (st.playMode === 'boomerang' && seq.length > 2) seq = seq.concat(seq.slice(1, -1).reverse());
        if (!st.fade || seq.length < 2) return seq;
        const out = [], n = st.fade;
        seq.forEach((f, i) => {
          out.push(f);
          const g = seq[(i + 1) % seq.length];
          if (i === seq.length - 1 && st.loop === -1) return;
          for (let k = 1; k <= n; k++) out.push({ src: f.src, src2: g.src, t: k / (n + 1), delay: Math.max(20, Math.round(Math.min(f.delay, 200) / (n + 1))) });
        });
        return out;
      };
      const renderSeq = (f, W, H, ctx, tmp) => {
        drawFrame(f.src, W, H, ctx);
        if (f.src2) {
          const tx = tmp.getContext('2d');
          drawFrame(f.src2, W, H, tx);
          ctx.globalAlpha = f.t; ctx.drawImage(tmp, 0, 0); ctx.globalAlpha = 1;
        }
      };

      /* ---------------- önizleme (oynatıcı) */
      const pv = h('canvas', { class: 'gif-pv' });
      const pvInfo = h('div', { class: 'gif-pvinfo' });
      const playBtn = UI.iconBtn('pause', 'Play / Pause', () => { st.playing = !st.playing; playBtn.innerHTML = App.icon(st.playing ? 'pause' : 'play', 18); if (st.playing) tick(); });
      let timer = null, pos = 0, seqCache = null;
      const tick = () => {
        clearTimeout(timer);
        if (!document.body.contains(pv)) return;
        if (!st.frames.length) { pv.width = 1; pv.height = 1; return; }
        const { w, h: H } = outSize(), k = Math.min(1, 460 / w, 340 / H);
        const W2 = Math.max(1, Math.round(w * k)), H2 = Math.max(1, Math.round(H * k));
        if (pv.width !== W2 || pv.height !== H2) { pv.width = W2; pv.height = H2; }
        seqCache = seqCache || sequence();
        if (pos >= seqCache.length) pos = 0;
        const f = seqCache[pos];
        renderSeq(f, W2, H2, pv.getContext('2d'), U.canvas(W2, H2));
        pvInfo.textContent = App.t('Frame {0} / {1}', pos + 1, seqCache.length);
        if (st.playing) { pos++; timer = setTimeout(tick, f.delay); }
      };
      // Ayar değişince eski GIF geçersiz olur (kaydederken yeniden hazırlanır)
      const changed = () => {
        seqCache = null; result = null; resBox.innerHTML = ''; job++; stopWorker();
        refreshStats(); if (!st.playing) tick();
      };

      /* ---------------- kare şeridi */
      const strip = h('div', { class: 'gif-strip' });
      let dragI = -1;
      const renderStrip = () => {
        strip.innerHTML = '';
        if (!st.frames.length) {
          strip.appendChild(h('div', { class: 'gif-empty' }, h('span', { html: App.icon('film', 30) }), h('b', null, 'No Frames Yet'), h('span', null, 'Add images or a video, or drag files here.')));
          return;
        }
        st.frames.forEach((f, i) => {
          const th = U.canvas(84, 64), x = th.getContext('2d');
          const k = Math.min(84 / f.canvas.width, 64 / f.canvas.height);
          x.drawImage(f.canvas, (84 - f.canvas.width * k) / 2, (64 - f.canvas.height * k) / 2, f.canvas.width * k, f.canvas.height * k);
          const dIn = h('input', { type: 'number', class: 'gif-delay', min: 20, max: 10000, step: 10, value: f.delay, title: 'Duration of This Frame (ms)' });
          dIn.onchange = () => { f.delay = U.clamp(Math.round(+dIn.value || 100), 20, 10000); dIn.value = f.delay; changed(); };
          const card = h('div', { class: 'gif-fr' + (i === st.sel ? ' on' : ''), draggable: 'true', onclick: e => { if (e.target === dIn) return; st.sel = i; st.playing = false; playBtn.innerHTML = App.icon('play', 18); pos = i; seqCache = null; tick(); renderStrip(); } },
            h('span', { class: 'gif-no' }, String(i + 1)), th,
            h('div', { class: 'gif-fr-row' }, dIn, h('small', null, 'ms')),
            h('div', { class: 'gif-fr-acts' },
              h('button', { title: 'Duplicate', html: App.icon('copy', 13), onclick: e => { e.stopPropagation(); st.frames.splice(i + 1, 0, { ...f }); renderStrip(); changed(); } }),
              h('button', { title: 'Delete', html: App.icon('trash', 13), onclick: e => { e.stopPropagation(); st.frames.splice(i, 1); st.sel = -1; renderStrip(); changed(); } })));
          card.addEventListener('dragstart', e => { dragI = i; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'fr'); card.classList.add('drag'); });
          card.addEventListener('dragend', () => card.classList.remove('drag'));
          card.addEventListener('dragover', e => { if (dragI >= 0) { e.preventDefault(); card.classList.add('over'); } });
          card.addEventListener('dragleave', () => card.classList.remove('over'));
          card.addEventListener('drop', e => {
            e.preventDefault(); e.stopPropagation(); card.classList.remove('over');
            if (dragI < 0 || dragI === i) return;
            const [m] = st.frames.splice(dragI, 1); st.frames.splice(i, 0, m); dragI = -1;
            renderStrip(); changed();
          });
          strip.appendChild(card);
        });
      };

      /* ---------------- kare ekleme */
      const addCanvases = list => {
        for (const [c, name] of list) st.frames.push({ canvas: c, delay: st.delay, name });
        if (st.frames.length && st.size === 'custom' && !st.width) st.width = st.frames[0].canvas.width;
        renderStrip(); changed();
        if (st.playing) tick();
      };
      const addFiles = async fs => {
        const imgs = fs.filter(f => f.type.startsWith('image/')), vids = fs.filter(f => f.type.startsWith('video/'));
        const out = [];
        if (imgs.length) await App.busy('Loading images…', async prog => {
          for (let i = 0; i < imgs.length; i++) {
            const f = imgs[i];
            try { out.push([U.fit(await U.fileToCanvas(f), 1600), f.name]); } catch (e) { UI.toast(App.t('Could not open: {0}', f.name), 'error'); }
            prog((i + 1) / imgs.length, `${i + 1} / ${imgs.length}`);
          }
        });
        addCanvases(out);
        if (vids[0]) videoDialog(vids[0]);
      };

      // Videodan kare çıkarma: başlangıç / bitiş, kare hızı
      const videoDialog = file => {
        const url = URL.createObjectURL(file);
        const vid = h('video', { src: url, class: 'gif-video', muted: true, playsinline: true, preload: 'auto', controls: true });
        const vs = { start: 0, end: 0, fps: 10, dur: 0 };
        const info = h('p', { class: 'note' });
        const upd = () => {
          const n = Math.max(1, Math.round((vs.end - vs.start) * vs.fps));
          info.textContent = App.t('{0} s, {1} frames will be extracted', (vs.end - vs.start).toFixed(1), n);
        };
        let sS, eS;
        const sliders = h('div');
        vid.addEventListener('loadedmetadata', () => {
          vs.dur = vid.duration || 0; vs.end = Math.min(vs.dur, 5);
          sS = UI.slider({ label: 'Start (s)', min: 0, max: Math.max(0.1, vs.dur), step: 0.1, value: 0, onInput: v => { vs.start = Math.min(v, vs.end - 0.1); vid.currentTime = vs.start; upd(); } });
          eS = UI.slider({ label: 'End (s)', min: 0, max: Math.max(0.1, vs.dur), step: 0.1, value: vs.end, onInput: v => { vs.end = Math.max(v, vs.start + 0.1); vid.currentTime = vs.end; upd(); } });
          sliders.append(sS.el, eS.el);
          upd();
        });
        const fpsSeg = UI.seg({ label: 'Frames per Second', options: [[5, '5'], [10, '10'], [15, '15'], [20, '20'], [25, '25']], value: 10, onChange: v => { vs.fps = +v; upd(); } });
        UI.modal({
          title: 'Get Frames from Video', width: 560,
          content: h('div', null, vid, sliders, fpsSeg.el, info, UI.note('Long videos mean many frames and a large GIF; choosing a few seconds is recommended.')),
          buttons: [{ label: 'Cancel', value: null }, { label: 'Get Frames', primary: true, value: 'ok' }],
        }).then(async r => {
          if (r !== 'ok' || !vs.dur) { URL.revokeObjectURL(url); return; }
          const n = Math.min(400, Math.max(1, Math.round((vs.end - vs.start) * vs.fps)));
          const out = [];
          await App.busy('Extracting frames…', async prog => {
            const k = Math.min(1, 800 / Math.max(vid.videoWidth, vid.videoHeight));
            const W = Math.max(1, Math.round(vid.videoWidth * k)), H = Math.max(1, Math.round(vid.videoHeight * k));
            for (let i = 0; i < n; i++) {
              const t = vs.start + i / vs.fps;
              await new Promise(res => { const done = () => { vid.removeEventListener('seeked', done); res(); }; vid.addEventListener('seeked', done); vid.currentTime = Math.min(t, vs.dur - 0.001); setTimeout(done, 1500); });
              const c = U.canvas(W, H); c.getContext('2d').drawImage(vid, 0, 0, W, H);
              out.push([c, file.name + ' #' + (i + 1)]);
              prog((i + 1) / n, `${i + 1} / ${n}`);
            }
          });
          URL.revokeObjectURL(url);
          const d0 = st.delay; st.delay = Math.round(1000 / vs.fps);
          addCanvases(out);
          st.delay = d0;
        });
      };

      /* ---------------- GIF üretimi */
      const stats = h('div', { class: 'gif-stats' });
      const refreshStats = () => {
        const s = sequence(), { w, h: H } = outSize();
        const total = s.reduce((a, f) => a + f.delay, 0);
        stats.textContent = st.frames.length ? App.t('{0} x {1} px · {2} kare · {3} sn', w, H, s.length, (total / 1000).toFixed(2)) : '';
      };
      /* GIF, "GIF kaydet"e basılınca hazırlanır (video gibi), ardından kaydetme penceresi açılır.
         Kareler burada çizilir, renk azaltma ve kodlama işçide yapılır; program donmaz.
         Hazırlanan GIF ve dosya boyutu altta görünür; ayarlar değişmedikçe yeniden kaydederken tekrar hazırlanmaz. */
      const resBox = h('div', { class: 'gif-res' });
      let worker = null, job = 0;
      const stopWorker = () => { if (worker) { worker.terminate(); if (worker.done) worker.done(null); worker = null; } };
      const build = async prog => {
        const id = ++job;
        stopWorker();
        const seq = sequence(), { w: W, h: H } = outSize();
        const c = U.canvas(W, H), x = c.getContext('2d', { willReadFrequently: true }), tmp = U.canvas(W, H);
        const bufs = [];
        let t0 = performance.now();
        for (let i = 0; i < seq.length; i++) {
          renderSeq(seq[i], W, H, x, tmp);
          bufs.push(x.getImageData(0, 0, W, H).data.buffer);
          prog((i + 1) / seq.length * 0.2);
          // arada bir nefes al: arayüz akıcı kalsın
          if (performance.now() - t0 > 12) { await new Promise(r => setTimeout(r, 0)); t0 = performance.now(); }
          if (id !== job) return null;
        }
        const w = worker = new Worker('js/features/gif-worker.js');
        const res = await new Promise(done => {
          w.done = done;
          w.onmessage = e => { if (e.data.blob) done(e.data); else prog(0.2 + e.data.p * 0.8); };
          w.onerror = () => done(null);
          w.postMessage({ W, H, frames: bufs, delays: seq.map(f => f.delay), colors: st.colors, dither: st.dither, optimize: st.optimize, loop: st.loop }, bufs);
        });
        if (worker === w) { w.done = null; stopWorker(); }
        if (id !== job || !res) return null;
        if (result) URL.revokeObjectURL(result.url);
        result = { blob: res.blob, url: URL.createObjectURL(res.blob) };
        resBox.innerHTML = '';
        resBox.append(
          h('div', { class: 'gif-res-img' }, h('img', { src: result.url, alt: '', draggable: 'false' })),
          h('div', { class: 'gif-res-info' }, h('span', { class: 'note' }, 'File Size'), h('b', null, U.fmtBytes(res.blob.size)), h('span', null, App.t('{0} x {1} px · {2} kare', W, H, res.count))));
        return result;
      };
      const save = async () => {
        if (!st.frames.length) { UI.toast('Add frames first', 'warn'); return; }
        if (!result) {
          let stopped = false;
          await App.busy('Creating GIF…', prog => build(prog), { cancel: () => { stopped = true; job++; stopWorker(); } });
          if (stopped) return;
          if (!result) { UI.toast('Could not create GIF', 'error'); return; }
        }
        const ok = await App.saveBlob(result.blob, 'pixtape.gif', [{ description: 'GIF', accept: { 'image/gif': ['.gif'] } }]);
        if (ok) UI.toast('GIF saved', 'ok');
      };

      // Video (MP4) olarak kaydet: kareler tarayıcının video kaydedicisiyle gerçek sürelerinde kaydedilir.
      // MP4 desteklenmezse WEBM'e düşer. Videoda saydamlık olmadığı için boşluk rengi kullanılır.
      const saveVideo = async () => {
        if (!st.frames.length) { UI.toast('Add frames first', 'warn'); return; }
        const types = ['video/mp4;codecs=avc1.640028', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
        const type = window.MediaRecorder && types.find(t => MediaRecorder.isTypeSupported(t));
        if (!type) { UI.toast('This system does not support saving video', 'error'); return; }
        const mp4 = type.startsWith('video/mp4');
        const seq = sequence(), sz = outSize();
        // H.264 çift sayılı boyut ister
        const W = Math.max(2, sz.w & ~1), H = Math.max(2, sz.h & ~1);
        const c = U.canvas(W, H), x = c.getContext('2d'), tmp = U.canvas(W, H);
        const stream = c.captureStream(0), track = stream.getVideoTracks()[0];
        const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: U.clamp(W * H * 12, 2e6, 16e6) });
        const chunks = [];
        rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
        const recStopped = new Promise(r => { rec.onstop = r; });
        const tb = st.transparentBg;
        const reps = st.loop > 0 ? st.loop + 1 : 1;
        const total = seq.reduce((a, f) => a + f.delay, 0) * reps;
        // iptal edilince bekleme hemen biter
        let stopped = false, wake = null;
        const sleep = ms => new Promise(r => { wake = r; setTimeout(r, ms); });
        st.transparentBg = false;
        const draw = f => { renderSeq(f, W, H, x, tmp); track.requestFrame(); };
        try {
          await App.busy('Creating video…', async prog => {
            draw(seq[0]);
            rec.start();
            let t = 0;
            const t0 = performance.now();
            for (let r = 0; r < reps && !stopped; r++) {
              for (const f of seq) {
                if (stopped) break;
                draw(f);
                t += f.delay;
                // gerçek zamana göre bekle (kayma birikmesin)
                await sleep(Math.max(0, t - (performance.now() - t0)));
                prog(t / total, App.t('{0} s', ((total - t) / 1000).toFixed(1)));
              }
            }
            draw(seq[seq.length - 1]);
            await sleep(60);
            rec.stop();
            await recStopped;
          }, { cancel: () => { stopped = true; if (wake) wake(); } });
        } finally { st.transparentBg = tb; track.stop(); }
        if (stopped) return;
        if (!chunks.length) { UI.toast('Could not create video', 'error'); return; }
        const blob = new Blob(chunks, { type: mp4 ? 'video/mp4' : 'video/webm' });
        const ext = mp4 ? '.mp4' : '.webm';
        const ok = await App.saveBlob(blob, 'pixtape' + ext, [{ description: mp4 ? 'MP4' : 'WEBM', accept: { [blob.type]: [ext] } }]);
        if (ok) UI.toast(mp4 ? 'Video (MP4) Saved' : 'Video (WEBM) Saved', 'ok');
      };

      /* ---------------- ayarlar */
      const set = (k, f) => v => { st[k] = v; if (f) f(v); changed(); };
      const customW = UI.number({ label: 'Width (px)', value: st.width, min: 16, max: 1600, onChange: v => { st.width = U.clamp(Math.round(v), 16, 1600); changed(); } });
      customW.el.style.display = 'none';
      const allDelay = UI.number({ label: 'All Frames (ms)', value: st.delay, min: 20, max: 10000, onChange: v => { st.delay = U.clamp(Math.round(v), 20, 10000); } });
      const bgc = UI.color({ label: 'Padding Color', value: st.bg, onInput: set('bg') });
      const right = h('div', { class: 'gif-side' },
        UI.section('Timing', [
          h('div', { class: 'field' }, h('label', { class: 'fld-label' }, 'All Frames (ms)'),
            h('div', { class: 'inline-apply' }, allDelay.inp, UI.button('Apply', () => { st.delay = U.clamp(Math.round(+allDelay.inp.value || 200), 20, 10000); st.frames.forEach(f => { f.delay = st.delay; }); renderStrip(); changed(); }, { small: true }))),
          h('div', { class: 'rs-presets' }, [['Slow', 600], ['Normal', 200], ['Fast', 80], ['Very Fast', 40]].map(([n, v]) => h('button', { class: 'rs-chip', onclick: () => { st.delay = v; allDelay.set(v); st.frames.forEach(f => { f.delay = v; }); renderStrip(); changed(); } }, n))),
          UI.seg({ label: 'Playback', options: [['normal', 'Normal'], ['reverse', 'Reverse'], ['boomerang', 'Boomerang']], value: st.playMode, onChange: set('playMode') }).el,
          UI.select({ label: 'Repeat', options: [['0', 'Loop Forever'], ['1', 'Repeat Once'], ['2', 'Repeat Twice'], ['4', 'Repeat 4 Times'], ['-1', 'Play Once']], value: '0', onChange: v => { st.loop = +v; changed(); } }).el,
          UI.slider({ label: 'Crossfade Between Frames', min: 0, max: 6, value: 0, def: 0, onChange: set('fade') }).el,
        ]),
        UI.section('Size', [
          UI.seg({ options: [['first', 'First Frame'], ['largest', 'Largest'], ['custom', 'Custom']], value: st.size, onChange: set('size', v => { customW.el.style.display = v === 'custom' ? '' : 'none'; }) }).el,
          customW.el,
          UI.seg({ label: 'Frames of Different Sizes', options: [['contain', 'Fit'], ['cover', 'Fill'], ['stretch', 'Stretch']], value: st.fit, onChange: set('fit') }).el,
          UI.toggle({ label: 'Transparent Background', value: st.transparentBg, onChange: set('transparentBg', v => { bgc.el.style.display = v ? 'none' : ''; }) }).el,
          bgc.el,
        ], { open: false }),
        UI.section('Quality and File Size', [
          UI.seg({ label: 'Number of Colors', options: [[256, '256'], [128, '128'], [64, '64'], [32, '32']], value: 256, onChange: v => { st.colors = +v; changed(); } }).el,
          UI.toggle({ label: 'Smooth Color Transitions', value: st.dither, onChange: set('dither') }).el,
          UI.toggle({ label: 'Skip Unchanged Pixels', value: st.optimize, onChange: set('optimize') }).el,
          UI.note('Fewer colors and optimization make the file smaller. For photos, keep dithering on for smoother color transitions.'),
        ], { open: false }));

      const fileIn = h('input', { type: 'file', accept: 'image/*,video/*', multiple: true, style: { display: 'none' }, onchange: () => { addFiles([...fileIn.files]); fileIn.value = ''; } });
      const left = h('div', { class: 'gif-main' },
        h('div', { class: 'gif-toolbar' },
          UI.button('Add Image', () => { fileIn.accept = 'image/*'; fileIn.click(); }, { small: true, primary: true, icon: 'image' }),
          UI.button('Add Video', () => { fileIn.accept = 'video/*'; fileIn.click(); }, { small: true, icon: 'video' }),
          h('div', { class: 'spacer' }),
          UI.button('Delete All', () => { st.frames = []; st.sel = -1; renderStrip(); changed(); }, { small: true, cls: 'ghost', icon: 'trash' }), fileIn),
        h('div', { class: 'gif-stage' }, h('div', { class: 'gif-pvwrap' }, pv), h('div', { class: 'gif-pvbar' }, playBtn, pvInfo, h('div', { class: 'spacer' }), stats)),
        strip, resBox);
      // Kare şeridi fare tekerleğiyle yatay kayar
      strip.addEventListener('wheel', e => {
        if (strip.scrollWidth <= strip.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
        e.preventDefault();
        strip.scrollBy({ left: e.deltaY * 1.2, behavior: App.scrollBehavior() });
      }, { passive: false });
      // Yalnızca dışarıdan bırakılan dosyalar kare olarak eklenir; pencere içindeki bir resmi sürüklemek bir şey eklemez
      let inner = false;
      left.addEventListener('dragstart', () => { inner = true; });
      left.addEventListener('dragend', () => { inner = false; });
      left.addEventListener('dragover', e => { if (!inner && [...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
      left.addEventListener('drop', e => { if (inner || !e.dataTransfer.files.length) return; e.preventDefault(); e.stopPropagation(); addFiles([...e.dataTransfer.files]); });
      renderStrip(); refreshStats();
      UI.modal({
        title: 'Make GIF', width: Math.min(1100, innerWidth - 40), sticky: true,
        content: h('div', { class: 'gif-wrap' }, left, right),
        buttons: [{ label: 'Close', value: null }, { label: 'Save Video (MP4)', value: () => { saveVideo(); return false; } }, { label: 'Save GIF', primary: true, value: () => { save(); return false; } }],
      }).then(() => { clearTimeout(timer); job++; stopWorker(); if (result) URL.revokeObjectURL(result.url); });
      setTimeout(tick, 50);
    },
  };
})();
