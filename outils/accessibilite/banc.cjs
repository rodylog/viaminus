// Banc commun : ouvre la page générée dans Chromium (Playwright), remplace le réseau par les
// données factices (donnees.cjs) et sait atteindre chaque état mesuré (accueil, assistant,
// liste, fiche station, fiche borne, plan de pleins, plan de charge, Options, Aide).
// Usage : const {ouvrir, ETATS, atteindre} = require('./banc.cjs');
'use strict';
const fs = require('fs');
const {chromium} = require('playwright');
const D = require('./donnees.cjs');

const ORIGINE = 'http://viaminus.test';
const CONTEXTES = [
  {nom: 'mobile-clair', largeur: 375, hauteur: 667, sombre: false, mobile: true},
  {nom: 'mobile-sombre', largeur: 375, hauteur: 667, sombre: true, mobile: true},
  {nom: 'bureau-clair', largeur: 1280, hauteur: 800, sombre: false, mobile: false},
  {nom: 'bureau-sombre', largeur: 1280, hauteur: 800, sombre: true, mobile: false},
];

function json(route, obj){ return route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(obj)}); }

// Réseau : tout est servi localement ; ce qui n'est pas prévu est refusé (la page doit tenir).
// latence (ms) : retard applique aux reponses des API (prix, itineraire, bornes) pour imiter un
// reseau reel ; 0 par defaut (mesure du travail de la page seule).
async function brancherReseau(context, html, journal, latence = 0){
  const json0 = json;
  await context.route('**/*', async route => {
    const u = route.request().url();
    if(journal) journal.push(u);
    const json = (r, o) => latence && !u.startsWith(ORIGINE + '/index.html') ? new Promise(res => setTimeout(() => res(json0(r, o)), latence)) : json0(r, o);
    if(u.startsWith(ORIGINE + '/index.html')) return route.fulfill({status: 200, contentType: 'text/html; charset=utf-8', body: html});
    if(u.startsWith(ORIGINE + '/data/irve/index.json')) return json(route, D.indexIrve());
    const m = u.match(/^http:\/\/viaminus\.test\/data\/irve\/(\d\d)\.json/);
    if(m) return json(route, D.bornes(m[1]));
    if(u.includes('data.economie.gouv.fr')) return json(route, D.reponseStations());
    if(u.includes('/geocodage/search') || u.includes('api-adresse.data.gouv.fr/search')) return json(route, D.geocode(new URL(u).searchParams.get('q')));
    if(u.includes('api-adresse.data.gouv.fr/reverse')) return json(route, D.inverse());
    if(u.includes('/navigation/itineraire')) return json(route, D.itineraire());
    if(u.includes('/styles/PLAN.IGN/attenue.json')) return json(route, D.STYLE);
    if(u.includes('sedeaplicaciones.minetur.gob.es')) return json(route, D.provinceES());
    return route.abort();
  });
}

// ouvrir({html, contexte, scenario}) : scenario = 'thermique' | 'elec' | 'premier' (aucun réglage :
// l'assistant s'ouvre). Renvoie {navigateur, context, page}.
async function ouvrir({html, contexte, scenario = 'thermique', navigateur, journal, initScript, latence = 0}){
  const nav = navigateur || await chromium.launch();
  const c = contexte;
  const centre = scenario === 'elec' ? D.CENTRE_BORNE : scenario === 'espagne' ? D.CENTRE_GIRONA : D.CENTRE_PARIS;
  const context = await nav.newContext({
    viewport: {width: c.largeur, height: c.hauteur}, colorScheme: c.sombre ? 'dark' : 'light',
    hasTouch: !!c.mobile, isMobile: !!c.mobile, deviceScaleFactor: 1, locale: 'fr-FR',
    geolocation: {latitude: centre[0], longitude: centre[1]}, permissions: ['geolocation'],
    bypassCSP: true,   // seulement pour injecter axe-core ; la CSP de la page n'est pas l'objet de la mesure
  });
  await brancherReseau(context, html, journal, latence);
  if(scenario !== 'premier'){
    const regl = JSON.stringify(D.reglages(scenario, centre));
    await context.addInitScript(r => { try{ localStorage.setItem('fuelpilot:reglages', r); }catch(e){} }, regl);
  }
  if(initScript) await context.addInitScript(initScript);
  const page = await context.newPage();
  page.on('pageerror', e => console.error('  [erreur page]', e.message));
  await page.goto(ORIGINE + '/index.html');
  return {navigateur: nav, context, page};
}

const attendre = (page, sel, t = 15000) => page.waitForSelector(sel, {state: 'visible', timeout: t});
async function attendreListe(page, elec){
  await attendre(page, elec ? '#listeBornes .carte' : '#liste .carte');
}
// Panneau mobile : le déplier en plein (au clavier : flèche haut sur la poignée).
async function deplier(page, contexte){
  if(!contexte.mobile) return;
  for(let i = 0; i < 2; i++){ await page.focus('#poignee'); await page.keyboard.press('ArrowUp'); }
  await page.waitForFunction(() => document.getElementById('panneau').dataset.cran === 'plein');
}
async function trajet(page, elec){
  await page.evaluate(() => { document.getElementById('recherche').classList.add('ouvert'); });
  await page.fill('#depart', 'Paris');
  await page.fill('#arrivee', 'Lyon');
  await page.click('#trajet [type=submit]');
  if(!elec){
    await attendre(page, '#aBordQ');           // « il vous reste combien ? » : Passer = plein
    await page.click('#aBordPasser');
  }
  await attendre(page, '#blocPlan .ligne-temps', 20000);
}

// Les états mesurés : nom, scénario, et comment y aller une fois la page chargée.
const ETATS = [
  {nom: 'accueil', scenario: 'thermique', aller: async (p, c) => { await attendreListe(p); }},
  {nom: 'assistant-1', scenario: 'premier', aller: async (p) => { await attendre(p, '#asEcran1'); }},
  {nom: 'assistant-2', scenario: 'premier', aller: async (p) => {
    await attendre(p, '#asEcran1'); await p.check('#asCarbs input[value=e85]'); await p.fill('#asAutonomie', '600');
    await p.click('#asSuite1'); await attendre(p, '#asEcran2'); }},
  {nom: 'assistant-3', scenario: 'premier', aller: async (p) => {
    await attendre(p, '#asEcran1'); await p.check('#asCarbs input[value=e85]'); await p.fill('#asAutonomie', '600');
    await p.click('#asSuite1'); await attendre(p, '#asEcran2'); await p.click('#asPlusTard'); await attendre(p, '#asEcran3'); }},
  {nom: 'liste', scenario: 'thermique', aller: async (p, c) => { await attendreListe(p); await deplier(p, c); }},
  {nom: 'fiche-station', scenario: 'thermique', aller: async (p, c) => {
    await attendreListe(p); await deplier(p, c); await p.click('#liste .carte'); await attendre(p, '#ficheStation'); }},
  {nom: 'fiche-borne', scenario: 'elec', aller: async (p, c) => {
    await attendreListe(p, true); await deplier(p, c); await p.click('#listeBornes .carte'); await attendre(p, '#ficheBorne'); }},
  {nom: 'plan-pleins', scenario: 'thermique', aller: async (p, c) => { await attendreListe(p); await trajet(p, false); await deplier(p, c); }},
  {nom: 'plan-charge', scenario: 'elec', aller: async (p, c) => { await attendreListe(p, true); await trajet(p, true); await deplier(p, c); }},
  // État supplémentaire (hors brief) : stations espagnoles dans la liste (badge ES, lang="es").
  {nom: 'liste-espagne', scenario: 'espagne', aller: async (p, c) => { await p.waitForSelector('#liste .badge-pays', {state: 'attached', timeout: 15000}); await deplier(p, c); }},
  {nom: 'options', scenario: 'thermique', aller: async (p) => { await attendreListe(p); await p.click('#options'); await attendre(p, '#menuOptions'); }},
  {nom: 'aide', scenario: 'thermique', aller: async (p) => { await attendreListe(p); await p.click('#aideBtn'); await attendre(p, '#aide'); }},
];

function lireHtml(chemin){
  if(!chemin || !fs.existsSync(chemin)){ console.error('usage : node <script>.cjs <page.html> <dossier de sortie>'); process.exit(2); }
  return fs.readFileSync(chemin, 'utf8');
}

module.exports = {ORIGINE, CONTEXTES, ETATS, ouvrir, attendre, attendreListe, deplier, trajet, lireHtml};
