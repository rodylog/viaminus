// Tests de src/partage.js : format #veh= historique et son extension electrique, aller-retour,
// retrocompatibilite (un lien ancien reste lu), bornes de securite.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {vehVersParam, paramVersVeh} = require('./partage.js');

const DEFAUT = ['e85'];

test('lien ancien a 5 champs (README : Nom|e85+e10|6.5|50|30) : lu tel quel, autonomie vide, pas d\'energie', () => {
  const v = paramVersVeh('Clio|e85+e10|6.5|50|30', DEFAUT);
  assert.deepStrictEqual(v, {nom: 'Clio', type: 'voiture', carbs: ['e85', 'e10'], conso: '6.5', cuve: '50', reserve: '30', autonomie: ''});
  assert.strictEqual(v.energie, undefined);
});

test('lien ancien a 6 champs (autonomie) et carburants vides -> DEFAUT ; nom encode decode', () => {
  const v = paramVersVeh('Ma%20voiture||6.5|50|30|600', DEFAUT);
  assert.strictEqual(v.nom, 'Ma voiture');
  assert.deepStrictEqual(v.carbs, ['e85']);
  assert.strictEqual(v.autonomie, '600');
});

test('aller-retour thermique : vehVersParam puis paramVersVeh rend la meme fiche (6 champs ecrits)', () => {
  const v = {nom: 'Berline gazole', type: 'voiture', carbs: ['gazole'], conso: '5.1', cuve: '60', reserve: '40', autonomie: '1100'};
  const p = vehVersParam(v);
  assert.strictEqual(p, 'Berline%20gazole|gazole|5.1|60|40|1100');
  assert.strictEqual(p.split('|').length, 6);
  assert.deepStrictEqual(paramVersVeh(p, DEFAUT), v);
  // Le motif historique de la page (6 champs au plus) lit encore ce lien.
  assert.ok(/^([^|]+)\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)(?:\|([^|]*))?$/.test(p));
});

test('aller-retour electrique : « Citadine électrique 50 kWh », 7e champ E…', () => {
  const v = {nom: 'Citadine électrique 50 kWh', type: 'voiture', carbs: [], conso: '', cuve: '', reserve: '', autonomie: '',
             energie: 'elec', batterieKwh: '50', consoKwh100: '17', kwMaxDC: '150', kwMaxAC: '11', prise: 'ccs', reservePct: '15', departPct: '80'};
  const p = vehVersParam(v);
  assert.strictEqual(p, 'Citadine%20%C3%A9lectrique%2050%20kWh|||||' + '|E50,17,150,11,ccs,15,80');
  const lu = paramVersVeh(p, DEFAUT);
  assert.deepStrictEqual(lu, v);
  // Un lien electrique n'herite pas des carburants par defaut quand le 2e champ est vide.
  assert.deepStrictEqual(lu.carbs, []);
});

test('electrique partiel : champs manquants vides, prise inconnue -> ccs, pourcentages > 100 ou negatifs ecartes', () => {
  const v = paramVersVeh('Zoe|||||' + '|E52,,,7.4,usb,150,80', DEFAUT);
  assert.strictEqual(v.energie, 'elec');
  assert.strictEqual(v.batterieKwh, '52');
  assert.strictEqual(v.consoKwh100, '');
  assert.strictEqual(v.kwMaxDC, '');
  assert.strictEqual(v.kwMaxAC, '7.4');
  assert.strictEqual(v.prise, 'ccs');
  assert.strictEqual(v.reservePct, '');       // 150 % : illisible -> vide (la page prendra 15)
  assert.strictEqual(v.departPct, '80');
  // Virgule decimale acceptee a l'ecriture (« 7,4 ») : normalisee en point.
  assert.match(vehVersParam({nom: 'X', energie: 'elec', kwMaxAC: '7,4'}), /E,,,7\.4,ccs,,$/);
});

test('7e champ sans E : ignore (thermique) ; 8e champ et au-dela ignores ; moins de 5 champs ou nom vide -> null', () => {
  const v = paramVersVeh('A|e10|6|50|30|600|bidule|encore', DEFAUT);
  assert.strictEqual(v.energie, undefined);
  assert.strictEqual(v.autonomie, '600');
  assert.strictEqual(paramVersVeh('A|e10|6|50', DEFAUT), null);
  assert.strictEqual(paramVersVeh('|e10|6|50|30', DEFAUT), null);
  assert.strictEqual(paramVersVeh('%20|e10|6|50|30', DEFAUT), null);
  assert.strictEqual(paramVersVeh(null, DEFAUT), null);
});

test('securite : nom borne a 80 caracteres, chaines gardees telles quelles (echappement a la charge de la page)', () => {
  const long = 'x'.repeat(200);
  assert.strictEqual(paramVersVeh(`${long}|e10|6|50|30`, DEFAUT).nom.length, 80);
  assert.strictEqual(vehVersParam({nom: long, carbs: ['e10']}).split('|')[0].length, 80);
  const v = paramVersVeh('%3Cb%3Enom%3C%2Fb%3E|e10|6|50|30', DEFAUT);
  assert.strictEqual(v.nom, '<b>nom</b>');   // decode, pas echappe : la page echappe a l'ingestion
  // Nombres electriques : « 50<script> » n'est pas un nombre -> vide.
  assert.strictEqual(paramVersVeh('A|||||' + '|E50%3Cscript%3E,17', DEFAUT).batterieKwh, '');
});
