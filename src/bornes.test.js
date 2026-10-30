// Tests de src/bornes.js : departements a charger pour une emprise, classe de marqueur par
// puissance, libelles (horaires, mise a jour, prises, paiement), « peut-on s'y brancher ».
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {departementsPourEmprise, classePuissance, libellePuissance, libelleHoraires, libelleMaj,
       branchable, libellePrises, libellePaiement} = require('./bornes.js');

// index.json factice : Herault (34, bbox de la fixture), Gard (30), Aude (11), Paris (75), sans bbox (00).
const INDEX = {genere: '2026-10-30', departements: {
  '34': {stations: 10, bbox: [2.742882, 43.265294, 4.060912, 43.689381]},
  '30': {stations: 5, bbox: [3.26, 43.46, 4.85, 44.46]},
  '11': {stations: 5, bbox: [1.69, 42.65, 3.24, 43.46]},
  '75': {stations: 50, bbox: [2.22, 48.81, 2.47, 48.90]},
  '00': {stations: 1},
  '2A': {stations: 2, bbox: {w: 8.5, s: 41.3, e: 9.4, n: 42.4}},
}};

test('departementsPourEmprise : Montpellier (zoom ville) -> 34 et 30 ; Paris -> 75 ; mer -> aucun', () => {
  assert.deepStrictEqual(departementsPourEmprise(INDEX, {s: 43.55, n: 43.70, w: 3.80, e: 4.00}), ['30', '34']);
  assert.deepStrictEqual(departementsPourEmprise(INDEX, {s: 48.84, n: 48.88, w: 2.30, e: 2.40}), ['75']);
  assert.deepStrictEqual(departementsPourEmprise(INDEX, {s: 42.0, n: 42.5, w: 3.5, e: 4.5}), []);   // Mediterranee
  // Corse : bbox en objet {w, s, e, n} acceptee aussi.
  assert.deepStrictEqual(departementsPourEmprise(INDEX, {s: 41.5, n: 42.0, w: 8.6, e: 9.0}), ['2A']);
});

test('departementsPourEmprise : France entiere -> tous ceux qui ont une bbox (jamais 00) ; bornes touchees comptent', () => {
  assert.deepStrictEqual(departementsPourEmprise(INDEX, {s: 41.2, n: 51.3, w: -5.5, e: 9.8}), ['11', '2A', '30', '34', '75']);
  // Une emprise qui effleure la bbox de l'Aude par son bord nord (lat 43.46) la retient.
  assert.deepStrictEqual(departementsPourEmprise(INDEX, {s: 43.46, n: 43.50, w: 2.0, e: 2.5}), ['11']);
  assert.deepStrictEqual(departementsPourEmprise(null, {s: 0, n: 1, w: 0, e: 1}), []);
  assert.deepStrictEqual(departementsPourEmprise(INDEX, null), []);
  assert.deepStrictEqual(departementsPourEmprise(INDEX, {s: NaN, n: 1, w: 0, e: 1}), []);
});

test('classePuissance : >= 150 rapide, 50 a 149 moyen, < 50 lent, inconnu sinon', () => {
  assert.strictEqual(classePuissance(300), 'rapide');
  assert.strictEqual(classePuissance(150), 'rapide');
  assert.strictEqual(classePuissance(149.9), 'moyen');
  assert.strictEqual(classePuissance(60), 'moyen');
  assert.strictEqual(classePuissance(50), 'moyen');
  assert.strictEqual(classePuissance(49), 'lent');
  assert.strictEqual(classePuissance(22.08), 'lent');
  assert.strictEqual(classePuissance(7.36), 'lent');
  assert.strictEqual(classePuissance(null), 'inconnu');
  assert.strictEqual(classePuissance(0), 'inconnu');
  assert.strictEqual(classePuissance('abc'), 'inconnu');
  assert.strictEqual(classePuissance('150'), 'rapide');
});

test('libellePuissance : 22.08 -> « 22 kW », 7.36 -> « 7,4 kW », null -> inconnue', () => {
  assert.strictEqual(libellePuissance(22.08), '22 kW');
  assert.strictEqual(libellePuissance(7.36), '7,4 kW');
  assert.strictEqual(libellePuissance(150), '150 kW');
  assert.strictEqual(libellePuissance(null), 'puissance inconnue');
});

test('libelleHoraires : 24/7 et variantes -> « 24h/24 » ; Mo-Su 00:00-23:57 -> « 24h/24 » ; vide -> inconnus ; texte garde', () => {
  assert.strictEqual(libelleHoraires('24/7'), '24h/24');
  assert.strictEqual(libelleHoraires('24h/24 7j/7'), '24h/24');
  assert.strictEqual(libelleHoraires('24/24'), '24h/24');
  assert.strictEqual(libelleHoraires('Mo-Su 00:00-23:57'), '24h/24');
  assert.strictEqual(libelleHoraires(null), 'horaires inconnus');
  assert.strictEqual(libelleHoraires('  '), 'horaires inconnus');
  assert.strictEqual(libelleHoraires('Mo-Fr 08:00-12:00,Mo-Fr 14:00-18:00,Th 08:00-18:00'), 'Mo-Fr 08:00-12:00,Mo-Fr 14:00-18:00,Th 08:00-18:00');
});

test('libelleMaj : aujourd\'hui, hier, il y a N jours ; au-dela de 365 jours « donnée ancienne » ; illisible', () => {
  const now = new Date(2026, 9, 30, 12, 0);   // 30/10/2026 midi
  assert.deepStrictEqual(libelleMaj('2026-10-30', now), {jours: 0, txt: 'mis à jour aujourd\'hui', ancien: false});
  assert.deepStrictEqual(libelleMaj('2026-10-29', now), {jours: 1, txt: 'mis à jour hier', ancien: false});
  assert.deepStrictEqual(libelleMaj('2026-10-14', now), {jours: 16, txt: 'mis à jour il y a 16 jours', ancien: false});
  const vieux = libelleMaj('2022-04-25', now);   // hotel de la fixture
  assert.strictEqual(vieux.ancien, true);
  assert.ok(vieux.jours > 365);
  assert.match(vieux.txt, /^mis à jour il y a \d+ jours \(25\/04\/2022\) — donnée ancienne$/);
  assert.strictEqual(libelleMaj('2025-10-30', now).ancien, false);   // exactement 365 jours : pas ancien
  assert.strictEqual(libelleMaj('2025-10-29', now).ancien, true);    // 366 jours
  assert.deepStrictEqual(libelleMaj(null, now), {jours: null, txt: 'date de mise à jour inconnue', ancien: false});
  assert.deepStrictEqual(libelleMaj('bientôt', now), {jours: null, txt: 'date de mise à jour inconnue', ancien: false});
  // Date dans le futur (horloge de l'appareil en retard) : 0 jour, pas negatif.
  assert.strictEqual(libelleMaj('2026-11-02', now).jours, 0);
});

test('branchable : prise DC connue ou AC connue -> vrai ; toutes connues absentes -> faux ; inconnu garde', () => {
  assert.strictEqual(branchable({ccs: true, ac: false}, 'ccs'), true);
  assert.strictEqual(branchable({ccs: false, ac: true}, 'ccs'), true);        // AC utilisable par une CCS
  assert.strictEqual(branchable({ccs: false, chademo: true, ac: false}, 'ccs'), false);
  assert.strictEqual(branchable({ccs: null, ac: null}, 'ccs'), true);          // inconnu : gardee
  assert.strictEqual(branchable({ccs: false, ac: null}, 'ccs'), true);         // une inconnue : gardee
  assert.strictEqual(branchable({chademo: true, ac: false}, 'chademo'), true);
  assert.strictEqual(branchable({chademo: false, ccs: true, ac: false}, 'chademo'), false);
  assert.strictEqual(branchable({ccs: true, ac: false}, 't2'), false);         // Type 2 seule : il faut de l'AC
  assert.strictEqual(branchable({ccs: true, ac: null}, 't2'), true);
  assert.strictEqual(branchable(null, 'ccs'), false);
});

test('libellePrises et libellePaiement sur la fixture (Buffalo Grill, hotel, Minerve)', () => {
  assert.strictEqual(libellePrises({ccs: true, chademo: true, ac: true}), 'CCS · CHAdeMO · Type 2');
  assert.strictEqual(libellePrises({ccs: false, chademo: false, ac: true}), 'Type 2');
  assert.strictEqual(libellePrises({ccs: null, chademo: null, ac: null}), 'prises inconnues');
  assert.strictEqual(libellePaiement({gratuit: true, cb: false, acte: true}), 'gratuit');
  assert.strictEqual(libellePaiement({gratuit: false, cb: true, acte: true}), 'carte bancaire · à l\'acte');
  assert.strictEqual(libellePaiement({gratuit: false, cb: false, acte: true}), 'à l\'acte');
  assert.strictEqual(libellePaiement({gratuit: null, cb: null, acte: null}), 'paiement inconnu');
});
