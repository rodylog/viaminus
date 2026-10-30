// Données factices du banc d'accessibilité : dix stations sur une ligne Paris → Lyon, trois
// bornes de recharge (forme de src/fixtures/irve-34.json, déplacées sur la ligne), un véhicule
// thermique et un électrique. Aucune donnée réelle, aucune donnée personnelle. Les réponses
// imitent les API publiques appelées par la page (ministère de l'Économie, Géoplateforme IGN,
// Base Adresse Nationale, fichiers data/irve/*.json servis à côté de la page).
'use strict';
const fs = require('fs');
const path = require('path');

// Ligne Paris → Auxerre → Beaune → Lyon (lat, lon) ; la route factice la suit en 80 points.
const SOMMETS = [[48.8566, 2.3522], [47.7980, 3.5734], [47.0240, 4.8400], [45.7640, 4.8357]];
function interpoler(pts, n){
  const seg = [];
  for(let i = 1; i < pts.length; i++) seg.push(Math.hypot(pts[i][0] - pts[i-1][0], (pts[i][1] - pts[i-1][1]) * 0.68));
  const total = seg.reduce((a, b) => a + b, 0);
  const res = [];
  for(let k = 0; k < n; k++){
    let t = total * k / (n - 1), i = 0;
    while(i < seg.length - 1 && t > seg[i]){ t -= seg[i]; i++; }
    const f = seg[i] ? t / seg[i] : 0;
    res.push([pts[i][0] + (pts[i+1][0] - pts[i][0]) * f, pts[i][1] + (pts[i+1][1] - pts[i][1]) * f]);
  }
  return res;
}
const ROUTE = interpoler(SOMMETS, 80);          // [lat, lon]
const DISTANCE_M = 465000, DUREE_S = 4 * 3600 + 46 * 60;

// Dix stations : trois autour du centre de Paris (visibles à l'accueil, zoom 13), sept le long
// de la route. Prix E85 / E10 / gazole variés : une moins chère nette, une dans le décile cher.
const VILLES = ['Paris', 'Paris', 'Paris', 'Fontainebleau', 'Sens', 'Auxerre', 'Avallon', 'Beaune', 'Mâcon', 'Lyon'];
const CP = ['75011', '75012', '75004', '77300', '89100', '89000', '89200', '21200', '71000', '69003'];
const POS = [[48.858, 2.372], [48.842, 2.389], [48.853, 2.357],
             ROUTE[10], ROUTE[18], ROUTE[27], ROUTE[36], ROUTE[52], ROUTE[66], ROUTE[78]];
const E85 = [0.729, 0.689, 0.799, 0.749, 0.739, 0.699, 0.769, 0.719, 0.759, 0.709];
const E10 = [1.729, 1.699, 1.819, 1.759, 1.739, 1.709, 1.779, 1.729, 1.769, 1.719];
const GAZ = [1.659, 1.629, 1.749, 1.689, 1.669, 1.639, 1.709, 1.659, 1.699, 1.649];
const MAJ = '2026-10-30T07:40:00+00:00';
function stations(){
  return VILLES.map((ville, i) => {
    const [la, lo] = POS[i];
    return {id: String(1000 + i), latitude: String(Math.round(la * 100000)), longitude: String(Math.round(lo * 100000)),
            cp: CP[i], ville, adresse: `${10 + i * 3} avenue de la Gare`,
            gazole_prix: GAZ[i], gazole_maj: MAJ, e10_prix: E10[i], e10_maj: MAJ,
            sp95_prix: null, sp95_maj: null, sp98_prix: E10[i] + 0.08, sp98_maj: MAJ,
            e85_prix: i === 8 ? null : E85[i], e85_maj: i === 8 ? null : MAJ,          // Mâcon ne sert pas d'E85
            gplc_prix: null, gplc_maj: null, horaires_automate_24_24: i % 2 ? 'Oui' : 'Non',
            carburants_rupture_temporaire: '', carburants_rupture_definitive: ''};
  });
}
function reponseStations(){ const r = stations(); return {total_count: r.length, results: r}; }

// Trois bornes (forme exacte d'irve-34.json), posées sur la route à ~170, ~310 et ~400 km,
// chacune dans « son » département factice (lots de départements, comme dans la vraie page).
const FIXTURE = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'fixtures', 'irve-34.json'), 'utf8'));
const BORNES_POS = {'89': ROUTE[28], '21': ROUTE[52], '71': ROUTE[66]};
const BORNES_KW = {'89': 150, '21': 300, '71': 50};
function bornes(dep){
  const src = FIXTURE[Object.keys(BORNES_POS).indexOf(dep) + 1] || FIXTURE[0];
  const [lat, lon] = BORNES_POS[dep];
  return [Object.assign({}, src, {id: `FRTEST${dep}`, n: `Aire de ${dep === '89' ? 'Vermenton' : dep === '21' ? 'Beaune-Tailly' : 'Mâcon-Loché'}`,
                                   op: 'Opérateur test', lon: +lon.toFixed(6), lat: +lat.toFixed(6), pdc: 4,
                                   kw: BORNES_KW[dep], kwmin: 22, ac: true, ccs: true, chademo: false, gratuit: false, cb: true, acte: true,
                                   h: '24/7', pmr: true, acces: 'libre', maj: '2026-10-28'})];
}
function indexIrve(){
  const departements = {};
  for(const [dep, [lat, lon]] of Object.entries(BORNES_POS))
    departements[dep] = {stations: 1, pdc: 4, octets: 400, bbox: [lon - 0.3, lat - 0.3, lon + 0.3, lat + 0.3]};
  return {genere: '2026-10-30', source: 'données factices du banc', departements};
}

// Géocodage et itinéraire (formats Géoplateforme) ; adresse inverse (Base Adresse Nationale).
const LIEUX = {paris: {lat: 48.8566, lon: 2.3522, label: 'Paris'}, lyon: {lat: 45.764, lon: 4.8357, label: 'Lyon'}};
function geocode(q){
  const k = Object.keys(LIEUX).find(k => String(q || '').toLowerCase().includes(k));
  if(!k) return {features: []};
  const l = LIEUX[k];
  return {features: [{geometry: {coordinates: [l.lon, l.lat]}, properties: {label: l.label}}]};
}
function itineraire(){ return {geometry: {coordinates: ROUTE.map(([la, lo]) => [lo, la])}, distance: DISTANCE_M, duration: DUREE_S}; }
function inverse(){ return {features: [{properties: {city: 'Paris'}}]}; }

// Style de carte minimal (aucune tuile, aucune police) : la carte s'affiche sans réseau.
const STYLE = {version: 8, sources: {}, layers: [{id: 'fond', type: 'background', paint: {'background-color': '#e8ebee'}}]};

// Véhicules du banc : fiche thermique (E85, autonomie 320 km : le plan Paris → Lyon doit
// s'arrêter) et fiche électrique (50 kWh, 17 kWh/100, CCS 150 kW : deux arrêts attendus).
const THERMIQUE = {nom: 'Clio E85', type: 'voiture', cat: 'citadine', energie: 'thermique', carbs: ['e85'],
                   conso: '7.5', cuve: '', autonomie: '320', reserve: '30'};
const ELECTRIQUE = {nom: 'Citadine électrique', type: 'voiture', cat: 'citadine', energie: 'elec', carbs: [],
                    batterieKwh: '50', consoKwh100: '17', kwMaxDC: '150', kwMaxAC: '11', prise: 'ccs', reservePct: '15', departPct: '80'};
// Réglages mémorisés (localStorage) pour ouvrir la page sur un état donné.
function reglages(actif, centre){
  // Espagne : l'E85 n'y existe presque pas, le véhicule du scénario roule au gazole.
  const th = actif === 'espagne' ? Object.assign({}, THERMIQUE, {nom: 'Clio gazole', carbs: ['gazole']}) : THERMIQUE;
  return {vehicules: [th, ELECTRIQUE], vehActif: actif === 'elec' ? 1 : 0, assistantVu: true,
          centre: centre || [48.853, 2.37], sansCher: actif !== 'espagne', queUtiles: true};   // Espagne : rien de masqué (prix espagnols dans le décile cher du secteur factice)
}
const CENTRE_PARIS = [48.853, 2.37];
// Espagne : centre près de Girona ; la province 17 répond avec la fixture réelle tronquée (3 stations).
const CENTRE_GIRONA = [41.92, 2.79];
const ES_FIXTURE = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'fixtures', 'es-echantillon-girona.json'), 'utf8'));
function provinceES(){ return ES_FIXTURE; }
const CENTRE_BORNE = BORNES_POS['89'];

module.exports = {ROUTE, reponseStations, bornes, indexIrve, geocode, itineraire, inverse, STYLE,
                  THERMIQUE, ELECTRIQUE, reglages, CENTRE_PARIS, CENTRE_BORNE, CENTRE_GIRONA, provinceES};
