// Tests de estimerConso (src/conso.js) : la table embarquee et ses regles (E85 = essence
// x 1,25 ; GPL = essence x 1,20 ; hybrides sans estimation ; lignes « larges »).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {estimerConso, TABLE_CONSO, CATEGORIES_CONSO} = require('./conso.js');

test('citadine essence : mediane ADEME 5,9 L/100, source datee, pas « large »', () => {
  const r = estimerConso('voiture', 'citadine', 'e10');
  assert.strictEqual(r.conso, 5.9);
  assert.strictEqual(r.large, false);
  assert.match(r.source, /ADEME Car Labelling \(14\/10\/2026\)/);
  assert.match(r.source, /n = 382/);
});

test('les trois SP et « SP le - cher » lisent la colonne essence ; gazole et GPL la leur', () => {
  for(const k of ['e10', 'sp95', 'sp98', 'spmin']) assert.strictEqual(estimerConso('voiture', 'suv', k).conso, 6.7);
  assert.strictEqual(estimerConso('voiture', 'suv', 'gazole').conso, 5.4);
  assert.strictEqual(estimerConso('voiture', 'suv', 'gplc').conso, 8.0);
});

test('E85 = essence x 1,25 et GPL = essence x 1,20, a 0,1 pres, sur toutes les lignes', () => {
  for(const type of Object.keys(TABLE_CONSO)) for(const [cat, l] of Object.entries(TABLE_CONSO[type])){
    if(l.essence && l.e85) assert.ok(Math.abs(l.e85 - l.essence * 1.25) < 0.1, `${type}/${cat} E85`);
    if(l.essence && l.gpl) assert.ok(Math.abs(l.gpl - l.essence * 1.20) < 0.1, `${type}/${cat} GPL`);
  }
});

test('camping-car : gazole seulement ; essence ou E85 -> null', () => {
  assert.strictEqual(estimerConso('campingcar', 'campingcar', 'gazole').conso, 11.0);
  assert.strictEqual(estimerConso('campingcar', 'campingcar', 'e10'), null);
  assert.strictEqual(estimerConso('campingcar', 'campingcar', 'e85'), null);
});

test('lignes sans source ouverte : marquees « large » et dites telles', () => {
  const r = estimerConso('utilitaire', 'fourgon', 'gazole');
  assert.strictEqual(r.conso, 7.5);
  assert.strictEqual(r.large, true);
  assert.match(r.source, /estimation large/);
  assert.strictEqual(estimerConso('moto', 'scooter', 'e10').conso, 3.0);
  assert.strictEqual(estimerConso('moto', 'moto', 'e85').conso, 6.3);
  assert.strictEqual(estimerConso('moto', 'moto', 'gazole'), null);
});

test('categorie absente ou inconnue -> premiere categorie du type', () => {
  assert.strictEqual(estimerConso('voiture', '', 'gazole').conso, 4.4);          // citadine
  assert.strictEqual(estimerConso('voiture', 'camion', 'e10').conso, 5.9);
  assert.strictEqual(estimerConso('utilitaire', undefined, 'e10').conso, 9.0);
});

test('hybride -> null (pas d\'estimation), type inconnu -> null, carburant inconnu -> null', () => {
  assert.strictEqual(estimerConso('voiture', 'compacte', 'e10', true), null);
  assert.strictEqual(estimerConso('tracteur', 'x', 'e10'), null);
  assert.strictEqual(estimerConso('voiture', 'compacte', 'hydrogene'), null);
});

test('chaque categorie listee a une ligne dans la table, et reciproquement', () => {
  for(const type of Object.keys(TABLE_CONSO)){
    const listees = CATEGORIES_CONSO[type].map(c => c[0]).sort();
    assert.deepStrictEqual(Object.keys(TABLE_CONSO[type]).sort(), listees);
  }
});

// ---- Vehicule electrique : estimerConsoElec (kWh/100 km) ----

test('estimerConsoElec : table du brief (citadine 15, compacte 17, berline 18, SUV 21, monospace 20, utilitaire 25, camping-car 30, scooter/moto 7)', () => {
  const {estimerConsoElec, TABLE_CONSO_ELEC} = require('./conso.js');
  assert.strictEqual(estimerConsoElec('voiture', 'citadine').conso, 15);
  assert.strictEqual(estimerConsoElec('voiture', 'compacte').conso, 17);
  assert.strictEqual(estimerConsoElec('voiture', 'berline').conso, 18);
  assert.strictEqual(estimerConsoElec('voiture', 'suv').conso, 21);
  assert.strictEqual(estimerConsoElec('voiture', 'monospace').conso, 20);
  assert.strictEqual(estimerConsoElec('utilitaire', 'fourgon').conso, 25);
  assert.strictEqual(estimerConsoElec('campingcar', 'campingcar').conso, 30);
  assert.strictEqual(estimerConsoElec('moto', 'scooter').conso, 7);
  assert.strictEqual(estimerConsoElec('moto', 'moto').conso, 7);
  // Meme jeu de categories que le thermique : chaque categorie listee a une valeur electrique.
  for(const type of Object.keys(TABLE_CONSO)) assert.deepStrictEqual(Object.keys(TABLE_CONSO_ELEC[type]).sort(), Object.keys(TABLE_CONSO[type]).sort());
});

test('estimerConsoElec : categorie absente -> premiere du type ; type inconnu -> null ; source dite « ordre de grandeur »', () => {
  const {estimerConsoElec} = require('./conso.js');
  assert.strictEqual(estimerConsoElec('voiture').conso, 15);
  assert.strictEqual(estimerConsoElec('voiture', 'camion').conso, 15);
  assert.strictEqual(estimerConsoElec('utilitaire', undefined).conso, 25);
  assert.strictEqual(estimerConsoElec('tracteur', 'x'), null);
  assert.match(estimerConsoElec('voiture', 'suv').source, /ordre de grandeur suv/i);
  assert.match(estimerConsoElec('voiture', 'suv').source, /WLTP/);
});
