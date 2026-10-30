#!/usr/bin/env node
// Mode enregistrement : joue un trajet dans la page generee (Chromium headless, reseau REEL),
// enregistre chaque reponse des API (URL normalisee -> corps, statut, type) dans
// banc/fixtures/<slug>/ avec meta.json (date, vehicule, URL, empreinte) et attendu.json (le
// plan obtenu, resume). A lancer hors cloud : la ou les API sont joignables.
//
//   node banc/enregistre.js "Montpellier > Orléans" --veh polo-e85 [--couloir 10] [--sans-peage]
//                           [--aller-retour] [--abord 80 [--litres]] [--slug nom] [--ecraser]
//   node banc/enregistre.js --scenario montpellier-orleans      (depuis banc/scenarios.json)
//   node banc/enregistre.js --tous                              (tous les scenarios sans fixture)
//   node banc/enregistre.js --liste
//
// Sortie 0 : fixture ecrite ; 2 : reseau indisponible (aucune fixture ecrite) ; 1 : autre erreur.
'use strict';
const fs = require('fs'), path = require('path');
const {execFileSync} = require('child_process');
const C = require('./lib/commun.js');

function lireArgs(argv){
  const a = {positionnels: []};
  for(let i = 0; i < argv.length; i++){
    const x = argv[i];
    const val = () => { if(i + 1 >= argv.length) throw new Error(`valeur manquante après ${x}`); return argv[++i]; };
    if(x === '--veh') a.veh = val();
    else if(x === '--couloir') a.couloir = val();
    else if(x === '--sans-peage') a.sansPeage = true;
    else if(x === '--aller-retour') a.allerRetour = true;
    else if(x === '--abord') a.aBord = +val();
    else if(x === '--litres') a.aBordUnite = 'l';
    else if(x === '--slug') a.slug = val();
    else if(x === '--scenario') a.scenario = val();
    else if(x === '--tous') a.tous = true;
    else if(x === '--liste') a.liste = true;
    else if(x === '--ecraser') a.ecraser = true;
    else if(x === '--aide' || x === '-h' || x === '--help') a.aide = true;
    else if(x.startsWith('--')) throw new Error(`option inconnue : ${x}`);
    else a.positionnels.push(x);
  }
  return a;
}
// « Montpellier > Orléans », « A → B », « A ⇄ B » (aller-retour), « > B » (depuis ma position).
function lireTrajet(txt){
  const m = String(txt).match(/^\s*(.*?)\s*(>|→|->|⇄|<>)\s*(.+?)\s*$/);
  if(!m) throw new Error(`trajet attendu sous la forme « Départ > Arrivée » : « ${txt} »`);
  return {depart: m[1], arrivee: m[3], allerRetour: m[2] === '⇄' || m[2] === '<>'};
}

// Routeur d'enregistrement : API -> requete reelle, reponse enregistree puis rendue a la page ;
// fond de carte -> coupe (hors banc) ; hote inconnu -> laisse passer et note.
function routeurEnregistrement(journal){
  return async route => {
    const url = route.request().url(), c = C.classer(url);
    if(c.genre === 'page') return route.continue();
    if(c.genre === 'fond') return route.abort('failed');
    if(c.genre === 'inconnu'){ journal.inconnues.push(C.cleUrl(url)); return route.continue(); }
    journal.enVol++;
    try{
      let rep;
      try{ rep = await route.fetch(); }
      catch(e){ journal.erreurs.push({url: C.cleUrl(url), erreur: e.message.split('\n')[0]}); return await route.abort('failed'); }
      const corps = await rep.body();
      journal.reponses.push({url: C.cleUrl(url), nom: c.nom, statut: rep.status(), type: rep.headers()['content-type'] || 'application/octet-stream', corps});
      if(rep.status() >= 400) journal.erreurs.push({url: C.cleUrl(url), erreur: 'HTTP ' + rep.status()});
      return await route.fulfill({response: rep, body: corps});
    }finally{ journal.enVol--; }
  };
}

function nomFichier(i, r){
  const u = new URL('https://' + r.url);
  let detail = '';
  if(r.nom === 'geocodage' || r.nom === 'ban') detail = C.slugifier(u.searchParams.get('q') || '');
  else if(r.nom === 'prix'){
    const w = u.searchParams.get('where') || '';
    detail = (/rupture/.test(w) ? 'ruptures' : /distance\(/.test(w) ? 'referentiel' : 'stations') + (u.searchParams.get('offset') ? '-' + u.searchParams.get('offset') : '');
  }
  return `${String(i + 1).padStart(2, '0')}-${r.nom}${detail ? '-' + detail : ''}.json`;
}

async function enregistrer(navigateur, sc, {ecraser}){
  const dossier = path.join(C.FIXTURES, sc.slug);
  if(fs.existsSync(dossier) && !ecraser) throw new Error(`${path.relative(C.RACINE, dossier)} existe déjà (--ecraser pour la remplacer)`);
  const date = new Date(); date.setMilliseconds(0);
  const fichierPage = C.genererPage();
  const journal = Object.assign(C.journalNeuf(), {reponses: [], erreurs: []});
  const {ctx, page} = await C.ouvrirPage(navigateur, {date: date.toISOString(), routeur: routeurEnregistrement(journal)});
  let plan;
  try{
    plan = await C.jouer(page, fichierPage, sc, () => journal.enVol);
  }catch(e){
    const reseau = journal.erreurs.length || !journal.reponses.length;
    const detail = journal.erreurs.slice(0, 5).map(x => `  ${x.url.slice(0, 90)} → ${x.erreur}`).join('\n');
    const err = new Error(`${reseau ? 'réseau indisponible' : 'enregistrement impossible'} : ${e.message}${detail ? '\n' + detail : ''}`);
    err.code = reseau ? 2 : 1;
    throw err;
  }finally{ await ctx.close(); }
  // Ecriture : une reponse par fichier (JSON lisible quand c'en est), meta.json, attendu.json.
  fs.rmSync(dossier, {recursive: true, force: true});
  fs.mkdirSync(path.join(dossier, 'reponses'), {recursive: true});
  const reponses = journal.reponses.map((r, i) => {
    const fichier = path.join('reponses', nomFichier(i, r));
    let corps = r.corps.toString('utf8');
    if(/json/.test(r.type)){ try{ corps = JSON.parse(corps); }catch(e){ /* garde le texte */ } }
    C.ecrireJson(path.join(dossier, fichier), {url: r.url, statut: r.statut, type: r.type, corps});
    return {url: r.url, fichier, statut: r.statut, type: r.type, sha256: C.sha256(r.corps)};
  });
  let commit = null; try{ commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {cwd: C.RACINE}).toString().trim(); }catch(e){ /* hors git */ }
  const meta = {
    version: C.VERSION_FIXTURE, date: date.toISOString(), origine: 'enregistrement',
    scenario: sc, url: C.urlTrajet('viaminus.html', sc).replace(/^file:\/\/\/?[^#]*/, ''),
    page: {commit, navigateur: `chromium ${navigateur.version()}`},
    reponses, empreinte: C.sha256(reponses.map(r => r.sha256).join('\n')),
    requetesInconnues: journal.inconnues, erreursReseau: journal.erreurs,
  };
  C.ecrireJson(path.join(dossier, 'meta.json'), meta);
  C.ecrireJson(path.join(dossier, 'attendu.json'), C.resumePlan(plan));
  return {dossier, meta, plan};
}

async function main(){
  const a = lireArgs(process.argv.slice(2));
  if(a.aide || (!a.positionnels.length && !a.scenario && !a.tous && !a.liste)){
    console.log(fs.readFileSync(__filename, 'utf8').split('\n').filter(l => l.startsWith('//')).slice(0, 14).map(l => l.slice(3)).join('\n'));
    return;
  }
  const tous = C.scenarios();
  if(a.liste){
    tous.forEach(s => console.log(`${s.slug.padEnd(40)} ${s.depart || 'Ma position'} ${s.allerRetour ? '⇄' : '→'} ${s.arrivee}  véh. ${s.veh.nom}${s.aBord != null ? `  à bord ${s.aBord} ${s.aBordUnite}` : ''}${s.sansPeage ? '  sans péage' : ''}` +
      (fs.existsSync(path.join(C.FIXTURES, s.slug, 'meta.json')) ? '  [fixture]' : '')));
    return;
  }
  let liste;
  if(a.tous) liste = tous.filter(s => a.ecraser || !fs.existsSync(path.join(C.FIXTURES, s.slug, 'meta.json')));
  else if(a.scenario){ const s = tous.find(x => x.slug === a.scenario); if(!s) throw new Error(`scénario inconnu : ${a.scenario} (--liste)`); liste = [s]; }
  else{
    const t = lireTrajet(a.positionnels.join(' '));
    liste = [C.scenarioNormalise({slug: a.slug, depart: t.depart, arrivee: t.arrivee, allerRetour: a.allerRetour || t.allerRetour,
      couloir: a.couloir, sansPeage: a.sansPeage, veh: a.veh, aBord: a.aBord, aBordUnite: a.aBordUnite})];
  }
  if(!liste.length){ console.log('rien à enregistrer : toutes les fixtures existent (--ecraser pour refaire)'); return; }
  const navigateur = await C.ouvrirNavigateur();
  let code = 0;
  try{
    for(const sc of liste){
      process.stdout.write(`${sc.slug} : ${sc.depart || 'Ma position'} ${sc.allerRetour ? '⇄' : '→'} ${sc.arrivee} (${sc.veh.nom}) … `);
      try{
        const {dossier, meta, plan} = await enregistrer(navigateur, sc, {ecraser: a.ecraser});
        const p = C.resumePlan(plan);
        console.log(`écrit dans ${path.relative(C.RACINE, dossier)} : ${meta.reponses.length} réponses, plan « ${p.etat} », ${p.etapes.length} étape(s), voyage ${p.voyage == null ? 'non chiffré' : p.voyage + ' €'}`);
        if(meta.requetesInconnues.length) console.log(`  attention : ${meta.requetesInconnues.length} requête(s) vers un hôte inconnu du banc, non enregistrées (voir meta.json)`);
        if(meta.erreursReseau.length) console.log(`  attention : ${meta.erreursReseau.length} réponse(s) en erreur enregistrée(s) telles quelles (repli de l'application rejoué)`);
      }catch(e){
        console.log(`\n  ÉCHEC — ${e.message}`);
        code = Math.max(code, e.code || 1);
      }
    }
  }finally{ await navigateur.close(); }
  process.exitCode = code;
}

main().catch(e => { console.error(e.message); process.exitCode = e.code || 1; });
