// Parcours au clavier seul, focus visible (captures), cibles tactiles, zoom 200 %.
// node clavier.cjs <page.html> <dossier de sortie>
//  - Tab depuis le début de la page sur l'accueil (bureau) et dans chaque feuille (mobile) :
//    liste des éléments atteints, élément hors feuille atteint = piège/fuite, retour du focus ;
//  - contraste du contour de focus (:focus-visible) mesuré sur quelques éléments ;
//  - cibles tactiles < 44 px (contexte tactile 375 px) ;
//  - reflow à 320 px et zoom texte 200 % (racine à 200 %) : débordement horizontal, contenu coupé.
'use strict';
const fs = require('fs');
const path = require('path');
const {chromium} = require('playwright');
const B = require('./banc.cjs');

const decrire = el => {
  if(!el || el === document.body) return 'body';
  const id = el.id ? '#' + el.id : '';
  const lbl = el.getAttribute('aria-label') || el.textContent.trim().slice(0, 40).replace(/\s+/g, ' ');
  return `${el.tagName.toLowerCase()}${id}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''} « ${lbl} »`;
};
async function tabulations(page, n, dansSel){
  return page.evaluate(async ({n, dansSel, decrireSrc}) => {
    const decrire = eval(decrireSrc);
    const res = [];
    const cible = dansSel ? document.querySelector(dansSel) : null;
    for(let i = 0; i < n; i++){
      const a = document.activeElement;
      const r = a.getBoundingClientRect();
      const cs = getComputedStyle(a);
      const visible = r.width > 0 && r.height > 0 && cs.visibility !== 'hidden';
      res.push({el: decrire(a), visible, dans: cible ? cible.contains(a) : null, focusVisible: a.matches(':focus-visible'),
                outline: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0 ? `${cs.outlineWidth} ${cs.outlineStyle} ${cs.outlineColor}` : 'aucun'});
      await new Promise(r => setTimeout(r, 0));
      break;
    }
    return res;
  }, {n, dansSel, decrireSrc: decrire.toString()});
}
async function marcher(page, n, dansSel){
  const suite = [];
  for(let i = 0; i < n; i++){
    await page.keyboard.press('Tab');
    const [r] = await tabulations(page, 1, dansSel);
    suite.push(r);
    if(suite.length > 2 && r.el === suite[0].el) break;   // boucle complète
  }
  return suite;
}
// Luminance / contraste WCAG (couleurs rgb() calculées).
const lum = c => { const m = c.match(/\d+(\.\d+)?/g).map(Number); const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]); };
const contraste = (a, b) => { const la = lum(a), lb = lum(b); return +((Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)).toFixed(2); };

(async () => {
  const html = B.lireHtml(process.argv[2]);
  const sortie = process.argv[3] || 'sortie';
  fs.mkdirSync(path.join(sortie, 'captures'), {recursive: true});
  const nav = await chromium.launch();
  const rapport = {parcours: {}, focus: [], cibles: [], reflow: {}, zoom200: {}};
  const capture = async (page, nom) => page.screenshot({path: path.join(sortie, 'captures', nom + '.png')});

  // 1. Bureau clair : Tab depuis le début, 40 arrêts, puis ouverture de chaque feuille et cycle Tab dedans.
  for(const c of [B.CONTEXTES[2], B.CONTEXTES[0]]){
    const {context, page} = await B.ouvrir({html, contexte: c, scenario: 'thermique', navigateur: nav});
    await B.attendreListe(page);
    await B.deplier(page, c);
    await page.evaluate(() => document.body.focus());
    const accueil = await marcher(page, 45);
    rapport.parcours[`${c.nom}-accueil`] = accueil;
    // Capture du focus sur la première carte de la liste et sur un bouton rond.
    await page.focus('#liste .carte'); await capture(page, `${c.nom}-focus-carte`);
    await page.focus('#options'); await capture(page, `${c.nom}-focus-options`);
    // Contraste du contour de focus : couleur du contour contre le fond derrière l'élément.
    for(const sel of ['#liste .carte', '#options', '#depart', '#trajet [type=submit]', '.tri button[data-k=prix]']){
      const r = await page.evaluate(sel => {
        const el = document.querySelector(sel); if(!el) return null; el.focus();
        const cs = getComputedStyle(el);
        let p = el.parentElement, bg = 'rgba(0, 0, 0, 0)';
        while(p && (bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent')){ bg = getComputedStyle(p).backgroundColor; p = p.parentElement; }
        return {sel, contour: cs.outlineColor, largeur: cs.outlineWidth, style: cs.outlineStyle, fond: bg, focusVisible: el.matches(':focus-visible')};
      }, sel);
      if(r){ r.contraste = /rgba?\(/.test(r.fond) && /rgba?\(/.test(r.contour) && !/rgba\(.*, 0\)/.test(r.fond) ? contraste(r.contour, r.fond) : null; r.contexte = c.nom; rapport.focus.push(r); }
    }
    // Feuilles : ouvrir, Tab en boucle (le focus doit rester dedans), Échap (retour du focus à l'ouvreur).
    for(const [bouton, feuille] of [['#options', '#menuOptions'], ['#aideBtn', '#aide'], ['#chipVeh', '#garage'], ['#fonds', '#menuFonds'], ['#liste .carte', '#ficheStation']]){
      // Mobile, panneau en plein : les boutons de la carte sont retires du flux (recouverts) ; on rabaisse
      // le panneau d'un cran au clavier (fleche bas sur la poignee) avant d'y aller.
      if(c.mobile && bouton === '#fonds'){ await page.focus('#poignee'); await page.keyboard.press('ArrowDown'); await page.waitForTimeout(250); }
      await page.focus(bouton); await page.keyboard.press('Enter'); await B.attendre(page, feuille);
      const dedans = await marcher(page, 40, feuille);
      const fuite = dedans.filter(x => x.dans === false);
      await capture(page, `${c.nom}-focus-${feuille.slice(1)}`);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(100);
      const retour = await page.evaluate(() => document.activeElement && (document.activeElement.id ? '#' + document.activeElement.id : document.activeElement.className));
      rapport.parcours[`${c.nom}-${feuille.slice(1)}`] = {arrets: dedans.length, fuites: fuite.map(x => x.el), retourFocus: retour, premier: dedans[0] && dedans[0].el};
      console.log(`${c.nom} ${feuille} : ${dedans.length} arrêts Tab, ${fuite.length} hors feuille, Échap → focus sur ${retour}`);
    }
    // Assistant : trois écrans, focus visible.
    await context.close();
  }
  {
    const c = B.CONTEXTES[0];
    const {context, page} = await B.ouvrir({html, contexte: c, scenario: 'premier', navigateur: nav});
    await B.attendre(page, '#asEcran1');
    const dedans = await marcher(page, 60, '#assistant');
    rapport.parcours['mobile-assistant-1'] = {arrets: dedans.length, fuites: dedans.filter(x => x.dans === false).map(x => x.el), premier: dedans[0] && dedans[0].el};
    await page.focus('#asTypes button'); await capture(page, 'mobile-clair-focus-assistant');
    await context.close();
  }
  // 2. Cibles tactiles < 44 px (375 px tactile), accueil déplié + fiche station + plan.
  {
    const c = B.CONTEXTES[0];
    for(const e of B.ETATS.filter(e => ['liste', 'fiche-station', 'plan-pleins', 'plan-charge', 'options', 'assistant-1', 'fiche-borne'].includes(e.nom))){
      const {context, page} = await B.ouvrir({html, contexte: c, scenario: e.scenario, navigateur: nav});
      await e.aller(page, c);
      const petites = await page.evaluate(() => {
        const out = [];
        document.querySelectorAll('button,[href],input,select,[role=button],[tabindex]:not([tabindex="-1"])').forEach(el => {
          if(el.closest('[hidden]') || el.hidden) return;
          const r = el.getBoundingClientRect();
          if(r.width === 0 || r.height === 0) return;
          const cs = getComputedStyle(el); if(cs.visibility === 'hidden' || cs.display === 'none') return;
          if(el.type === 'checkbox' && el.closest('label')){ const rl = el.closest('label').getBoundingClientRect(); if(rl.width >= 44 && rl.height >= 44) return; }
          if(r.width < 44 || r.height < 44) out.push({el: (el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ')[0] : '')), l: Math.round(r.width), h: Math.round(r.height), txt: (el.getAttribute('aria-label') || el.textContent.trim()).slice(0, 30)});
        });
        return out;
      });
      rapport.cibles.push({etat: e.nom, petites});
      console.log(`cibles < 44 px (${e.nom}) : ${petites.length} — ${petites.map(p => `${p.el} ${p.l}×${p.h}`).join(', ')}`);
      await context.close();
    }
  }
  // 3. Reflow 320 px et zoom texte 200 % à 375 px : débordement horizontal du document, éléments coupés.
  const mesurerDebordement = page => page.evaluate(() => {
    const de = document.documentElement;
    const coupes = [];
    document.querySelectorAll('#panneau *, .modale:not([hidden]) *, .haut *').forEach(el => {
      if(el.children.length) return;
      if(el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflowX === 'hidden' && el.textContent.trim()) coupes.push((el.id ? '#' + el.id : el.className ? '.' + String(el.className).split(' ')[0] : el.tagName) + ' « ' + el.textContent.trim().slice(0, 30) + ' »');
    });
    return {largeurDoc: de.scrollWidth, largeurVue: de.clientWidth, debordeH: de.scrollWidth > de.clientWidth, coupes: coupes.slice(0, 12)};
  });
  for(const [nom, largeur, zoom, etat] of [['320-liste', 320, 1, 'liste'], ['320-plan', 320, 1, 'plan-pleins'], ['375-zoom200-liste', 375, 2, 'liste'], ['375-zoom200-garage', 375, 2, 'garage'], ['375-zoom200-plan', 375, 2, 'plan-pleins']]){
    const c = Object.assign({}, B.CONTEXTES[0], {largeur, hauteur: 667});
    const {context, page} = await B.ouvrir({html, contexte: c, scenario: 'thermique', navigateur: nav});
    if(zoom !== 1) await page.evaluate(z => { document.documentElement.style.fontSize = (100 * z) + '%'; }, zoom);
    if(etat === 'garage'){ await B.attendreListe(page); await page.click('#chipVeh'); await B.attendre(page, '#garage'); }
    else await B.ETATS.find(e => e.nom === etat).aller(page, c);
    await page.waitForTimeout(200);
    const r = await mesurerDebordement(page);
    rapport[zoom === 1 ? 'reflow' : 'zoom200'][nom] = r;
    await capture(page, `${nom}`);
    console.log(`${nom} : largeur document ${r.largeurDoc}/${r.largeurVue} px${r.debordeH ? ' DÉBORDEMENT' : ''}, textes coupés : ${r.coupes.length} ${r.coupes.slice(0, 5).join(' ; ')}`);
    await context.close();
  }
  await nav.close();
  fs.writeFileSync(path.join(sortie, 'clavier.json'), JSON.stringify(rapport, null, 1));
  console.log('\nFocus :', rapport.focus.map(f => `${f.contexte} ${f.sel} ${f.largeur} ${f.style} ${f.contour} sur ${f.fond} → ${f.contraste ?? '?'}:1`).join('\n'));
})();
