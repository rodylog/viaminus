// Tests de optimiserPlanElectrique (src/plan.js) : plan de charge « comme un carburant ».
// Vehicule de reference : « Citadine electrique 50 kWh », 17 kWh/100 km, CCS 150 kW / AC 11 kW,
// depart 80 %, reserve 15 %. Energies en kWh entiers : depart 40, reserve 7,5 -> 8, arrivee 8,
// 80 % = 40. Trajets Paris -> Lyon (300 km) et Montpellier -> Toulouse (250 km), bornes
// factices aux kilometres ronds. Chaque resultat est calcule a la main en commentaire.
// Ne pas modifier plan.js pour faire passer ces tests.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {optimiserPlanElectrique, autonomieElectrique, puissanceEffective, tempsCharge, optimiserPlan} = require('./plan.js');

const presque = (a, b, tol = 1e-9) => Math.abs(a - b) < tol;
const CITADINE = {batterieKwh: 50, consoKwh100: 17, kwMaxDC: 150, kwMaxAC: 11, prise: 'ccs'};
// borne : {s: station, km, e} comme bornesSurTrajet (irve.js)
const B = (id, km, kw, prises = {ccs: true}, e = 0) => ({s: Object.assign({id, kw}, prises), km, e});

test('autonomieElectrique : 50 kWh, 17 kWh/100, 80 % -> 40 kWh au depart, reserve 7,5, 191 km utiles', () => {
  const r = autonomieElectrique(CITADINE);
  assert.ok(presque(r.B, 50) && presque(r.R, 7.5) && presque(r.E0, 40) && presque(r.Ea, 7.5) && presque(r.lkm, 0.17));
  assert.ok(presque(r.A, 32.5 / 0.17) && presque(r.plein, 42.5 / 0.17));
  assert.strictEqual(autonomieElectrique({batterieKwh: 50}), null);
  // A (km) et lkm donnes remplacent ceux du vehicule : 100 km utiles a 0,2 kWh/km -> E0 = 7,5 + 20.
  assert.ok(presque(autonomieElectrique(CITADINE, 100, 0.2).E0, 27.5));
});

test('puissanceEffective : DC si la borne a la prise du vehicule, sinon AC ; inconnue -> null', () => {
  assert.strictEqual(puissanceEffective({kw: 300, ccs: true}, CITADINE), 150);     // borne par le vehicule
  assert.strictEqual(puissanceEffective({kw: 50, ccs: true}, CITADINE), 50);       // borne par la borne
  assert.strictEqual(puissanceEffective({kw: 22, ac: true}, CITADINE), 11);        // AC : 11 kW embarques
  assert.strictEqual(puissanceEffective({kw: 150, chademo: true}, CITADINE), null);
  assert.strictEqual(puissanceEffective({kw: null, ccs: true}, CITADINE), null);
  assert.strictEqual(puissanceEffective({kw: 50, chademo: true}, {prise: 'chademo', kwMaxDC: 50}), 50);
});

test('tempsCharge : 50 kW, 20 kWh sous 80 % = 24 min ; au-dela de 80 % la puissance est divisee par deux', () => {
  assert.ok(presque(tempsCharge(14, 34, 50, 40), 24));
  // 31 -> 42 : 9 kWh a 50 kW (10,8 min) + 2 kWh a 25 kW (4,8 min) = 15,6 min.
  assert.ok(presque(tempsCharge(31, 42, 50, 40), 15.6));
  assert.ok(presque(tempsCharge(45, 50, 50, 40), 12));   // 5 kWh entierement a 25 kW
});

test('Paris -> Lyon 300 km : un arret obligatoire, 20 kWh en 29 min a 50 kW, arrivee a 16 %', () => {
  // Depart 40 kWh. Borne au km 150 : 150 x 0,17 = 25,5 -> 26 kWh : on arrive avec 14 (28 %).
  // Reste 150 km = 26 kWh + reserve 8 = 34 a bord en repartant (68 %) : 20 kWh a charger,
  // tout sous 80 % : 20 / 50 x 60 = 24 min + 5 min de branchement = 29 min. Arrivee 8 kWh = 16 %.
  const r = optimiserPlanElectrique([B('S50', 150, 50)], null, 300, null, CITADINE);
  assert.strictEqual(r.faisable, true);
  assert.strictEqual(r.arrets.length, 1);
  const a = r.arrets[0];
  assert.strictEqual(a.station.id, 'S50');
  assert.strictEqual(a.kmDepuisDepart, 150);
  assert.strictEqual(a.kwhCharges, 20);
  assert.ok(presque(a.minutes, 29));
  assert.strictEqual(a.pctArrivee, 28);
  assert.strictEqual(a.pctDepart, 68);
  assert.ok(presque(r.minutesCharge, 29));
  assert.strictEqual(r.pctArrivee, 16);
  assert.ok(presque(r.energieKwh, 51));
  assert.strictEqual(r.motif, null);
});

test('borne 150 kW contre 50 kW : la plus rapide gagne (13 min contre 29)', () => {
  // S150 au km 160 : 160 x 0,17 = 27,2 -> 28 : arrive avec 12. Reste 140 km = 23,8 -> 24 + 8 = 32 :
  // 20 kWh a 150 kW = 8 min + 5 = 13 min.
  const r = optimiserPlanElectrique([B('S50', 150, 50), B('S150', 160, 150)], null, 300, null, CITADINE);
  assert.deepStrictEqual(r.arrets.map(a => a.station.id), ['S150']);
  assert.ok(presque(r.minutesCharge, 13));
  assert.strictEqual(r.arrets[0].kw, 150);
  // La borne de 300 kW est bornee par les 150 kW du vehicule : meme temps que 150.
  const r2 = optimiserPlanElectrique([B('S300', 160, 300)], null, 300, null, CITADINE);
  assert.ok(presque(r2.minutesCharge, 13) && r2.arrets[0].kw === 150);
});

test('borne incompatible ignoree : CHAdeMO seule -> infaisable ; CHAdeMO + CCS -> la CCS', () => {
  const r = optimiserPlanElectrique([B('CHA', 150, 150, {chademo: true})], null, 300, null, CITADINE);
  assert.strictEqual(r.faisable, false);
  assert.strictEqual(r.motif, 'aucune borne compatible dans le couloir');
  assert.deepStrictEqual(r.arrets, []);
  const r2 = optimiserPlanElectrique([B('CHA', 140, 150, {chademo: true}), B('S50', 150, 50)], null, 300, null, CITADINE);
  assert.deepStrictEqual(r2.arrets.map(a => a.station.id), ['S50']);
  // Une borne AC Type 2 (22 kW) est utilisable par une voiture CCS, a 11 kW : 20 kWh = 109 min + 5.
  const r3 = optimiserPlanElectrique([B('AC', 150, 22, {ac: true})], null, 300, null, CITADINE);
  assert.ok(r3.faisable && presque(r3.minutesCharge, 5 + 20 / 11 * 60));
});

test('trajet 100 km : faisable sans recharge, arrivee a 46 %', () => {
  // 100 x 0,17 = 17 kWh ; 40 - 17 = 23 kWh = 46 %.
  const r = optimiserPlanElectrique([B('S50', 50, 50)], null, 100, null, CITADINE);
  assert.deepStrictEqual(r, {faisable: true, arrets: [], minutesCharge: 0, pctArrivee: 46, energieKwh: 17, motif: 'faisable sans recharge'});
});

test('aucune borne : infaisable avec motif ; bornes trop espacees : autre motif', () => {
  const r = optimiserPlanElectrique([], null, 300, null, CITADINE);
  assert.strictEqual(r.faisable, false);
  assert.strictEqual(r.motif, 'aucune borne compatible dans le couloir');
  assert.strictEqual(r.minutesCharge, null);
  // Une seule borne au km 250 : 250 x 0,17 = 42,5 -> 43 kWh > 40 - 8 utiles : inatteignable.
  const r2 = optimiserPlanElectrique([B('LOIN', 250, 150)], null, 300, null, CITADINE);
  assert.strictEqual(r2.faisable, false);
  assert.strictEqual(r2.motif, 'bornes trop espacees pour l\'autonomie');
  // Vehicule incomplet.
  assert.strictEqual(optimiserPlanElectrique([B('S', 150, 50)], null, 300, null, {prise: 'ccs'}).motif, 'vehicule incomplet');
});

test('a egalite de temps, moins d\'arrets : deux bornes de 50 kW, un seul arret retenu', () => {
  const r = optimiserPlanElectrique([B('A', 100, 50), B('C', 150, 50)], null, 300, null, CITADINE);
  assert.strictEqual(r.arrets.length, 1);
  assert.ok(presque(r.minutesCharge, 29));
});

test('Montpellier -> Toulouse 250 km, borne au km 50 : il faut depasser 80 %, courbe a demi-puissance', () => {
  // 50 km = 8,5 -> 9 kWh : arrive avec 31 (62 %). Reste 200 km = 34 + 8 = 42 kWh > 40 (80 %) :
  // 9 kWh a 50 kW (10,8 min) + 2 kWh a 25 kW (4,8 min) + 5 = 20,6 min ; repart a 84 %.
  const r = optimiserPlanElectrique([B('P', 50, 50)], null, 250, null, CITADINE);
  assert.strictEqual(r.arrets[0].kwhCharges, 11);
  assert.ok(presque(r.minutesCharge, 20.6));
  assert.strictEqual(r.arrets[0].pctDepart, 84);
  assert.strictEqual(r.pctArrivee, 16);
});

test('charger plus a une borne rapide pour eviter une borne lente : plein a 80 % puis juste', () => {
  // 500 km. RAPIDE 150 kW au km 150, LENTE 11 kW (AC 22) au km 330. Depart 40 - 26 = 14 a RAPIDE.
  // Jusqu'a LENTE : 180 km = 30,6 -> 31 kWh (+8 = 39 a bord). Sans charger a LENTE il faudrait
  // 31 + 170 km (28,9 -> 29) + 8 = 68 > 50 : LENTE est obligatoire. A RAPIDE on charge a 100 %
  // (36 kWh : 26 a 150 kW = 10,4 min + 10 a 75 kW = 8 min) pour arriver a LENTE avec 19 et n'y
  // prendre que 29 + 8 - 19 = 18 kWh (98,2 min) : 10 + 18,4 + 98,2 = 126,6 min. Charger juste
  // a RAPIDE (25 kWh, 10 min) puis 29 kWh a 11 kW (158,2 min) = 183,2 min : bien pire.
  const r = optimiserPlanElectrique([B('RAPIDE', 150, 150), B('LENTE', 330, 22, {ac: true})], null, 500, null, CITADINE);
  assert.deepStrictEqual(r.arrets.map(a => [a.station.id, a.kwhCharges]), [['RAPIDE', 36], ['LENTE', 18]]);
  assert.ok(presque(r.minutesCharge, 10 + 26 / 150 * 60 + 10 / 75 * 60 + 18 / 11 * 60));
});

test('detour : l\'energie du detour compte a l\'aller et au retour', () => {
  // Borne au km 150 a 10 km de la route (comme pour le carburant : e km pour y entrer, e km
  // pour en ressortir). Aller : 150 + 10 = 160 km = 27,2 -> 28 kWh : arrive avec 12. Retour sur
  // la route puis fin : 10 + 150 = 160 km = 28 + 8 = 36 a bord : 24 kWh a 50 kW = 28,8 min + 5.
  // Sans detour (test Paris -> Lyon) : 20 kWh, 29 min.
  const r = optimiserPlanElectrique([B('D', 150, 50, {ccs: true}, 10)], null, 300, null, CITADINE);
  assert.strictEqual(r.arrets[0].kwhCharges, 24);
  assert.strictEqual(r.arrets[0].detourKm, 10);
  assert.ok(presque(r.minutesCharge, 33.8));
});

test('opts.departPct : parti a 50 %, le trajet de 100 km n\'est plus faisable sans arret', () => {
  // 25 kWh - 17 = 8 >= 8 : faisable de justesse a 50 % ; a 40 % (20 kWh) : 3 < 7,5 -> arret.
  assert.strictEqual(optimiserPlanElectrique([B('S', 50, 50)], null, 100, null, CITADINE, {departPct: 50}).arrets.length, 0);
  const r = optimiserPlanElectrique([B('S', 50, 50)], null, 100, null, CITADINE, {departPct: 40});
  assert.strictEqual(r.arrets.length, 1);
});

test('elagage au-dela de 240 bornes : plan toujours faisable, arrets en km croissants', () => {
  const bornes = [];
  for(let k = 1; k <= 600; k++) bornes.push(B('S' + k, k, 50 + (k % 4) * 25));
  const r = optimiserPlanElectrique(bornes, null, 600, null, CITADINE);
  assert.ok(r.faisable && r.arrets.length >= 2 && r.arrets.length <= 5);
  for(let i = 1; i < r.arrets.length; i++) assert.ok(r.arrets[i].kmDepuisDepart > r.arrets[i - 1].kmDepuisDepart);
  for(const a of r.arrets) assert.ok(a.kw >= 125);   // les plus puissantes gardees
});

test('le plan carburant est inchange par l\'ajout (cas Montpellier -> Tours)', () => {
  const st = (s, km, p) => ({s, km, e: 0, p});
  const r = optimiserPlan([st('D', 5, 0.90), st('BON', 300, 0.85), st('CHER', 360, 1.05), st('F', 655, 0.90)], 370, 660, 0.1);
  assert.deepStrictEqual(r.plan.map(e => e.s), ['BON']);
  assert.ok(presque(r.voyage, 57.95));
});
