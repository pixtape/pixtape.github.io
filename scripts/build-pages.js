// Özellik sayfalarını (ör. /compress-image/) index.html'den üretir ve sitemap.xml'i yeniler.
// Sayfa listesi js/pages.js'tedir; her sayfa aynı uygulamadır (bkz. main.js FEATURES).
// index.html her değiştiğinde yeniden çalıştırılmalı:  node scripts/build-pages.js
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SITE = 'https://pixtape.github.io/';
const PAGES = require('../js/pages.js');

const esc = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const swap = (html, re, value, what) => {
  if (!re.test(html)) throw new Error('index.html: ' + what + ' bulunamadı');
  return html.replace(re, value);
};

for (const { slug, title, desc } of PAGES) {
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

const urls = [SITE, ...PAGES.map(p => SITE + p.slug + '/')];
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'),
  '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  urls.map(u => `  <url>\n    <loc>${u}</loc>\n  </url>\n`).join('') + '</urlset>\n');
console.log(PAGES.length + ' sayfa ve sitemap.xml yazıldı');
