// Recette headless de l'appli installable et hors-ligne (30/10/2026). Lance Chromium (Playwright) sur
// une copie de la page servie en http local avec pwa/ et une base IRVE reduite (fixture) ; le flux
// des prix (data.economie.gouv.fr) est simule par un serveur https local vers lequel Chromium est
// aiguille (--host-resolver-rules), car l'environnement de developpement n'a pas acces a l'API.
//   python3 generate.py --sans-snapshot --out /tmp/x.html && node recette/pwa.js /tmp/x.html
// Verifie : enregistrement du service worker, deuxieme chargement servi depuis le cache, passage
// hors-ligne (page utilisable, bandeau « Hors ligne — prix du … », itineraire et carte annonces),
// bornes servies depuis le cache, nouvelle version (bandeau, Recharger, purge des anciens caches),
// file:// (aucun enregistrement, aucune erreur). Captures dans recette/captures/.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const os = require('node:os');
const {execSync} = require('node:child_process');
const {chromium} = require('playwright');

const PAGE = process.argv[2];
if(!PAGE || !fs.existsSync(PAGE)){ console.error('usage : node recette/pwa.js <page generee>'); process.exit(2); }
const RACINE = path.join(__dirname, '..');
const CAPTURES = path.join(__dirname, 'captures');
const PORT = 8765;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'viaminus-recette-'));
const SITE = path.join(TMP, 'site');
let ECHECS = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  ECHEC') + ' ' + msg); if(!cond) ECHECS++; };

// ---- Site local : page + pwa/ + data/irve (fixture de l'Herault) ----
function preparerSite(build){
  fs.rmSync(SITE, {recursive: true, force: true});
  fs.mkdirSync(path.join(SITE, 'data', 'irve'), {recursive: true});
  let html = fs.readFileSync(PAGE, 'utf8');
  if(build) html = html.replace(/<meta name="fuelpilot-build" content="[^"]*">/, `<meta name="fuelpilot-build" content="${build}">`);
  fs.writeFileSync(path.join(SITE, 'index.html'), html);
  for(const f of ['sw.js', 'manifest.webmanifest', 'icone-192.png', 'icone-512.png', 'icone-maskable-512.png'])
    fs.copyFileSync(path.join(RACINE, 'pwa', f), path.join(SITE, f));
  fs.copyFileSync(path.join(RACINE, 'docs', 'guide.html'), path.join(SITE, 'guide.html'));
  const irve = JSON.parse(fs.readFileSync(path.join(RACINE, 'src', 'fixtures', 'irve-34.json'), 'utf8'));
  fs.writeFileSync(path.join(SITE, 'data', 'irve', '34.json'), JSON.stringify(irve));
  fs.writeFileSync(path.join(SITE, 'data', 'irve', 'index.json'), JSON.stringify({genere: '2026-10-30', source: 'fixture',
    departements: {'34': {stations: irve.length, pdc: irve.length, octets: 1, bbox: [2.742882, 43.265294, 4.060912, 43.689381]}}}));
}
const TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json',
               '.webmanifest': 'application/manifest+json', '.png': 'image/png'};
function serveurSite(){
  return http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if(p.endsWith('/')) p += 'index.html';
    const f = path.join(SITE, p);
    if(!f.startsWith(SITE) || !fs.existsSync(f)){ res.writeHead(404); res.end(); return; }
    res.writeHead(200, {'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store'});
    res.end(fs.readFileSync(f));
  }).listen(PORT, '127.0.0.1');
}

// ---- Flux des prix simule : 3 stations autour de Montpellier, format du flux officiel ----
const STATIONS = [
  {id: 34000001, latitude: '4361000', longitude: '387000', cp: '34000', ville: 'Montpellier', adresse: '1 avenue de la Recette',
   gazole_prix: 1.599, gazole_maj: '2026-10-30T07:00:00+00:00', e10_prix: 1.689, e10_maj: '2026-10-30T07:00:00+00:00',
   sp95_prix: null, sp95_maj: null, sp98_prix: 1.789, sp98_maj: '2026-10-30T07:00:00+00:00', e85_prix: 0.759, e85_maj: '2026-10-30T07:00:00+00:00',
   gplc_prix: null, gplc_maj: null, horaires_automate_24_24: 'Oui', carburants_rupture_temporaire: null, carburants_rupture_definitive: null},
  {id: 34000002, latitude: '4359000', longitude: '390000', cp: '34000', ville: 'Montpellier', adresse: '2 rue du Cache',
   gazole_prix: 1.629, gazole_maj: '2026-10-30T06:30:00+00:00', e10_prix: 1.709, e10_maj: '2026-10-30T06:30:00+00:00',
   sp95_prix: 1.729, sp95_maj: '2026-10-30T06:30:00+00:00', sp98_prix: null, sp98_maj: null, e85_prix: null, e85_maj: null,
   gplc_prix: 0.959, gplc_maj: '2026-10-30T06:30:00+00:00', horaires_automate_24_24: 'Non', carburants_rupture_temporaire: null, carburants_rupture_definitive: null},
  {id: 34000003, latitude: '4363000', longitude: '384000', cp: '34080', ville: 'Montpellier', adresse: '3 boulevard Hors-Ligne',
   gazole_prix: 1.579, gazole_maj: '2026-10-30T05:00:00+00:00', e10_prix: 1.669, e10_maj: '2026-10-30T05:00:00+00:00',
   sp95_prix: null, sp95_maj: null, sp98_prix: 1.769, sp98_maj: '2026-10-30T05:00:00+00:00', e85_prix: 0.779, e85_maj: '2026-10-30T05:00:00+00:00',
   gplc_prix: null, gplc_maj: null, horaires_automate_24_24: 'Oui', carburants_rupture_temporaire: null, carburants_rupture_definitive: null},
];
let APPELS_PRIX = 0;
function serveurPrix(){
  const cle = path.join(TMP, 'cle.pem'), cert = path.join(TMP, 'cert.pem');
  execSync(`openssl req -x509 -newkey rsa:2048 -nodes -keyout "${cle}" -out "${cert}" -days 2 -subj "/CN=data.economie.gouv.fr" 2>/dev/null`);
  return https.createServer({key: fs.readFileSync(cle), cert: fs.readFileSync(cert)}, (req, res) => {
    const u = new URL(req.url, 'https://x');
    APPELS_PRIX++;
    const ruptures = /rupture_type/.test(u.searchParams.get('select') || '');
    const corps = ruptures ? {total_count: 0, results: []} : {total_count: STATIONS.length, results: STATIONS};
    res.writeHead(200, {'content-type': 'application/json', 'access-control-allow-origin': '*'});
    res.end(JSON.stringify(corps));
  }).listen(443, '127.0.0.1');
}

async function attendreEtat(page, re, ms){
  try{ await page.waitForFunction(r => new RegExp(r).test(document.getElementById('etat').textContent), re.source, {timeout: ms || 20000}); }
  catch(e){
    console.error('etat attendu ' + re + ', obtenu : « ' + await page.locator('#etat').textContent() + ' »');
    throw e;
  }
}
const capture = (page, nom) => page.screenshot({path: path.join(CAPTURES, nom), fullPage: false});

(async () => {
  fs.mkdirSync(CAPTURES, {recursive: true});
  const buildA = /<meta name="fuelpilot-build" content="([^"]*)">/.exec(fs.readFileSync(PAGE, 'utf8'))[1];
  preparerSite(buildA);
  let site = serveurSite(), prix = serveurPrix();
  // Sans mandataire (variables *_PROXY de l'environnement retirees) : sinon Chromium demande un tunnel
  // vers data.economie.gouv.fr au mandataire au lieu de suivre la regle de resolution locale.
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/proxy/i.test(k)));
  const navigateur = await chromium.launch({env, args: ['--host-resolver-rules=MAP data.economie.gouv.fr 127.0.0.1', '--ignore-certificate-errors', '--no-proxy-server']});
  const contexte = await navigateur.newContext({viewport: {width: 390, height: 844}, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
                                                 locale: 'fr-FR', timezoneId: 'Europe/Paris', ignoreHTTPSErrors: true});
  // Garage pre-rempli (une E85 + E10) : l'assistant du premier lancement ne s'ouvre pas, la liste a des prix a montrer.
  await contexte.addInitScript(() => { try{ if(!localStorage.getItem('fuelpilot:reglages')) localStorage.setItem('fuelpilot:reglages',
    JSON.stringify({vehicules: [{nom: 'Recette', type: 'voiture', carbs: ['e85', 'e10'], conso: '7', cuve: '50', reserve: '60', autonomie: '600'}], vehActif: 0, assistantVu: true})); }catch(e){ /* about:blank */ } });
  const page = await contexte.newPage();
  const erreurs = [];
  page.on('pageerror', e => { erreurs.push(String(e)); console.error('  exception : ' + e); });
  const URL_PAGE = `http://127.0.0.1:${PORT}/#pos=43.61,3.88`;

  console.log('1. Premier chargement en ligne (http local), enregistrement du service worker');
  await page.goto(URL_PAGE);
  await attendreEtat(page, /prix en direct/);
  const reg = await page.evaluate(async () => { const r = await navigator.serviceWorker.ready; return {scope: r.scope, url: r.active && r.active.scriptURL}; });
  ok(reg.url && reg.url.includes('/sw.js?v=' + buildA), 'service worker actif : ' + reg.url);
  await page.waitForFunction(async () => (await caches.keys()).some(k => k.startsWith('viaminus-coquille-')), null, {timeout: 10000});
  const cles1 = await page.evaluate(async () => (await caches.keys()).sort());
  ok(cles1.includes('viaminus-coquille-' + buildA), 'cache de la coquille versionne par le build : ' + cles1.join(', '));
  ok(await page.locator('#horsLigne').count() === 0, 'pas de bandeau hors ligne en direct');
  ok(await page.locator('#carteHorsLigne').isHidden(), 'pas de mot « carte hors ligne » en ligne');
  await capture(page, '1-en-ligne.png');
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, {timeout: 10000});
  ok(true, 'la premiere page est prise en main par le worker des son activation (clients.claim)');
  // Les bornes passent par le worker (cache d'abord, rafraichi en arriere-plan) : on les demande une fois.
  const irve = await page.evaluate(async () => { const r = await fetch('data/irve/index.json'); return {ok: r.ok, date: r.headers.get('x-viaminus-date')}; });
  ok(irve.ok, 'data/irve/index.json chargee en ligne (' + (irve.date ? 'servie du cache' : 'reseau') + ')');
  await page.evaluate(() => fetch('data/irve/34.json').then(r => r.ok));
  await page.waitForTimeout(500);

  console.log('2. Deuxieme chargement : la page vient du cache du service worker');
  const appelsAvant = APPELS_PRIX;
  await page.goto('about:blank');   // meme URL a l'ancre pres = navigation dans la page ; on repart de zero
  const rep2 = await page.goto(URL_PAGE);
  ok(rep2.fromServiceWorker(), 'navigation servie par le service worker');
  ok(!!rep2.headers()['x-viaminus-date'], 'page servie depuis le cache (en-tete x-viaminus-date)');
  await attendreEtat(page, /prix en direct/);
  ok(APPELS_PRIX > appelsAvant, 'prix redemandes au reseau (reseau d\'abord) : ' + (APPELS_PRIX - appelsAvant) + ' appels');
  ok(await page.locator('#horsLigne').count() === 0, 'toujours pas de bandeau hors ligne');

  console.log('3. Passage hors ligne (emulation Chromium + serveurs arretes)');
  await contexte.setOffline(true);
  prix.closeAllConnections(); site.closeAllConnections();   // les connexions persistantes aussi : plus rien ne repond
  await new Promise(r => prix.close(r)); await new Promise(r => site.close(r));
  await page.goto('about:blank');
  const rep3 = await page.goto(URL_PAGE);
  ok(rep3 && rep3.ok() && rep3.fromServiceWorker(), 'page ouverte hors ligne depuis le cache');
  await attendreEtat(page, /hors ligne — prix du .*\d{2}\/\d{2} \d{2}:\d{2}/);
  await page.waitForTimeout(1500);   // les rechargements declenches par la carte (taille, position) finissent
  await attendreEtat(page, /hors ligne — prix du .*\d{2}\/\d{2} \d{2}:\d{2}/);
  const etat3 = await page.locator('#etat').textContent();
  ok(true, 'etat : « ' + etat3.trim() + ' »');
  await page.waitForSelector('#horsLigne', {timeout: 10000});
  const bandeau = await page.locator('#horsLigne').textContent();
  ok(/^\s*Hors ligne — prix du .*\d{2}:\d{2}/.test(bandeau), 'bandeau : « ' + bandeau.trim() + ' »');
  const nbStations = await page.evaluate(() => DATA.length);
  ok(nbStations === STATIONS.length, nbStations + ' stations dans la liste hors ligne (les dernieres vues)');
  ok(await page.locator('#carteHorsLigne').isVisible(), 'mot « carte hors ligne » affiche sur la carte');
  const irve3 = await page.evaluate(async () => { try{ const r = await fetch('data/irve/index.json'); return {ok: r.ok, date: r.headers.get('x-viaminus-date')}; }catch(e){ return {ok: false}; } });
  ok(irve3.ok && irve3.date, 'bornes (data/irve/index.json) servies depuis le cache hors ligne');
  const tuile = await page.evaluate(async () => { try{ await fetch('https://data.geopf.fr/annexes/ressources/vectorTiles/styles/PLAN.IGN/attenue.json'); return 'reponse'; }catch(e){ return 'echec'; } });
  ok(tuile === 'echec', 'style/tuiles IGN jamais en cache : echec hors ligne, comme attendu');
  await page.waitForTimeout(800);
  await capture(page, '3-hors-ligne-carte.png');
  // Itineraire hors ligne : annonce propre.
  await page.locator('#pilule').click();
  await page.locator('#arrivee').fill('Tours');
  await page.locator('#trajet button[type=submit]').click();
  await page.locator('#aBordPasser').click();   // « Réservoir au départ ? » : Passer = plein
  const t0 = Date.now();
  try{ await page.waitForFunction(() => /Hors ligne/.test(document.getElementById('infoTrajet').textContent), null, {timeout: 45000}); }
  catch(e){ console.error('infoTrajet : « ' + await page.locator('#infoTrajet').textContent() + ' », onLine=' + await page.evaluate(() => navigator.onLine) + ', formulaire visible=' + await page.locator('#trajet').isVisible()); throw e; }
  ok(Date.now() - t0 < 25000, 'itineraire hors ligne annonce en ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
  const info = await page.locator('#infoTrajet').textContent();
  ok(/Hors ligne : itinéraire indisponible/.test(info), 'itineraire : « ' + info.trim() + ' »');
  await capture(page, '3-hors-ligne-itineraire.png');
  await page.keyboard.press('Escape');
  // La liste hors ligne, feuille depliee.
  await page.evaluate(() => { rechercheOuverte(false); deplier('plein'); });
  await page.waitForTimeout(600);
  await capture(page, '3-hors-ligne-liste.png');

  console.log('4. Retour en ligne, nouvelle version publiee : bandeau, Recharger, purge');
  const buildB = buildA.replace(/\d{6}$/, m => String((parseInt(m, 10) + 1) % 1000000).padStart(6, '0'));
  preparerSite(buildB);
  site = serveurSite(); prix = serveurPrix();
  await contexte.setOffline(false);
  await page.waitForTimeout(500);
  await page.evaluate(() => { derniereVerif = 0; return verifierVersion(); });
  await page.waitForSelector('#majDispo', {timeout: 20000});
  ok(true, 'bandeau « nouvelle version » apres l\'installation du nouveau worker (sw.js?v=' + buildB + ')');
  const attente = await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return r && r.waiting && r.waiting.scriptURL; });
  ok(attente && attente.includes('v=' + buildB), 'nouveau worker en attente : ' + attente);
  ok((await page.evaluate(() => document.querySelector('meta[name="fuelpilot-build"]').content)) === buildA, 'pas de rechargement automatique (page toujours en ' + buildA + ')');
  await capture(page, '4-nouvelle-version.png');
  await Promise.all([page.waitForNavigation({timeout: 20000}), page.locator('#majDispo .btn.primaire').click()]);
  await attendreEtat(page, /prix en direct/);
  ok((await page.evaluate(() => document.querySelector('meta[name="fuelpilot-build"]').content)) === buildB, 'apres Recharger : page en ' + buildB);
  await page.waitForFunction(async b => { const k = await caches.keys(); return k.includes('viaminus-coquille-' + b) && !k.some(x => x.startsWith('viaminus-coquille-') && x !== 'viaminus-coquille-' + b); }, buildB, {timeout: 10000});
  const cles4 = await page.evaluate(async () => (await caches.keys()).sort());
  ok(!cles4.includes('viaminus-coquille-' + buildA) && cles4.includes('viaminus-coquille-' + buildB), 'ancien cache purge a l\'activation : ' + cles4.join(', '));
  ok(cles4.includes('viaminus-prix') && cles4.includes('viaminus-irve'), 'caches de donnees conserves');
  // Rien de personnel dans les caches : jamais la position (geocodage inverse, #pos=), jamais le
  // garage (localStorage). Les URL des prix portent l'emprise de la carte (un rectangle, cle de la
  // reponse publique), pas le point de l'appareil.
  const urls = await page.evaluate(async () => {
    const urls = [];
    for(const n of await caches.keys()){ const c = await caches.open(n); for(const k of await c.keys()) urls.push(k.url); }
    return urls;
  });
  const fuite = urls.filter(u => /api-adresse|geocodage|reverse|pos=|fuelpilot|reglages|veh=|trajet=/.test(u));
  ok(fuite.length === 0, 'aucune URL de cache ne porte la position ni le garage (' + urls.length + ' entrees : page, prix par emprise, bornes)');
  ok(urls.every(u => /^http:\/\/127\.0\.0\.1:8765\/(index\.html)?(data\/irve\/)?|^https:\/\/data\.economie\.gouv\.fr\//.test(u)), 'seules la coquille, les prix et les bornes sont en cache');
  await page.waitForTimeout(300);
  ok(erreurs.length === 0, 'aucune exception JavaScript pendant toute la recette' + (erreurs.length ? ' : ' + erreurs.join(' | ') : ''));
  await contexte.close();

  console.log('5. file:// : aucun enregistrement, aucune erreur console');
  const ctx5 = await navigateur.newContext({viewport: {width: 390, height: 844}, locale: 'fr-FR'});
  const page5 = await ctx5.newPage();
  const console5 = [], erreurs5 = [];
  page5.on('console', m => { if(m.type() === 'error') console5.push(m.text()); });
  page5.on('pageerror', e => erreurs5.push(String(e)));
  await page5.goto('file://' + path.resolve(PAGE) + '#pos=43.61,3.88');
  await attendreEtat(page5, /hors ligne — relevé du|prix en direct/);
  // En file://, Chromium refuse jusqu'a l'interrogation (« document is in an invalid state ») : la page ne
  // tente rien (SW_OK faux, pas d'appel a register) et aucune exception n'en sort.
  const sw5 = await page5.evaluate(async () => { try{ if(!('serviceWorker' in navigator)) return 'absent'; const r = await navigator.serviceWorker.getRegistrations(); return r.length; }catch(e){ return 'refuse par le navigateur'; } });
  ok(sw5 === 'absent' || sw5 === 0 || sw5 === 'refuse par le navigateur', 'aucun service worker en file:// (' + sw5 + ')');
  ok((await page5.evaluate(() => SW_OK)) === false, 'la page n\'enregistre rien en file:// (SW_OK faux)');
  const reseau = console5.filter(t => !/Failed to load resource|net::ERR_|ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|ERR_PROXY/.test(t));
  ok(erreurs5.length === 0 && reseau.length === 0, 'aucune erreur de script en file:// (erreurs reseau attendues ignorees : ' + console5.length + ')' + (reseau.length ? ' : ' + reseau.join(' | ') : ''));
  await capture(page5, '5-file.png');
  await ctx5.close();

  await navigateur.close();
  prix.closeAllConnections(); site.closeAllConnections();
  await new Promise(r => prix.close(r)); await new Promise(r => site.close(r));
  fs.rmSync(TMP, {recursive: true, force: true});
  console.log(ECHECS ? `\n${ECHECS} ECHEC(S)` : '\nRecette : tout est vert');
  process.exit(ECHECS ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
