/* Özellik sayfaları: her özelliğin kendi adresi var (ör. /compress-image/), hepsi aynı uygulamayı açar.
   Arama başlığı ve açıklaması burada; scripts/build-pages.js bunlarla index.html'den sayfaları üretir, main.js de
   özellik açılınca sekme başlığını buradan alır. Başlık en fazla ~60, açıklama en fazla ~155 karakter
   (arama sonucunda kesilmesin). Başlıklar arama için her dilde İngilizce kalır. */
(function () {
  const PAGES = [
    { slug: 'remove-background', title: 'Remove Background from Image Free | Pixtape',
      desc: 'Remove the background from any photo for free in your browser. No upload, no sign-up: your images never leave your device. Add a new color behind it.' },
    { slug: 'compress-image', title: 'Compress Images Online Free, JPG, PNG, WEBP | Pixtape',
      desc: 'Compress JPG, PNG and WEBP images in your browser and see the size before you save. Many images at once, no upload and no sign-up. Free and private.' },
    { slug: 'resize-image', title: 'Resize Image Online Free | Pixtape',
      desc: 'Resize photos to any width and height or by percent, with the aspect ratio kept. Works in your browser, free, no sign-up, your images stay on your device.' },
    { slug: 'crop-image', title: 'Crop Image Online Free | Pixtape',
      desc: 'Crop photos to any size or ratio like 1:1, 4:5 or 16:9, and rotate or straighten them in your browser. Free, no sign-up, nothing is uploaded.' },
    { slug: 'add-text-to-photo', title: 'Add Text to Photo Online Free | Pixtape',
      desc: 'Add text to photos with dozens of fonts, ready-made templates, outlines, shadows and curved text. Free photo editor in your browser, no sign-up.' },
    { slug: 'collage-maker', title: 'Photo Collage Maker Online Free | Pixtape',
      desc: 'Make photo collages with 16 layouts in your browser. Adjust spacing, rounded corners and background, then save in high quality. Free, no watermark.' },
    { slug: 'batch-photo-editor', title: 'Batch Photo Editor, Resize and Watermark Images | Pixtape',
      desc: 'Edit many photos at once in your browser: resize, crop, adjust colors, add a watermark or border and save as JPG, PNG or WEBP. Free, no sign-up, no upload.' },
    { slug: 'gif-maker', title: 'GIF Maker, Make GIFs from Images or Video | Pixtape',
      desc: 'Make animated GIFs from images or video clips in your browser. Set speed, size and looping, save as GIF or MP4. Free, no sign-up, no watermark.' },
  ];
  if (typeof module !== 'undefined' && module.exports) module.exports = PAGES; else App.PAGES = PAGES;
})();
