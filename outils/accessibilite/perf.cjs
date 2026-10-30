// Performance : temps jusqu'au premier rendu de la liste (première carte ajoutée à #liste) et
// jusqu'à la création de la carte MapLibre (canvas inséré), mesurés par MutationObserver depuis
// l'origine de navigation (Performance API), moyenne de N chargements, données factices locales
// (réseau ≈ 0 : la mesure isole le travail de la page elle-même).
// node perf.cjs <page.html> <dossier de sortie> [N=5]
'use strict';
const fs = require('fs');
const path = require('path');
const {chromium} = require('playwright');
const B = require('./banc.cjs');

const SONDE = `(() => {
  window.__perf = {liste: null, canvas: null, lib: null, ctor: null, rendus: 0};
  // Fin de l'evaluation de MapLibre (affectation de window.maplibregl) et duree du constructeur Map.
  Object.defineProperty(window, 'maplibregl', {configurable: true, set(v){
    window.__perf.lib = performance.now();
    const M = v.Map;
    v.Map = class extends M { constructor(...a){ const t = performance.now(); super(...a); window.__perf.ctor = Math.round((performance.now() - t) * 10) / 10; } };
    Object.defineProperty(window, 'maplibregl', {value: v, writable: true, configurable: true});
  }, get(){ return undefined; }});
  const obs = new MutationObserver(() => {
    const t = performance.now();
    if(window.__perf.canvas == null && document.querySelector('#map canvas')) window.__perf.canvas = t;
    const l = document.getElementById('liste'), lb = document.getElementById('listeBornes');
    if(window.__perf.liste == null && ((l && l.querySelector('.carte')) || (lb && lb.querySelector('.carte')))) window.__perf.liste = t;
  });
  obs.observe(document, {childList: true, subtree: true});
  // Compte les rendus de la liste (remplacements du contenu de #liste) pour détecter les boucles.
  document.addEventListener('DOMContentLoaded', () => {
    const l = document.getElementById('liste');
    if(l) new MutationObserver(m => { if(m.some(x => x.addedNodes.length)) window.__perf.rendus++; }).observe(l, {childList: true});
  });
})();`;

(async () => {
  const html = B.lireHtml(process.argv[2]);
  const sortie = process.argv[3] || 'sortie';
  const N = +process.argv[4] || 5;
  fs.mkdirSync(sortie, {recursive: true});
  const nav = await chromium.launch();
  const res = {};
  // Deux latences : 0 ms (travail de la page seule) et 150 ms (ordre de grandeur du flux des prix).
  for(const latence of [0, 150]) for(const c of [B.CONTEXTES[0], B.CONTEXTES[2]]){
    const mesures = [];
    for(let i = 0; i < N; i++){
      const {context, page} = await B.ouvrir({html, contexte: c, scenario: 'thermique', navigateur: nav, initScript: SONDE, latence});
      await B.attendreListe(page);
      await page.waitForTimeout(1500);   // laisse passer la géolocalisation et le second chargement
      const m = await page.evaluate(() => {
        const nav = performance.getEntriesByType('navigation')[0] || {};
        return Object.assign({}, window.__perf, {domContentLoaded: nav.domContentLoadedEventEnd, domInteractive: nav.domInteractive,
                                                 taille: nav.transferSize || nav.encodedBodySize});
      });
      mesures.push(m);
      await context.close();
    }
    const moy = k => Math.round(mesures.reduce((t, m) => t + (m[k] || 0), 0) / mesures.length);
    const cle = `${c.nom}-latence${latence}`;
    res[cle] = {n: N, latence, liste_ms: moy('liste'), canvas_ms: moy('canvas'), lib_ms: moy('lib'), ctor_ms: moy('ctor'), domInteractive_ms: moy('domInteractive'),
                  domContentLoaded_ms: moy('domContentLoaded'), rendus_liste: moy('rendus'), brut: mesures};
    const r = res[cle];
    console.log(`${cle} : premier rendu de la liste ${r.liste_ms} ms · MapLibre évalué à ${r.lib_ms} ms · constructeur Map ${r.ctor_ms} ms (début ${r.canvas_ms} ms) · domInteractive ${r.domInteractive_ms} ms · rendus de la liste en 1,5 s : ${r.rendus_liste} (moyenne de ${N})`);
  }
  await nav.close();
  fs.writeFileSync(path.join(sortie, 'perf.json'), JSON.stringify(res, null, 1));
})();
