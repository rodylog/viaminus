#!/usr/bin/env node
// Rejoue UNE fixture sans reseau et montre ce que le test verrait : plan resume, requetes
// servies ou manquantes, verdict de chaque regle. Pour lire un echec de `node --test banc/*.test.js`
// ou regenerer attendu.json apres un changement voulu du code.
//
//   node banc/rejeu.js <slug | dossier> [--brut] [--attendu]
//     --brut     : le plan complet (window.__viaminus_plan) en JSON, au lieu du resume
//     --attendu  : (re)ecrit fixtures/<slug>/attendu.json avec le plan rejoue
//
// Sortie 0 : toutes les regles passent ; 1 : au moins un manquement ou une requete manquante.
'use strict';
const path = require('path'), fs = require('fs');
const C = require('./lib/commun.js');
const {REGLES} = require('./regles.js');

async function main(){
  const args = process.argv.slice(2), cible = args.find(x => !x.startsWith('--'));
  if(!cible){ console.log(fs.readFileSync(__filename, 'utf8').split('\n').filter(l => l.startsWith('//')).slice(0, 9).map(l => l.slice(3)).join('\n')); return; }
  const dossier = fs.existsSync(path.join(cible, 'meta.json')) ? path.resolve(cible) : path.join(C.FIXTURES, cible);
  const fx = C.lireFixture(dossier);
  const navigateur = await C.ouvrirNavigateur();
  let r;
  try{ r = await C.rejouer(navigateur, fx); }finally{ await navigateur.close(); }
  const {plan, journal} = r;
  let echec = false;
  console.log(`# ${fx.slug} — ${fx.scenario.depart || 'Ma position'} ${fx.scenario.allerRetour ? '⇄' : '→'} ${fx.scenario.arrivee}, ${fx.scenario.veh.nom}, enregistré le ${fx.meta.date}`);
  console.log(`\n## Requêtes : ${journal.requetes.length} servies depuis la fixture`);
  journal.requetes.forEach(u => console.log(`  ok  ${u.length > 120 ? u.slice(0, 117) + '…' : u}`));
  if(journal.manquantes.length){ echec = true; console.log(`  ${journal.manquantes.length} MANQUANTE(S) :`); journal.manquantes.forEach(u => console.log(`  !!  ${u}`)); }
  if(journal.inconnues.length){ echec = true; console.log(`  hôtes inconnus du banc :`); journal.inconnues.forEach(u => console.log(`  ??  ${u}`)); }
  console.log(`\n## Plan${args.includes('--brut') ? ' (complet)' : ' (résumé)'}`);
  console.log(JSON.stringify(args.includes('--brut') ? plan : C.resumePlan(plan), null, 2));
  console.log('\n## Règles');
  for(const regle of REGLES){
    const pb = regle.verifier({plan, date: fx.meta.date});
    if(pb.length) echec = true;
    console.log(`  ${pb.length ? 'ÉCHEC' : 'ok   '} ${regle.nom}`);
    pb.forEach(x => console.log(`        - ${x}`));
  }
  if(fx.attendu && !args.includes('--attendu')){
    const diff = require('./regles.js').determinisme(fx.attendu, C.resumePlan(plan));
    if(diff.length) echec = true;
    console.log(`  ${diff.length ? 'ÉCHEC' : 'ok   '} fidélité à attendu.json`);
    diff.forEach(x => console.log(`        - ${x}`));
  }
  if(args.includes('--attendu')){
    C.ecrireJson(path.join(dossier, 'attendu.json'), C.resumePlan(plan));
    console.log(`\nattendu.json réécrit dans ${path.relative(C.RACINE, dossier)}`);
  }
  process.exitCode = echec ? 1 : 0;
}
main().catch(e => { console.error('erreur :', e.message); process.exitCode = 1; });
