// ---------- Signalements partagés « pompe vide » : module pur (partie 2, côté application) ----------
// Sans DOM ni réseau, testé sous Node (src/signalements.test.js). Le service (Cloudflare Worker +
// base D1, worker/README.md de la branche claude/signalements-worker) reçoit des signalements
// anonymes {station, carburant, etat: 'vide' | 'ok'} et sert, par station puis par carburant, un
// agrégat sur 48 h : {vide, ok, dernier} — `vide` et `ok` = nombre de signalements, `dernier` =
// horodatage du plus récent en SECONDES UTC ; un « ok » plus récent que le dernier « vide » remet
// `vide` à zéro côté service (la pompe est repartie).
//
// Convention de ce module : `maintenant` est toujours Date.now() (millisecondes), comme partout
// dans l'application ; seul `agregat.dernier` est en secondes (contrat du service), converti ici et
// nulle part ailleurs. Le journal local ({"<station>|<carburant>": t en ms}) tient dans localStorage
// sous CLE_SIGNALEMENTS : il reproduit le quota du service (un signalement par station et carburant
// par 6 h) pour désactiver les boutons avant d'essuyer un 429.

const SIG_FENETRE_H = 12;           // évitement dans le plan : « vide » signalé il y a moins de 12 h
const SIG_SEUIL = 1;                // ... au moins une fois
const SIG_DELAI_MS = 6 * 3600e3;    // un signalement par station et carburant par 6 h (quota du service)
const SIG_LOT = 400;                // identifiants par requête GET /v1/etat (plafond du service)
const SIG_CACHE_MS = 60e3;          // cache mémoire des agrégats = Cache-Control du service (60 s)
const CLE_SIGNALEMENTS = 'fuelpilot:signalements';
// Identifiants acceptés par le service : flux français (8 chiffres), Espagne (ES-<IDEESS>).
// Une station sans identifiant (repli « lat,lon » de normalise()) n'est jamais envoyée.
const RE_SIG_STATION = /^(\d{8}|ES-\d{1,8})$/;
const SIG_CARBURANTS = ['e85', 'e10', 'sp95', 'sp98', 'gazole', 'gplc'];

const idSignalable = id => typeof id === 'string' && RE_SIG_STATION.test(id);
const carburantSignalable = k => SIG_CARBURANTS.includes(k);

// « à l'instant », « il y a 40 min », « il y a 2 h », « il y a 3 j ».
function ilYA(ms){
  const min = Math.floor(Math.max(0, ms) / 60e3);
  if(min < 1) return 'à l\'instant';
  if(min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if(h < 48) return `il y a ${h} h`;
  return `il y a ${Math.floor(h / 24)} j`;
}

// Texte d'un agrégat {vide, ok, dernier} (une station, un carburant) :
// « signalé vide il y a 2 h (3) » (le nombre dès deux signalements), « de nouveau dispo il y a
// 40 min » (un « ok » plus récent que tout « vide » : le service a remis `vide` à zéro), sinon ''.
function libelle(agregat, maintenant){
  if(!agregat || typeof agregat !== 'object') return '';
  const vide = +agregat.vide || 0, ok = +agregat.ok || 0, dernier = +agregat.dernier;
  if(!Number.isFinite(dernier) || (vide < 1 && ok < 1)) return '';
  const age = ilYA(maintenant - dernier * 1000);
  if(vide >= 1) return `signalé vide ${age}${vide > 1 ? ` (${vide})` : ''}`;
  return `de nouveau dispo ${age}`;
}

// Le plan doit-il éviter cette station pour ce carburant ? Vrai si l'agrégat de la station
// (`{e85: {vide, ok, dernier}, …}`) compte au moins `options.seuil` (défaut 1) signalements « vide »
// sur les `options.fenetreH` (défaut 12) dernières heures. « Aucun ok plus récent » : le service
// remet `vide` à zéro dès qu'un « ok » est plus récent que le dernier « vide » ; `vide` > 0
// implique donc que le dernier signalement est un « vide », et `dernier` en est la date.
function aEviter(agregatStation, carburant, maintenant, options = {}){
  const seuil = options.seuil != null ? options.seuil : SIG_SEUIL;
  const fenetreH = options.fenetreH != null ? options.fenetreH : SIG_FENETRE_H;
  const a = agregatStation && typeof agregatStation === 'object' ? agregatStation[carburant] : null;
  if(!a || typeof a !== 'object') return false;
  const vide = +a.vide || 0, dernier = +a.dernier;
  if(vide < Math.max(1, seuil) || !Number.isFinite(dernier)) return false;
  return maintenant - dernier * 1000 <= fenetreH * 3600e3;
}

// ---- Journal local : un signalement par station et carburant par 6 h ----
const cleJournal = (station, carburant) => `${station}|${carburant}`;
// Journal relu depuis le stockage : entrées valides et de moins de 6 h seulement.
function purgerJournal(journal, maintenant){
  const out = {};
  if(!journal || typeof journal !== 'object') return out;
  for(const [cle, t] of Object.entries(journal)){
    if(typeof t === 'number' && Number.isFinite(t) && t <= maintenant && maintenant - t < SIG_DELAI_MS) out[cle] = t;
  }
  return out;
}
// Millisecondes à attendre avant de pouvoir signaler de nouveau (0 = tout de suite).
function delaiRestant(journal, station, carburant, maintenant){
  const t = journal && typeof journal === 'object' ? journal[cleJournal(station, carburant)] : undefined;
  if(typeof t !== 'number' || !Number.isFinite(t) || t > maintenant) return 0;
  return Math.max(0, SIG_DELAI_MS - (maintenant - t));
}
const peutSignaler = (journal, station, carburant, maintenant) =>
  delaiRestant(journal, station, carburant, maintenant) === 0;
// Nouveau journal (l'ancien n'est pas modifié) : l'entrée posée, les entrées périmées retirées.
function noterSignalement(journal, station, carburant, maintenant){
  const out = purgerJournal(journal, maintenant);
  out[cleJournal(station, carburant)] = maintenant;
  return out;
}
// « dans 5 h 20 », « dans 12 min », « dans moins d'une minute ».
function libelleDelai(ms){
  const min = Math.ceil(Math.max(0, ms) / 60e3);
  if(min < 1) return 'dans moins d\'une minute';
  if(min < 60) return `dans ${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return `dans ${h} h${m ? ` ${String(m).padStart(2, '0')}` : ''}`;
}

// Identifiants à interroger, par paquets de 400 (plafond du service), doublons et identifiants
// non signalables retirés. [] si rien à demander.
function lotsIds(ids){
  const vus = new Set(), lots = [];
  for(const id of Array.isArray(ids) ? ids : []){
    if(!idSignalable(id) || vus.has(id)) continue;
    vus.add(id);
    if(!lots.length || lots[lots.length - 1].length >= SIG_LOT) lots.push([]);
    lots[lots.length - 1].push(id);
  }
  return lots;
}

if(typeof module !== 'undefined' && module.exports)
  module.exports = {libelle, aEviter, peutSignaler, delaiRestant, noterSignalement, purgerJournal, libelleDelai,
                    lotsIds, idSignalable, carburantSignalable, ilYA,
                    SIG_FENETRE_H, SIG_SEUIL, SIG_DELAI_MS, SIG_LOT, SIG_CACHE_MS, CLE_SIGNALEMENTS, SIG_CARBURANTS};
