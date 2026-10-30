#!/usr/bin/env node
// Recette headless des signalements partagés « pompe vide » (partie 2, 30/10/2026).
// Tout est simulé par Playwright (route) : le flux officiel des prix, le géocodage et l'itinéraire
// IGN, et le service de signalements (https://signalements.test) — aucun réseau, aucun déploiement.
//
//   python3 generate.py --sans-snapshot --out /tmp/sans.html
//   python3 generate.py --sans-snapshot --signalements-url https://signalements.test --out /tmp/avec.html
//   node recette/signalements.js /tmp/sans.html /tmp/avec.html [dossier des captures]
//
// Vérifie : URL non configurée → aucune requête vers le service, ni bouton ni option ; badges dans la
// liste ; fiche : deux boutons par carburant (≥ 44 px), envoi {station, carburant, etat} et rien
// d'autre, confirmation, boutons désactivés 6 h avec le délai ; 429 → message humain ; plan :
// candidate signalée vide écartée avant optimiserPlan et dite dans la carte-héros ; évitement levé
// et dit quand le plan devient infaisable sans elles. Captures PNG dans le dossier donné.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const {chromium} = require('playwright');

const [,, SANS, AVEC, CAPTURES = path.join(__dirname, 'captures')] = process.argv;
if(!SANS || !AVEC){ console.error('usage : node recette/signalements.js sans.html avec.html [captures/]'); process.exit(2); }
fs.mkdirSync(CAPTURES, {recursive: true});

// ---- Données simulées -------------------------------------------------------------------------
// Trajet rectiligne Montpellier -> Clermont-Ferrand (≈ 245 km en projection plane), six stations à
// 0,5 km de la route : départ, km 60, 100, 140, 180, 220. Le km 100 (Lodève, fictif) est la moins chère.
const DEP = [3.8767, 43.6108], ARR = [3.0870, 45.7772];
const KX = 111.32 * Math.cos(44.7 * Math.PI / 180), KY = 110.57;
const LONG = Math.hypot((ARR[0] - DEP[0]) * KX, (ARR[1] - DEP[1]) * KY);
const point = km => [DEP[0] + (ARR[0] - DEP[0]) * km / LONG, DEP[1] + (ARR[1] - DEP[1]) * km / LONG];
const ROUTE = []; for(let i = 0; i <= 60; i++) ROUTE.push(point(LONG * i / 60));
const STATIONS = [
  {id: '34000001', km: 0,   ville: 'Montpellier',    e85: 0.859, e10: 1.659},
  {id: '34000002', km: 60,  ville: 'Clermont-l\'Hérault', e85: 0.879, e10: 1.679},
  {id: '34000003', km: 100, ville: 'Lodève',         e85: 0.699, e10: 1.599},
  {id: '12000004', km: 140, ville: 'Millau',         e85: 0.889, e10: 1.689},
  {id: '15000005', km: 180, ville: 'Saint-Flour',    e85: 0.869, e10: 1.669},
  {id: '63000006', km: 220, ville: 'Issoire',        e85: 0.849, e10: 1.649},
];
const flux = () => STATIONS.map(s => {
  const [lon, lat] = point(s.km);
  return {id: s.id, latitude: String(Math.round((lat + 0.0045) * 1e5)), longitude: String(Math.round(lon * 1e5)),
          cp: s.id.slice(0, 2) + '000', ville: s.ville, adresse: `${s.km} route du test`, horaires_automate_24_24: 'Oui',
          e85_prix: s.e85, e85_maj: '2026-10-30T08:00:00+00:00', e10_prix: s.e10, e10_maj: '2026-10-30T08:00:00+00:00',
          sp95_prix: null, sp98_prix: null, gazole_prix: null, gplc_prix: null,
          carburants_rupture_temporaire: '', carburants_rupture_definitive: ''};
});

// Service de signalements simulé : agrégats par station, journal des requêtes, mode 429.
function serviceSimule(){
  const etats = {};   // station -> {carburant: {vide, ok, dernier}}
  const requetes = [];
  let mode429 = false;
  const vide = (station, carburant, ilYaS, n = 1) => { (etats[station] ||= {})[carburant] = {vide: n, ok: 0, dernier: Math.floor(Date.now() / 1000) - ilYaS}; };
  const ok = (station, carburant, ilYaS) => { (etats[station] ||= {})[carburant] = {vide: 0, ok: 1, dernier: Math.floor(Date.now() / 1000) - ilYaS}; };
  async function repondre(route){
    const req = route.request(), url = new URL(req.url());
    const corps = req.method() === 'POST' ? req.postData() : null;
    requetes.push({method: req.method(), path: url.pathname + url.search, body: corps, headers: req.headers()});
    if(url.pathname === '/v1/etat' && req.method() === 'GET'){
      const ids = (url.searchParams.get('ids') || '').split(',').filter(Boolean);
      if(ids.length > 400) return route.fulfill({status: 400, contentType: 'application/json', body: '{"erreur":"au plus 400 identifiants"}'});
      const out = {};
      ids.forEach(id => { if(etats[id]) out[id] = etats[id]; });
      return route.fulfill({status: 200, contentType: 'application/json', headers: {'Cache-Control': 'public, max-age=60'}, body: JSON.stringify(out)});
    }
    if(url.pathname === '/v1/signalement' && req.method() === 'POST'){
      if(mode429) return route.fulfill({status: 429, contentType: 'application/json', body: '{"erreur":"au plus 5 signalements par heure"}'});
      let j; try{ j = JSON.parse(corps); }catch(e){ return route.fulfill({status: 400, body: '{"erreur":"JSON invalide"}'}); }
      const cles = Object.keys(j).sort().join(',');
      if(cles !== 'carburant,etat,station' || !/^(\d{8}|ES-\d{1,8})$/.test(j.station) || !['vide', 'ok'].includes(j.etat))
        return route.fulfill({status: 400, contentType: 'application/json', body: '{"erreur":"entrée invalide"}'});
      (j.etat === 'vide' ? vide : ok)(j.station, j.carburant, 0);
      return route.fulfill({status: 201, contentType: 'application/json', body: JSON.stringify({[j.station]: etats[j.station]})});
    }
    return route.fulfill({status: 404, contentType: 'application/json', body: '{"erreur":"route inconnue"}'});
  }
  return {etats, requetes, vide, ok, repondre, set429(v){ mode429 = v; }};
}

// Réponses des services publics simulés (prix, géocodage, itinéraire) ; le reste est coupé.
async function routesPubliques(route){
  const url = new URL(route.request().url());
  if(url.hostname === 'data.economie.gouv.fr'){
    const where = url.searchParams.get('where') || '';
    const rows = /_rupture_type/.test(where) ? [] : flux();
    return route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({total_count: rows.length, results: rows})});
  }
  if(url.hostname === 'data.geopf.fr' && url.pathname.startsWith('/geocodage/search')){
    const q = (url.searchParams.get('q') || '').toLowerCase();
    const c = q.startsWith('mont') ? DEP : q.startsWith('clermont') ? ARR : null;
    return route.fulfill({status: 200, contentType: 'application/json',
      body: JSON.stringify({features: c ? [{geometry: {coordinates: c}, properties: {label: q.startsWith('mont') ? 'Montpellier' : 'Clermont-Ferrand'}}] : []})});
  }
  if(url.hostname === 'data.geopf.fr' && url.pathname.startsWith('/navigation/itineraire')){
    return route.fulfill({status: 200, contentType: 'application/json',
      body: JSON.stringify({geometry: {type: 'LineString', coordinates: ROUTE}, distance: Math.round(LONG * 1000), duration: Math.round(LONG / 90 * 3600)})});
  }
  if(url.hostname === 'api-adresse.data.gouv.fr') return route.fulfill({status: 200, contentType: 'application/json', body: '{"features":[]}'});
  return route.abort();
}

// Serveur local pour les deux pages (http : stockage local et CSP comme en production).
function servir(){
  const srv = http.createServer((req, res) => {
    const f = req.url.startsWith('/avec') ? AVEC : req.url.startsWith('/sans') ? SANS : null;
    if(!f){ res.writeHead(404); return res.end(); }
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    fs.createReadStream(f).pipe(res);
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r({srv, base: `http://127.0.0.1:${srv.address().port}`})));
}

// Réglages posés avant la page : un véhicule E85 (6,5 L/100, 150 km par plein dont 30 de réserve),
// repère à Montpellier, assistant déjà vu.
const REGLAGES = {vehicules: [{nom: 'Recette', carbs: ['e85'], conso: '6.5', cuve: '', autonomie: '150', reserve: '30', type: 'voiture', energie: 'thermique'}],
                  vehActif: 0, centre: [43.6108, 3.8767], assistantVu: true, theme: 'clair'};

let nOk = 0;
const check = (cond, msg) => { assert.ok(cond, msg); nOk++; console.log('  ✓ ' + msg); };

async function page(browser, base, quelle, service, opts = {}){
  const ctx = await browser.newContext({viewport: opts.viewport || {width: 420, height: 860}, locale: 'fr-FR', deviceScaleFactor: 1,
                                        reducedMotion: 'reduce'});
  await ctx.addInitScript(r => { localStorage.setItem('fuelpilot:reglages', JSON.stringify(r)); }, REGLAGES);
  await ctx.route('**/*', route => {
    const u = new URL(route.request().url());
    if(u.hostname === '127.0.0.1') return route.continue();
    if(u.hostname === 'signalements.test') return service.repondre(route);
    return routesPubliques(route);
  });
  const p = await ctx.newPage();
  p.on('pageerror', e => { console.error('  erreur page :', e.message); process.exitCode = 1; });
  await p.goto(`${base}/${quelle}.html`);
  await p.waitForSelector('#liste .carte', {timeout: 15000});
  await ouvrirPanneau(p);   // mobile : le panneau est replié au chargement, la liste est sous l'en-tête
  return {ctx, p};
}
const capture = (p, nom) => p.screenshot({path: path.join(CAPTURES, nom + '.png'), fullPage: false});
const ouvrirPanneau = p => p.evaluate(() => { document.getElementById('panneau').dataset.cran = 'plein'; document.getElementById('corps').style.overflowY = ''; });

async function main(){
  const {srv, base} = await servir();
  const browser = await chromium.launch();
  try{
    // 1. URL non configurée : aucune requête vers le service, ni bouton, ni option.
    console.log('1. URL non configurée');
    {
      const service = serviceSimule();
      service.vide('34000003', 'e85', 7200, 3);
      const {ctx, p} = await page(browser, base, 'sans', service);
      await p.click('#liste .carte >> nth=0');
      await p.waitForSelector('#ficheStation:not([hidden])');
      await p.waitForTimeout(800);
      check(service.requetes.length === 0, 'aucune requête vers le service (compteur à 0)');
      check(await p.locator('.sig-btn').count() === 0, 'aucun bouton de signalement dans la fiche');
      check(await p.locator('#liste .badge-sig, #fsCarbs .sig-lbl').count() === 0, 'aucun badge dans la liste ni la fiche');
      check(await p.locator('#eviterVidesLbl').isHidden(), 'option « Éviter les pompes signalées vides » cachée');
      check(await p.locator('#fsSigNote').isHidden(), 'note de confidentialité cachée');
      await ctx.close();
    }

    // 2. Badges dans la liste et la fiche.
    console.log('2. Badges');
    {
      const service = serviceSimule();
      service.vide('34000003', 'e85', 2 * 3600, 3);     // Lodève : vide il y a 2 h, 3 signalements
      service.ok('34000002', 'e85', 40 * 60);           // Clermont-l'Hérault : de nouveau dispo il y a 40 min
      const {ctx, p} = await page(browser, base, 'avec', service);
      await p.waitForSelector('.badge-sig.vide', {timeout: 10000});
      const etat = service.requetes.filter(r => r.method === 'GET' && r.path.startsWith('/v1/etat'));
      check(etat.length >= 1 && etat.every(r => r.path.includes('ids=')), `GET /v1/etat appelé (${etat.length} fois), identifiants en paramètre`);
      const ids = new URL('https://x' + etat[0].path).searchParams.get('ids').split(',');
      check(ids.length === STATIONS.length && ids.every(id => /^\d{8}$/.test(id)), `${ids.length} identifiants demandés, tous à 8 chiffres`);
      check(await p.locator('.badge-sig.vide').first().textContent() === ' E85 signalé vide il y a 2 h (3)', 'badge rouge « E85 signalé vide il y a 2 h (3) »');
      check(await p.locator('.badge-sig.dispo').first().textContent() === ' E85 de nouveau dispo il y a 40 min', 'badge vert « E85 de nouveau dispo il y a 40 min »');
      await capture(p, '02-badges-liste');
      await p.click('#liste .carte:has(.badge-sig.vide)');
      await p.waitForSelector('#ficheStation:not([hidden])');
      check((await p.locator('#fsCarbs .sig-lbl.vide').first().textContent()).includes('signalé vide il y a 2 h (3)'), 'fiche : même texte sous le carburant');
      await capture(p, '03-fiche-badge');
      await ctx.close();
    }

    // 3. Fiche : boutons, envoi, confirmation, délai de 6 h ; puis 429.
    console.log('3. Boutons de la fiche, envoi, 429');
    {
      const service = serviceSimule();
      const {ctx, p} = await page(browser, base, 'avec', service);
      await p.waitForTimeout(500);
      await p.click('#liste .carte:has-text("Millau")');
      await p.waitForSelector('#ficheStation:not([hidden])');
      const btns = p.locator('#fsCarbs .sig-btn');
      check(await btns.count() === 4, 'deux boutons par carburant vendu (E85, E10) : 4 boutons');
      const boxes = await btns.evaluateAll(l => l.map(b => b.getBoundingClientRect().height));
      check(boxes.every(h => h >= 44), `boutons d'au moins 44 px de haut (${boxes.map(Math.round).join(', ')})`);
      check(await p.locator('#fsSigNote').isVisible() && (await p.locator('#fsSigNote').textContent()).includes('jamais votre position'), 'note : ce qui est envoyé et ce qui ne l\'est pas');
      await capture(p, '04-fiche-boutons');
      await p.click('#fsCarbs .sig-btn.vide[data-k="e85"]');
      await p.waitForSelector('#fsSigMsg:not([hidden])');
      await p.waitForFunction(() => /Merci/.test(document.getElementById('fsSigMsg').textContent), null, {timeout: 5000});
      const post = service.requetes.filter(r => r.method === 'POST');
      check(post.length === 1 && post[0].path === '/v1/signalement', 'un seul POST /v1/signalement');
      check(post[0].body === '{"station":"12000004","carburant":"e85","etat":"vide"}', 'corps exact {station, carburant, etat} — rien d\'autre');
      check(/^application\/json/.test(post[0].headers['content-type']), 'Content-Type: application/json');
      check(!post[0].headers.cookie, 'aucun cookie envoyé');
      check((await p.locator('#fsSigMsg').textContent()).startsWith('Merci'), 'confirmation discrète « Merci … »');
      const dis = p.locator('#fsCarbs .sig-btn[data-k="e85"]');
      check((await dis.evaluateAll(l => l.map(b => b.disabled))).every(Boolean), 'les deux boutons E85 sont désactivés');
      check((await p.locator('#fsCarbs .sig-attente').first().textContent()).includes('de nouveau possible dans 6 h'), 'délai restant affiché (dans 6 h)');
      check(!(await p.locator('#fsCarbs .sig-btn.vide[data-k="e10"]').isDisabled()), 'les boutons E10 restent actifs');
      check(await p.locator('#fsCarbs li.ko').count() >= 1, 'correction locale posée : E85 barré (signalée vide) sur cet appareil');
      check((await p.locator('#fsCarbs .sig-lbl.vide').first().textContent()).includes('signalé vide à l\'instant'), 'agrégat du 201 affiché : « signalé vide à l\'instant »');
      const journal = await p.evaluate(() => JSON.parse(localStorage.getItem('fuelpilot:signalements')));
      check(journal && typeof journal['12000004|e85'] === 'number', 'journal local fuelpilot:signalements noté');
      await capture(p, '05-fiche-envoye');
      // 429 sur une autre station
      service.set429(true);
      await p.click('#ficheStation .fermer');
      await p.click('#liste .carte:has-text("Issoire")');
      await p.waitForSelector('#ficheStation:not([hidden])');
      await p.click('#fsCarbs .sig-btn.vide[data-k="e85"]');
      await p.waitForFunction(() => /trop de signalements/i.test(document.getElementById('fsSigMsg').textContent), null, {timeout: 5000});
      const m429 = await p.locator('#fsSigMsg').textContent();
      check(/5 par heure/.test(m429) && /6 h/.test(m429), 'message humain sur 429 : ' + m429);
      check(await p.locator('#fsSigMsg').evaluate(e => e.classList.contains('ko')), 'message en erreur (classe ko)');
      check(!(await p.locator('#fsCarbs .sig-btn.vide[data-k="e85"]').isDisabled()), 'boutons ré-activés après le refus (rien noté au journal)');
      await capture(p, '06-fiche-429');
      await ctx.close();
    }

    // 4. Plan : évitement avant optimiserPlan, carte-héros, option.
    console.log('4. Plan de pleins : évitement');
    const planAvec = async (service, nom, attendu) => {
      const {ctx, p} = await page(browser, base, 'avec', service, {viewport: {width: 1200, height: 900}});
      await p.fill('#depart', 'Montpellier');
      await p.fill('#arrivee', 'Clermont-Ferrand');
      await p.click('#trajet [type=submit]');
      await p.waitForSelector('#aBordQ:not([hidden])');
      await p.click('#aBordPasser');
      await p.waitForSelector('#blocPlan:not([hidden]) .ligne-temps', {timeout: 15000});
      await p.waitForFunction(() => document.querySelector('#plan .heros-note') !== null || document.querySelector('#plan .heros-etat'), null, {timeout: 10000}).catch(() => {});
      const etapes = await p.locator('.ligne-temps .lt-etape b').allTextContents();
      const note = await p.locator('#plan .heros-note').first().textContent().catch(() => '');
      const r = await attendu(p, etapes, note);
      await capture(p, nom);
      await ctx.close();
      return r;
    };
    {
      const service = serviceSimule();
      service.vide('34000003', 'e85', 3600, 2);   // Lodève (la moins chère) : vide il y a 1 h
      await planAvec(service, '07-plan-evitement', async (p, etapes, note) => {
        check(etapes.length > 0, `plan avec ${etapes.length} arrêt(s) : ${etapes.join(' | ')}`);
        check(!etapes.some(t => /Lodève/.test(t)), 'Lodève (signalée vide, pourtant la moins chère) n\'est pas une étape');
        check(/1 station écartée du plan/.test(note) && /Lodève/.test(note) && /12 h/.test(note), 'carte-héros : « 1 station écartée du plan … (Lodève) », motif et fenêtre');
        // Option coupée : Lodève revient dans le plan, la note disparaît.
        await p.click('#options');
        await p.waitForSelector('#menuOptions:not([hidden])');
        check(await p.locator('#eviterVidesLbl').isVisible() && await p.locator('#eviterVides').isChecked(), 'option visible et cochée par défaut');
        await p.click('#eviterVidesLbl');
        await p.click('#menuOptions .fermer');
        await p.waitForFunction(() => [...document.querySelectorAll('.ligne-temps .lt-etape b')].some(b => /Lodève/.test(b.textContent)), null, {timeout: 5000});
        check(await p.locator('#plan .heros-note').count() === 0, 'option décochée : Lodève redevient une étape, plus de note');
        check((await p.locator('.ligne-temps .lt-alerte').allTextContents()).some(t => /signalé vide il y a 1 h \(2\) par d'autres utilisateurs/.test(t)), 'étape Lodève : alerte « signalé vide il y a 1 h (2) par d\'autres utilisateurs »');
        await p.click('#options'); await p.click('#eviterVidesLbl'); await p.click('#menuOptions .fermer');
        await p.waitForFunction(() => document.querySelector('#plan .heros-note') !== null, null, {timeout: 5000});
        check(await p.evaluate(() => JSON.parse(localStorage.getItem('fuelpilot:reglages')).eviterVides) === true, 'option mémorisée (fuelpilot:reglages)');
      });
    }
    {
      const service = serviceSimule();
      ['34000002', '34000003', '12000004', '15000005'].forEach(id => service.vide(id, 'e85', 1800));   // km 60 à 180 : plus rien d'atteignable
      await planAvec(service, '08-plan-evitement-leve', async (p, etapes, note) => {
        check(etapes.length > 0, `plan calculé quand même : ${etapes.length} arrêt(s) : ${etapes.join(' | ')}`);
        check(/4 stations signalées vides/.test(note) && /aucun plan ne passe/.test(note) && /vérifiez avant d'y aller/.test(note), 'carte-héros : évitement levé et dit : ' + note.trim());
        check(await p.locator('#plan .heros-note.ko').count() === 1, 'note en avertissement (classe ko)');
        check((await p.locator('.ligne-temps .lt-alerte').allTextContents()).filter(t => /par d'autres utilisateurs/.test(t)).length >= 1, 'chaque étape signalée vide porte son alerte');
      });
    }
    console.log(`\n${nOk} vérifications passées — captures dans ${CAPTURES}`);
  }finally{
    await browser.close();
    srv.close();
  }
}
main().catch(e => { console.error('ÉCHEC :', e.message); process.exit(1); });
