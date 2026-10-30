// Espagne : prix des carburants du ministere espagnol (Ministerio para la Transicion
// Ecologica y el Reto Demografico, « Precios de carburantes », Geoportal Gasolineras,
// donnees ouvertes). Module PUR (aucun DOM), CommonJS comme plan.js : testable sous Node,
// inline dans la page a la generation (generate.py, SCRIPTS).
//
// Source par province (celle que la page utilise, quelques centaines de ko ; le fichier
// national pese 12 Mo pour 11 422 stations le 28/10/2026) :
//   https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/
//     EstacionesTerrestres/FiltroProvincia/{IDProvincia}      (deux chiffres, 17 = Girona)
// Reponse : {Fecha: "28/10/2026 11:42:52", ListaEESSPrecio: [...], Nota, ResultadoConsulta: "OK"}.
// Formats MESURES le 28/10/2026 : tous les nombres sont des TEXTES a virgule decimale
// ("1,999", "41,917028") ; prix en €/L ; chaine vide = carburant non vendu (null, jamais 0) ;
// `Tipo Venta` P = vente au public, R = reserve (exclue) ; `Fecha` est l'horodatage GLOBAL
// du fichier, il n'y a pas de date par station : chaque station porte `Fecha` comme date de
// tous ses prix. `Horario` : « L-D: 24H », « L-S: 06:00-22:00; D: 07:00-22:00 » (jours L lundi,
// M mardi, X mercredi, J jeudi, V vendredi, S samedi, D dimanche ; regles separees par « ; »).
//
// But : une station espagnole normalisee a EXACTEMENT la forme d'une station francaise telle
// que app.js la construit (normalise()), plus `pays`, `enseigne` et `horario` — pour que la
// liste, la carte, la fiche et le plan de pleins (plan.js, inchange) les traitent sans rien savoir.

const ES_HOTE = 'https://sedeaplicaciones.minetur.gob.es';
const ES_URL = ES_HOTE + '/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/FiltroProvincia/';
const ES_MAX_PROVINCES = 3;        // requetes par chargement au plus ; au-dela, l'ecran dit de zoomer
const ES_CACHE_MS = 30 * 60e3;     // cache memoire par province (le fichier change toutes les 30 min)
const ES_EMPRISE_MAX = 3;          // degres de latitude : au-dela, trop large pour charger l'Espagne

// Table des 52 provinces : id -> [nom, nb de stations, latMin, latMax, lonMin, lonMax], calculee
// le 28/10/2026 depuis le fichier complet (src/es-provincias.json). Sous Node : lue du fichier ;
// dans la page : inlinee par generate.py a la place du jeton (ci-dessous).
// Cinq entrees ont des bornes degenerees (08 Barcelona, 28 Madrid, 30 Murcia, 39 Cantabria :
// une station a 0,0 ; 36 Pontevedra : latitude et longitude inversees) : elles croisent des
// emprises qu'elles ne devraient pas. recouvrementsProvinces les marque `douteuse` et les classe
// apres les autres ; a recalculer en ecartant les stations hors de l'enveloppe (voir ES_ENVELOPPE).
const ES_PROVINCIAS = (typeof module !== 'undefined' && module.exports)
  ? require('./es-provincias.json') : __ES_PROVINCIAS__;

// Correspondance avec les carburants de l'application (cles de app.js : FUELS).
// Comptes du 28/10/2026 : GPL 995 stations, E10 28, E85 2 seulement.
const ES_CARBURANTS = {
  gazole: 'Precio Gasoleo A',
  sp95:   'Precio Gasolina 95 E5',
  sp98:   'Precio Gasolina 98 E5',
  e10:    'Precio Gasolina 95 E10',
  e85:    'Precio Gasolina 95 E85',
  gplc:   'Precio Gases licuados del petróleo',
};
const ES_CLES = ['e85', 'e10', 'sp98', 'sp95', 'gazole', 'gplc'];   // meme ordre que FUELS (app.js)
// Enveloppe de l'Espagne, Canaries, Ceuta et Melilla comprises : une station hors de la
// (coordonnees a 0, lat/lon inverses) n'est pas placable et serait fausse sur la carte.
const ES_ENVELOPPE = {s: 27, n: 44.5, w: -18.5, e: 4.5};

// Echappement HTML a l'ingestion, comme app.js (esc) : tout ce qui vient du flux (noms,
// adresses, enseignes, horaires) est rendu sain ici, une fois.
const echapperES = x => String(x).replace(/[&<>"']/g, c =>
  ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

// "1,999" -> 1.999 ; "" / null / illisible -> null (jamais 0 : un prix absent n'est pas gratuit).
function nombreES(texte){
  if(texte == null) return null;
  const t = String(texte).trim();
  if(!t) return null;
  const n = parseFloat(t.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

// "28/10/2026 11:42:52" -> "2026-10-28T11:42:52" (heure locale, l'Espagne peninsulaire est sur
// le fuseau de la France ; meme forme que les `<carburant>_maj` du flux francais pour jour(),
// quand() et le tri par releve). null si illisible.
function fechaISO(fecha){
  const m = String(fecha || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}):(\d{2}):(\d{2})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6]}` : null;
}

// Station espagnole -> forme d'une station francaise (app.js, normalise()). null si la station
// n'est pas en vente au public (`Tipo Venta` != P) ou n'est pas placable.
// opts.dist(la, lo) : distance au repere en km (app.js), 0 a defaut (module pur).
function normaliserStationES(o, fecha, opts = {}){
  if(!o || o['Tipo Venta'] !== 'P') return null;
  const la = nombreES(o.Latitud), lo = nombreES(o['Longitud (WGS84)']);
  if(la == null || lo == null) return null;
  if(!(la >= ES_ENVELOPPE.s && la <= ES_ENVELOPPE.n && lo >= ES_ENVELOPPE.w && lo <= ES_ENVELOPPE.e)) return null;
  const maj = fechaISO(fecha);
  const prix = {}, dates = {}, depuis = {}, kotype = {};
  ES_CLES.forEach(k => {
    prix[k] = nombreES(o[ES_CARBURANTS[k]]);
    dates[k] = prix[k] == null ? null : maj;
    depuis[k] = null; kotype[k] = null;
  });
  const horario = String(o.Horario || '').trim();
  return {id: echapperES('ES-' + (o.IDEESS != null && String(o.IDEESS).trim() ? String(o.IDEESS).trim() : `${la},${lo}`)),
          la, lo,
          ville: echapperES(o.Localidad || ''), cp: echapperES(o['C.P.'] || ''), adresse: echapperES(o['Dirección'] || ''),
          auto: /^L-D:\s*24H$/i.test(horario),
          rupture: '',                     // pas de notion de rupture dans le flux espagnol
          hs: new Set(),
          d: typeof opts.dist === 'function' ? opts.dist(la, lo) : 0,
          prix, maj: dates,
          depuis, kotype,
          off: {prix: Object.assign({}, prix), maj: Object.assign({}, dates)},
          corr: {},
          pays: 'ES',
          enseigne: echapperES(o['Rótulo'] || ''),
          horario: echapperES(horario)};
}

// ---- Horaires « L-S: 06:00-22:00; D: 07:00-22:00 » ----
const ES_JOURS = 'LMXJVSD';                                   // lundi .. dimanche
const FR_JOURS = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];
// -> [{jours: [indices 0..6], plages: [[debut, fin] en minutes]}], ou null si illisible.
function reglesHorario(horario){
  if(typeof horario !== 'string' || !horario.trim()) return null;
  const regles = [];
  for(const part of horario.split(';')){
    const m = part.trim().match(/^([LMXJVSD](?:\s*-\s*[LMXJVSD])?(?:\s*[,y]\s*[LMXJVSD](?:\s*-\s*[LMXJVSD])?)*)\s*:\s*(.+?)\s*$/i);
    if(!m) return null;
    const jours = [];
    for(const tok of m[1].toUpperCase().split(/\s*[,Y]\s*/)){
      const [a, b] = tok.split(/\s*-\s*/);
      const i = ES_JOURS.indexOf(a), j = b ? ES_JOURS.indexOf(b) : i;
      if(i < 0 || j < 0) return null;
      for(let k = i; ; k = (k + 1) % 7){ jours.push(k); if(k === j) break; }
    }
    const plages = [];
    if(/^24\s*H$/i.test(m[2])) plages.push([0, 1440]);
    else for(const p of m[2].split(/\s*(?:,|\by\b|\band\b)\s*/i)){
      const h = p.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
      if(!h) return null;
      const de = +h[1] * 60 + +h[2], a = +h[3] * 60 + +h[4];
      if(de > 1440 || a > 1440) return null;
      if(a > de) plages.push([de, a]);
      else { plages.push([de, 1440]); plages.push([0, a]); }   // a cheval sur minuit : simplifie au meme jour
    }
    regles.push({jours, plages});
  }
  return regles.length ? regles : null;
}
// true (ouvert), false (ferme a cette date), null (horaire inconnu ou illisible).
function ouvertA(horario, date){
  const regles = reglesHorario(horario);
  if(!regles || !(date instanceof Date) || isNaN(date)) return null;
  const jour = (date.getDay() + 6) % 7, min = date.getHours() * 60 + date.getMinutes();
  for(const r of regles){
    if(!r.jours.includes(jour)) continue;
    if(r.plages.some(([de, a]) => min >= de && min < a)) return true;
  }
  return false;
}
// Resume lisible : « 24 h/24 », « lun-sam 6h-22h · dim 7h-22h » ; l'horaire brut s'il est illisible.
function resumerHorario(horario){
  const regles = reglesHorario(horario);
  if(!regles) return horario ? String(horario) : '';
  if(regles.length === 1 && regles[0].jours.length === 7 && regles[0].plages.some(([de, a]) => de === 0 && a === 1440)) return '24 h/24';
  const hm = m => m % 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : `${m / 60}h`;
  const joursTxt = j => {
    if(j.length === 7) return 'tous les jours';
    // suite contigue (lun-sam) sinon enumeration (sam, dim)
    const contigu = j.every((x, i) => i === 0 || x === (j[i - 1] + 1) % 7);
    return j.length > 2 && contigu ? `${FR_JOURS[j[0]]}-${FR_JOURS[j[j.length - 1]]}` : j.map(x => FR_JOURS[x]).join(', ');
  };
  return regles.map(r => `${joursTxt(r.jours)} ${r.plages.some(([de, a]) => de === 0 && a === 1440) ? '24 h/24'
    : r.plages.map(([de, a]) => `${hm(de)}-${hm(a === 1440 ? 0 : a)}`).join(' et ')}`).join(' · ');
}

// ---- Provinces croisees par une emprise {s, n, w, e} (app.js, emprise()) ----
// -> [{id, aire (deg² de recouvrement), douteuse}], tries : bornes fiables d'abord, puis
// recouvrement decroissant. `douteuse` : boite de plus de 30 deg² (une province reelle tient
// en moins de 5), signe d'une station a 0,0 ou inversee dans le fichier source.
function recouvrementsProvinces(table, bbox){
  const res = [];
  for(const id of Object.keys(table)){
    const p = table[id];
    if(!Array.isArray(p) || p.length < 6) continue;
    const [, , s, n, w, e] = p;
    const dLat = Math.min(n, bbox.n) - Math.max(s, bbox.s);
    const dLon = Math.min(e, bbox.e) - Math.max(w, bbox.w);
    if(!(dLat > 0 && dLon > 0)) continue;
    res.push({id, aire: dLat * dLon, douteuse: (n - s) * (e - w) > 30});
  }
  return res.sort((a, b) => (a.douteuse - b.douteuse) || (b.aire - a.aire) || (a.id < b.id ? -1 : 1));
}
// Identifiants des provinces dont la boite croise l'emprise, par recouvrement decroissant.
function provincesPourEmprise(table, bbox){
  return recouvrementsProvinces(table, bbox).map(r => r.id);
}
// Vrai si au moins une province croise l'emprise.
function enEspagne(bbox, table = ES_PROVINCIAS){
  return recouvrementsProvinces(table, bbox).length > 0;
}

// Export Node (tests) ; sans effet dans la page, ou `module` n'existe pas.
if(typeof module !== 'undefined' && module.exports)
  module.exports = {nombreES, fechaISO, normaliserStationES, ouvertA, resumerHorario, reglesHorario,
                    recouvrementsProvinces, provincesPourEmprise, enEspagne,
                    ES_PROVINCIAS, ES_CARBURANTS, ES_CLES, ES_URL, ES_HOTE, ES_MAX_PROVINCES, ES_CACHE_MS, ES_EMPRISE_MAX, ES_ENVELOPPE};
