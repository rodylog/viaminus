let CENTRE = null;   // resolu apres lecture des reglages : geoloc > memoire > France
const SNAPSHOT = __SNAP__;
const SNAP_DATE = "__SNAPDATE__";

// Tous les carburants du flux officiel : la fiche vehicule doit servir a
// n'importe quel conducteur (diesel, GPL...), pas seulement a un profil donne.
const FUELS = [["e85","E85 (bioéthanol)"],["e10","SP95-E10"],["sp98","SP98"],
               ["sp95","SP95"],["gazole","Gazole (B7)"],["gplc","GPLc"]];
const LBL = Object.fromEntries(FUELS);
const SP = [["e10","E10"],["sp95","SP95"],["sp98","SP98"]];
// Cases a cocher : cumulables. Coche par defaut = E85 (bioethanol).
const CASES = [["e85","E85"],["e10","E10"],["sp95","SP95"],["sp98","SP98"],
               ["spmin","SP le - cher"],["gazole","Gazole"],["gplc","GPLc"]];
const DEFAUT = ["e85"];
// Type de vehicule : ne sert qu'a l'icone du chip (l'assistant vehicule viendra plus tard).
const TYPES = {voiture: 'Voiture', utilitaire: 'Utilitaire', moto: 'Moto', campingcar: 'Camping-car'};

// Les reglages survivent au rechargement : sans cela, chaque F5 remettait les
// cases par defaut et faisait perdre la selection en cours.
const CLE = 'fuelpilot:reglages';
function reglagesLus(){
  try{
    // Ancienne cle (versions anterieures au 16/09/2026) lue si la nouvelle est vide.
    return JSON.parse(localStorage.getItem(CLE) ||
                      localStorage.getItem('carte-carburants:reglages')) || {};
  }catch(e){ return {}; }
}
const REGL = reglagesLus();
// Migration : l'ancien format (reglages a plat) devient le vehicule 1 du garage.
if(!Array.isArray(REGL.vehicules) || !REGL.vehicules.length){
  REGL.vehicules = [{nom: 'Véhicule 1',
    carbs: Array.isArray(REGL.carbs) && REGL.carbs.length ? REGL.carbs : DEFAUT,
    conso: REGL.conso || '', cuve: REGL.cuve || ''}];
  REGL.vehActif = 0;
}
if(!(REGL.vehActif >= 0) || REGL.vehActif >= REGL.vehicules.length) REGL.vehActif = 0;

// Ecriture directe, SANS fusion : reservee aux operations de structure du
// garage (suppression, renommage) et aux reglages globaux (theme, fond, appli de
// navigation) qui doivent s'imposer tels quels.
function reglagesBruts(){
  try{ localStorage.setItem(CLE, JSON.stringify(REGL)); }
  catch(e){ /* stockage refuse : on continue sans memoire */ }
}

const $ = id => document.getElementById(id);

function reglagesEcrits(){
  // ETAT LIVE AVANT D'ECRIRE : plusieurs onglets partagent ce stockage ; ecrire
  // notre copie memoire ecraserait leur travail (constate le 09/08 : un onglet
  // reste sur « Vehicule 1 » a efface le profil cree ailleurs). On repart
  // du stockage frais et on n'y reporte QUE notre vehicule actif + les globaux.
  const frais = reglagesLus();
  if(Array.isArray(frais.vehicules) && frais.vehicules.length){
    const mienNom = REGL.vehicules[REGL.vehActif].nom;
    REGL.vehicules = frais.vehicules;
    let i = REGL.vehicules.findIndex(x => x.nom === mienNom);
    if(i < 0){ REGL.vehicules.push({nom: mienNom}); i = REGL.vehicules.length - 1; }
    REGL.vehActif = i;
  }
  const v = REGL.vehicules[REGL.vehActif];
  v.carbs = choix();
  v.type = $('vtype').value;
  v.conso = $('conso').value;
  v.cuve  = $('cuve').value;
  v.autonomie = $('autonomie').value;
  v.reserve = $('reserve').value;
  REGL.sansCher = $('sansCher').checked;
  REGL.couloir  = $('couloir').value;
  REGL.queUtiles = $('queUtiles').checked;
  REGL.sansPeage = $('sansPeage').checked;
  reglagesBruts();
  majSelectVeh();   // le garage a pu s'enrichir depuis un autre onglet
  majChip();
}
function majSelectVeh(){
  $('veh').innerHTML = REGL.vehicules.map((v,i) =>
    `<option value="${i}"${i === REGL.vehActif ? ' selected' : ''}>${esc(v.nom)}</option>`).join('');
}
function appliquerVeh(){
  const v = REGL.vehicules[REGL.vehActif];
  document.querySelectorAll('#carbs input').forEach(i => i.checked = v.carbs.includes(i.value));
  $('vtype').value = TYPES[v.type] ? v.type : 'voiture';
  $('conso').value = v.conso || '';
  $('cuve').value  = v.cuve || '';
  $('autonomie').value = v.autonomie || '';
  $('reserve').value = v.reserve || '';
  $('vnom').value = v.nom;
  majEstimations();
  majChip();
}
// Autonomie d'un plein et reservoir se deduisent l'un de l'autre par la conso : chaque
// champ affiche en grise ce qu'il vaudrait d'apres l'autre, ce qui montre tout de suite
// un ecart entre les deux saisies (l'autonomie prime dans le calcul, cf. autonomieUtile).
function majEstimations(){
  const conso = +$('conso').value;
  const cuve = +$('cuve').value;
  const auto = +$('autonomie').value;
  $('autonomie').placeholder = conso > 0 && cuve > 0 ? `≈ ${Math.round(cuve / conso * 100)}` : '600';
  $('cuve').placeholder = conso > 0 && auto > 0 ? `≈ ${Math.round(auto * conso / 100)}` : '50';
}
// Chip vehicule (en haut a droite) : icone du type, nom, carburants coches.
function majChip(){
  const v = REGL.vehicules[REGL.vehActif];
  $('chipIco').innerHTML = ico(TYPES[v.type] ? v.type : 'voiture');
  $('chipNom').textContent = v.nom;
  const c = (v.carbs || []).map(k => k === 'spmin' ? 'SP le - cher' : (COURT[k] || k));
  $('chipCarb').textContent = c.length ? c.join(' + ') : 'aucun carburant';
  $('chipVeh').setAttribute('aria-label', `Garage — ${v.nom}, ${c.join(' + ') || 'aucun carburant'}`);
}
const coches = REGL.vehicules[REGL.vehActif].carbs;
$('carbs').innerHTML = CASES.map(([k,l]) =>
  `<label class="case"><input type="checkbox" value="${k}"`+
  `${coches.includes(k)?' checked':''}> ${l}</label>`).join('');

// ---------- Theme : automatique, ou choix memorise ----------
const SCHEMA_SOMBRE = matchMedia('(prefers-color-scheme: dark)');
const sombreEffectif = () => REGL.theme === 'sombre' || (REGL.theme !== 'clair' && SCHEMA_SOMBRE.matches);
function appliquerTheme(){
  document.documentElement.dataset.theme = REGL.theme || 'auto';
  document.querySelectorAll('[data-theme]').forEach(b => {
    if(b.tagName === 'BUTTON') b.setAttribute('aria-pressed', String((REGL.theme || 'auto') === b.dataset.theme));
  });
  if(CARTE) CARTE.sombre(sombreEffectif());
}
document.documentElement.dataset.theme = REGL.theme || 'auto';
SCHEMA_SOMBRE.addEventListener('change', () => appliquerTheme());

// Regle de conception : AUCUNE coordonnee personnelle en dur. Le centre vient de
// la geolocalisation de l'appareil ; a defaut du dernier repere memorise sur CE
// navigateur ; a defaut d'une vue France entiere (appui long / clic droit pour poser le repere).
if(Array.isArray(REGL.centre)) CENTRE = REGL.centre.slice();
const ZOOM0 = CENTRE ? 13 : 5.5;
if(!CENTRE) CENTRE = [46.603, 2.334];

// ---------- Carte (MapLibre GL, fond IGN) ----------
// Sans WebGL : message sur fond neutre, le reste (liste, garage, plan) fonctionne.
const CARTE = creerCarte({centre: CENTRE, zoom: ZOOM0, sombre: sombreEffectif(), fond: REGL.fond});
const map = CARTE ? CARTE.map : null;
if(!CARTE){
  $('map').hidden = true;
  $('sansWebgl').hidden = false;
}
// Repere (pastille bleue) : les distances partent d'ici.
const elRepere = document.createElement('div');
elRepere.className = 'repere';
elRepere.title = 'Point de repère — les distances partent d\'ici';
const repere = CARTE ? CARTE.marqueur(CENTRE[0], CENTRE[1], elRepere) : null;
// Trace du trajet (couche GeoJSON, remise apres chaque changement de style).
const TRACE_VIDE = {type: 'FeatureCollection', features: []};
if(CARTE) CARTE.couche('fh-trace', {type: 'geojson', data: TRACE_VIDE},
  {type: 'line', layout: {'line-cap': 'round', 'line-join': 'round'},
   paint: {'line-color': '#1d4ed8', 'line-width': 5, 'line-opacity': 0.45}});

let MARQUEURS = [];   // marqueurs HTML des stations et reperes du plan, refaits a chaque rendu
let DATA = [], sortKey = 'prix', sortAsc = true;

const dist = (la,lo) => {
  const R=6371, p=Math.PI/180;
  const dLa=(la-CENTRE[0])*p, dLo=(lo-CENTRE[1])*p;
  const a=Math.sin(dLa/2)**2+Math.cos(CENTRE[0]*p)*Math.cos(la*p)*Math.sin(dLo/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
};
// Trois couleurs tranchees, lues d'un coup d'oeil : VERT = le moins cher, BLEU = dans
// la norme, ROUGE = cher (choix Eric, 17/09/2026 ; avant : bleu / marron / rouge).
// La couleur ne dit QUE le prix : les reperes du plan (etapes, depart, arrivee) sont
// en noir, pour qu'un cercle vert ne se lise pas « moins cher ».
// Couleurs lues depuis les jetons app.css (--vert/--bleu/--rouge) : source
// unique de la palette. Repli sur les valeurs en dur si le jeton est absent
// (feuille non chargee, style calcule vide).
const jeton = (nom, repli) =>
  getComputedStyle(document.documentElement).getPropertyValue(nom).trim() || repli;
const VERT = jeton('--vert', '#158a3f'), BLEU = jeton('--bleu', '#0b57d0'),
      ROUGE = jeton('--rouge', '#c02626');
function couleur(p, b, mini){
  if(mini != null && p <= mini + 1e-9) return VERT;    // le moins cher, ex aequo compris
  if(b && p > b.p90) return ROUGE;                     // 10 % les plus chers du secteur
  return BLEU;                                         // dans la norme
}

// Referentiel de couleur : les bornes viennent du SECTEUR (60 km autour du
// point de repere), pas de la zone affichee. Sans cela, la moins chere d'un ecran de
// stations cheres s'afficherait en vert — « la moins chere ici » n'est pas
// « une bonne affaire ». Rouge plein = au-dessus du 9e decile.
let REF_ROWS = [];
const jour = s => s ? s.slice(8,10)+'/'+s.slice(5,7) : '—';
function quand(s){
  if(!s) return {txt:'date inconnue', vieux:true};
  const d = new Date(s);
  const j = Math.floor((Date.now() - d.getTime()) / 86400000);
  const txt = d.toLocaleString('fr-FR', {day:'2-digit', month:'2-digit',
                                         hour:'2-digit', minute:'2-digit'})
              .replace(' ', ' à ');
  return {txt: j >= 1 ? `${txt} · il y a ${j} j` : txt, vieux: j >= 4};
}

// Echappement HTML de toute chaine venue de l'exterieur (flux des stations,
// nom de vehicule importe par l'URL) : fait UNE fois a l'ingestion, tout ce qui
// est rendu ensuite (liste, fiches, garage) est sain.
const esc = x => String(x).replace(/[&<>"']/g, c =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Retour au texte brut pour ce qui ne passe pas par innerHTML (presse-papiers, aria-label).
const brut = x => String(x).replace(/&(amp|lt|gt|quot|#39);/g, m =>
  ({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'"}[m]));

function normalise(rows){
  return rows.map(r => {
    const la=parseFloat(r.latitude)/100000, lo=parseFloat(r.longitude)/100000;
    if(!isFinite(la)||!isFinite(lo)) return null;
    return {id: esc(r.id != null ? r.id : `${la},${lo}`), la, lo,
            ville:esc(r.ville||''), cp:esc(r.cp||''), adresse:esc(r.adresse||''),
            auto:r.horaires_automate_24_24==='Oui',
            rupture:esc([r.carburants_rupture_temporaire, r.carburants_rupture_definitive]
                      .filter(Boolean).join(';')),
            hs:new Set([r.carburants_rupture_temporaire, r.carburants_rupture_definitive]
                       .filter(Boolean).join(';').split(';')
                       .map(x => x.trim().toLowerCase()).filter(Boolean)),
            d:dist(la,lo),
            prix:Object.fromEntries(FUELS.map(([k])=>[k,r[k+'_prix']])),
            maj:Object.fromEntries(FUELS.map(([k])=>[k,r[k+'_maj']]))};
  }).filter(Boolean);
}

// Selection multiple : une station n'est retenue que si elle sert TOUS les
// carburants coches ; le classement se fait sur la somme, mais chaque carburant
// garde sa propre couleur (un bon E85 avec un SP quelconque doit se voir).
const COURT = {e10:'E10', sp98:'SP98', sp95:'SP95', e85:'E85',
               gazole:'Gazole', gplc:'GPLc'};
// Libelles tels qu'ils apparaissent dans carburants_rupture_* du flux officiel.
const RUPT = {e10:'e10', sp98:'sp98', sp95:'sp95', e85:'e85',
              gazole:'gazole', gplc:'gplc'};
const dispo = (s, k) => s.prix[k] != null && !s.hs.has(RUPT[k]);
const choix = () => [...document.querySelectorAll('#carbs input:checked')].map(i => i.value);

function pick(s, sel){
  const lignes = [];
  for(const k of sel){
    if(k === 'spmin'){
      const c = SP.filter(([kk]) => dispo(s, kk))
                  .map(([kk,n]) => ({ref:kk, tag:n, prix:s.prix[kk], maj:s.maj[kk]}));
      if(!c.length) return null;
      lignes.push(c.reduce((a,b) => b.prix < a.prix ? b : a));
    }else{
      if(!dispo(s, k)) return null;
      lignes.push({ref:k, tag:COURT[k], prix:s.prix[k], maj:s.maj[k]});
    }
  }
  if(!lignes.length) return null;
  return {p: +lignes.reduce((t,l) => t + l.prix, 0).toFixed(3), lignes,
          maj: lignes.map(l => l.maj).filter(Boolean).sort()[0] || null};
}

// Bornes du secteur pour une selection donnee (un seul carburant, ou la somme).
function bornes(sel){
  const px = REF_ROWS.map(s => pick(s, sel)).filter(Boolean)
                     .map(v => v.p).sort((a,b) => a-b);
  if(px.length < 8) return null;
  const Q = f => px[Math.round(f*(px.length-1))];
  return {med: Q(0.50), p90: Q(0.90)};
}

const sansCherLbl = () => $('sansCher').checked
  ? 'les 10 % les plus chères du secteur sont masquées'
  : 'rouge = les 10 % les plus chères du secteur';

// Emprise interrogee. BUG CORRIGE (phase 1) : au chargement, la carte peut n'avoir
// aucune taille (conteneur pas encore mis en page, page ouverte dans un cadre ou un
// panneau masque) ; ses bornes se reduisent alors a une ligne (sud = nord) et le flux
// repond HTTP 400 a cette bbox degeneree — trois fois (chargement initial, moveend,
// retour de la geolocalisation), d'ou « hors ligne » alors que le premier geste, fait
// sur une carte enfin dimensionnee, reussissait. Desormais : une bbox n'est envoyee
// que si elle est finie et non degeneree ; sinon on interroge autour du repere, et la
// carte relance un chargement des qu'elle recoit sa taille (evenement resize).
let empriseProvisoire = false;
function emprise(){
  if(map){
    const c = map.getContainer();
    if(c.clientWidth > 0 && c.clientHeight > 0){
      const b = map.getBounds();
      const s = b.getSouth(), n = b.getNorth(), w = b.getWest(), e = b.getEast();
      if([s, n, w, e].every(Number.isFinite) && n - s > 1e-4 && e - w > 1e-4){
        empriseProvisoire = false;
        return {s: Math.max(-85, s), n: Math.min(85, n), w: Math.max(-180, w), e: Math.min(180, e)};
      }
    }
  }
  empriseProvisoire = true;
  if(ZOOM0 < 10) return {s: 41.2, n: 51.3, w: -5.5, e: 9.8};     // France entiere
  const dLat = 0.05, dLon = 0.05 / Math.cos(CENTRE[0] * Math.PI / 180);   // ~5 km
  return {s: CENTRE[0] - dLat, n: CENTRE[0] + dLat, w: CENTRE[1] - dLon, e: CENTRE[1] + dLon};
}
const dansEmprise = (b, la, lo) => la >= b.s && la <= b.n && lo >= b.w && lo <= b.e;

// ---------- Rendu : marqueurs, liste en cartes, bloc plan ----------
function rendu(){
  const sel = choix();
  const liste = $('liste');
  MARQUEURS.forEach(m => m.remove()); MARQUEURS = [];
  liste.innerHTML = '';
  $('blocPlan').hidden = true;
  $('titreListe').firstChild.textContent = ROUTE ? 'Sur le trajet' : 'Autour de vous';
  $('secStations').querySelector('.stations-tete').hidden = !ROUTE;
  if(!sel.length){
    majEtat('aucun carburant coché');
    liste.innerHTML = '<li class="vide">Cochez au moins un carburant dans le garage.</li>';
    return;
  }

  // En itineraire, le couloir est deja charge en entier : le zoom se contente de
  // filtrer l'affichage, ce qui est instantane et ne perd aucune station.
  let source = DATA;
  if(ROUTE){
    const large = +$('couloir').value;
    const vue = emprise();
    DATA.forEach(s => { if(s.ecart == null){
      const r = distTrace(s.la, s.lo); s.ecart = r.d; s.kmr = r.km; } });
    source = DATA.filter(s => s.ecart <= large && dansEmprise(vue, s.la, s.lo));
  }
  const list = source.map(s => ({s, v: pick(s, sel)})).filter(o => o.v);
  const n = list.length;
  majCompte = t => {
    $('compte').textContent =
      `${n} station${n>1?'s':''} ${ROUTE ? 'sur le trajet, dans la zone affichée' : 'dans la zone affichée'}` + t +
      (tronque ? ` · ${tronque} de plus non chargée${tronque>1?'s':''} (plafond ${PLAFOND})` : '');
    $('titreStations').textContent = `Stations du couloir (${n})`;
    majEtat();
  };
  majCompte('');
  if(!n){
    liste.innerHTML = ROUTE
      ? '<li class="vide">Aucune station du couloir ne sert cette combinaison dans la zone affichée — dézoomez, élargissez le couloir, ou décochez un carburant.</li>'
      : '<li class="vide">Aucune station ne sert cette combinaison dans la zone affichée — dézoomez, déplacez la carte, ou décochez un carburant.</li>';
    return;
  }

  const px = list.map(o => o.v.p);
  const refTotal = bornes(sel), miniTot = Math.min(...px);
  const refs  = sel.map(k => bornes([k]));
  const minis = sel.map((k,i) => Math.min(...list.map(o => o.v.lignes[i].prix)));
  const multi = sel.length > 1;

  const sansCher = $('sansCher').checked;
  // Une station est « trop chere » des qu'UN des carburants demandes est dans le
  // 9e decile de son propre secteur — pas seulement quand la somme l'est. Sinon
  // le masque laissait passer des pastilles rouges, ce qui se voyait et se lisait mal.
  const chere = o => couleur(o.v.p, refTotal, miniTot) === ROUGE ||
                     o.v.lignes.some((l,j) => couleur(l.prix, refs[j], minis[j]) === ROUGE);
  const retenues = sansCher ? list.filter(o => !chere(o)) : list;
  const ecartees = list.length - retenues.length;

  // Dessin des etiquettes de prix, appele une fois connue la liste REELLEMENT affichee
  // (voir plus bas) : mn = prix minimum par carburant parmi ces seules stations.
  // Les plus cheres dessinees en premier : les etiquettes utiles restent dessus.
  const dessinerMarqueurs = (liste, mn) => { if(!CARTE) return;
    [...liste].sort((a,b) => b.v.p - a.v.p).forEach(o => {
      const {s,v} = o;
      const chips = v.lignes.map((l,j) =>
        `<span style="background:${couleur(l.prix, refs[j], mn[j])}">${l.tag} ${l.prix.toFixed(3)}</span>`).join('');
      const html = multi
        ? `<div class="lbl lbl2">${chips}</div>`
        : `<div class="lbl" style="background:${couleur(v.lignes[0].prix, refs[0], mn[0])};`+
          `border-color:#555;color:#fff">${v.lignes[0].prix.toFixed(3)}`+
          (sel[0]==='spmin' ? ` <span style="font-size:10px;opacity:.85">${v.lignes[0].tag}</span>` : '')+
          `</div>`;
      const el = document.createElement('button');
      el.type = 'button'; el.className = 'marqueur'; el.tabIndex = -1;
      el.setAttribute('aria-label', `${brut(s.ville)} — ${v.lignes.map(l => `${l.tag} ${l.prix.toFixed(3)} €`).join(', ')}`);
      el.innerHTML = html; el.dataset.id = s.id;
      el.addEventListener('click', e => { e.stopPropagation(); ouvrirStation(o, el); });
      MARQUEURS.push(CARTE.marqueur(s.la, s.lo, el));
    });
  };

  const gardees = retenues;
  $('thDist').textContent = ROUTE ? 'Écart au trajet' : 'Distance';

  const ordre = (a,b)=>{
    let x,y;
    if(sortKey==='prix'){x=a.v.p;y=b.v.p;}
    else if(sortKey==='dist'){x=ROUTE?a.s.ecart:a.s.d;y=ROUTE?b.s.ecart:b.s.d;}
    else if(sortKey==='maj'){x=a.v.maj||'';y=b.v.maj||'';}
    else {x=(a.s[sortKey]||'').toLowerCase();y=(b.s[sortKey]||'').toLowerCase();}
    return (x>y?1:x<y?-1:0)*(sortAsc?1:-1);
  };
  let tri = [...gardees].sort(ordre);
  majCompte(ecartees ? ` · ${ecartees} trop chère${ecartees>1?'s':''} masquée${ecartees>1?'s':''}` : '');

  // ---- Plan de pleins : plein au depart, arrets choisis au moins cher ----
  const etapeNum = new Map();
  // Plein au depart / a l'arrivee : station -> libelle. Toujours visibles, meme avec
  // le filtre « arrets du plan » (demande Eric, 17/09/2026 : Orleans > Montpellier,
  // aucune station ni au depart ni a l'arrivee).
  const extremites = new Map();
  // Trajet sans arret necessaire : stations gardees a la place du plan (voir plus bas).
  const moinsCheres = new Set();
  let utilesPlan = null, horsPlan = 0;
  const elPlan = $('plan');
  if(ROUTE && KMS){
    const conso = +$('conso').value;
    const cuve  = +$('cuve').value;
    const autonomie = +$('autonomie').value;
    // Reserve en KM (choix d'ergonomie) : plus parlant qu'un pourcentage.
    const resv = Math.max(0, +$('reserve').value || 30);
    const au = autonomieUtile(conso, cuve, autonomie, resv);
    $('blocPlan').hidden = false;
    if(!(conso > 0) || !au){
      elPlan.innerHTML = '<span style="color:var(--muted)">Renseignez la conso et l\'autonomie d\'un plein (ou le réservoir) dans le garage pour savoir où faire le plein.</span>';
    }else{
      const A = au.A;
      const total = KMS[KMS.length - 1];
      const larg = +$('couloir').value;
      const lkm = conso / 100;
      const carbPlan = sel[0];               // le plan se calcule sur le 1er carburant coche
      const candTous = DATA.filter(x => x.kmr != null)
                       .map(x => ({s: x, v: pick(x, sel)})).filter(o => o.v)
                       .map(o => ({s: o.s, v: o.v, km: o.s.kmr, e: o.s.ecart,
                                   p: o.v.lignes[0].prix}))
                       .sort((a,b) => a.km - b.km);
      const cand = candTous.filter(c => c.e <= larg);
      const r = optimiserPlan(cand, A, total, lkm);
      const plan = r.plan;
      const coutTotal = r.coutAchats || 0;
      utilesPlan = r.utiles || null;

      // Cout du voyage COMPLET : le plein de depart se paie aussi. Il est value
      // au meilleur prix disponible a moins de 15 km du point de depart.
      const coutVoyage = (candW, rw) => {
        if(!rw || rw.plan === null) return null;
        const pd = Math.min(...candW.filter(c => c.km <= 15).map(c => c.p));
        if(!isFinite(pd)) return null;
        const kmDep = rw.plan.length ? rw.plan[0].km + rw.plan[0].e : total;
        return pd * lkm * Math.min(kmDep, total) + rw.coutAchats;
      };
      const voyage = coutVoyage(cand, r);

      // Le cout depend de la largeur du couloir : plus large, plus de stations
      // pas cheres candidates — mais des detours plus longs. Comparatif calcule
      // sur les memes donnees (chargees a 20 km quoi qu'il arrive).
      const comparatif = [1, 2, 5, 10, 20].map(w => {
        const cw = candTous.filter(c => c.e <= w);
        const v = coutVoyage(cw, optimiserPlan(cw, A, total, lkm));
        return `${w === larg ? '<b>' : ''}${w} km : ${v == null ? '—' : v.toFixed(2) + ' €'}${w === larg ? '</b> ◄' : ''}`;
      }).join(' · ');

      // Temps perdu : ~5 min par arret + le detour parcouru a ~50 km/h.
      const minutes = e => 5 + (2 * e.e) / 50 * 60;
      const tempsTotal = (plan || []).reduce((t, e) => t + minutes(e), 0);

      // Ou faire le plein avant de partir, et ou le refaire en arrivant (15 km de chaque bout).
      const {depart, arrivee} = pleinsExtremites(cand, total);
      if(depart) extremites.set(depart.s, 'Départ');
      if(arrivee) extremites.set(arrivee.s, extremites.has(arrivee.s) ? 'Départ et arrivée' : 'Arrivée');

      (plan || []).forEach((e,i) => etapeNum.set(e.s, i + 1));
      // Trajet court, aucun arret necessaire : le filtre « arrets du plan » ne doit pas
      // vider la carte. On garde alors les moins cheres du couloir DANS LA ZONE AFFICHEE
      // (meme reference que le vert : sinon le texte citait des stations hors ecran) :
      // TOUTES celles au prix le plus bas, ex aequo compris, donc toutes en vert,
      // completees jusqu'a trois stations, departagees par le detour. Constate le
      // 17/09/2026 : Montpellier > Aniane, 35 km, 10 stations dans le couloir, carte et
      // liste vides.
      if(plan && !plan.length && list.length){
        const parPrix = [...list].sort((a,b) => a.v.p - b.v.p || a.s.ecart - b.s.ecart);
        const pMin = parPrix[0].v.p;
        parPrix.forEach((o,i) => { if(o.v.p <= pMin + 1e-9 || i < 3) moinsCheres.add(o.s); });
      }
      // Reperes du plan sur la carte : cercle noir pointille = etape, plein = depart/arrivee.
      const rond = (s, titre, plein) => { if(!CARTE) return;
        const el = document.createElement('div');
        el.className = 'etape-rond' + (plein ? ' plein' : ''); el.title = titre;
        MARQUEURS.push(CARTE.marqueur(s.la, s.lo, el));
      };
      (plan || []).forEach((e,i) => rond(e.s, `Étape ${i+1} — km ${Math.round(e.km)}`, false));
      [[depart, 'Plein au départ'], [arrivee, 'Plein à l\'arrivée']].forEach(([o, t]) => {
        if(o) rond(o.s, `${t} — km ${Math.round(o.km)}`, true);
      });
      const nomStation = o => `<b>${o.s.ville}</b> ${o.v.lignes.map(l => `${l.tag} ${l.prix.toFixed(3)}`).join(' + ')} €`+
                              ` (km ${Math.round(o.km)}, détour ${(2*o.e).toFixed(1)} km)`;
      const ligneDepart = `<span class="badge">${ico('pompe')} Départ</span> Plein au départ : ` +
        (depart ? nomStation(depart) : 'aucune station à moins de 15 km du départ dans ce couloir');
      const ligneArrivee = `<span class="badge">${ico('pompe')} Arrivée</span> Plein à l'arrivée : ` +
        (arrivee ? nomStation(arrivee) : 'aucune station à moins de 15 km de l\'arrivée dans ce couloir');
      const origine = au.source === 'autonomie' ? `plein ≈ ${Math.round(au.plein)} km`
                    : `${cuve} L × ${String(conso).replace('.', ',')} L/100`;
      const tete = `${ligneDepart} · autonomie utile ~${Math.round(A)} km (${origine}, réserve ${resv} km)`;
      if(plan === null){
        elPlan.innerHTML = `${tete} · <b style="color:var(--rouge)">${ico('alerte')} trajet infaisable avec cette`+
          ` autonomie dans ce couloir</b> — élargissez le couloir, réduisez la réserve ou vérifiez conso et réservoir`;
      }else if(!plan.length){
        const lst = [...list].filter(o => moinsCheres.has(o.s))
                             .sort((a,b) => a.v.p - b.v.p || a.s.ecart - b.s.ecart);
        elPlan.innerHTML = `${tete} · trajet de ${Math.round(total)} km : <b>aucun arrêt nécessaire</b>`+
          (voyage != null ? ` · carburant du voyage ≈ <b>${voyage.toFixed(2)} €</b> (plein au départ)` : '') +
          (lst.length ? `<br>Pour un plein en route, les moins chères du couloir dans la zone affichée : ` +
            lst.map(o => `<b>${o.s.ville}</b> ${o.v.lignes.map(l => `${l.tag} ${l.prix.toFixed(3)}`).join(' + ')} €`+
                         ` (km ${Math.round(o.s.kmr)}, détour ${(2*o.s.ecart).toFixed(1)} km)`).join(' · ') : '') +
          `<br>${ligneArrivee}`;
      }else{
        elPlan.innerHTML = tete +
          ` · plan optimal sur ${COURT[carbPlan] || 'SP'}, détours comptés — achats en route ≈ <b>${coutTotal.toFixed(2)} €</b>` +
          (voyage != null ? ` · carburant du voyage ≈ <b>${voyage.toFixed(2)} €</b> (plein de départ compris)` : '') +
          ` · temps d'arrêts ≈ <b>${Math.round(tempsTotal)} min</b>` +
          `<br>` +
          plan.map((e,i) =>
            `<span class="badge">${ico('pompe')} ${i+1}</span> ${e.s.ville} km ${Math.round(e.km)}`+
            ` (détour ${(2*e.e).toFixed(1)} km ≈ ${(2*e.e*lkm*e.p).toFixed(2)} €, ~${Math.round(minutes(e))} min)`+
            ` — ${e.v.lignes.map(l => `${l.tag} ${l.prix.toFixed(3)}`).join(' + ')} €`).join(' · ') +
          `<br>${ligneArrivee}` +
          `<br><span style="color:var(--muted)">Voyage selon le couloir — ${comparatif}</span>`;
      }
    }
    // Une station du plan (etape, depart, arrivee) reste visible meme « trop chere » :
    // le plan y passe. La masquer faisait croire a un plan vide (constate le 17/09/2026 :
    // Le Caylar, etape 1 d'Orleans > Montpellier, absente de la liste et de la carte).
    const dansTri = new Set(tri.map(o => o.s));
    const reprises = list.filter(o => (etapeNum.has(o.s) || extremites.has(o.s)) && !dansTri.has(o.s));
    if(reprises.length){ tri.push(...reprises); tri.sort(ordre); }
    if(utilesPlan && $('queUtiles').checked){
      const avant = tri.length;
      tri = tri.filter(({s}) => etapeNum.has(s) || moinsCheres.has(s) || extremites.has(s));
      const off = avant - tri.length;
      horsPlan = off;
      if(off) majCompte(` · ${off} hors plan masquée${off>1?'s':''}`);
    }
  }
  if(!tri.length){
    // Deux causes possibles, deux messages : le filtre du plan, ou le masque des cheres.
    liste.innerHTML = horsPlan
      ? '<li class="vide">Aucune station du plan dans la zone affichée — dézoomez, ou désactivez « Seulement les arrêts du plan » pour voir tout le couloir.</li>'
      : '<li class="vide">Toutes les stations de la zone sont dans les 10 % les plus chères du secteur — désactivez « Masquer les trop chères » (options) pour les voir.</li>';
    return;
  }
  // Couleurs calculees sur les stations REELLEMENT affichees, comme le dit la legende
  // (« la moins chere affichee ») : avec le filtre « arrets du plan », une etape seule
  // restait « dans la norme » parce que des stations masquees etaient moins cheres ;
  // ex aequo compris, toutes les moins cheres affichees sont vertes (17/09/2026).
  const minisAff = sel.map((k,i) => Math.min(...tri.map(o => o.v.lignes[i].prix)));
  const miniTotAff = Math.min(...tri.map(o => o.v.p));
  $('echelle').textContent =
    `— vert = la moins chère affichée, ex æquo compris ; ${sansCherLbl()} · ` +
    sel.map((k,i) => `${k==='spmin'?'SP':COURT[k]} ${minisAff[i].toFixed(3)}` +
                     (refs[i] ? ` / ${refs[i].p90.toFixed(3)}` : '')).join(' · ') + ' €';
  dessinerMarqueurs(tri, minisAff);
  tri.forEach((o, i) => {
    const {s, v} = o;
    const chips = v.lignes.map((l,j) =>
      `<span class="pill" style="background:${couleur(l.prix, refs[j], minisAff[j])}">${l.tag} ${l.prix.toFixed(3)}</span>`).join('');
    const prix = (multi
      ? `<span class="pill" style="background:${couleur(v.p, refTotal, miniTotAff)}">${v.p.toFixed(3)} €</span>` : '') + chips;
    const et = etapeNum.get(s), mc = moinsCheres.has(s), ex = extremites.get(s);
    const badges = (ex ? `<span class="badge">${ico('pompe')} ${ex}</span> ` : '') +
      (et ? `<span class="badge">${ico('pompe')} Étape ${et}</span> ` : mc ? `<span class="badge badge-min">Moins chère</span> ` : '');
    const li = document.createElement('li');
    li.innerHTML = `<button type="button" class="carte${et || mc || ex ? ' etape' : ''}" aria-haspopup="dialog">`+
      `<span class="ville">${badges}${s.ville} <span class="cp">${s.cp}</span></span>`+
      `<span class="prix">${prix}</span>`+
      `<span class="adr">${s.adresse}${s.auto ? ' · 24/24' : ''}</span>`+
      `<span class="meta"><span>${(ROUTE ? s.ecart : s.d).toFixed(1)} km${ROUTE ? ' du trajet' : ''}</span>`+
      (ROUTE && s.kmr != null ? `<span>km ${Math.round(s.kmr)}</span>` : '')+
      `<span>relevé ${jour(v.maj)}</span></span></button>`;
    const b = li.firstChild;
    b.dataset.i = i; b.dataset.id = s.id;
    b.addEventListener('click', () => {
      // Geste explicite : la carte peut se recadrer (sans animation si mouvement reduit).
      // Sur mobile, la feuille couvre le bas : la station est centree dans la partie visible.
      if(CARTE) CARTE.aller([s.la, s.lo], Math.max(map.getZoom(), 14), true,
                            MOBILE.matches ? [0, -Math.round(panneau.offsetHeight / 2)] : [0, 0]);
      ouvrirStation(o, b);
    });
    liste.appendChild(li);
  });
  LISTE_COURANTE = tri;
}
let LISTE_COURANTE = [];

// Navigation clavier dans la liste : fleches haut/bas entre les cartes.
$('liste').addEventListener('keydown', e => {
  if(e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  const cartes = [...$('liste').querySelectorAll('.carte')];
  const i = cartes.indexOf(document.activeElement);
  if(i < 0) return;
  const j = e.key === 'ArrowDown' ? Math.min(cartes.length - 1, i + 1) : Math.max(0, i - 1);
  cartes[j].focus(); e.preventDefault();
});
document.querySelectorAll('.tri button[data-k]').forEach(b => {
  b.onclick = () => {
    const k = b.dataset.k;
    sortAsc = (k === sortKey) ? !sortAsc : true; sortKey = k;
    document.querySelectorAll('.tri button[data-k]').forEach(o => {
      o.setAttribute('aria-pressed', String(o === b));
      o.querySelector('svg')?.remove();
    });
    b.insertAdjacentHTML('beforeend', ' ' + ico(sortAsc ? 'haut' : 'bas'));
    rendu();
  };
});
$('replier').onclick = () => {
  const ouvert = $('replier').getAttribute('aria-expanded') !== 'true';
  $('replier').setAttribute('aria-expanded', String(ouvert));
  $('secStations').classList.toggle('replie', !ouvert);
};
function replierStations(replie){
  $('replier').hidden = !ROUTE;
  $('replier').setAttribute('aria-expanded', String(!replie));
  $('secStations').classList.toggle('replie', replie);
}

// ---------- Fiche station (feuille) ----------
let STATION = null;
function ouvrirStation(o, origine){
  const {s, v} = o;
  STATION = s;
  const utilises = v ? v.lignes.map(l => l.ref) : [];
  $('fsTitre').innerHTML = `${s.ville} <span class="cp" style="font-weight:400;color:var(--muted)">${s.cp}</span>`;
  $('fsAdresse').innerHTML = s.adresse || '<i>adresse non renseignée</i>';
  $('fsInfos').innerHTML =
    (s.auto ? `<span>${ico('horloge')} automate 24 h/24</span>` : '') +
    `<span>${ico('epingle')} ${ROUTE && s.ecart != null ? `${s.ecart.toFixed(1)} km du trajet · km ${Math.round(s.kmr)}` : `${s.d.toFixed(1)} km du repère`}</span>` +
    (s.rupture ? `<span class="ko-lbl">${ico('alerte')} rupture : ${s.rupture}</span>` : '');
  $('fsCarbs').innerHTML = FUELS.filter(([k]) => s.prix[k] != null).map(([k,l]) => {
    const q = quand(s.maj[k]);
    const ko = s.hs.has(RUPT[k]);
    return `<li class="${utilises.includes(k) ? 'hi' : ''}${ko ? ' ko' : ''}"><span>${l}`+
           `${ko ? ' <span class="ko-lbl">(en rupture)</span>' : ''}</span>`+
           `<span class="dt${q.vieux ? ' vieux' : ''}">${q.txt}</span>`+
           `<b>${s.prix[k].toFixed(3)} €</b></li>`;
  }).join('') || '<li>Aucun prix déclaré.</li>';
  ouvrirFeuille('ficheStation', origine);
}
$('fsCopier').onclick = async () => {
  if(!STATION) return;
  const txt = brut(`${STATION.adresse}, ${STATION.cp} ${STATION.ville}`);
  try{ await navigator.clipboard.writeText(txt); majEtat('adresse copiée'); }
  catch(e){ prompt('Copiez l\'adresse :', txt); }
};

// « Y aller » : choix de l'application memorise au premier usage. Defaut Android =
// lien geo: (l'appareil propose ses applis) ; iPhone/iPad = Plans ; bureau =
// OpenStreetMap. Liens ouverts par l'utilisateur : la CSP ne les borne pas (ce ne sont
// pas des requetes de la page), aucun hote nouveau n'est contacte par la page elle-meme.
const NAV_APPS = [
  ['geo', 'Application par défaut', 'lien geo: — l\'appareil propose ses applis', s =>
    `geo:${s.la},${s.lo}?q=${s.la},${s.lo}(${encodeURIComponent(brut(s.ville))})`],
  ['magicearth', 'Magic Earth', '', s => `magicearth://?drive_to&lat=${s.la}&lon=${s.lo}`],
  ['osmand', 'OsmAnd', '', s => `osmand.api://navigate?dest_lat=${s.la}&dest_lon=${s.lo}&profile=car&force=true`],
  ['gmaps', 'Google Maps', '', s => `https://www.google.com/maps/dir/?api=1&destination=${s.la},${s.lo}`],
  ['waze', 'Waze', '', s => `https://waze.com/ul?ll=${s.la},${s.lo}&navigate=yes`],
  ['osm', 'OpenStreetMap', 'dans le navigateur', s => `https://www.openstreetmap.org/directions?to=${s.la}%2C${s.lo}`],
  ['apple', 'Plans (Apple)', '', s => `https://maps.apple.com/?daddr=${s.la},${s.lo}`],
];
const UA = navigator.userAgent;
const NAV_DEFAUT = /Android/i.test(UA) ? 'geo' : /iPhone|iPad|iPod/i.test(UA) ? 'apple' : 'osm';
function naviguer(cle, s){
  const app = NAV_APPS.find(a => a[0] === cle) || NAV_APPS.find(a => a[0] === NAV_DEFAUT);
  const url = app[3](s);
  if(/^https?:/.test(url)) window.open(url, '_blank', 'noopener');
  else location.href = url;   // schema d'application (geo:, magicearth:, osmand.api:)
}
$('fsAller').onclick = () => {
  if(!STATION) return;
  if(NAV_APPS.some(a => a[0] === REGL.navApp)) naviguer(REGL.navApp, STATION);
  else ouvrirFeuille('menuNav', $('fsAller'));   // premier usage : on demande, puis on memorise
};
$('navChoix').innerHTML = NAV_APPS.map(([k, nom, note]) =>
  `<button type="button" class="choix-item" data-app="${k}">${ico(k === 'osm' || k === 'gmaps' || k === 'apple' ? 'carte' : 'navigation')} ${nom}`+
  `<small>${note || (k === NAV_DEFAUT ? 'conseillé sur cet appareil' : '')}</small></button>`).join('');
$('navChoix').querySelectorAll('[data-app]').forEach(b => b.onclick = () => {
  REGL.navApp = b.dataset.app; reglagesBruts(); majNavApp();
  fermerFeuille();
  if(STATION) naviguer(REGL.navApp, STATION);
});
$('navApp').innerHTML = `<option value="">Demander au premier usage</option>` +
  NAV_APPS.map(([k, nom]) => `<option value="${k}">${nom}${k === NAV_DEFAUT ? ' (conseillé ici)' : ''}</option>`).join('');
function majNavApp(){ $('navApp').value = NAV_APPS.some(a => a[0] === REGL.navApp) ? REGL.navApp : ''; }
$('navApp').onchange = () => { REGL.navApp = $('navApp').value || undefined; reglagesBruts(); };
majNavApp();

// ---------- Garage ----------
$('carbs').onchange = () => { reglagesEcrits(); charger(); };
majSelectVeh();
$('veh').onchange = e => {
  REGL.vehActif = +e.target.value;
  appliquerVeh(); reglagesEcrits(); charger();
};
$('chipVeh').onclick = () => { appliquerVeh(); ouvrirFeuille('garage', $('chipVeh')); };
$('vehPlus').onclick = () => {
  REGL.vehicules.push({nom: 'Véhicule ' + (REGL.vehicules.length + 1), type: 'voiture',
    carbs: DEFAUT.slice(), conso: '', cuve: '', autonomie: '', reserve: ''});
  REGL.vehActif = REGL.vehicules.length - 1;
  appliquerVeh(); majSelectVeh(); reglagesEcrits(); charger();
  $('vnom').focus(); $('vnom').select();
};
$('vehOk').onclick = () => {
  reglagesEcrits();                       // synchronise sous le nom courant
  const nom = $('vnom').value.trim();
  if(nom && nom !== REGL.vehicules[REGL.vehActif].nom){
    REGL.vehicules[REGL.vehActif].nom = nom;
    reglagesBruts();                      // renommage : ecriture directe
  }
  majSelectVeh(); majChip(); fermerFeuille(); charger();
};
$('vehMoins').onclick = () => {
  if(REGL.vehicules.length <= 1) return;
  if(!confirm(`Supprimer « ${REGL.vehicules[REGL.vehActif].nom} » ?`)) return;
  REGL.vehicules.splice(REGL.vehActif, 1);
  REGL.vehActif = 0;
  reglagesBruts();                        // suppression : ecriture directe
  majSelectVeh(); appliquerVeh(); fermerFeuille(); charger();
};
$('vtype').onchange = () => { reglagesEcrits(); };

// Import d'une fiche vehicule par l'URL — sert aussi a PARTAGER un profil :
//   fuelpilot.html#veh=Nom|e85+e10|conso|cuve|reserve[|autonomie]
// (autonomie d'un plein en km, 6e champ facultatif : les anciens liens restent valables)
(function(){
  // #pos=lat,lon : pose le repere sans geolocalisation — indispensable en
  // file:// (Firefox reserve la geolocalisation aux contextes securises).
  const mp = location.hash.match(/^#pos=(-?[0-9.]+),(-?[0-9.]+)$/);
  if(mp){
    setTimeout(() => situer(+mp[1], +mp[2], 'Point de repère'), 0);
    history.replaceState(null, '', location.pathname);
    return;
  }
  const m = location.hash.match(/^#veh=([^|]+)\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)(?:\|([^|]*))?$/);
  if(!m) return;
  const nom = decodeURIComponent(m[1]);
  const v = {nom, type: 'voiture',
    carbs: m[2] ? decodeURIComponent(m[2]).split('+') : DEFAUT.slice(),
    conso: decodeURIComponent(m[3]), cuve: decodeURIComponent(m[4]),
    reserve: decodeURIComponent(m[5]), autonomie: m[6] ? decodeURIComponent(m[6]) : ''};
  const i = REGL.vehicules.findIndex(x => x.nom === nom);
  if(i >= 0) REGL.vehicules[i] = Object.assign({type: REGL.vehicules[i].type}, v); else REGL.vehicules.push(v);
  REGL.vehActif = i >= 0 ? i : REGL.vehicules.length - 1;
  appliquerVeh(); majSelectVeh(); reglagesEcrits();
  history.replaceState(null, '', location.pathname);
})();
$('sansCher').onchange = () => { reglagesEcrits(); rendu(); };

// ---------- Chargement des prix ----------
const SEL = encodeURIComponent("__SELECT__");
const URL_API = "__API__";
const PLAFOND = 400;      // stations chargees au maximum pour une emprise donnee
let tronque = 0, seq = 0, minuteur = null, majCompte = () => {};
// Etat (region aria-live) : fraicheur des prix + compteur ; un message ponctuel
// (adresse copiee, position refusee) prend la place le temps de quelques secondes.
let etatPrix = 'chargement…', etatTempo = null;
function majEtat(ponctuel){
  const el = $('etat');
  if(ponctuel){
    el.innerHTML = ponctuel;
    clearTimeout(etatTempo); etatTempo = setTimeout(() => majEtat(), 4000);
    return;
  }
  const c = $('compte').textContent;
  el.innerHTML = etatPrix + (c ? ' · ' + esc(c) : '');
}

// Les stations suivent l'emprise de la carte : chaque deplacement ou dezoom
// relance une requete bornee par la bbox visible. Le compteur `seq` annule les
// reponses d'une emprise devenue obsolete (sinon un lent revient apres un rapide
// et repeint la mauvaise zone).
// Filtre serveur adosse a la vue : sur une grande emprise, le plafond doit etre
// depense sur des stations utiles. En « mes 2 pleins », l'E85 est le carburant
// rare (27 stations sur 60 dans la zone de test) : c'est lui qui borne.
function clauseVue(){
  return choix().map(k => k === 'spmin'
    ? " and (e10_prix is not null or sp95_prix is not null or sp98_prix is not null)"
    : ` and ${k}_prix is not null`).join('');
}

// Decoupe le trace en emprises courtes. Sur un long trajet, une seule bbox
// englobante couvre un quart de la France : le plafond tombait alors sur des
// stations tirees au hasard par l'API et le couloir revenait presque vide
// (constate sur un trajet de ~600 km, ~3 700 stations dans l'emprise).
function emprisesTrace(margeKm){
  const dLat = margeKm/110.57;
  const cases = [];
  let cur = null;
  for(const [lon, lat] of ROUTE){
    const dLon = margeKm/(111.32*Math.cos(lat*Math.PI/180));
    if(!cur) cur = {s:lat, n:lat, w:lon, e:lon};
    const s2 = Math.min(cur.s,lat), n2 = Math.max(cur.n,lat);
    const w2 = Math.min(cur.w,lon), e2 = Math.max(cur.e,lon);
    if((n2-s2) > 1.2 || (e2-w2) > 1.2){        // ~130 km de cote au maximum
      cases.push({s:cur.s-dLat, n:cur.n+dLat, w:cur.w-dLon, e:cur.e+dLon});
      cur = {s:lat, n:lat, w:lon, e:lon};
    }else{
      cur = {s:s2, n:n2, w:w2, e:e2};
    }
  }
  if(cur){
    const dLon = margeKm/(111.32*Math.cos(cur.n*Math.PI/180));
    cases.push({s:cur.s-dLat, n:cur.n+dLat, w:cur.w-dLon, e:cur.e+dLon});
  }
  return cases;
}

async function charger(){
  const mien = ++seq;
  // Hors itineraire : l'emprise de l'ecran (validee, voir emprise()). En itineraire :
  // une suite d'emprises courtes le long du trace, pour ne rien manquer sur un long trajet.
  const zones = ROUTE ? emprisesTrace(20)   // toujours le couloir maxi : la largeur
                      : [emprise()];
  // choisie filtre localement, et le comparatif par largeur se fait sans recharger.
  const clause = clauseVue();
  etatPrix = 'chargement…'; majEtat();
  try{
    let rows = [], reste = 0;
    for(const z of zones){
      const bbox = encodeURIComponent(
        `in_bbox(geom, ${z.s.toFixed(5)}, ${z.w.toFixed(5)}, ` +
        `${z.n.toFixed(5)}, ${z.e.toFixed(5)})` + clause);
      let off = 0, tot = 1;
      while(off < tot && off < PLAFOND){
        const r = await fetch(`${URL_API}?where=${bbox}&select=${SEL}&limit=100&offset=${off}`);
        if(!r.ok) throw new Error('HTTP '+r.status);
        const j = await r.json();
        if(mien !== seq) return;
        tot = j.total_count; rows = rows.concat(j.results); off += 100;
      }
      reste += Math.max(0, tot - Math.min(tot, PLAFOND));
    }
    const vus = new Set();
    rows = rows.filter(r => !vus.has(r.id) && vus.add(r.id));   // emprises jointives
    tronque = reste;
    DATA = normalise(rows);
    if(ROUTE){
      DATA = DATA.map(s => { const r = distTrace(s.la, s.lo);
                             return Object.assign(s, {ecart: r.d, kmr: r.km}); })
                 .filter(s => s.ecart <= 20);
    }
    etatPrix = 'prix en direct · ' + new Date().toLocaleString('fr-FR',
      {weekday:'short',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
  }catch(e){
    if(mien !== seq) return;
    const vis = emprise();
    DATA = normalise(SNAPSHOT).filter(s => dansEmprise(vis, s.la, s.lo));
    tronque = 0;
    etatPrix = '<span class="ko">hors ligne</span> — relevé du ' + SNAP_DATE;
  }
  rendu();
}

if(map){
  map.on('moveend', () => {
    if(ROUTE){ rendu(); return; }      // couloir deja charge : simple refiltrage
    clearTimeout(minuteur);
    minuteur = setTimeout(charger, 400);
  });
  // La carte recoit (enfin) une taille : si le dernier chargement s'est fait sur une
  // emprise de secours, on recharge sur la vraie (cf. emprise()).
  map.on('resize', () => { if(empriseProvisoire && !ROUTE){ clearTimeout(minuteur); minuteur = setTimeout(charger, 100); } });
}
$('couloir').onchange = () => { reglagesEcrits(); if(ROUTE) rendu(); };
$('conso').onchange = $('cuve').onchange = $('autonomie').onchange =
$('reserve').onchange = () => { reglagesEcrits(); rendu(); };
['conso', 'cuve', 'autonomie'].forEach(id => $(id).addEventListener('input', majEstimations));
$('queUtiles').onchange = () => { reglagesEcrits(); rendu(); };
$('sansPeage').onchange = () => {
  reglagesEcrits();
  if(ROUTE) $('trajet').requestSubmit();
};

// ---------- Position et repere ----------
// Le centre suit l'appareil : la page reste juste pour qui la recoit, sans rien
// coder en dur de personnel. Le repere de secours ne sert que si la geoloc est
// refusee, indisponible ou trop lente.
let libelleRepere = 'Point de repère';
function situer(lat, lon, libelle, explicite){
  CENTRE = [lat, lon];
  libelleRepere = libelle;
  REGL.centre = [lat, lon]; reglagesEcrits();
  $('posMemo').hidden = false;
  if(repere){ repere.setLngLat([lon, lat]); elRepere.title = libelle + " — les distances partent d'ici"; }
  if(CARTE) CARTE.aller(CENTRE, 13, explicite);   // ~5 km autour du point ; moveend -> rechargement
  else charger();
  chargerReferentiel().then(rendu).catch(() => {});   // le secteur suit le nouveau centre
  // Le titre suit la position (nom de commune via la Base Adresse Nationale) :
  // la page peut etre partagee, la commune du snapshot ne doit pas rester figee.
  fetch(`https://api-adresse.data.gouv.fr/reverse/?lon=${lon}&lat=${lat}`)
    .then(r => r.json())
    .then(j => {
      const c = j.features?.[0]?.properties?.city;
      if(c){
        $('lieu').textContent = ' · ' + c;
        document.title = 'FillHop — ' + c;
      }
    }).catch(() => {});
}
function localiser(auto){
  if(!navigator.geolocation){
    if(!auto) majEtat('géolocalisation non disponible');
    return;
  }
  majEtat('localisation…');
  $('maposition').classList.add('actif');
  navigator.geolocation.getCurrentPosition(
    pos => { $('maposition').classList.remove('actif');
             situer(pos.coords.latitude, pos.coords.longitude, 'Ma position', !auto); },
    ()  => { $('maposition').classList.remove('actif');
             majEtat(Array.isArray(REGL.centre)
               ? 'position refusée — repère mémorisé utilisé'
               : 'position refusée — appui long sur la carte pour poser le repère');
             // Refus au chargement : le premier chargement est deja en cours, rien a relancer.
             if(!auto) ouvrirFeuille('menuPosition', $('maposition')); },
    {enableHighAccuracy: false, timeout: 8000, maximumAge: 300000});
}
$('maposition').onclick = () => localiser(false);
$('posMoi').onclick = () => { fermerFeuille(); localiser(false); };
$('posMemo').onclick = () => {
  fermerFeuille();
  if(Array.isArray(REGL.centre)) situer(REGL.centre[0], REGL.centre[1], 'Point de repère', true);
};
$('posMemo').hidden = !Array.isArray(REGL.centre);
$('posAdresse').onsubmit = async e => {
  e.preventDefault();
  const q = $('posQ').value.trim();
  if(!q) return;
  try{
    const g = await geocoder(q);
    fermerFeuille();
    situer(g.lat, g.lon, g.label, true);
  }catch(err){ majEtat(esc(err.message)); }
};
$('optPosition').onclick = () => ouvrirFeuille('menuPosition', $('options'));
// Reticule : viser le repere au centre de la carte.
function reticule(on){
  $('reticule').hidden = !on;
  if(on) poserCran('apercu');
}
$('posCarte').onclick = () => { fermerFeuille(); if(CARTE) reticule(true); };
$('reticuleOk').onclick = () => {
  const c = map.getCenter();
  reticule(false);
  situer(c.lat, c.lng, 'Point de repère', true);
};
$('reticuleNon').onclick = () => reticule(false);
// Appui long (tactile) ou clic droit (bureau) sur la carte = poser le repere.
// Chrome Android emet aussi contextmenu sur l'appui long : on dedoublonne dans le temps.
let dernierRepere = 0;
function poserRepere(ll){
  if(Date.now() - dernierRepere < 1000) return;
  dernierRepere = Date.now();
  if(navigator.vibrate) navigator.vibrate(15);
  situer(ll.lat, ll.lng, 'Point de repère', true);
}
if(map){
  map.on('contextmenu', e => { e.preventDefault(); poserRepere(e.lngLat); });
  const cc = map.getCanvasContainer();
  let minuteurAppui = null, p0 = null;
  const annuler = () => { clearTimeout(minuteurAppui); minuteurAppui = null; };
  cc.addEventListener('touchstart', e => {
    if(e.touches.length !== 1) return annuler();
    p0 = [e.touches[0].clientX, e.touches[0].clientY];
    minuteurAppui = setTimeout(() => {
      minuteurAppui = null;
      const r = cc.getBoundingClientRect();
      poserRepere(map.unproject([p0[0] - r.left, p0[1] - r.top]));
    }, 600);
  }, {passive: true});
  cc.addEventListener('touchmove', e => {
    if(minuteurAppui && p0 && Math.hypot(e.touches[0].clientX - p0[0], e.touches[0].clientY - p0[1]) > 10) annuler();
  }, {passive: true});
  cc.addEventListener('touchend', annuler, {passive: true});
  cc.addEventListener('touchcancel', annuler, {passive: true});
  // Un geste sur la carte referme la recherche ouverte (mobile).
  map.on('dragstart', () => rechercheOuverte(false));
  map.on('click', () => rechercheOuverte(false));
}

// ---------- Itineraire ----------
// Geocodage : Base Adresse Nationale. Trace : Geoplateforme IGN (bdtopo-osrm).
// Les deux sont publics, sans cle, et autorisent l'appel depuis un fichier local.
const BAN = 'https://api-adresse.data.gouv.fr/search/';
const ITI = 'https://data.geopf.fr/navigation/itineraire';
let ROUTE = null;        // [[lon,lat], …] simplifie
const infoT = $('infoTrajet');
// Un depart vide ou « Ma position » vaut le repere courant.
const maPosition = q => !q.trim() || /^ma position$/i.test(q.trim());

async function geocoder(q){
  if(maPosition(q)) return {lon: CENTRE[1], lat: CENTRE[0], label: libelleRepere === 'Ma position' ? 'ma position' : 'le repère'};
  const r = await fetch(`${BAN}?q=${encodeURIComponent(q)}&limit=1`);
  if(!r.ok) throw new Error('géocodage indisponible');
  const j = await r.json();
  if(!j.features.length) throw new Error(`adresse introuvable : « ${q} »`);
  const f = j.features[0];
  return {lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1],
          label: f.properties.label};
}

// Distance d'un point au trace, en km (approximation plane : a cette echelle
// l'erreur est negligeable devant la largeur du couloir).
let KMS = null;   // abscisse cumulee (km) de chaque point du trace
function preparerKms(){
  KMS = [0];
  for(let i=1; i<ROUTE.length; i++){
    const [lo1,la1] = ROUTE[i-1], [lo2,la2] = ROUTE[i];
    const kx = 111.32*Math.cos(la1*Math.PI/180);
    KMS.push(KMS[i-1] + Math.hypot((lo2-lo1)*kx, (la2-la1)*110.57));
  }
}

// Renvoie l'ecart au trace ET la position le long du trajet (km depuis le depart).
function distTrace(la, lo){
  const kx = 111.32*Math.cos(la*Math.PI/180), ky = 110.57;
  let best = Infinity, km = 0;
  for(let i=1; i<ROUTE.length; i++){
    const ax=(ROUTE[i-1][0]-lo)*kx, ay=(ROUTE[i-1][1]-la)*ky;
    const bx=(ROUTE[i][0]-lo)*kx,   by=(ROUTE[i][1]-la)*ky;
    const dx=bx-ax, dy=by-ay, l2=dx*dx+dy*dy;
    let t = l2 ? -(ax*dx+ay*dy)/l2 : 0;
    t = Math.max(0, Math.min(1, t));
    const px=ax+t*dx, py=ay+t*dy, d=Math.hypot(px,py);
    if(d<best){ best=d; km = KMS ? KMS[i-1] + t*(KMS[i]-KMS[i-1]) : 0; }
  }
  return {d: best, km};
}

// ---------- Trajets memorises ----------
// Demande Eric, 17/09/2026 : rappeler un trajet frequent en un clic. Cle dediee,
// relue fraiche avant chaque ecriture : plusieurs onglets partagent ce stockage
// (meme precaution que pour le garage). Un depart vide vaut « ma position ».
const CLE_TRAJETS = 'fuelpilot:trajets';
const trajetsLus = () => {
  try{ const t = JSON.parse(localStorage.getItem(CLE_TRAJETS)); return Array.isArray(t) ? t : []; }
  catch(e){ return []; }
};
const trajetCourant = () => ({dep: maPosition($('depart').value) ? '' : $('depart').value.trim(),
                              arr: $('arrivee').value.trim(),
                              sansPeage: $('sansPeage').checked});
const memeTrajet = (x, y) => String(x.dep).toLowerCase() === String(y.dep).toLowerCase() &&
  String(x.arr).toLowerCase() === String(y.arr).toLowerCase() && !!x.sansPeage === !!y.sansPeage;
const nomTrajet = t => `${t.dep || 'Ma position'} → ${t.arr}${t.sansPeage ? ' (sans péage)' : ''}`;
function majTrajets(){
  const liste = trajetsLus();
  const sel = $('trajetsMemo');
  // Options construites en DOM (texte, jamais HTML) : les noms viennent de la saisie.
  sel.replaceChildren(new Option('Trajets mémorisés…', ''),
    ...liste.map((t,i) => new Option(nomTrajet(t), String(i))));
  sel.hidden = !liste.length;
  const b = $('memoriser'), c = trajetCourant();
  const deja = !!(ROUTE && c.arr && liste.some(t => memeTrajet(t, c)));
  b.hidden = !(ROUTE && c.arr);
  b.setAttribute('aria-pressed', String(deja));
  b.innerHTML = ico(deja ? 'etoilePleine' : 'etoile') + (deja ? ' Mémorisé' : ' Mémoriser');
  b.title = deja ? 'Retirer ce trajet des trajets mémorisés' : 'Mémoriser ce trajet';
}
$('memoriser').onclick = () => {
  const c = trajetCourant();
  if(!c.arr) return;
  let liste = trajetsLus();
  const i = liste.findIndex(t => memeTrajet(t, c));
  if(i >= 0) liste.splice(i, 1); else liste = [c, ...liste].slice(0, 20);
  try{ localStorage.setItem(CLE_TRAJETS, JSON.stringify(liste)); }
  catch(e){ /* stockage refuse : rien a memoriser */ }
  majTrajets();
};
$('trajetsMemo').onchange = e => {
  const t = trajetsLus()[+e.target.value];
  e.target.value = '';
  if(!t) return;
  $('depart').value = t.dep || '';
  $('arrivee').value = t.arr || '';
  $('sansPeage').checked = !!t.sansPeage;
  $('trajet').requestSubmit();
};
['depart', 'arrivee'].forEach(id => $(id).addEventListener('input', majTrajets));
$('sansPeage').addEventListener('change', majTrajets);
window.addEventListener('storage', e => { if(e.key === CLE_TRAJETS) majTrajets(); });
majTrajets();

// Pilule de recherche (mobile) : un champ ferme, deux a l'ouverture.
function rechercheOuverte(on){
  if($('recherche').classList.contains('ouvert') === on) return;
  $('recherche').classList.toggle('ouvert', on);
  $('pilule').setAttribute('aria-expanded', String(on));
  if(on){
    if(!$('depart').value) $('depart').value = 'Ma position';
    if(MOBILE.matches) poserCran('apercu');   // la feuille laisse la place aux champs
    $('arrivee').focus();
  }
}
$('pilule').onclick = () => rechercheOuverte(!$('recherche').classList.contains('ouvert'));
document.addEventListener('echap', () => { rechercheOuverte(false); reticule(false); });
function majPilule(){
  const c = trajetCourant();
  $('piluleTxt').textContent = ROUTE && c.arr ? `${c.dep || 'Ma position'} → ${c.arr}` : 'Où allez-vous ?';
}

async function calculerTrajet(ev){
  ev.preventDefault();
  infoT.textContent = 'calcul…';
  try{
    const [a, b] = await Promise.all([
      geocoder($('depart').value),
      geocoder($('arrivee').value)]);
    // « Sans péage » : moteur bdtopo-pgr + interdiction des autoroutes (verifie
    // le 09/08 : la contrainte est IGNOREE par bdtopo-osrm, respectee par pgr).
    // Approximation assumee : quelques autoroutes gratuites (A75...) sont
    // evitees aussi.
    const sansP = $('sansPeage').checked;
    const u = `${ITI}?resource=${sansP ? 'bdtopo-pgr' : 'bdtopo-osrm'}&profile=car&optimization=fastest`+
              `&start=${a.lon},${a.lat}&end=${b.lon},${b.lat}&geometryFormat=geojson`+
              (sansP ? `&constraints=${encodeURIComponent('{"constraintType":"banned","key":"wayType","operator":"=","value":"autoroute"}')}` : '');
    const r = await fetch(u);
    if(!r.ok) throw new Error('calcul d\'itinéraire indisponible');
    const j = await r.json();
    const pts = j.geometry.coordinates;
    const pas = Math.max(1, Math.round(pts.length/400));   // ~400 points suffisent
    ROUTE = pts.filter((_, i) => i % pas === 0);
    if(ROUTE[ROUTE.length-1] !== pts[pts.length-1]) ROUTE.push(pts[pts.length-1]);
    preparerKms();

    if(CARTE){
      CARTE.donnees('fh-trace', {type: 'FeatureCollection', features: [
        {type: 'Feature', geometry: {type: 'LineString', coordinates: ROUTE}}]});
      // Cadrage sur le trace : geste explicite (le bouton), donc autorise ; la feuille
      // s'ouvre a moitie sur mobile, le cadrage laisse la place en bas.
      let s = 90, n = -90, w = 180, e = -180;
      ROUTE.forEach(([lo, la]) => { s = Math.min(s, la); n = Math.max(n, la); w = Math.min(w, lo); e = Math.max(e, lo); });
      const h = map.getContainer().clientHeight;
      const pad = MOBILE.matches
        ? {top: 100, bottom: Math.min(Math.round(h / 2) + 16, Math.max(0, h - 160)), left: 24, right: 24}
        : {top: 60, bottom: 60, left: 60, right: 60};
      CARTE.cadrer({s, n, w, e}, pad, true);
    }
    infoT.textContent = `${(j.distance/1000).toFixed(0)} km · ${Math.round(j.duration/60)} min`+
      `${sansP ? ' · sans autoroute' : ''} · ${a.label} → ${b.label}`;
    $('effacer').hidden = false;
    majTrajets(); majPilule();
    replierStations(true);
    if(MOBILE.matches){ rechercheOuverte(false); deplier('moitie'); }
    charger();
  }catch(e){
    infoT.textContent = e.message;
  }
}
$('trajet').onsubmit = calculerTrajet;
// Inverser depart et arrivee = le trajet retour en un clic. Un champ vide vaut
// « ma position » (cf. geocoder), donc l'echange reste juste quand le depart
// est implicite. Trace deja affiche : on relance le calcul, sinon on se
// contente d'echanger les deux champs.
$('inverser').onclick = () => {
  const d = $('depart'), a = $('arrivee');
  [d.value, a.value] = [a.value, d.value];
  if(ROUTE) $('trajet').requestSubmit();
};
$('effacer').onclick = () => {
  ROUTE = null; KMS = null;
  if(CARTE) CARTE.donnees('fh-trace', TRACE_VIDE);
  $('effacer').hidden = true;
  majTrajets(); majPilule(); replierStations(false);
  infoT.textContent = '';
  situer(CENTRE[0], CENTRE[1], libelleRepere, true);
};

// ---------- Menus : fonds et apparence, options, aide ----------
function majFonds(){
  document.querySelectorAll('[data-fond]').forEach(b =>
    b.setAttribute('aria-pressed', String((REGL.fond || 'plan') === b.dataset.fond)));
}
document.querySelectorAll('[data-fond]').forEach(b => b.onclick = () => {
  REGL.fond = b.dataset.fond; reglagesBruts(); majFonds();
  if(CARTE) CARTE.fond(REGL.fond);
});
document.querySelectorAll('button[data-theme]').forEach(b => b.onclick = () => {
  REGL.theme = b.dataset.theme === 'auto' ? undefined : b.dataset.theme; reglagesBruts(); appliquerTheme();
});
$('fonds').onclick = () => { majFonds(); ouvrirFeuille('menuFonds', $('fonds')); };
$('options').onclick = () => ouvrirFeuille('menuOptions', $('options'));
$('aideBtn').onclick = () => ouvrirFeuille('aide', $('aideBtn'));
$('optAide').onclick = () => ouvrirFeuille('aide', $('options'));

// Cadrage initial deterministe (~10 km autour du repere de depart), sans fitBounds ni
// animation : aucun recadrage sans geste de l'utilisateur.
if(REGL.sansCher === false) $('sansCher').checked = false;
if(REGL.couloir) $('couloir').value = REGL.couloir;
if(REGL.queUtiles === false) $('queUtiles').checked = false;
if(REGL.sansPeage) $('sansPeage').checked = true;
appliquerVeh();
appliquerTheme();
majFonds();

// Le referentiel (60 km) part en parallele du premier chargement : la carte
// s'affiche sans l'attendre, puis se recolore des qu'il arrive.
async function chargerReferentiel(){
  const w = encodeURIComponent(
    `distance(geom, geom'POINT(${CENTRE[1]} ${CENTRE[0]})', 60km)`);   // secteur courant
  let rows=[], off=0, tot=1;
  while(off < tot && off < 600){
    const r = await fetch(`${URL_API}?where=${w}&select=${SEL}&limit=100&offset=${off}`);
    if(!r.ok) throw new Error('HTTP '+r.status);
    const j = await r.json();
    tot = j.total_count; rows = rows.concat(j.results); off += 100;
  }
  REF_ROWS = normalise(rows);
}
chargerReferentiel().then(rendu).catch(() => {});
charger();          // on affiche tout de suite, sans attendre l'autorisation
localiser(true);    // puis on recentre sur l'appareil si l'utilisateur accepte

// ---------- Nouvelle version disponible ----------
// Home Assistant sert /local/ avec un cache navigateur de 31 jours : sans ce controle,
// une nouvelle version restait invisible jusqu'a un rechargement force (constate le
// 17/09/2026 dans Chrome). La page relit sa propre adresse en contournant le cache ;
// si le marqueur de build differe, un bandeau propose de recharger. La relecture met
// aussi a jour le cache, donc le rechargement recupere bien la nouvelle version.
// Rien en file:// (fetch refuse) ; nouvelle verification au retour sur l'onglet,
// au plus toutes les 10 minutes.
const BUILD = document.querySelector('meta[name="fuelpilot-build"]')?.content || '';
let derniereVerif = 0;
async function verifierVersion(){
  if(!/^https?:$/.test(location.protocol) || !BUILD) return;
  if(Date.now() - derniereVerif < 600000) return;
  derniereVerif = Date.now();
  try{
    const r = await fetch(location.pathname, {cache: 'no-cache'});
    if(!r.ok) return;
    const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
    const enLigne = doc.querySelector('meta[name="fuelpilot-build"]')?.content;
    if(enLigne && enLigne !== BUILD) montrerNouvelleVersion();
  }catch(e){ /* hors ligne : on reessaiera au prochain retour sur l'onglet */ }
}
function montrerNouvelleVersion(){
  if($('majDispo')) return;
  const d = document.createElement('div');
  d.id = 'majDispo'; d.className = 'maj-dispo'; d.setAttribute('role', 'status');
  const t = document.createElement('span');
  t.textContent = 'Nouvelle version de FillHop disponible';
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'btn primaire'; b.textContent = 'Recharger';
  b.onclick = () => location.reload();
  const x = document.createElement('button');
  x.type = 'button'; x.className = 'btn'; x.textContent = 'Plus tard';
  x.onclick = () => d.remove();
  d.append(t, b, x);
  document.body.appendChild(d);
}
verifierVersion();
document.addEventListener('visibilitychange', () => { if(!document.hidden) verifierVersion(); });
