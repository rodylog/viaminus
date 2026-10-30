// Socle du banc : hotes des API, URL normalisee, fixtures (lecture, ecriture), page generee,
// navigateur, lancement d'un trajet par l'URL #trajet= et attente du plan (point d'acces de
// test window.__viaminus_plan / evenement viaminus:plan ajoute a src/app.js le 30/10/2026).
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
const {execFileSync} = require('child_process');
const {repondreFlux} = require('./flux.js');

const RACINE = path.resolve(__dirname, '..', '..');
const BANC = path.resolve(__dirname, '..');
const FIXTURES = path.join(BANC, 'fixtures');
const VERSION_FIXTURE = 1;

// API dont les reponses font le plan (les hotes de connect-src dans generate.py) : enregistrees,
// puis servies au rejeu ; une requete vers l'une d'elles sans reponse en fixture = echec du test.
const API = [
  {hote: 'data.economie.gouv.fr', nom: 'prix'},
  {hote: 'api-adresse.data.gouv.fr', nom: 'ban'},
  {hote: 'data.geopf.fr', chemin: /^\/geocodage\//, nom: 'geocodage'},
  {hote: 'data.geopf.fr', chemin: /^\/navigation\//, nom: 'itineraire'},
  {hote: 'valhalla1.openstreetmap.de', nom: 'valhalla'},
];
// Fond de carte (style vectoriel, tuiles WMTS, glyphes, sprites, OSM de secours) : hors banc.
// Jamais enregistre ; coupe au rejeu sans faire echouer le test (le plan n'en depend pas).
const FOND = ['data.geopf.fr', 'tile.openstreetmap.org'];

// genre : 'page' (file:, data:, blob:), 'api' (+ nom), 'fond', 'inconnu'.
function classer(url){
  const u = new URL(url);
  if(u.protocol !== 'http:' && u.protocol !== 'https:') return {genre: 'page'};
  const api = API.find(a => a.hote === u.hostname && (!a.chemin || a.chemin.test(u.pathname)));
  if(api) return {genre: 'api', nom: api.nom};
  if(FOND.includes(u.hostname)) return {genre: 'fond'};
  return {genre: 'inconnu'};
}

// URL normalisee = cle des fixtures : hote + chemin + parametres decodes, tries par nom puis valeur.
function cleUrl(url){
  const u = new URL(url);
  const params = [...u.searchParams.entries()].sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0);
  const q = params.map(([k, v]) => `${k}=${v}`).join('&');
  return `${u.hostname}${u.pathname}${q ? '?' + q : ''}`;
}

const sha256 = x => crypto.createHash('sha256').update(x).digest('hex');
const slugifier = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const lireJson = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const ecrireJson = (f, o) => { fs.mkdirSync(path.dirname(f), {recursive: true}); fs.writeFileSync(f, JSON.stringify(o, null, 2) + '\n'); };

// ---- Vehicules et scenarios ----
const VEHICULES = lireJson(path.join(BANC, 'vehicules.json'));
function vehicule(v){
  if(v == null) v = 'polo-e85';
  if(typeof v === 'string'){
    if(VEHICULES[v] && v !== '_note') return Object.assign({}, VEHICULES[v]);
    // Format du lien #veh= : Nom|e85+e10|conso|cuve|reserve|autonomie
    const f = v.split('|');
    if(f.length >= 5) return {nom: f[0], carbs: f[1].split('+').filter(Boolean), conso: f[2], cuve: f[3], reserve: f[4], autonomie: f[5] || ''};
    throw new Error(`véhicule inconnu : « ${v} » (fiches : ${Object.keys(VEHICULES).filter(k => k !== '_note').join(', ')}, ou Nom|carbs|conso|cuve|reserve|autonomie)`);
  }
  return Object.assign({}, v);
}
// Parametre #veh= tel que l'application le construit (vehParam dans app.js).
function vehParam(v){
  const e = x => encodeURIComponent(x == null ? '' : String(x));
  return [e(v.nom), (v.carbs || []).join('+'), e(v.conso), e(v.cuve), e(v.reserve), e(v.autonomie)].join('|');
}
// URL de la page avec le trajet : #trajet=<depart>|<arrivee>|<couloir>|<options>&veh=…
function urlTrajet(fichierPage, sc){
  const o = (sc.sansPeage ? 'p' : '') + (sc.allerRetour ? 'r' : '');
  const h = `#trajet=${encodeURIComponent(sc.depart || '')}|${encodeURIComponent(sc.arrivee)}|${sc.couloir || 10}|${o}&veh=${vehParam(vehicule(sc.veh))}`;
  return require('url').pathToFileURL(fichierPage).href + h;
}
function scenarioNormalise(sc){
  if(!sc.arrivee) throw new Error('scénario sans arrivée');
  const s = {slug: sc.slug || slugifier(`${sc.depart || 'ma-position'}-${sc.arrivee}`), depart: sc.depart || '', arrivee: sc.arrivee,
             couloir: String(sc.couloir || 10), sansPeage: !!sc.sansPeage, allerRetour: !!sc.allerRetour,
             veh: vehicule(sc.veh), aBord: sc.aBord == null ? null : +sc.aBord, aBordUnite: sc.aBordUnite === 'l' ? 'l' : 'km'};
  if(!['1', '2', '5', '10', '20'].includes(s.couloir)) throw new Error('couloir : 1, 2, 5, 10 ou 20 km');
  return s;
}
function scenarios(){ return lireJson(path.join(BANC, 'scenarios.json')).map(scenarioNormalise); }

// ---- Page generee (generate.py reste le seul build) ----
let PAGE = null;
function genererPage(){
  if(PAGE && fs.existsSync(PAGE)) return PAGE;
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'viaminus-banc-'));
  const out = path.join(dossier, 'viaminus.html');
  try{
    execFileSync('python3', [path.join(RACINE, 'generate.py'), '--sans-snapshot', '--out', out], {stdio: ['ignore', 'pipe', 'pipe']});
  }catch(e){
    throw new Error('generate.py a échoué (MapLibre absent du cache ~/.cache/fuelpilot ? voir banc/README.md) :\n' + String(e.stderr || e.message));
  }
  PAGE = out;
  return out;
}

// ---- Navigateur ----
function playwright(){
  try{ return require('playwright'); }
  catch(e){ throw new Error('Playwright introuvable : dans banc/, « npm install » puis « npx playwright install chromium » (voir banc/README.md)'); }
}
async function ouvrirNavigateur(){ return playwright().chromium.launch(); }

// Contexte neuf (stockage vide : aucun reglage, aucun repere), horloge figee a `date` (regles
// datees : prix figes, ruptures), fuseau Europe/Paris, et `routeur` sur toutes les requetes.
async function ouvrirPage(navigateur, {date, routeur}){
  const ctx = await navigateur.newContext({viewport: {width: 1280, height: 900}, locale: 'fr-FR', timezoneId: 'Europe/Paris'});
  const page = await ctx.newPage();
  if(date) await page.clock.setFixedTime(new Date(date));
  await page.addInitScript(() => {
    window.__banc = {plans: 0};
    window.addEventListener('viaminus:plan', () => { window.__banc.plans++; });
  });
  await ctx.route('**/*', routeur);
  return {ctx, page};
}

// Attend une publication du plan posterieure a `apres`, puis le calme : aucune requete en vol et
// aucune nouvelle publication pendant 500 ms (rendu() est rappele apres le referentiel, apres le
// cadrage de la carte…). Echoue tot si l'application a renonce (message dans #infoTrajet).
async function attendrePlan(page, {apres = 0, delai = 30000, enVol = () => 0} = {}){
  const debut = Date.now();
  for(;;){
    const info = await page.evaluate(() => document.getElementById('infoTrajet').textContent);
    if(/indisponible|introuvable|vide/.test(info)) throw new Error(`trajet abandonné par l'application : « ${info} »`);
    const n = await page.evaluate(() => window.__banc.plans);
    if(n > apres && enVol() === 0){
      await page.waitForTimeout(500);
      const n2 = await page.evaluate(() => window.__banc.plans);
      if(n2 === n && enVol() === 0) return {plan: await page.evaluate(() => window.__viaminus_plan), n};
    }
    if(Date.now() - debut > delai) throw new Error(`plan non produit en ${Math.round(delai / 1000)} s (trajet : « ${info} », publications : ${n})`);
    await page.waitForTimeout(100);
  }
}

// Joue un scenario dans une page deja routee : ouvre l'URL #trajet=, attend le plan, puis, si le
// scenario fixe le reservoir au depart, le saisit (champ #aBord + unite) et attend le plan refait.
async function jouer(page, fichierPage, sc, enVol){
  await page.goto(urlTrajet(fichierPage, sc));
  let r = await attendrePlan(page, {enVol});
  if(sc.aBord != null){
    await page.selectOption('#aBordUnite', sc.aBordUnite);
    await page.fill('#aBord', String(sc.aBord));
    await page.dispatchEvent('#aBord', 'change');
    r = await attendrePlan(page, {apres: r.n, enVol});
  }
  return r.plan;
}

// ---- Fixtures ----
function listerFixtures(){
  if(!fs.existsSync(FIXTURES)) return [];
  return fs.readdirSync(FIXTURES).filter(d => fs.existsSync(path.join(FIXTURES, d, 'meta.json'))).sort()
    .map(d => path.join(FIXTURES, d));
}
function lireFixture(dossier){
  const meta = lireJson(path.join(dossier, 'meta.json'));
  if(meta.version !== VERSION_FIXTURE) throw new Error(`${dossier} : version de fixture ${meta.version}, attendue ${VERSION_FIXTURE}`);
  const exactes = new Map();
  let stations = null;
  for(const r of meta.reponses || []){
    if(r.emule === 'flux-prix') stations = lireJson(path.join(dossier, r.fichier));
    else exactes.set(r.url, r);
  }
  const attendu = fs.existsSync(path.join(dossier, 'attendu.json')) ? lireJson(path.join(dossier, 'attendu.json')) : null;
  return {
    dossier, slug: path.basename(dossier), meta, attendu, scenario: scenarioNormalise(meta.scenario),
    // {statut, type, corps} ou null si rien ne correspond.
    repondre(url){
      const r = exactes.get(cleUrl(url));
      if(r){
        const f = lireJson(path.join(dossier, r.fichier));
        return {statut: f.statut, type: f.type, corps: typeof f.corps === 'string' ? f.corps : JSON.stringify(f.corps)};
      }
      if(stations && classer(url).nom === 'prix') return repondreFlux(stations, url);
      return null;
    },
  };
}

// Routeur du rejeu : page -> reseau local ; fond de carte -> coupe ; API -> fixture, sinon coupe
// ET note dans journal.manquantes ; hote inconnu -> coupe et note. journal.enVol compte les
// requetes en cours (attendrePlan s'en sert).
function routeurRejeu(fixture, journal){
  return async route => {
    const url = route.request().url(), c = classer(url);
    if(c.genre === 'page') return route.continue();
    if(c.genre === 'fond') return route.abort('failed');
    journal.enVol++;
    try{
      if(c.genre === 'inconnu'){ journal.inconnues.push(cleUrl(url)); return await route.abort('failed'); }
      journal.requetes.push(cleUrl(url));
      const rep = fixture.repondre(url);
      if(!rep){ journal.manquantes.push(cleUrl(url)); return await route.abort('failed'); }
      return await route.fulfill({status: rep.statut, contentType: rep.type, body: rep.corps});
    }finally{ journal.enVol--; }
  };
}
const journalNeuf = () => ({enVol: 0, requetes: [], manquantes: [], inconnues: []});

// Rejoue une fixture : {plan, journal}. Le navigateur est fourni (un seul pour tous les tests).
async function rejouer(navigateur, fixture){
  const fichierPage = genererPage();
  const journal = journalNeuf();
  const {ctx, page} = await ouvrirPage(navigateur, {date: fixture.meta.date, routeur: routeurRejeu(fixture, journal)});
  try{
    const plan = await jouer(page, fichierPage, fixture.scenario, () => journal.enVol);
    return {plan, journal};
  }finally{ await ctx.close(); }
}

// Projection stable d'un plan, pour attendu.json et le diagnostic : ce qui doit rester identique
// d'un rejeu a l'autre tant que le code ne change pas d'intention.
const r2 = x => x == null ? null : Math.round(x * 100) / 100;
function resumePlan(p){
  if(!p) return null;
  const st = s => s ? {id: s.id, ville: s.ville, km: Math.round(s.km), prix: s.prix, datePrix: s.datePrix} : null;
  return {
    etat: p.etat, couloir: p.couloir, trajet: p.trajet && {dep: p.trajet.dep, arr: p.trajet.arr, km: Math.round(p.trajet.km), moteur: p.trajet.moteur},
    etapes: (p.etapes || []).map(e => Object.assign(st(e), {litres: r2(e.litres), plein: e.plein, cout: r2(e.cout)})),
    depart: st(p.depart), arrivee: st(p.arrivee),
    achats: r2(p.achats), voyage: r2(p.voyage), aBordValeur: r2(p.aBordValeur), prixMoyen: p.prixMoyen == null ? null : Math.round(p.prixMoyen * 1000) / 1000,
    economie: p.economie ? {economie: r2(p.economie.economie), prix: p.economie.prix} : null,
    detours: (p.detours || []).map(d => ({w: d.w, voyage: r2(d.voyage), minutes: Math.round(d.minutes), arrets: d.arrets, conseille: d.conseille})),
    messages: p.messages || [], alertes: p.alertes || [],
  };
}

module.exports = {RACINE, BANC, FIXTURES, VERSION_FIXTURE, API, classer, cleUrl, sha256, slugifier, lireJson, ecrireJson,
  VEHICULES, vehicule, vehParam, urlTrajet, scenarioNormalise, scenarios, genererPage, ouvrirNavigateur, ouvrirPage,
  attendrePlan, jouer, listerFixtures, lireFixture, routeurRejeu, journalNeuf, rejouer, resumePlan};
