// Tests de src/signalements.js : libellés, seuil et fenêtre d'évitement, « ok » après « vide »,
// journal local (un signalement par station et carburant par 6 h), paquets d'identifiants.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {libelle, aEviter, peutSignaler, delaiRestant, noterSignalement, purgerJournal, libelleDelai,
       lotsIds, idSignalable, carburantSignalable, ilYA, SIG_DELAI_MS, SIG_LOT} = require('./signalements.js');

// Instant de référence : 30/10/2026 12:00:00 UTC, en ms (comme Date.now()) ; le service parle en secondes.
const T = Date.UTC(2026, 9, 30, 12, 0, 0);
const sec = msAvant => Math.floor((T - msAvant) / 1000);
const H = 3600e3, MIN = 60e3;

test('libelle : « signalé vide il y a 2 h », nombre dès deux signalements', () => {
  assert.equal(libelle({vide: 1, ok: 0, dernier: sec(2 * H)}, T), 'signalé vide il y a 2 h');
  assert.equal(libelle({vide: 3, ok: 0, dernier: sec(2 * H)}, T), 'signalé vide il y a 2 h (3)');
  assert.equal(libelle({vide: 2, ok: 1, dernier: sec(40 * MIN)}, T), 'signalé vide il y a 40 min (2)');
});

test('libelle : « de nouveau dispo » quand un ok a remis vide à zéro ; rien sinon', () => {
  assert.equal(libelle({vide: 0, ok: 1, dernier: sec(40 * MIN)}, T), 'de nouveau dispo il y a 40 min');
  assert.equal(libelle({vide: 0, ok: 2, dernier: sec(3 * H)}, T), 'de nouveau dispo il y a 3 h');
  assert.equal(libelle({vide: 0, ok: 0, dernier: sec(H)}, T), '');
  assert.equal(libelle(null, T), '');
  assert.equal(libelle(undefined, T), '');
  assert.equal(libelle({vide: 1, ok: 0}, T), '');            // sans date : rien d'affichable
  assert.equal(libelle({vide: 'x', ok: 0, dernier: sec(H)}, T), '');
});

test('ilYA : à l\'instant, minutes, heures, jours ; un horodatage dans le futur vaut à l\'instant', () => {
  assert.equal(ilYA(30e3), 'à l\'instant');
  assert.equal(ilYA(59 * MIN), 'il y a 59 min');
  assert.equal(ilYA(60 * MIN), 'il y a 1 h');
  assert.equal(ilYA(47 * H + 59 * MIN), 'il y a 47 h');
  assert.equal(ilYA(48 * H), 'il y a 2 j');
  assert.equal(ilYA(-5 * MIN), 'à l\'instant');
  assert.equal(libelle({vide: 1, ok: 0, dernier: sec(-5 * MIN)}, T), 'signalé vide à l\'instant');
});

test('aEviter : un « vide » de moins de 12 h suffit par défaut ; au-delà, non', () => {
  const station = {e85: {vide: 1, ok: 0, dernier: sec(11 * H + 59 * MIN)}};
  assert.equal(aEviter(station, 'e85', T), true);
  assert.equal(aEviter({e85: {vide: 1, ok: 0, dernier: sec(12 * H + MIN)}}, 'e85', T), false);
  assert.equal(aEviter({e85: {vide: 1, ok: 0, dernier: sec(12 * H)}}, 'e85', T), true);   // borne incluse
  assert.equal(aEviter(station, 'gazole', T), false);      // autre carburant : pas signalé
  assert.equal(aEviter(null, 'e85', T), false);
  assert.equal(aEviter({}, 'e85', T), false);
  assert.equal(aEviter({e85: null}, 'e85', T), false);
});

test('aEviter : seuil et fenêtre réglables', () => {
  const station = {e85: {vide: 1, ok: 0, dernier: sec(2 * H)}};
  assert.equal(aEviter(station, 'e85', T, {seuil: 2}), false);
  assert.equal(aEviter({e85: {vide: 2, ok: 0, dernier: sec(2 * H)}}, 'e85', T, {seuil: 2}), true);
  assert.equal(aEviter(station, 'e85', T, {fenetreH: 1}), false);
  assert.equal(aEviter(station, 'e85', T, {fenetreH: 3}), true);
  assert.equal(aEviter(station, 'e85', T, {seuil: 0}), true);   // 0 vaut 1 : jamais « éviter sans signalement »
  assert.equal(aEviter({e85: {vide: 0, ok: 0, dernier: sec(H)}}, 'e85', T, {seuil: 0}), false);
});

test('aEviter : un « ok » plus récent que le « vide » (vide remis à zéro par le service) ne fait pas éviter', () => {
  assert.equal(aEviter({e85: {vide: 0, ok: 1, dernier: sec(10 * MIN)}}, 'e85', T), false);
  // Un « ok » plus ancien que le « vide » : le service garde `vide` > 0, la station reste évitée.
  assert.equal(aEviter({e85: {vide: 1, ok: 1, dernier: sec(10 * MIN)}}, 'e85', T), true);
});

test('journal local : libre au départ, bloqué 6 h après un signalement, par station et carburant', () => {
  assert.equal(peutSignaler({}, '12345678', 'e85', T), true);
  assert.equal(peutSignaler(null, '12345678', 'e85', T), true);
  assert.equal(delaiRestant({}, '12345678', 'e85', T), 0);
  const j = noterSignalement({}, '12345678', 'e85', T);
  assert.deepEqual(j, {'12345678|e85': T});
  assert.equal(peutSignaler(j, '12345678', 'e85', T + MIN), false);
  assert.equal(delaiRestant(j, '12345678', 'e85', T + MIN), SIG_DELAI_MS - MIN);
  assert.equal(peutSignaler(j, '12345678', 'gazole', T + MIN), true);     // autre carburant
  assert.equal(peutSignaler(j, 'ES-2777', 'e85', T + MIN), true);         // autre station
  assert.equal(peutSignaler(j, '12345678', 'e85', T + SIG_DELAI_MS - 1), false);
  assert.equal(peutSignaler(j, '12345678', 'e85', T + SIG_DELAI_MS), true);
});

test('journal local : noter purge le périmé, ne modifie pas l\'ancien objet ; purge tolère un stockage abîmé', () => {
  const ancien = {'11111111|e85': T - 7 * H, '22222222|e10': T - 5 * H, 'abc': 'x', 'futur|e85': T + H};
  const j = noterSignalement(ancien, '33333333|sp95'.split('|')[0], 'sp95', T);
  assert.deepEqual(j, {'22222222|e10': T - 5 * H, '33333333|sp95': T});
  assert.equal(Object.keys(ancien).length, 4);                  // intact
  assert.deepEqual(purgerJournal('n\'importe quoi', T), {});
  assert.deepEqual(purgerJournal(null, T), {});
  assert.deepEqual(purgerJournal([1, 2], T), {});
  assert.equal(delaiRestant({'12345678|e85': 'hier'}, '12345678', 'e85', T), 0);
  assert.equal(delaiRestant({'12345678|e85': T + H}, '12345678', 'e85', T), 0);   // horloge reculée : on n'enferme pas
});

test('libelleDelai : minutes, heures et minutes', () => {
  assert.equal(libelleDelai(0), 'dans moins d\'une minute');
  assert.equal(libelleDelai(20e3), 'dans 1 min');
  assert.equal(libelleDelai(12 * MIN), 'dans 12 min');
  assert.equal(libelleDelai(5 * H + 20 * MIN), 'dans 5 h 20');
  assert.equal(libelleDelai(6 * H), 'dans 6 h');
  assert.equal(libelleDelai(SIG_DELAI_MS - 30e3), 'dans 6 h');   // 5 h 59 min 30 s arrondi à la minute supérieure
});

test('lotsIds : paquets de 400, doublons retirés, identifiants non signalables écartés', () => {
  const ids = [];
  for(let i = 0; i < 1000; i++) ids.push(String(10000000 + i));
  const lots = lotsIds(ids);
  assert.deepEqual(lots.map(l => l.length), [400, 400, 200]);
  assert.equal(lots[0][0], '10000000');
  assert.equal(lots[2][199], '10000999');
  assert.deepEqual(lotsIds(['12345678', '12345678', 'ES-2777', '43.6,3.9', '', null, 'ES-', '1234567', '123456789']),
                   [['12345678', 'ES-2777']]);
  assert.deepEqual(lotsIds([]), []);
  assert.deepEqual(lotsIds(null), []);
  assert.deepEqual(lotsIds(new Array(SIG_LOT).fill(0).map((_, i) => String(20000000 + i))).map(l => l.length), [400]);
});

test('idSignalable / carburantSignalable : contrat du service', () => {
  assert.equal(idSignalable('12345678'), true);
  assert.equal(idSignalable('ES-1'), true);
  assert.equal(idSignalable('ES-12345678'), true);
  assert.equal(idSignalable('ES-123456789'), false);
  assert.equal(idSignalable('43.6,3.9'), false);
  assert.equal(idSignalable(12345678), false);
  assert.equal(carburantSignalable('e85'), true);
  assert.equal(carburantSignalable('spmin'), false);   // choix « SP le moins cher » : pas un carburant du service
  assert.equal(carburantSignalable('elec'), false);
});
