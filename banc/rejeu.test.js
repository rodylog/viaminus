// Rejeu automatique du banc « 10 trajets » : pour chaque dossier de banc/fixtures/, la page
// generee est lancee dans Chromium headless, tout le reseau est servi depuis la fixture (une
// requete sans reponse enregistree = echec), le plan est lu par le point d'acces de test
// (window.__viaminus_plan) et les regles metier de regles.js sont verifiees, plus le
// determinisme (deux rejeux) et la fidelite au plan enregistre (attendu.json).
//   node --test src/*.test.js banc/*.test.js
// Lire un echec : node banc/rejeu.js <slug>   (voir banc/README.md).
'use strict';
const {describe, it, before, after} = require('node:test');
const assert = require('node:assert/strict');
const C = require('./lib/commun.js');
const {REGLES, determinisme} = require('./regles.js');

const fixtures = C.listerFixtures().map(C.lireFixture);

describe('banc de non-régression (rejeu des fixtures, sans réseau)', () => {
  let navigateur = null;
  before(async () => { navigateur = await C.ouvrirNavigateur(); });
  after(async () => { if(navigateur) await navigateur.close(); });

  it('au moins une fixture dans banc/fixtures/', () => { assert.ok(fixtures.length, 'aucun dossier avec meta.json'); });

  for(const fx of fixtures){
    const sc = fx.scenario;
    describe(`${fx.slug} : ${sc.depart || 'Ma position'} ${sc.allerRetour ? '⇄' : '→'} ${sc.arrivee} (${sc.veh.nom}${sc.aBord != null ? `, ${sc.aBord} ${sc.aBordUnite} à bord` : ''}${sc.sansPeage ? ', sans péage' : ''})`, () => {
      let a = null, b = null;
      before(async () => { a = await C.rejouer(navigateur, fx); b = await C.rejouer(navigateur, fx); });

      it('toutes les requêtes réseau sont servies depuis la fixture', () => {
        assert.ok(a.journal.requetes.length, 'aucune requête interceptée');
        assert.deepEqual(a.journal.manquantes, [], 'requêtes sans réponse enregistrée');
        assert.deepEqual(a.journal.inconnues, [], 'requêtes vers un hôte inconnu du banc');
      });
      it('un plan est publié par la page', () => {
        assert.ok(a.plan && a.plan.etat, 'window.__viaminus_plan vide');
        assert.notEqual(a.plan.etat, 'vehicule-incomplet', 'fiche véhicule incomplète : le plan ne se calcule pas');
      });
      for(const regle of REGLES){
        it(regle.nom, () => {
          const pb = regle.verifier({plan: a.plan, date: fx.meta.date});
          assert.ok(!pb.length, `${pb.length} manquement(s) :\n  - ${pb.join('\n  - ')}`);
        });
      }
      it('le plan est identique entre deux rejeux (déterminisme)', () => {
        const diff = determinisme(a.plan, b.plan);
        assert.ok(!diff.length, diff.join('\n'));
      });
      it('le plan rejoué est celui enregistré (attendu.json)', t => {
        if(!fx.attendu) return t.skip('pas d\'attendu.json : node banc/rejeu.js ' + fx.slug + ' --attendu');
        assert.deepEqual(C.resumePlan(a.plan), fx.attendu);
      });
    });
  }
});
