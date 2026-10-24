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
// Type de vehicule (icone du chip, table de conso) ; la categorie (v.cat) affine l'estimation.
const TYPES = {voiture: 'Voiture', utilitaire: 'Utilitaire', moto: 'Scooter / moto', campingcar: 'Camping-car'};

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
// Premier lancement = aucun reglage memorise (nouvelle ni ancienne cle) : l'assistant
// vehicule s'ouvre, sauf si l'URL porte deja une fiche (#veh=) ou un trajet (#trajet=).
const PREMIER = (() => { try{ return !localStorage.getItem(CLE) && !localStorage.getItem('carte-carburants:reglages'); }catch(e){ return false; } })();
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
  v.cat = $('vcat').value || undefined;
  v.conso = $('conso').value;
  v.cuve  = $('cuve').value;
  v.autonomie = $('autonomie').value;
  v.reserve = $('reserve').value;
  REGL.sansCher = $('sansCher').checked;
  REGL.couloir  = $('couloir').value;
  REGL.queUtiles = $('queUtiles').checked;
  REGL.sansPeage = $('sansPeage').checked;
  REGL.allerRetour = $('allerRetour').checked;
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
  majCats(v.cat);
  $('consoSource').hidden = true;
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
// Categorie (citadine, SUV, scooter…) selon le type : alimente l'estimation de conso.
// Un type a une seule categorie (utilitaire, camping-car) n'affiche pas le choix.
function majCats(voulue){
  const cats = CATEGORIES_CONSO[$('vtype').value] || [];
  const cour = voulue || $('vcat').value;
  $('vcat').replaceChildren(...cats.map(([k, l]) => new Option(l, k)));
  if(cats.some(c => c[0] === cour)) $('vcat').value = cour;
  $('vcatLbl').hidden = cats.length < 2;
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
// Aller-retour : le retour est un second trait, decale de quelques pixels pour se lire.
if(CARTE) CARTE.couche('fh-trace', {type: 'geojson', data: TRACE_VIDE},
  {type: 'line', layout: {'line-cap': 'round', 'line-join': 'round'},
   paint: {'line-color': '#1d4ed8', 'line-width': 5, 'line-opacity': 0.45,
           'line-offset': ['case', ['==', ['get', 'sens'], 'retour'], 6, 0]}});

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
    DATA.forEach(s => { if(s.ecart == null) situerSurTrace(s); });
    source = DATA.filter(s => s.ecart != null && s.ecart <= large && dansEmprise(vue, s.la, s.lo));
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

  // ---- Plan de pleins : carte-heros (phase 2, 23/10/2026) ----
  // Chiffre-heros = carburant du voyage (plein de depart compris) ; sous-ligne = arrets,
  // minutes, economie vs « pleins au prix median » ; ligne de temps verticale (<ol>) ;
  // mini-barres par couloir. Tout est construit en DOM (textContent) : les noms de
  // stations viennent du flux.
  const etapesStation = new Map();   // station -> [n° d'etape, …] (deux en aller-retour possible)
  // Plein au depart / a l'arrivee : station -> libelle. Toujours visibles, meme avec
  // le filtre « arrets du plan » (demande Eric, 17/09/2026 : Orleans > Montpellier,
  // aucune station ni au depart ni a l'arrivee).
  const extremites = new Map();
  // Trajet sans arret necessaire : stations gardees a la place du plan (voir plus bas).
  const moinsCheres = new Set();
  let utilesPlan = null, horsPlan = 0;
  const chipsPrix = [];              // [element, prix, indice carburant] a recolorer sur l'affichage reel
  const elPlan = $('plan');
  if(ROUTE && KMS){
    const conso = +$('conso').value;
    const cuve  = +$('cuve').value;
    const autonomie = +$('autonomie').value;
    // Reserve en KM (choix d'ergonomie) : plus parlant qu'un pourcentage.
    const resv = Math.max(0, +$('reserve').value || 30);
    const au = autonomieUtile(conso, cuve, autonomie, resv);
    const total = KMS[KMS.length - 1];
    $('blocPlan').hidden = false;
    // En-tete : « Paris → Lyon · 465 km · 4 h 46 » (« Paris ⇄ Lyon · 930 km » en aller-retour).
    if(TRAJET){
      $('planTrajet').textContent = `${TRAJET.dep} ${TRAJET.ar ? '⇄' : '→'} ${TRAJET.arr}`;
      $('planMeta').textContent = `${Math.round(TRAJET.km)} km · ${duree(TRAJET.min)}`;
    }
    const el = (tag, cls, ...enfants) => {
      const e = document.createElement(tag);
      if(cls) e.className = cls;
      for(const c of enfants){ if(c == null || c === false) continue; e.append(c.nodeType ? c : String(c)); }
      return e;
    };
    const svg = nom => { const t = document.createElement('template'); t.innerHTML = ico(nom); return t.content.firstChild; };
    const bouton = (cls, libelle, action, icone) => {
      const b = el('button', cls, icone ? svg(icone) : null, icone ? ' ' : null, libelle);
      b.type = 'button'; b.onclick = action; return b;
    };
    const euros = x => x.toFixed(2).replace('.', ',') + ' €';
    const litre = x => x.toFixed(3).replace('.', ',') + ' €/L';
    const virg = x => String(x).replace('.', ',');
    const ouvrirGarage = champ => { appliquerVeh(); ouvrirFeuille('garage', $('chipVeh')); if(champ) $(champ).focus(); };
    const heros = [];
    let resume = '';

    if(!(conso > 0) || !au){
      // Etat : conso ou autonomie manquante.
      const manque = [!(conso > 0) && 'la conso', !au && 'l\'autonomie d\'un plein (ou le réservoir)'].filter(Boolean).join(' et ');
      heros.push(el('div', 'heros-etat', el('b', null, 'Véhicule à compléter'), ` — renseignez ${manque} pour savoir où faire le plein et chiffrer le voyage.`,
        el('div', 'actions',
          bouton('btn primaire', 'Compléter le véhicule', () => ouvrirGarage(!(conso > 0) ? 'conso' : 'autonomie'), 'garage'),
          bouton('btn', 'Assistant', () => ASSISTANT.ouvrir(REGL.vehicules[REGL.vehActif]), 'estimer'))));
      resume = 'Plan de pleins : véhicule à compléter.';
    }else{
      const A = au.A;
      const larg = +$('couloir').value;
      const lkm = conso / 100;
      const carbPlan = sel[0];               // le plan se calcule sur le 1er carburant coche
      // Candidats le long de la boucle : une occurrence par position (aller, retour).
      const candTous = [];
      DATA.forEach(x => {
        if(!x.occ || !x.occ.length) return;
        const v = pick(x, sel);
        if(!v) return;
        x.occ.forEach(o => candTous.push({s: x, v, km: o.km, e: o.d, p: v.lignes[0].prix}));
      });
      candTous.sort((a,b) => a.km - b.km);
      const cand = candTous.filter(c => c.e <= larg);
      const r = optimiserPlan(cand, A, total, lkm);
      const plan = r.plan;
      utilesPlan = r.utiles || null;
      const voyage = coutVoyage(cand, r, total, lkm);
      const eco = economieVsMedian(cand, A, total, lkm, voyage);
      // Le cout depend de la largeur du couloir : plus large, plus de stations pas cheres
      // candidates — mais des detours plus longs. Comparatif sur les memes donnees
      // (chargees a 20 km quoi qu'il arrive).
      const comparatif = [1, 2, 5, 10, 20].map(w => {
        const cw = candTous.filter(c => c.e <= w);
        return {w, v: coutVoyage(cw, optimiserPlan(cw, A, total, lkm), total, lkm)};
      });
      // Temps perdu : ~5 min par arret + le detour parcouru a ~50 km/h.
      const minutes = e => 5 + (2 * e.e) / 50 * 60;
      const tempsTotal = (plan || []).reduce((t, e) => t + minutes(e), 0);
      // Ou faire le plein avant de partir (15 km du depart) ; en aller simple, ou le refaire
      // en arrivant. En aller-retour, le plein du retour est une ETAPE du plan.
      const ext = pleinsExtremites(cand, total);
      const depart = ext.depart, pleinArrivee = ROUTE_AR ? null : ext.arrivee;
      if(depart) extremites.set(depart.s, 'Départ');
      if(pleinArrivee) extremites.set(pleinArrivee.s, extremites.has(pleinArrivee.s) ? 'Départ et arrivée' : 'Arrivée');
      (plan || []).forEach((e,i) => { const l = etapesStation.get(e.s) || []; l.push(i + 1); etapesStation.set(e.s, l); });
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
        const e = document.createElement('div');
        e.className = 'etape-rond' + (plein ? ' plein' : ''); e.title = titre;
        MARQUEURS.push(CARTE.marqueur(s.la, s.lo, e));
      };
      (plan || []).forEach((e,i) => rond(e.s, `Étape ${i+1} — km ${Math.round(e.km)}`, false));
      [[depart, 'Plein au départ'], [pleinArrivee, 'Plein à l\'arrivée']].forEach(([o, t]) => {
        if(o) rond(o.s, `${t} — km ${Math.round(o.km)}`, true);
      });

      // Prix d'une candidate, en palette metier. Reference provisoire = les candidates du
      // couloir ; recolore plus bas sur les stations REELLEMENT affichees (meme vert que la
      // carte et la liste), une fois le filtre « arrets du plan » applique.
      const mnCand = sel.map((k, j) => Math.min(...cand.map(c => c.v.lignes[j].prix)));
      const chipPrix = c => c.v.lignes.map((l, j) => {
        const sp = el('span', 'prix', `${l.tag} ${litre(l.prix)}`);
        sp.style.background = couleur(l.prix, refs[j], mnCand[j]);
        chipsPrix.push([sp, l.prix, j]);
        return sp;
      });
      const origine = au.source === 'autonomie' ? `plein ≈ ${Math.round(au.plein)} km`
                    : `${cuve} L × ${virg(conso)} L/100`;
      const rappel = el('p', 'heros-rappel',
        `≈ ${Math.round(A)} km utiles (${origine}, réserve ${resv} km) · plan sur ${carbPlan === 'spmin' ? 'SP le moins cher' : (COURT[carbPlan] || 'SP')}` +
        (voyage != null ? ' · plein de départ compris' : ''));
      // Ligne de temps : <ol>, un repere par item (lecteur d'ecran : liste ordonnee).
      const item = (cls, pt, titre, lignes, station) => {
        const li = el('li', cls);
        const p = el('span', 'lt-pt' + (pt.plein ? ' plein' : '') + (pt.pause ? ' pause' : ''), pt.txt || '');
        p.setAttribute('aria-hidden', 'true');
        const txt = el('div', 'lt-txt', el('b', null, titre));
        (lignes || []).filter(Boolean).forEach(l => txt.append(el('span', 'lt-ligne', ...(Array.isArray(l) ? l : [l]))));
        li.append(p, txt);
        if(station){
          const b = bouton('lt-aller', 'Y aller', () => allerA(station, b), 'navigation');
          b.setAttribute('aria-label', `Y aller : ${brut(station.ville)}`);
          li.append(b);
        }
        return li;
      };
      const nomVille = s => brut(s.ville);
      // Autonomie restante estimee a un km donne : plein au dernier plein (depart compris).
      const restante = km => {
        const avant = (plan || []).filter(e => e.km <= km);
        const dernier = avant.length ? avant[avant.length - 1] : null;
        return Math.round(au.plein - (km - (dernier ? dernier.km : 0)) - (dernier ? dernier.e : 0));
      };
      const ligneTemps = () => {
        const ol = el('ol', 'ligne-temps');
        ol.setAttribute('aria-label', 'Étapes du plan');
        ol.append(item('lt-depart', {plein: true, txt: ''}, 'Départ · plein',
          depart ? [[nomVille(depart.s), ' · km ', String(Math.round(depart.km)), ' · ', ...chipPrix(depart)]]
                 : ['aucune station à moins de 15 km du départ dans ce couloir — partez le réservoir plein'],
          depart ? depart.s : null));
        const etapes = plan || [];
        const ajouterEtapes = (de, a) => etapes.forEach((e, i) => {
          if(e.km < de || e.km >= a) return;
          ol.append(item('lt-etape', {txt: String(i + 1)}, `Étape ${i + 1} — ${nomVille(e.s)}`,
            [[`km ${Math.round(e.km)} · `, ...chipPrix(e)],
             `détour ${(2 * e.e).toFixed(1).replace('.', ',')} km (+${euros(2 * e.e * lkm * e.p)}) · ≈ ${Math.round(minutes(e))} min`],
            e.s));
        });
        if(ROUTE_AR){
          ajouterEtapes(0, ALLER_KM);
          ol.append(item('lt-arrivee', {pause: true, txt: ''}, `Arrivée — ${TRAJET ? TRAJET.arr : 'arrivée'}`,
            [`km ${Math.round(ALLER_KM)} · autonomie restante ≈ ${restante(ALLER_KM)} km`]));
          ajouterEtapes(ALLER_KM, Infinity);
          ol.append(item('lt-retour', {plein: true, txt: ''}, `Retour — ${TRAJET ? TRAJET.dep : 'départ'}`,
            [`km ${Math.round(total)} · autonomie restante ≈ ${restante(total)} km`]));
        }else{
          ajouterEtapes(0, Infinity);
          ol.append(item('lt-arrivee', {plein: true, txt: ''}, `Arrivée — ${TRAJET ? TRAJET.arr : 'arrivée'}`,
            [`km ${Math.round(total)} · autonomie restante ≈ ${restante(total)} km`]));
          ol.append(item('lt-retour', {pause: true, txt: ''}, 'Retour — plein conseillé à l\'arrivée',
            pleinArrivee ? [[nomVille(pleinArrivee.s), ' · km ', String(Math.round(pleinArrivee.km)), ' · ', ...chipPrix(pleinArrivee)]]
                         : ['aucune station à moins de 15 km de l\'arrivée dans ce couloir'],
            pleinArrivee ? pleinArrivee.s : null));
        }
        return ol;
      };
      // Mini-barres : carburant du voyage selon le couloir (hauteur ∝ cout) ; toucher une
      // barre change le couloir — le select#couloir reste la source de verite.
      const barres = () => {
        const bloc = el('div', 'couloirs', el('p', 'couloirs-titre', 'Carburant du voyage selon le couloir'));
        const grille = el('div', 'couloirs-barres');
        grille.setAttribute('role', 'group'); grille.setAttribute('aria-label', 'Largeur du couloir');
        const vals = comparatif.map(c => c.v).filter(v => v != null);
        const vmax = vals.length ? Math.max(...vals) : 0;
        comparatif.forEach(({w, v}) => {
          const b = el('button', 'couloir-b');
          b.type = 'button'; b.dataset.w = String(w);
          b.setAttribute('aria-pressed', String(w === larg));
          b.setAttribute('aria-label', `Couloir ${w} km, ${v == null ? 'infaisable' : euros(v)}`);
          const barre = el('span', 'cb-barre' + (v == null ? ' ko' : ''));
          if(v != null) barre.style.height = `${Math.max(6, Math.round(40 * v / vmax))}px`;
          b.append(barre, el('span', 'cb-val', v == null ? '—' : euros(v)), el('span', 'cb-km', `${w} km`));
          b.onclick = () => {
            if($('couloir').value === String(w)) return;
            $('couloir').value = String(w);
            $('couloir').dispatchEvent(new Event('change'));
          };
          grille.append(b);
        });
        bloc.append(grille);
        return bloc;
      };
      const chiffre = () => {
        if(voyage != null) return el('p', 'heros-chiffre', el('b', null, euros(voyage)), el('span', null, 'carburant du voyage'));
        return el('p', 'heros-chiffre', el('b', null, euros(r.coutAchats || 0)), el('span', null, 'achats en route (plein de départ non chiffré : aucune station à moins de 15 km)'));
      };
      const ligneEco = () => {
        if(!eco) return null;
        if(Math.abs(eco.economie) < 0.05) return el('b', 'eco nulle', `au prix du marché (${litre(eco.median)})`);
        const signe = eco.economie > 0 ? '−' : '+';
        return el('b', 'eco' + (eco.economie > 0 ? '' : ' nulle'), `${signe}${euros(Math.abs(eco.economie))} vs pleins au prix médian (${litre(eco.median)})`);
      };

      if(plan === null){
        // Etat : infaisable — trois remedes cliquables.
        const actions = el('div', 'actions');
        if(larg < 10) actions.append(bouton('btn', 'Élargir le couloir à 10 km', () => { $('couloir').value = '10'; $('couloir').dispatchEvent(new Event('change')); }));
        if(larg < 20) actions.append(bouton('btn', larg < 10 ? 'Élargir à 20 km' : 'Élargir le couloir à 20 km', () => { $('couloir').value = '20'; $('couloir').dispatchEvent(new Event('change')); }));
        if(resv > 0){
          const cible = resv > 10 ? 10 : 0;
          actions.append(bouton('btn', `Réduire la réserve (${resv} → ${cible} km)`, () => { $('reserve').value = String(cible); $('reserve').dispatchEvent(new Event('change')); }));
        }
        actions.append(bouton('btn', 'Revoir l\'autonomie', () => ouvrirGarage('autonomie'), 'garage'));
        heros.push(el('div', 'heros-etat ko', svg('alerte'), ' ', el('b', null, 'Trajet infaisable avec cette autonomie dans ce couloir'),
          ` — ${Math.round(A)} km utiles pour ${Math.round(total)} km, couloir ${larg} km : aucune suite d'arrêts ne passe.`, actions));
        heros.push(rappel, barres());
        resume = `Plan de pleins : trajet infaisable avec ${Math.round(A)} km d'autonomie utile dans un couloir de ${larg} km.`;
      }else if(!plan.length){
        // Etat : aucun arret necessaire.
        heros.push(el('div', 'heros-etat ok', el('b', null, 'Aucun arrêt nécessaire'),
          ` — ${Math.round(total)} km pour ${Math.round(A)} km utiles : un plein au départ suffit.`));
        heros.push(chiffre());
        heros.push(el('p', 'heros-sous', '0 arrêt · ', ligneEco()));
        heros.push(rappel, ligneTemps());
        const lst = [...list].filter(o => moinsCheres.has(o.s)).sort((a,b) => a.v.p - b.v.p || a.s.ecart - b.s.ecart);
        if(lst.length){
          const ul = el('ul', 'liste-min');
          lst.forEach(o => ul.append(el('li', null, el('b', null, nomVille(o.s)), ` km ${Math.round(o.s.kmr)}, détour ${(2 * o.s.ecart).toFixed(1).replace('.', ',')} km · `, ...chipPrix(o))));
          heros.push(el('p', 'heros-rappel', 'Pour un plein en route, les moins chères du couloir dans la zone affichée :'), ul);
        }
        heros.push(barres());
        resume = `Plan de pleins : aucun arrêt nécessaire${voyage != null ? `, carburant du voyage ${euros(voyage)}` : ''}.`;
      }else{
        heros.push(chiffre());
        heros.push(el('p', 'heros-sous', `${plan.length} arrêt${plan.length > 1 ? 's' : ''} · ≈ ${Math.round(tempsTotal)} min · `, ligneEco()));
        heros.push(rappel, ligneTemps(), barres());
        resume = `Plan de pleins : ${plan.length} arrêt${plan.length > 1 ? 's' : ''}${voyage != null ? `, carburant du voyage ${euros(voyage)}` : ''}` +
                 (eco && Math.abs(eco.economie) >= 0.05 ? `, ${eco.economie > 0 ? 'économie' : 'surcoût'} de ${euros(Math.abs(eco.economie))} par rapport au prix médian` : '') + '.';
      }
    }
    elPlan.replaceChildren(...heros);
    // Region aria-live : un resume court, mis a jour seulement s'il change (le plan est
    // redessine a chaque deplacement de la carte : pas de repetition au lecteur d'ecran).
    if($('planEtat').textContent !== resume) $('planEtat').textContent = resume;
    // Une station du plan (etape, depart, arrivee) reste visible meme « trop chere » :
    // le plan y passe. La masquer faisait croire a un plan vide (constate le 17/09/2026 :
    // Le Caylar, etape 1 d'Orleans > Montpellier, absente de la liste et de la carte).
    const dansTri = new Set(tri.map(o => o.s));
    const reprises = list.filter(o => (etapesStation.has(o.s) || extremites.has(o.s)) && !dansTri.has(o.s));
    if(reprises.length){ tri.push(...reprises); tri.sort(ordre); }
    if(utilesPlan && $('queUtiles').checked){
      const avant = tri.length;
      tri = tri.filter(({s}) => etapesStation.has(s) || moinsCheres.has(s) || extremites.has(s));
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
  chipsPrix.forEach(([sp, prix, j]) => { sp.style.background = couleur(prix, refs[j], minisAff[j]); });
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
    const et = etapesStation.get(s), mc = moinsCheres.has(s), ex = extremites.get(s);
    const badges = (ex ? `<span class="badge">${ico('pompe')} ${ex}</span> ` : '') +
      (et ? `<span class="badge">${ico('pompe')} Étape${et.length > 1 ? 's' : ''} ${et.join(' · ')}</span> ` : mc ? `<span class="badge badge-min">Moins chère</span> ` : '');
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
// « Y aller » depuis la fiche station ou la ligne de temps du plan : meme feuille de choix.
function allerA(s, origine){
  STATION = s;
  if(NAV_APPS.some(a => a[0] === REGL.navApp)) naviguer(REGL.navApp, s);
  else ouvrirFeuille('menuNav', origine || $('fsAller'));   // premier usage : on demande, puis on memorise
}
$('fsAller').onclick = () => { if(STATION) allerA(STATION, $('fsAller')); };
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
// Le nom se fixe des qu'on quitte le champ (Entree, Tab, clic ailleurs) : avant le
// 24/10/2026 seul OK le gardait, « Ajouter » ou un changement de vehicule juste apres
// la saisie le perdait (Eric : « pouvoir nommer le vehicule au cas ou on en ait plusieurs »).
function fixerNom(){
  const nom = $('vnom').value.trim();
  if(!nom || nom === REGL.vehicules[REGL.vehActif].nom) return;
  reglagesEcrits();                       // synchronise sous le nom courant
  REGL.vehicules[REGL.vehActif].nom = nom;
  reglagesBruts();                        // renommage : ecriture directe
  majSelectVeh(); majChip();
}
$('vnom').onchange = fixerNom;
$('vehPlus').onclick = () => {
  fixerNom();
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
// Suppression avec annulation (a la place de confirm()) : la fiche part tout de suite,
// « Supprimé · Annuler » reste 8 s, Annuler la remet a sa place.
let SUPPRIME = null, minuteurSuppr = null;
function messageGarage(texte, action, libelle){
  const m = $('garageMsg');
  m.replaceChildren(texte);
  if(action){
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn'; b.innerHTML = ico('annuler') + ' ' + libelle; b.onclick = action;
    m.append(b);
  }
  clearTimeout(minuteurSuppr);
  minuteurSuppr = setTimeout(() => { SUPPRIME = null; m.replaceChildren(); }, 8000);
}
$('vehMoins').onclick = () => {
  if(REGL.vehicules.length <= 1) return;
  const i = REGL.vehActif;
  const [v] = REGL.vehicules.splice(i, 1);
  SUPPRIME = {v, i};
  REGL.vehActif = 0;
  reglagesBruts();                        // suppression : ecriture directe
  majSelectVeh(); appliquerVeh(); charger();
  messageGarage(`« ${v.nom} » supprimé · `, () => {
    if(!SUPPRIME) return;
    REGL.vehicules.splice(Math.min(SUPPRIME.i, REGL.vehicules.length), 0, SUPPRIME.v);
    REGL.vehActif = Math.min(SUPPRIME.i, REGL.vehicules.length - 1);
    SUPPRIME = null;
    reglagesBruts(); majSelectVeh(); appliquerVeh(); charger();
    $('garageMsg').replaceChildren();
  }, 'Annuler');
};
$('vtype').onchange = () => { majCats(); reglagesEcrits(); };
$('vcat').onchange = () => { reglagesEcrits(); };
// Estimer la conso d'apres le type, la categorie et le premier carburant coche (src/conso.js).
$('vehEstimer').onclick = () => {
  const carb = choix()[0];
  const r = carb ? estimerConso($('vtype').value, $('vcat').value, carb) : null;
  const src = $('consoSource');
  src.hidden = false;
  if(!r){
    src.textContent = carb ? 'Pas d\'estimation pour cette combinaison — saisissez la conso que vous connaissez (les hybrides n\'ont pas d\'estimation).'
                           : 'Cochez d\'abord un carburant.';
    return;
  }
  $('conso').value = r.conso;
  src.textContent = `≈ ${String(r.conso).replace('.', ',')} L/100 — ${r.source}. Modifiable.`;
  majEstimations(); reglagesEcrits(); rendu();
};
// Partage : lien d'import de la fiche (#veh=…) ou du plan (#trajet=…&veh=…). Partage natif
// (navigator.share) quand il existe, sinon copie dans le presse-papiers et « Lien copié ».
const lienBase = () => location.href.split('#')[0];
const vehParam = v => [encodeURIComponent(v.nom), (v.carbs || []).join('+'), encodeURIComponent(v.conso || ''),
  encodeURIComponent(v.cuve || ''), encodeURIComponent(v.reserve || ''), encodeURIComponent(v.autonomie || '')].join('|');
async function partagerLien(url, texte, elMsg){
  if(navigator.share){
    try{ await navigator.share({title: 'ViaMinus', text: texte, url}); return; }
    catch(e){ if(e && e.name === 'AbortError') return; }
  }
  try{
    await navigator.clipboard.writeText(url);
    majEtat('lien copié');
    if(elMsg){ elMsg.textContent = 'Lien copié'; setTimeout(() => { if(elMsg.textContent === 'Lien copié') elMsg.textContent = ''; }, 4000); }
  }catch(e){ prompt('Copiez le lien :', url); }
}
$('vehPartager').onclick = () => {
  reglagesEcrits();
  const v = REGL.vehicules[REGL.vehActif];
  partagerLien(`${lienBase()}#veh=${vehParam(v)}`, `Fiche véhicule ${v.nom} — ViaMinus`, $('garageMsg'));
};
$('partagerPlan').onclick = () => {
  if(!ROUTE || !TRAJET) return;
  partagerLien(lienTrajet(), `Plan de pleins ${TRAJET.dep} ${TRAJET.ar ? '⇄' : '→'} ${TRAJET.arr} — ViaMinus`);
};

// Import par l'URL — sert aussi a PARTAGER :
//   #veh=Nom|e85+e10|conso|cuve|reserve[|autonomie]   fiche vehicule (format inchange)
//   #trajet=<depart>|<arrivee>|<couloir>|<options>    plan (depart vide = « Ma position »,
//       JAMAIS une coordonnee ; couloir 1/2/5/10/20 ; options = lettres p (sans peage),
//       r (aller-retour)) ; peut etre suivi de &veh=… : la fiche est traitee AVANT le trajet,
//       pour que le plan se calcule sur ce vehicule.
//   #pos=lat,lon                                        repere sans geolocalisation
// Les valeurs sont decodees puis traitees en TEXTE (.value, textContent), jamais en HTML ;
// le hash est efface (history.replaceState) une fois lu.
let IMPORT_HASH = false, TRAJET_IMPORT = null;
(function(){
  const h = location.hash.slice(1);
  if(!h) return;
  const parts = {};
  h.split('&').forEach(x => { const i = x.indexOf('='); if(i > 0) parts[x.slice(0, i)] = x.slice(i + 1); });
  const dec = x => { try{ return decodeURIComponent(x); }catch(e){ return x; } };
  let lu = false;
  if(parts.pos){
    // #pos=lat,lon : pose le repere sans geolocalisation — indispensable en
    // file:// (Firefox reserve la geolocalisation aux contextes securises).
    const mp = parts.pos.match(/^(-?[0-9.]+),(-?[0-9.]+)$/);
    if(mp){ setTimeout(() => situer(+mp[1], +mp[2], 'Point de repère'), 0); lu = true; }
  }
  const m = parts.veh && parts.veh.match(/^([^|]+)\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)(?:\|([^|]*))?$/);
  if(m){
    const nom = dec(m[1]);
    const v = {nom, type: 'voiture',
      carbs: m[2] ? dec(m[2]).split('+') : DEFAUT.slice(),
      conso: dec(m[3]), cuve: dec(m[4]),
      reserve: dec(m[5]), autonomie: m[6] ? dec(m[6]) : ''};
    const i = REGL.vehicules.findIndex(x => x.nom === nom);
    if(i >= 0) REGL.vehicules[i] = Object.assign({type: REGL.vehicules[i].type, cat: REGL.vehicules[i].cat}, v); else REGL.vehicules.push(v);
    REGL.vehActif = i >= 0 ? i : REGL.vehicules.length - 1;
    appliquerVeh(); majSelectVeh(); reglagesEcrits();
    IMPORT_HASH = true; lu = true;
  }
  if(parts.trajet){
    const f = parts.trajet.split('|');
    const arr = dec(f[1] || '').trim(), dep = dec(f[0] || '').trim();
    if(arr){
      $('depart').value = dep;                 // vide = « Ma position » (le repere courant)
      $('arrivee').value = arr;
      if(['1', '2', '5', '10', '20'].includes(f[2])){ $('couloir').value = f[2]; REGL.couloir = f[2]; }
      const o = f[3] || '';
      $('sansPeage').checked = o.includes('p');
      $('allerRetour').checked = o.includes('r');
      // Depart « Ma position » : on attend la reponse de la geolocalisation avant de calculer.
      TRAJET_IMPORT = {attendPosition: !dep || /^ma position$/i.test(dep)};
    }
    IMPORT_HASH = true; lu = true;
  }
  if(lu) history.replaceState(null, '', location.pathname);
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
    if(ROUTE) DATA = DATA.filter(situerSurTrace);
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
$('sansPeage').onchange = $('allerRetour').onchange = () => {
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
  // ~5 km autour du point ; moveend -> rechargement. Un trajet affiche n'est pas quitte
  // par une geolocalisation automatique (trajet importe par l'URL, par exemple).
  if(CARTE && (explicite || !ROUTE)) CARTE.aller(CENTRE, 13, explicite);
  else if(!CARTE) charger();
  chargerReferentiel().then(rendu).catch(() => {});   // le secteur suit le nouveau centre
  // Le titre suit la position (nom de commune via la Base Adresse Nationale) :
  // la page peut etre partagee, la commune du snapshot ne doit pas rester figee.
  fetch(`https://api-adresse.data.gouv.fr/reverse/?lon=${lon}&lat=${lat}`)
    .then(r => r.json())
    .then(j => {
      const c = j.features?.[0]?.properties?.city;
      if(c){
        $('lieu').textContent = ' · ' + c;
        document.title = 'ViaMinus — ' + c;
      }
    }).catch(() => {});
}
// localiser(auto, apres) : apres(ok) est appele a l'issue (succes ou refus) — l'assistant
// et le trajet importe « depuis ma position » s'en servent.
function localiser(auto, apres){
  if(!navigator.geolocation){
    if(!auto) majEtat('géolocalisation non disponible');
    if(apres) apres(false);
    return;
  }
  majEtat('localisation…');
  $('maposition').classList.add('actif');
  navigator.geolocation.getCurrentPosition(
    pos => { $('maposition').classList.remove('actif');
             situer(pos.coords.latitude, pos.coords.longitude, 'Ma position', !auto);
             if(apres) apres(true); },
    ()  => { $('maposition').classList.remove('actif');
             majEtat(Array.isArray(REGL.centre)
               ? 'position refusée — repère mémorisé utilisé'
               : 'position refusée — appui long sur la carte pour poser le repère');
             // Refus au chargement : le premier chargement est deja en cours, rien a relancer.
             if(!auto && !apres) ouvrirFeuille('menuPosition', $('maposition'));
             if(apres) apres(false); },
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
// reticule(on, apres) : apres() est appele une fois le repere pose (retour a l'assistant).
let APRES_RETICULE = null;
function reticule(on, apres){
  $('reticule').hidden = !on;
  APRES_RETICULE = on ? (apres || null) : null;
  if(on) poserCran('apercu');
}
$('posCarte').onclick = () => { fermerFeuille(); if(CARTE) reticule(true); };
$('reticuleOk').onclick = () => {
  const c = map.getCenter();
  const apres = APRES_RETICULE;
  reticule(false);
  situer(c.lat, c.lng, 'Point de repère', true);
  if(apres) apres();
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
// Secours, constates le 24/10/2026 (la Geoplateforme repondait 404 sur TOUTES ses ressources
// d'itineraire, geocodage BAN a 8 s) : geocodage porte par la Geoplateforme (meme format que
// la BAN), trace Valhalla public de FOSSGIS (OpenStreetMap, Allemagne, sans cle, CORS ouvert).
// Chaque appel est borne a DELAI : « calcul… » ne reste jamais affiche sans fin.
const GEOC = 'https://data.geopf.fr/geocodage/search/';
const ITI_SECOURS = 'https://valhalla1.openstreetmap.de/route';
const DELAI = 20000;
let MOTEUR = 'ign';      // moteur du dernier trace reussi : 'ign' ou 'osm' (dit dans l'info trajet)
async function lireJson(u){
  const r = await fetch(u, {signal: AbortSignal.timeout(DELAI)});
  if(!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
let ROUTE = null;        // [[lon,lat], …] simplifie ; en aller-retour : aller puis retour (boucle)
let I_RETOUR = null;     // indice du premier point du retour dans ROUTE (null : aller simple)
let ALLER_KM = null;     // km de l'arrivee sur la boucle (null : aller simple)
let ROUTE_AR = false;    // le trajet affiche est un aller-retour
let TRAJET = null;       // {dep, arr, km, min, ar, sansP} du trajet affiche (en-tete du plan)
let TRAJET_SANS_GESTE = false;   // calcul lance sans geste (import #trajet=) : pas d'animation
const infoT = $('infoTrajet');
// Un depart vide ou « Ma position » vaut le repere courant.
const maPosition = q => !q.trim() || /^ma position$/i.test(q.trim());

async function geocoder(q){
  if(maPosition(q)) return {lon: CENTRE[1], lat: CENTRE[0], label: libelleRepere === 'Ma position' ? 'ma position' : 'le repère'};
  // Geoplateforme d'abord (memes donnees BAN ; mesure le 24/10/2026 : 0,1 s contre 8 a 18 s
  // pour api-adresse, en cours de migration vers la Geoplateforme), api-adresse en secours.
  const qs = `?q=${encodeURIComponent(q)}&limit=1`;
  let j;
  try{ j = await lireJson(GEOC + qs); }
  catch(e){
    try{ j = await lireJson(BAN + qs); }
    catch(e2){ throw new Error('géocodage indisponible'); }
  }
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

// Positions d'une station le long du trace : ecart (km) et abscisse (km depuis le depart),
// pour chaque sens. En aller-retour, une station proche des deux sens apparait DEUX fois
// (km aller, km retour) : le plan la traite comme deux occurrences, numerotees a part.
// Seules les positions a moins de 20 km (couloir maximal) sont gardees.
function positionsTrace(la, lo){
  const kx = 111.32*Math.cos(la*Math.PI/180), ky = 110.57;
  const sens = I_RETOUR != null ? [[1, I_RETOUR], [I_RETOUR + 1, ROUTE.length]] : [[1, ROUTE.length]];
  const res = [];
  for(const [de, a] of sens){
    let best = Infinity, km = 0;
    for(let i = de; i < a; i++){
      const ax=(ROUTE[i-1][0]-lo)*kx, ay=(ROUTE[i-1][1]-la)*ky;
      const bx=(ROUTE[i][0]-lo)*kx,   by=(ROUTE[i][1]-la)*ky;
      const dx=bx-ax, dy=by-ay, l2=dx*dx+dy*dy;
      let t = l2 ? -(ax*dx+ay*dy)/l2 : 0;
      t = Math.max(0, Math.min(1, t));
      const px=ax+t*dx, py=ay+t*dy, d=Math.hypot(px,py);
      if(d<best){ best=d; km = KMS ? KMS[i-1] + t*(KMS[i]-KMS[i-1]) : 0; }
    }
    if(best <= 20) res.push({d: best, km});
  }
  return res;
}
// Attache a la station ses positions (occ), son ecart minimal et le km correspondant ;
// false si elle est hors du couloir maximal.
function situerSurTrace(s){
  const occ = positionsTrace(s.la, s.lo);
  if(!occ.length){ s.ecart = Infinity; s.kmr = null; s.occ = []; return false; }
  const m = occ.reduce((a, b) => b.d < a.d ? b : a);
  s.ecart = m.d; s.kmr = m.km; s.occ = occ;
  return true;
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
// Champ `ar` (aller-retour) ajoute le 23/10/2026 : les trajets memorises sans ce champ restent valables.
const trajetCourant = () => ({dep: maPosition($('depart').value) ? '' : $('depart').value.trim(),
                              arr: $('arrivee').value.trim(),
                              sansPeage: $('sansPeage').checked, ar: $('allerRetour').checked});
const memeTrajet = (x, y) => String(x.dep).toLowerCase() === String(y.dep).toLowerCase() &&
  String(x.arr).toLowerCase() === String(y.arr).toLowerCase() && !!x.sansPeage === !!y.sansPeage && !!x.ar === !!y.ar;
const nomTrajet = t => `${t.dep || 'Ma position'} ${t.ar ? '⇄' : '→'} ${t.arr}${t.sansPeage ? ' (sans péage)' : ''}`;
// Lien de partage du plan : trajet tel que saisi (jamais une coordonnee) + fiche vehicule.
function lienTrajet(){
  const c = trajetCourant();
  const o = (c.sansPeage ? 'p' : '') + (c.ar ? 'r' : '');
  return `${lienBase()}#trajet=${encodeURIComponent(c.dep)}|${encodeURIComponent(c.arr)}|${$('couloir').value}|${o}` +
         `&veh=${vehParam(REGL.vehicules[REGL.vehActif])}`;
}
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
  $('allerRetour').checked = !!t.ar;
  $('trajet').requestSubmit();
};
['depart', 'arrivee'].forEach(id => $(id).addEventListener('input', majTrajets));
$('sansPeage').addEventListener('change', majTrajets);
$('allerRetour').addEventListener('change', majTrajets);
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
  $('piluleTxt').textContent = ROUTE && c.arr ? `${c.dep || 'Ma position'} ${c.ar ? '⇄' : '→'} ${c.arr}` : 'Où allez-vous ?';
}

// Itineraire IGN entre deux points. « Sans péage » : moteur bdtopo-pgr + interdiction
// des autoroutes (verifie le 09/08 : la contrainte est IGNOREE par bdtopo-osrm, respectee
// par pgr). Approximation assumee : quelques autoroutes gratuites (A75...) sont evitees aussi.
async function itineraireIGN(a, b, sansP){
  const u = `${ITI}?resource=${sansP ? 'bdtopo-pgr' : 'bdtopo-osrm'}&profile=car&optimization=fastest`+
            `&start=${a.lon},${a.lat}&end=${b.lon},${b.lat}&geometryFormat=geojson`+
            (sansP ? `&constraints=${encodeURIComponent('{"constraintType":"banned","key":"wayType","operator":"=","value":"autoroute"}')}` : '');
  const j = await lireJson(u);
  return {pts: j.geometry.coordinates, distance: j.distance, duration: j.duration};
}
// Polyline « Google » a precision 6 (format de Valhalla) → [[lon, lat], …].
function decoderPolyline6(s){
  const pts = []; let i = 0, lat = 0, lon = 0;
  while(i < s.length){
    for(const k of [0, 1]){
      let res = 0, dec = 0, b;
      do{ b = s.charCodeAt(i++) - 63; res |= (b & 0x1f) << dec; dec += 5; }while(b >= 0x20);
      const d = (res & 1) ? ~(res >> 1) : (res >> 1);
      if(k === 0) lat += d; else lon += d;
    }
    pts.push([lon / 1e6, lat / 1e6]);
  }
  return pts;
}
// Itineraire de secours (Valhalla/OSM). « Sans péage » y est une vraie exclusion des
// troncons a peage, pas l'approximation « sans autoroute » de l'IGN.
async function itineraireSecours(a, b, sansP){
  const q = {locations: [{lat: a.lat, lon: a.lon}, {lat: b.lat, lon: b.lon}], costing: 'auto', units: 'kilometers'};
  if(sansP) q.costing_options = {auto: {use_tolls: 0, exclude_tolls: true}};
  const j = await lireJson(`${ITI_SECOURS}?json=${encodeURIComponent(JSON.stringify(q))}`);
  const t = j.trip;
  if(!t || !t.legs || !t.legs.length) throw new Error('tracé de secours vide');
  return {pts: t.legs.flatMap(l => decoderPolyline6(l.shape)),
          distance: t.summary.length * 1000, duration: t.summary.time};
}
// Un itineraire entre deux points (IGN, sinon secours), simplifie a ~400 points.
async function itineraire(a, b, sansP){
  let brut;
  try{ brut = await itineraireIGN(a, b, sansP); MOTEUR = 'ign'; }
  catch(e){
    try{ brut = await itineraireSecours(a, b, sansP); MOTEUR = 'osm'; }
    catch(e2){ throw new Error('calcul d\'itinéraire indisponible (IGN et secours)'); }
  }
  const pts = brut.pts;
  const pas = Math.max(1, Math.round(pts.length/400));   // ~400 points suffisent
  const sim = pts.filter((_, i) => i % pas === 0);
  if(sim[sim.length-1] !== pts[pts.length-1]) sim.push(pts[pts.length-1]);
  return {pts: sim, distance: brut.distance, duration: brut.duration};
}
const duree = min => min >= 60 ? `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, '0')}` : `${Math.round(min)} min`;

let CALCUL_N = 0;   // deux calculs lances coup sur coup (case puis ⇄) : seul le dernier ecrit
async function calculerTrajet(ev){
  ev.preventDefault();
  const sansGeste = TRAJET_SANS_GESTE; TRAJET_SANS_GESTE = false;
  const mien = ++CALCUL_N;
  infoT.textContent = 'calcul…';
  try{
    const [a, b] = await Promise.all([
      geocoder($('depart').value),
      geocoder($('arrivee').value)]);
    const sansP = $('sansPeage').checked, ar = $('allerRetour').checked;
    // Aller-retour : le retour est un second itineraire B -> A (meme moteur, memes
    // contraintes) ; ROUTE = aller puis retour, KMS continue, le total est la boucle.
    const aller = await itineraire(a, b, sansP);
    const retour = ar ? await itineraire(b, a, sansP) : null;
    if(mien !== CALCUL_N) return;   // un calcul plus recent est en cours : celui-ci est perime
    let pts = aller.pts, iRetour = null;
    if(retour){ iRetour = pts.length; pts = pts.concat(retour.pts); }
    ROUTE = pts; I_RETOUR = iRetour; ROUTE_AR = !!retour;
    preparerKms();
    ALLER_KM = iRetour != null ? KMS[iRetour] : null;
    const c = trajetCourant();
    TRAJET = {dep: c.dep || 'Ma position', arr: c.arr, ar: !!retour, sansP,
              km: (aller.distance + (retour ? retour.distance : 0)) / 1000,
              min: (aller.duration + (retour ? retour.duration : 0)) / 60};

    if(CARTE){
      const features = [{type: 'Feature', properties: {sens: 'aller'}, geometry: {type: 'LineString', coordinates: aller.pts}}];
      if(retour) features.push({type: 'Feature', properties: {sens: 'retour'}, geometry: {type: 'LineString', coordinates: retour.pts}});
      CARTE.donnees('fh-trace', {type: 'FeatureCollection', features});
      // Cadrage sur le trace : geste explicite (le bouton), donc autorise — sauf trajet
      // importe par l'URL, pose sans animation ; la feuille s'ouvre a moitie sur mobile,
      // le cadrage laisse la place en bas.
      let s = 90, n = -90, w = 180, e = -180;
      ROUTE.forEach(([lo, la]) => { s = Math.min(s, la); n = Math.max(n, la); w = Math.min(w, lo); e = Math.max(e, lo); });
      const h = map.getContainer().clientHeight;
      const pad = MOBILE.matches
        ? {top: 100, bottom: Math.min(Math.round(h / 2) + 16, Math.max(0, h - 160)), left: 24, right: 24}
        : {top: 60, bottom: 60, left: 60, right: 60};
      CARTE.cadrer({s, n, w, e}, pad, !sansGeste);
    }
    infoT.textContent = `${Math.round(TRAJET.km)} km · ${duree(TRAJET.min)}`+
      `${sansP ? (MOTEUR === 'osm' ? ' · sans péage' : ' · sans autoroute') : ''}${ar ? ' · aller-retour' : ''}`+
      ` · ${a.label} ${ar ? '⇄' : '→'} ${b.label}${MOTEUR === 'osm' ? ' · tracé OpenStreetMap (IGN muette)' : ''}`;
    $('effacer').hidden = false;
    majTrajets(); majPilule();
    replierStations(true);
    if(MOBILE.matches){ rechercheOuverte(false); deplier('moitie'); }
    charger();
  }catch(e){
    if(mien !== CALCUL_N) return;
    infoT.textContent = e.message;
    if(sansGeste) charger();   // trajet importe injoignable : les prix autour de soi, au moins
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
  ROUTE = null; KMS = null; I_RETOUR = null; ALLER_KM = null; ROUTE_AR = false; TRAJET = null;
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
// Trajet importe (#trajet=) : calcule tout de suite si le depart est une adresse, sinon
// une fois la geolocalisation repondue (acceptee ou non : le repere memorise sert alors).
function lancerTrajetImporte(){
  if(!TRAJET_IMPORT) return;
  TRAJET_IMPORT = null;
  TRAJET_SANS_GESTE = true;
  $('trajet').requestSubmit();
}
if(TRAJET_IMPORT && !TRAJET_IMPORT.attendPosition) lancerTrajetImporte();
else charger();     // on affiche tout de suite, sans attendre l'autorisation
localiser(true, () => lancerTrajetImporte());   // puis on recentre sur l'appareil si l'utilisateur accepte

// ---------- Assistant vehicule (premier lancement, ou bouton du garage) ----------
const ASSISTANT = creerAssistant({
  $, REGL, CASES, TYPES, CATEGORIES_CONSO, estimerConso, autonomieUtile, ico,
  ouvrirFeuille, fermerFeuille, localiser, reticule, geocoder, situer, rechercheOuverte, MOBILE, reglagesBruts,
  apresVehicule(){ appliquerVeh(); majSelectVeh(); charger(); },
});
$('vehAssistant').onclick = () => { reglagesEcrits(); ASSISTANT.ouvrir(REGL.vehicules[REGL.vehActif]); };
if(PREMIER && !IMPORT_HASH && !REGL.assistantVu) setTimeout(() => ASSISTANT.ouvrir(), 0);

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
  t.textContent = 'Nouvelle version de ViaMinus disponible';
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
