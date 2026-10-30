// Validation pure des entrées (station, carburant, état, liste d'identifiants).

// Clés de carburant telles que dans src/app.js (FUELS) de l'application.
export const CARBURANTS = ["e85", "e10", "sp95", "sp98", "gazole", "gplc"];
export const ETATS = ["vide", "ok"];
export const MAX_IDS = 400;

// Identifiant de station : flux français (8 chiffres) ou espagnol (ES- + 1 à 8 chiffres).
const RE_STATION = /^(\d{8}|ES-\d{1,8})$/;

export function stationValide(s) {
  return typeof s === "string" && RE_STATION.test(s);
}

// Retourne {ok: true, valeur: {station, carburant, etat}} ou {ok: false, erreur}.
export function valideSignalement(corps) {
  if (corps === null || typeof corps !== "object" || Array.isArray(corps)) {
    return {ok: false, erreur: "corps JSON attendu : objet {station, carburant, etat}"};
  }
  const cles = Object.keys(corps);
  const inconnues = cles.filter(c => !["station", "carburant", "etat"].includes(c));
  if (inconnues.length) return {ok: false, erreur: `champ inconnu : ${inconnues[0]}`};
  const {station, carburant, etat} = corps;
  if (!stationValide(station)) {
    return {ok: false, erreur: "station : 8 chiffres (France) ou ES-<1 à 8 chiffres> (Espagne)"};
  }
  if (typeof carburant !== "string" || !CARBURANTS.includes(carburant)) {
    return {ok: false, erreur: `carburant : une valeur parmi ${CARBURANTS.join(", ")}`};
  }
  if (typeof etat !== "string" || !ETATS.includes(etat)) {
    return {ok: false, erreur: "etat : 'vide' ou 'ok'"};
  }
  return {ok: true, valeur: {station, carburant, etat}};
}

// `ids` = paramètre brut de l'URL ("12345678,ES-2777"). Doublons retirés.
// Retourne {ok: true, valeur: [...]} ou {ok: false, erreur}.
export function valideIds(brut) {
  if (typeof brut !== "string" || brut.trim() === "") {
    return {ok: false, erreur: "paramètre ids requis (identifiants séparés par des virgules)"};
  }
  const ids = [...new Set(brut.split(",").map(s => s.trim()).filter(Boolean))];
  if (ids.length === 0) return {ok: false, erreur: "paramètre ids vide"};
  if (ids.length > MAX_IDS) return {ok: false, erreur: `au plus ${MAX_IDS} identifiants`};
  const mauvais = ids.find(id => !stationValide(id));
  if (mauvais !== undefined) return {ok: false, erreur: `identifiant invalide : ${mauvais.slice(0, 40)}`};
  return {ok: true, valeur: ids};
}
