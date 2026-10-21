// Özellik sayfalarını (ör. /compress-image/) index.html'den üretir ve sitemap.xml'i yeniler.
// Her sayfa aynı uygulamadır; yalnızca başlık, açıklama ve adres farklıdır (bkz. main.js LANDING).
// index.html her değiştiğinde yeniden çalıştırılmalı:  node scripts/build-pages.js
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SITE = 'https://pixtape.github.io/';
// Başlık en fazla ~60, açıklama en fazla ~155 karakter (arama sonucunda kesilmesin)
const PAGES = [
  ['remove-background', 'Remove Background from Image Free | Pixtape',
    'Remove the background from any photo for free in your browser. No upload, no sign-up: your images never leave your device. Add a new color behind it.'],
  ['compress-image', 'Compress Images Online Free, JPG, PNG, WEBP | Pixtape',
    'Compress JPG, PNG and WEBP images in your browser and see the size before you save. Many images at once, no upload and no sign-up. Free and private.'],
  ['resize-image', 'Resize Image Online Free | Pixtape',
    'Resize photos to any width and height or by percent, with the aspect ratio kept. Works in your browser, free, no sign-up, your images stay on your device.'],
  ['crop-image', 'Crop Image Online Free | Pixtape',
    'Crop photos to any size or ratio like 1:1, 4:5 or 16:9, and rotate or straighten them in your browser. Free, no sign-up, nothing is uploaded.'],
  ['add-text-to-photo', 'Add Text to Photo Online Free | Pixtape',
    'Add text to photos with dozens of fonts, ready-made templates, outlines, shadows and curved text. Free photo editor in your browser, no sign-up.'],
  ['collage-maker', 'Photo Collage Maker Online Free | Pixtape',
    'Make photo collages with 16 layouts in your browser. Adjust spacing, rounded corners and background, then save in high quality. Free, no watermark.'],
  ['gif-maker', 'GIF Maker, Make GIFs from Images or Video | Pixtape',
    'Make animated GIFs from images or video clips in your browser. Set speed, size and looping, save as GIF or MP4. Free, no sign-up, no watermark.'],
];

const esc = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const swap = (html, re, value, what) => {
  if (!re.test(html)) throw new Error('index.html: ' + what + ' bulunamadı');
  return html.replace(re, value);
};

for (const [slug, title, desc] of PAGES) {
  if (title.length > 60) console.warn(`uyarı: ${slug} başlığı ${title.length} karakter`);
  if (desc.length > 155) console.warn(`uyarı: ${slug} açıklaması ${desc.length} karakter`);
  const url = SITE + slug + '/';
  let html = src;
  // göreli adresler (css/, js/, lang/...) sitenin köküne göre çözülsün
  html = swap(html, /<meta charset="utf-8">/, '<meta charset="utf-8">\n  <base href="/">', 'charset');
  html = swap(html, /<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`, 'title');
  html = swap(html, /(<meta name="description" content=")[^"]*/, `$1${esc(desc)}`, 'description');
  html = swap(html, /(<meta property="og:title" content=")[^"]*/, `$1${esc(title)}`, 'og:title');
  html = swap(html, /(<meta property="og:description" content=")[^"]*/, `$1${esc(desc)}`, 'og:description');
  html = swap(html, /(<meta property="og:url" content=")[^"]*/, `$1${url}`, 'og:url');
  html = swap(html, /(<link rel="canonical" href=")[^"]*/, `$1${url}`, 'canonical');
  html = html.replace(/<script type="application\/ld\+json">[^<]*<\/script>\n?\s*/, '');
  fs.mkdirSync(path.join(ROOT, slug), { recursive: true });
  fs.writeFileSync(path.join(ROOT, slug, 'index.html'), html);
}

const urls = [SITE, ...PAGES.map(p => SITE + p[0] + '/')];
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'),
  '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  urls.map(u => `  <url>\n    <loc>${u}</loc>\n  </url>\n`).join('') + '</urlset>\n');
console.log(PAGES.length + ' sayfa ve sitemap.xml yazıldı');
