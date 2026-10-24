// Plan de pleins : ou s'arreter et combien acheter.
//
// Modele (refait le 24/10/2026, Eric : « un algorithme intelligent ») : on part le
// reservoir plein (A km utiles, paye au prix de depart pd) ; a chaque arret on achete
// soit JUSTE ce qu'il faut pour atteindre l'arret suivant (ou l'arrivee), soit le PLEIN
// (utile quand l'arret suivant, impose par l'autonomie, est plus cher : on y achete
// moins). On minimise le carburant CONSOMME pendant le voyage + une penalite par arret ;
// ce qui resterait a l'arrivee n'est pas compte (le plan ne propose donc jamais un arret
// « pour faire le plein pas cher en vue du prochain voyage »). Pour cette famille de
// politiques l'optimum est exact (probleme de la station-service, Khuller-Malekian-
// Mestre 2007) : etat = (arret, carburant en arrivant), ou le carburant en arrivant vaut
// 0 (dernier achat « juste ») ou A - trajet depuis le dernier plein.
// L'ancien modele facturait a chaque arret TOUT le reste du trajet au lieu du manque :
// il poussait vers une station tardive et chere (Montpellier -> Tours, 24/10/2026).
//
// cand : stations triees par km ({s, v, km, e, p}) ; A : autonomie utile (km) ;
// total : km du trajet ; lkm : L/km ; opts.pd : €/L du plein de depart (defaut : la moins
// chere a 15 km du depart, sinon la mediane) ; opts.utiles : calculer les stations par
// lesquelles passe un plan quasi optimal (passe arriere, plus couteuse). Un arret coute
// e km a l'aller et e au retour.
// Renvoie {plan, coutAchats, voyage, reste, utiles} — plan:null si infaisable, plan:[]
// si aucun arret n'est necessaire ; chaque etape = {...cand, q (km achetes), litres,
// plein (true = reservoir rempli), arrivee (km dans le reservoir en arrivant)}.
// voyage = carburant CONSOMME au prix ou il a ete achete, plein de depart compris (null
// si pd inconnu) ; reste = km dans le reservoir a l'arrivee (hors reserve : 0 des qu'il
// y a un arret, A - total sinon).
const ARRET = 0.8;     // EUR par arret : le temps perdu a une valeur, sinon micro-arrets
const TOL_UTILES = 0.5; // EUR : un plan a moins de 0,50 EUR de l'optimum est « utile »
const MAX_CAND = 240;  // au-dela, elagage : 2 moins cheres par tranche (DP en n^3)

function elaguer(cand, total){
  if(cand.length <= MAX_CAND) return cand;
  const tranche = total / (MAX_CAND / 2), bacs = new Map();
  cand.forEach(c => { const k = Math.floor(c.km / tranche); (bacs.get(k) || bacs.set(k, []).get(k)).push(c); });
  const gardes = [];
  bacs.forEach(l => { l.sort((x, y) => x.p - y.p || x.e - y.e); gardes.push(...l.slice(0, 2)); });
  return gardes.sort((x, y) => x.km - y.km);
}

function prixBout(cand, test){
  const px = cand.filter(test).map(c => c.p);
  return px.length ? Math.min(...px) : null;
}

function optimiserPlan(candTous, A, total, lkm, opts = {}){
  const cand = elaguer(candTous, total);
  const n = cand.length, FIN = n;
  const pd = opts.pd != null ? opts.pd : (prixBout(candTous, c => c.km <= 15) ?? prixMedian(candTous));
  if(total <= A) return {plan: [], coutAchats: 0, voyage: pd == null ? null : pd * lkm * total,
                         reste: A - total, utiles: new Set()};
  const km = i => i < 0 ? 0 : i >= n ? total : cand[i].km;
  const ex = i => (i < 0 || i >= n) ? 0 : cand[i].e;
  const leg = (j, i) => km(i) - km(j) + ex(j) + ex(i);
  const INF = Infinity;
  // Etats : vide[i] (arrive a i le reservoir vide) ; plein[i][s+1] (arrive a i avec
  // A - leg(s, i), dernier plein fait en s ; s = -1 : le depart). Cout = achats + arrets
  // (le plein de depart, constant, n'entre pas dans l'argmin).
  const vide = new Array(n).fill(INF), plein = [];
  const pVide = new Array(n).fill(null), pPlein = [];   // predecesseurs {j, etat} pour remonter
  for(let i = 0; i < n; i++){ plein.push(new Array(i + 1).fill(INF)); pPlein.push(new Array(i + 1).fill(null)); }
  let finCout = INF, finPred = null, finReste = 0;
  // etat courant en j : {g: carburant a l'arrivee, c: cout, cle: 'v' | s+1}
  const etats = j => {
    const l = [];
    if(j < 0) return [{g: A, c: 0, cle: 'd'}];
    if(vide[j] < INF) l.push({g: 0, c: vide[j], cle: 'v'});
    plein[j].forEach((c, s1) => { if(c < INF) l.push({g: A - leg(s1 - 1, j), c, cle: s1}); });
    return l;
  };
  const transitions = (j, g, c, cle, sur) => {
    // sur(k, cout, mode, q, reste) est appele pour chaque arrivee possible en k (k = FIN : l'arrivee)
    for(let k = j + 1; k <= FIN; k++){
      if(km(k) - km(j) > A) break;
      const L = leg(j, k);
      if(L > A) continue;
      if(j < 0){ sur(k, c, 'depart', 0, A - L); continue; }   // le plein de depart emmene jusqu'en k
      const p = cand[j].p;
      const qJ = L - g;                                        // juste ce qu'il faut
      if(qJ > 1e-9) sur(k, c + p * lkm * qJ + ARRET, 'juste', qJ, 0);
      const qP = A - g;                                        // le plein
      if(qP > 1e-9 && qP > qJ + 1e-9) sur(k, c + p * lkm * qP + ARRET, 'plein', qP, A - L);
    }
  };
  for(let j = -1; j < n; j++){
    for(const {g, c, cle} of etats(j)){
      transitions(j, g, c, cle, (k, cout, mode, q, reste) => {
        if(k === FIN){
          if(mode === 'plein') return;   // le reste a l'arrivee ne vaut rien : « juste » suffit
          if(cout < finCout - 1e-9){ finCout = cout; finPred = {j, cle, mode, q}; finReste = reste; }
        }else if(mode === 'juste'){
          if(cout < vide[k] - 1e-9){ vide[k] = cout; pVide[k] = {j, cle, mode, q}; }
        }else{
          if(cout < plein[k][j + 1] - 1e-9){ plein[k][j + 1] = cout; pPlein[k][j + 1] = {j, cle, mode, q}; }
        }
      });
    }
  }
  if(finCout === INF) return {plan: null};
  // Remontee : du dernier arret au premier.
  const plan = [];
  let cur = finPred, g = finReste, kSuiv = FIN;
  while(cur && cur.j >= 0){
    const j = cur.j;
    const arrivee = cur.cle === 'v' ? 0 : A - leg(cur.cle - 1, j);
    plan.unshift(Object.assign({}, cand[j], {q: cur.q, litres: cur.q * lkm, plein: cur.mode === 'plein', arrivee}));
    cur = cur.cle === 'v' ? pVide[j] : pPlein[j][cur.cle];
    kSuiv = j;
  }
  const coutAchats = plan.reduce((t, e) => t + e.p * lkm * e.q, 0);
  // Carburant consomme : le plein de depart (A km, consomme en entier des qu'il y a un
  // arret) puis les achats, tous consommes (le dernier est « juste »).
  const voyage = pd == null ? null : pd * lkm * A + coutAchats;
  const r = {plan, coutAchats, voyage, reste: finReste};
  if(!opts.utiles) return r;
  // Passe arriere : cout optimal de chaque etat jusqu'a l'arrivee ; utile = station par
  // laquelle passe un plan a moins de TOL_UTILES de l'optimum (en plus de celles du plan).
  const bVide = new Array(n).fill(INF), bPlein = plein.map(l => l.map(() => INF));
  const arriere = (j, g) => {
    let m = INF;
    transitions(j, g, 0, null, (k, cout, mode) => {
      if(k === FIN && mode === 'plein') return;
      const suite = k === FIN ? 0 : mode === 'juste' ? bVide[k] : bPlein[k][j + 1];
      if(cout + suite < m) m = cout + suite;
    });
    return m;
  };
  for(let j = n - 1; j >= 0; j--){
    bVide[j] = arriere(j, 0);
    for(let s1 = 0; s1 <= j; s1++){ const L = leg(s1 - 1, j); if(L <= A) bPlein[j][s1] = arriere(j, A - L); }
  }
  const utiles = new Set(plan.map(e => e.s));
  for(let i = 0; i < n; i++){
    let m = vide[i] + bVide[i];
    plein[i].forEach((c, s1) => { if(c + bPlein[i][s1] < m) m = c + bPlein[i][s1]; });
    if(m <= finCout + TOL_UTILES) utiles.add(cand[i].s);
  }
  r.utiles = utiles;
  return r;
}

// Plein au depart et plein a l'arrivee. Le plan suppose un reservoir plein au
// depart : encore faut-il savoir OU le faire, et ou refaire le plein en arrivant
// (demande Eric, 17/09/2026). Pour chaque bout du trajet : la station la moins
// chere a moins de `rayon` km du debut (resp. de la fin) ; a prix egal, le plus
// petit detour. null si aucune station dans le rayon.
function pleinsExtremites(cand, total, rayon = 15){
  const meilleure = liste => liste.length ? liste.reduce((x, y) =>
    (y.p < x.p - 1e-9 || (Math.abs(y.p - x.p) <= 1e-9 && y.e < x.e)) ? y : x) : null;
  return {depart:  meilleure(cand.filter(c => c.km <= rayon)),
          arrivee: meilleure(cand.filter(c => c.km >= total - rayon))};
}

// Autonomie utile du plan. Aucune source ouverte ne donne la capacite du reservoir
// (verifie le 17/09/2026) : on demande donc l'AUTONOMIE D'UN PLEIN en km, chiffre que
// le conducteur connait ou lit sur son tableau de bord. Si elle est saisie, elle prime ;
// sinon reservoir / conso x 100. On retire la reserve. null si ni l'une ni l'autre.
function autonomieUtile(conso, cuve, autonomie, reserve){
  const plein = autonomie > 0 ? autonomie : (cuve > 0 && conso > 0 ? cuve / conso * 100 : 0);
  if(!(plein > 0)) return null;
  return {plein, A: plein - Math.max(0, reserve || 0), source: autonomie > 0 ? 'autonomie' : 'reservoir'};
}

// Cout du voyage COMPLET (plein de depart compris) : calcule par optimiserPlan, repris
// ici pour les appelants historiques. null si infaisable ou si le plein de depart n'est
// pas chiffrable (aucune station : pd inconnu).
function coutVoyage(cand, r){
  if(!r || r.plan === null) return null;
  return r.voyage;
}

// Mediane des prix au litre des candidats du couloir ; null sans candidat.
function prixMedian(cand){
  if(!cand.length) return null;
  const px = cand.map(c => c.p).sort((a, b) => a - b);
  const m = px.length >> 1;
  return px.length % 2 ? px[m] : (px[m - 1] + px[m]) / 2;
}

// Economie du plan par rapport a des « pleins au prix median » : la reference est le
// MEME optimiserPlan sur les MEMES candidats, tous les prix remplaces par la mediane
// (plein de depart a la mediane aussi) ; economie = reference -
// carburant reel du voyage. Une reference a prix uniformes ne choisit ses arrets que sur
// les detours et la penalite d'arret : c'est ce que paierait un conducteur qui s'arrete
// « n'importe ou » dans le couloir. voyage = voyage reel (null -> null). Renvoie
// {economie, median, reference}, ou null si infaisable ou non chiffrable.
function economieVsMedian(cand, A, total, lkm, voyage){
  const median = prixMedian(cand);
  if(median == null || voyage == null) return null;
  const rm = optimiserPlan(cand.map(c => Object.assign({}, c, {p: median})), A, total, lkm, {pd: median});
  if(rm.plan === null || rm.voyage == null) return null;
  return {economie: rm.voyage - voyage, median, reference: rm.voyage};
}

// Export Node (tests) ; sans effet dans la page, ou `module` n'existe pas.
if(typeof module !== 'undefined' && module.exports)
  module.exports = {optimiserPlan, pleinsExtremites, autonomieUtile, coutVoyage, prixMedian, economieVsMedian};
