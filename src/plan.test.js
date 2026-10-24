// Tests unitaires de src/plan.js (modele du 24/10/2026 : etat du reservoir, achat
// « juste ce qu'il faut » ou « plein » a chaque arret, carburant consomme + 0,80 EUR par
// arret). Chaque cas construit ses stations avec des prix et des km ronds pour que le
// resultat attendu soit calculable a la main (voir le commentaire de chaque test).
// Ne pas modifier plan.js pour faire passer ces tests.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {optimiserPlan, pleinsExtremites, autonomieUtile, coutVoyage, prixMax, prixMoyen, economieVsPlusCher} = require('./plan.js');

function presque(a, b, tol = 1e-9){ return Math.abs(a - b) < tol; }
const st = (s, km, p, e = 0) => ({s, km, e, p});

// ---- optimiserPlan ----

test('aucun arret necessaire quand total <= A : reste = A - total, voyage = pd x total', () => {
  const r = optimiserPlan([st('D', 5, 1.0)], 100, 80, 1);
  assert.deepStrictEqual(r.plan, []);
  assert.strictEqual(r.coutAchats, 0);
  assert.strictEqual(r.reste, 20);
  assert.ok(presque(r.voyage, 80));
  assert.strictEqual(optimiserPlan([], 100, 80, 1).voyage, null);   // pd inconnu : non chiffrable
});

test('infaisable : aucune station atteignable', () => {
  assert.deepStrictEqual(optimiserPlan([], 100, 150, 1), {plan: null});
  // Une station trop loin pour le plein de depart : infaisable aussi.
  assert.deepStrictEqual(optimiserPlan([st('S', 120, 1)], 100, 150, 1), {plan: null});
});

test('cas Montpellier -> Tours : la moins chere ATTEIGNABLE gagne, pas la plus tardive', () => {
  // A 370, total 660, 10 L/100. Il manque 290 km. BON (km 300, 0.85) et CHER (km 360, 1.05)
  // permettent tous deux un seul arret. Ancien modele : CHER (moins de reste a facturer).
  // Nouveau : BON, achat juste 290 km = 29 L a 0.85 = 24.65 EUR.
  const D = st('D', 5, 0.90), BON = st('BON', 300, 0.85), CHER = st('CHER', 360, 1.05), F = st('F', 655, 0.90);
  const r = optimiserPlan([D, BON, CHER, F], 370, 660, 0.1, {utiles: true});
  assert.deepStrictEqual(r.plan.map(e => e.s), ['BON']);
  assert.strictEqual(r.plan[0].plein, false);
  assert.ok(presque(r.plan[0].q, 290) && presque(r.plan[0].litres, 29) && presque(r.plan[0].arrivee, 70));
  assert.ok(presque(r.coutAchats, 24.65));
  // voyage = plein de depart (370 km a 0.90 = 33.30) + achats = 57.95 ; reste 0.
  assert.ok(presque(r.voyage, 57.95));
  assert.strictEqual(r.reste, 0);
  assert.ok(r.utiles.has('BON') && !r.utiles.has('CHER'));
});

test('utiles : une station a moins de 0,50 EUR de l\'optimum est retenue', () => {
  const D = st('D', 5, 0.90), BON = st('BON', 300, 0.85), BON2 = st('BON2', 305, 0.851), CHER = st('CHER', 360, 1.05);
  const r = optimiserPlan([D, BON, BON2, CHER], 370, 660, 0.1, {utiles: true});
  assert.ok(r.utiles.has('BON') && r.utiles.has('BON2') && !r.utiles.has('CHER'));
  assert.strictEqual(optimiserPlan([D, BON, BON2, CHER], 370, 660, 0.1).utiles, undefined);   // sans option : pas de passe arriere
});

test('plein a une station pas chere pour acheter moins a l\'arret cher impose ensuite', () => {
  // A 370, total 700. C1 (km 100, 0.70) puis E (km 400, 1.20), seule station atteignable
  // depuis C1 permettant de finir. Juste a C1 (30 km) puis 300 km a 1.20 = 21 + 360 ;
  // plein a C1 (100 km = 70) puis 230 km a 1.20 = 276 : 346 < 381.
  const D = st('D', 5, 0.90), C1 = st('C1', 100, 0.70), E = st('E', 400, 1.20);
  const r = optimiserPlan([D, C1, E], 370, 700, 1);
  assert.deepStrictEqual(r.plan.map(e => [e.s, e.plein, e.q]), [['C1', true, 100], ['E', false, 230]]);
  assert.ok(presque(r.coutAchats, 346));
  assert.ok(presque(r.voyage, 0.90 * 370 + 346));
});

test('deux arrets imposes par l\'autonomie, plan en km croissants, quantites exactes', () => {
  // A 100, total 250. S1 (km 90, 1.0), S2 (km 180, 1.1). Plein a S1 (90 km) -> S2 avec 10
  // -> juste 60 km a 1.1 = 66 : 156 ; juste a S1 (80) -> S2 vide -> 70 a 1.1 = 77 : 157.
  const D = st('D', 5, 1.0), S1 = st('S1', 90, 1.0), S2 = st('S2', 180, 1.1);
  const r = optimiserPlan([D, S1, S2], 100, 250, 1);
  assert.deepStrictEqual(r.plan.map(e => e.s), ['S1', 'S2']);
  assert.ok(presque(r.coutAchats, 156));
  assert.ok(presque(r.voyage, 100 + 156));
});

test('la penalite de 0,80 EUR evite un arret inutile', () => {
  // A 100, total 120 : un arret suffit (20 km a acheter). Deux stations a 1.0 a km 50 et
  // 60 : un seul arret retenu, jamais deux.
  const r = optimiserPlan([st('D', 5, 1.0), st('S1', 50, 1.0), st('S2', 60, 1.0)], 100, 120, 1);
  assert.strictEqual(r.plan.length, 1);
  assert.ok(presque(r.coutAchats, 20));
});

test('le detour compte a l\'aller et au retour : une station moins chere mais loin perd', () => {
  // A 100, total 150, 1 L/km. P (km 60, e 0, 1.00) : arrive avec 40, il manque 50 km -> 50.
  // L (km 60, e 1, 0.95) : arrive avec 39, il manque 52 km -> 49.40 : L gagne.
  // L a e 10 : arrive avec 30, il manque 70 km -> 66.50 : P gagne (le detour se paie).
  const r1 = optimiserPlan([st('D', 5, 1.0), st('P', 60, 1.00), st('L', 60, 0.95, 1)], 100, 150, 1);
  assert.strictEqual(r1.plan[0].s, 'L');
  assert.ok(presque(r1.coutAchats, 49.4));
  const r2 = optimiserPlan([st('D', 5, 1.0), st('P', 60, 1.00), st('L', 60, 0.95, 10)], 100, 150, 1);
  assert.strictEqual(r2.plan[0].s, 'P');
  assert.ok(presque(r2.coutAchats, 50));
});

test('elagage au-dela de 240 candidats : plan toujours faisable', () => {
  const cand = [];
  for(let k = 1; k <= 600; k++) cand.push(st('S' + k, k, 0.8 + ((k * 7) % 30) / 100));
  const r = optimiserPlan(cand, 200, 600, 0.07, {utiles: true});
  assert.ok(Array.isArray(r.plan) && r.plan.length >= 2 && r.plan.length <= 4);
  for(let i = 1; i < r.plan.length; i++) assert.ok(r.plan[i].km > r.plan[i - 1].km);
});

// ---- pleinsExtremites : plein au depart et a l'arrivee ----

test('depart : la moins chere dans les 15 premiers km, celles au-dela ignorees', () => {
  const r = pleinsExtremites([st('D1', 3, 0.90, 1), st('D2', 12, 0.85, 2), st('LOIN', 40, 0.70)], 600);
  assert.strictEqual(r.depart.s, 'D2');
});

test('a prix egal, le plus petit detour l\'emporte', () => {
  assert.strictEqual(pleinsExtremites([st('A1', 5, 0.85, 4), st('A2', 9, 0.85, 1)], 600).depart.s, 'A2');
});

test('arrivee : la moins chere dans les 15 derniers km', () => {
  const r = pleinsExtremites([st('M', 300, 0.60), st('F1', 590, 0.88, 3), st('F2', 598, 0.84, 1)], 600);
  assert.strictEqual(r.arrivee.s, 'F2');
  assert.strictEqual(r.depart, null);
});

test('aucune station : depart et arrivee null', () => {
  assert.deepStrictEqual(pleinsExtremites([], 600), {depart: null, arrivee: null});
});

// ---- autonomieUtile ----

test('autonomie saisie : elle prime sur le reservoir, reserve deduite', () => {
  assert.deepStrictEqual(autonomieUtile(7, 40, 600, 30), {plein: 600, A: 570, source: 'autonomie'});
});

test('sans autonomie : reservoir / conso x 100', () => {
  assert.deepStrictEqual(autonomieUtile(8, 40, 0, 50), {plein: 500, A: 450, source: 'reservoir'});
});

test('ni autonomie ni reservoir exploitable : null', () => {
  assert.strictEqual(autonomieUtile(7, 0, 0, 30), null);
  assert.strictEqual(autonomieUtile(0, 40, 0, 30), null);
});

test('autonomie saisie sans conso : l\'autonomie suffit a situer les arrets', () => {
  assert.deepStrictEqual(autonomieUtile(0, 0, 650, 30), {plein: 650, A: 620, source: 'autonomie'});
});

// ---- coutVoyage, prixMax, prixMoyen, economieVsPlusCher ----

test('coutVoyage : reprend le voyage du plan ; null si infaisable', () => {
  const r = optimiserPlan([st('D', 5, 0.90), st('BON', 300, 0.85)], 370, 660, 0.1);
  assert.ok(presque(coutVoyage([], r), r.voyage));
  assert.strictEqual(coutVoyage([], {plan: null}), null);
  assert.strictEqual(coutVoyage([], null), null);
});

test('prixMax : le plus cher du couloir ; vide -> null', () => {
  assert.strictEqual(prixMax([st('a', 0, 0.9), st('b', 0, 0.7), st('c', 0, 1.05)]), 1.05);
  assert.strictEqual(prixMax([]), null);
});

test('prixMoyen : carburant du voyage / litres consommes (cas Tours : 57.95 EUR pour 66 L)', () => {
  const r = optimiserPlan([st('D', 5, 0.90), st('BON', 300, 0.85)], 370, 660, 0.1);
  assert.ok(presque(prixMoyen(r, 0.1, 370), 57.95 / 66));
  assert.strictEqual(prixMoyen({plan: null}, 0.1, 370), null);
});

test('economie nulle quand tous les prix sont egaux', () => {
  const cand = [st('D', 5, 0.9), st('S', 300, 0.9), st('F', 655, 0.9)];
  const r = optimiserPlan(cand, 370, 660, 0.1);
  const eco = economieVsPlusCher(cand, 370, 660, 0.1, r.voyage);
  assert.ok(presque(eco.economie, 0) && presque(eco.prix, 0.9));
});

test('economie positive quand une station moins chere est sur le trajet (cas Tours)', () => {
  // plus cher de [0.90, 0.85, 1.05, 0.90] = 1.05 ; reference : 660 km a 1.05 = 69.30 ;
  // reel 57.95 -> economie 11.35.
  const cand = [st('D', 5, 0.90), st('BON', 300, 0.85), st('CHER', 360, 1.05), st('F', 655, 0.90)];
  const r = optimiserPlan(cand, 370, 660, 0.1);
  const eco = economieVsPlusCher(cand, 370, 660, 0.1, r.voyage);
  assert.ok(presque(eco.economie, 11.35) && presque(eco.reference, 69.3) && eco.prix === 1.05);
});

// ---- g0 : carburant a bord au depart (Eric, 24/10/2026) ----

test('a bord au depart : plein en route si moins cher qu\'au depart, et seulement le manque', () => {
  // A 400, g0 200, total 300 : il manque 100 km. D (km 5, 1.00) ou S (km 150, 0.80) :
  // S, juste 100 km = 80 ; a D ce serait 100. Les 200 km a bord comptent au prix du depart.
  const D = st('D', 5, 1.00), S = st('S', 150, 0.80);
  const r = optimiserPlan([D, S], 400, 300, 1, {g0: 200});
  assert.deepStrictEqual(r.plan.map(e => [e.s, e.plein, e.q]), [['S', false, 100]]);
  assert.ok(presque(r.plan[0].arrivee, 50));
  assert.ok(presque(r.voyage, 1.00 * 200 + 80));
  // Station du depart moins chere que la route : on y achete le manque (arrive avec 195).
  const r2 = optimiserPlan([D, st('S', 150, 1.20)], 400, 300, 1, {g0: 200});
  assert.deepStrictEqual(r2.plan.map(e => [e.s, e.q]), [['D', 100]]);
});

test('a bord suffisant : aucun arret ; insuffisant pour la premiere station : infaisable', () => {
  assert.deepStrictEqual(optimiserPlan([st('D', 5, 1)], 400, 150, 1, {g0: 200}).plan, []);
  assert.deepStrictEqual(optimiserPlan([st('S', 150, 1)], 400, 300, 1, {g0: 100}), {plan: null});
});

test('economie : infaisable ou voyage non chiffrable -> null', () => {
  assert.strictEqual(economieVsPlusCher([], 100, 150, 1, null), null);
  assert.strictEqual(economieVsPlusCher([st('S', 5, 1)], 100, 150, 1, 10), null);   // infaisable au plus cher aussi
});
