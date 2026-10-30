// Mesure axe-core sur chaque état, à 375 px et 1280 px, clair et sombre.
// node axe.cjs <page.html> <dossier de sortie>  → axe.json + axe.md (tableau règle / état / nombre / gravité)
'use strict';
const fs = require('fs');
const path = require('path');
const {chromium} = require('playwright');
const B = require('./banc.cjs');

const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const GRAVITE = {critical: 'critique', serious: 'sérieuse', moderate: 'modérée', minor: 'mineure'};
const ORDRE = {critical: 0, serious: 1, moderate: 2, minor: 3};

async function mesurer(page){
  await page.evaluate(AXE);
  return page.evaluate(tags => axe.run(document, {runOnly: {type: 'tag', values: tags}, resultTypes: ['violations']}), TAGS);
}

(async () => {
  const html = B.lireHtml(process.argv[2]);
  const sortie = process.argv[3] || 'sortie';
  fs.mkdirSync(sortie, {recursive: true});
  const nav = await chromium.launch();
  const resultats = [];   // {contexte, etat, regle, impact, n, aide, cibles}
  for(const c of B.CONTEXTES){
    for(const e of B.ETATS){
      const {context, page} = await B.ouvrir({html, contexte: c, scenario: e.scenario, navigateur: nav});
      try{
        await e.aller(page, c);
        await page.waitForTimeout(300);
        const r = await mesurer(page);
        for(const v of r.violations){
          resultats.push({contexte: c.nom, etat: e.nom, regle: v.id, impact: v.impact, n: v.nodes.length, aide: v.help,
                          cibles: v.nodes.slice(0, 4).map(n => n.target.join(' ')),
                          detail: v.nodes.slice(0, 6).map(n => ({cible: n.target.join(' '), donnees: (n.any[0] || n.all[0] || {}).data || null, resume: (n.failureSummary || '').split('\n').slice(1, 3).join(' ')})), tags: v.tags.filter(t => /wcag|best/.test(t))});
        }
        console.log(`${c.nom.padEnd(14)} ${e.nom.padEnd(14)} ${r.violations.length} règle(s) en défaut : ${r.violations.map(v => `${v.id}×${v.nodes.length}(${v.impact})`).join(', ') || '—'}`);
      }catch(err){
        console.error(`${c.nom} ${e.nom} : ÉCHEC — ${err.message}`);
        resultats.push({contexte: c.nom, etat: e.nom, regle: 'ÉCHEC DU BANC', impact: 'critical', n: 0, aide: err.message.split('\n')[0], cibles: []});
        await page.screenshot({path: path.join(sortie, `echec-${c.nom}-${e.nom}.png`)}).catch(() => {});
      }
      await context.close();
    }
  }
  await nav.close();
  fs.writeFileSync(path.join(sortie, 'axe.json'), JSON.stringify(resultats, null, 1));
  // Tableau : règle, état, nombre (somme sur les 4 contextes), gravité ; détail par contexte en annexe.
  const agg = new Map();
  for(const r of resultats){
    const k = `${r.regle}|${r.etat}`;
    const a = agg.get(k) || {regle: r.regle, etat: r.etat, impact: r.impact, n: 0, contextes: new Set(), aide: r.aide, cibles: new Set()};
    a.n += r.n; a.contextes.add(r.contexte); r.cibles.forEach(x => a.cibles.add(x)); agg.set(k, a);
  }
  const lignes = [...agg.values()].sort((a, b) => ORDRE[a.impact] - ORDRE[b.impact] || a.regle.localeCompare(b.regle) || a.etat.localeCompare(b.etat));
  const total = {critical: 0, serious: 0, moderate: 0, minor: 0};
  resultats.forEach(r => { total[r.impact] = (total[r.impact] || 0) + r.n; });
  let md = `| Règle axe | État | Nombre d'éléments (4 contextes) | Gravité | Contextes |\n|---|---|---:|---|---|\n`;
  for(const l of lignes) md += `| \`${l.regle}\` | ${l.etat} | ${l.n} | ${GRAVITE[l.impact] || l.impact} | ${[...l.contextes].join(', ')} |\n`;
  if(!lignes.length) md += '| — | tous | 0 | — | aucune violation |\n';
  md += `\nTotal d'éléments en défaut : critique ${total.critical}, sérieuse ${total.serious}, modérée ${total.moderate}, mineure ${total.minor}.\n`;
  md += `\nRègles et éléments concernés :\n` + lignes.map(l => `- \`${l.regle}\` (${GRAVITE[l.impact]}) — ${l.aide} ; ex. ${[...l.cibles].slice(0, 3).map(x => `\`${x}\``).join(', ')}`).join('\n') + '\n';
  fs.writeFileSync(path.join(sortie, 'axe.md'), md);
  console.log(md);
})();
