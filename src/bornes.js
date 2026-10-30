// Bornes de recharge, cote interface (phase 2, 30/10/2026) : ce qui se calcule sans DOM pour
// afficher les bornes — departements a charger pour une emprise, classe de marqueur par
// puissance, libelles des horaires et de la date de mise a jour, « peut-on s'y brancher ».
// Module PUR, exporte pour Node et teste dans bornes.test.js ; dans la page il suit irve.js
// (dont il complete les fonctions sans les modifier) et precede app.js.

// ---- Departements a charger pour une emprise ----
// index : contenu de data/irve/index.json ({departements: {"34": {bbox: [w, s, e, n], …}}}),
// bbox d'emprise au format de la carte ({s, n, w, e}). Renvoie les codes des departements
// dont la bbox croise l'emprise, tries. Une bbox absente ou illisible n'est jamais retenue.
// La bbox d'un departement vaut [lon min, lat min, lon max, lat max] (irve_build.py) ; un
// objet {w, s, e, n} est accepte aussi.
function lireBbox(b){
  if(Array.isArray(b) && b.length === 4 && b.every(Number.isFinite)) return {w: b[0], s: b[1], e: b[2], n: b[3]};
  if(b && typeof b === 'object' && [b.w, b.s, b.e, b.n].every(Number.isFinite)) return {w: b.w, s: b.s, e: b.e, n: b.n};
  return null;
}
function departementsPourEmprise(index, emprise){
  const deps = index && index.departements;
  if(!deps || !emprise || ![emprise.s, emprise.n, emprise.w, emprise.e].every(Number.isFinite)) return [];
  const res = [];
  for(const [dep, d] of Object.entries(deps)){
    const b = lireBbox(d && d.bbox);
    if(!b) continue;
    if(b.w <= emprise.e && b.e >= emprise.w && b.s <= emprise.n && b.n >= emprise.s) res.push(dep);
  }
  return res.sort();
}

// ---- Classe de marqueur par puissance maximale ----
// >= 150 kW : « rapide » ; 50 a 149 : « moyen » ; < 50 : « lent » ; null ou illisible : « inconnu ».
const SEUIL_RAPIDE = 150, SEUIL_MOYEN = 50;
function classePuissance(kw){
  const p = typeof kw === 'number' ? kw : parseFloat(kw);
  if(!Number.isFinite(p) || !(p > 0)) return 'inconnu';
  if(p >= SEUIL_RAPIDE) return 'rapide';
  if(p >= SEUIL_MOYEN) return 'moyen';
  return 'lent';
}

// kW en texte francais : 22.08 -> « 22 kW », 7.36 -> « 7,4 kW », null -> « puissance inconnue ».
function libellePuissance(kw){
  const p = typeof kw === 'number' ? kw : parseFloat(kw);
  if(!Number.isFinite(p) || !(p > 0)) return 'puissance inconnue';
  const arrondi = p >= 20 ? Math.round(p) : Math.round(p * 10) / 10;
  return String(arrondi).replace('.', ',') + ' kW';
}

// ---- Horaires : resume lisible ----
// Chaine `h` de data/irve/<dep>.json (brute normalisee par irve_build.py) : « 24/7 » et ses
// variantes -> « 24h/24 », vide -> « horaires inconnus », autre -> le texte tel quel (il est
// deja echappe a l'ingestion et sera rendu en texte).
function libelleHoraires(h){
  if(h == null || String(h).trim() === '') return 'horaires inconnus';
  const t = String(h).trim();
  const c = t.toLowerCase().replace(/\s+/g, '');
  if(c === '24/7' || /^(24h?\/24(et|-|,|;)?(7j?\/7)?|7j?\/7(et|-|,|;)?(24h?\/24)?)$/.test(c)) return '24h/24';
  if(/^mo-su\s+00:00-(23:5\d|24:00|00:00)$/i.test(t)) return '24h/24';   // « Mo-Su 00:00-23:57 » (Mauguio)
  return t;
}

// ---- Date de mise a jour ----
// maj : « AAAA-MM-JJ » ; now : Date (ou ms). Renvoie {jours, txt, ancien} : « mis à jour
// aujourd'hui / il y a N jours » ; au-dela de 365 jours, ancien = true et le texte le dit
// (« donnée ancienne »). Date absente ou illisible : {jours: null, txt: 'date de mise à jour
// inconnue', ancien: false}.
const SEUIL_ANCIEN = 365;
function libelleMaj(maj, now){
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(maj == null ? '' : maj));
  if(!m) return {jours: null, txt: 'date de mise à jour inconnue', ancien: false};
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  const t = now instanceof Date ? now.getTime() : (Number.isFinite(now) ? now : Date.now());
  if(isNaN(d.getTime())) return {jours: null, txt: 'date de mise à jour inconnue', ancien: false};
  const jours = Math.max(0, Math.floor((t - d.getTime()) / 864e5));
  const ancien = jours > SEUIL_ANCIEN;
  const quand = jours === 0 ? 'aujourd\'hui' : jours === 1 ? 'hier' : `il y a ${jours} jours`;
  return {jours, txt: `mis à jour ${quand}` + (ancien ? ` (${m[3]}/${m[2]}/${m[1]}) — donnée ancienne` : ''), ancien};
}

// ---- Peut-on s'y brancher ? ----
// Pour AFFICHER les bornes d'un vehicule electrique (prise 'ccs' | 'chademo' | 't2') : vrai si
// la borne offre la prise DC du vehicule ou une prise alternative (Type 2 / EF : toute voiture
// se recharge aussi en alternatif) ; faux seulement si ces prises sont CONNUES absentes ; une
// borne dont les prises sont inconnues (null) est gardee (on ne l'ecarte pas sur une absence
// d'information). Plus large que compatible() d'irve.js, qui sert au plan et exige une prise
// connue.
const PRISE_DC = {ccs: 'ccs', chademo: 'chademo'};
function branchable(station, prise){
  if(!station) return false;
  const dc = PRISE_DC[prise];
  const prises = dc ? [station[dc], station.ac] : [station.ac];
  if(prises.some(v => v === true)) return true;
  return !prises.every(v => v === false);   // au moins une inconnue : gardee ; toutes connues absentes : ecartee
}

// ---- Prises en texte ----
// {ccs, chademo, ac} -> « CCS · CHAdeMO · Type 2 » ; rien de connu -> « prises inconnues ».
function libellePrises(s){
  if(!s) return 'prises inconnues';
  const l = [];
  if(s.ccs === true) l.push('CCS');
  if(s.chademo === true) l.push('CHAdeMO');
  if(s.ac === true) l.push('Type 2');
  return l.length ? l.join(' · ') : 'prises inconnues';
}

// ---- Paiement en texte ----
// gratuit / cb / acte a trois etats -> « gratuit », « carte bancaire », « à l'acte »,
// « paiement inconnu » ; plusieurs se cumulent (« carte bancaire · à l'acte »).
function libellePaiement(s){
  if(!s) return 'paiement inconnu';
  if(s.gratuit === true) return 'gratuit';
  const l = [];
  if(s.cb === true) l.push('carte bancaire');
  if(s.acte === true) l.push('à l\'acte');
  return l.length ? l.join(' · ') : 'paiement inconnu';
}

// Export Node (tests) ; sans effet dans la page, ou `module` n'existe pas.
if(typeof module !== 'undefined' && module.exports)
  module.exports = {departementsPourEmprise, classePuissance, libellePuissance, libelleHoraires, libelleMaj,
                    branchable, libellePrises, libellePaiement, SEUIL_RAPIDE, SEUIL_MOYEN, SEUIL_ANCIEN};
