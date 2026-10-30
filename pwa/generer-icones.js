// Genere UNE FOIS les icones PNG du manifeste depuis les SVG (Chromium headless via Playwright,
// deja present dans l'environnement de developpement) : node pwa/generer-icones.js
// Les PNG sont commites : rien n'est genere au build, aucun outil npm cote utilisateur.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');

const ICONES = [
  ['icone.svg', 'icone-192.png', 192],
  ['icone.svg', 'icone-512.png', 512],
  ['icone-maskable.svg', 'icone-maskable-512.png', 512],
];

(async () => {
  const navigateur = await chromium.launch();
  for(const [svg, png, taille] of ICONES){
    const page = await navigateur.newPage({viewport: {width: taille, height: taille}, deviceScaleFactor: 1});
    const src = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(__dirname, svg)).toString('base64');
    await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">` +
                          `<img src="${src}" width="${taille}" height="${taille}" style="display:block"></body></html>`);
    await page.waitForFunction(() => document.images[0] && document.images[0].complete);
    await page.screenshot({path: path.join(__dirname, png), omitBackground: true});
    await page.close();
    console.log(png, fs.statSync(path.join(__dirname, png)).size, 'octets');
  }
  await navigateur.close();
})();
