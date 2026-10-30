// Agrégation pure des signalements, sans dépendance (testable sous Node ou Workers).
//
// Entrée : lignes {station, carburant, etat ('vide'|'ok'), t (secondes epoch)}.
// Sortie : {station: {carburant: {vide, ok, dernier}}} sur la fenêtre glissante.
//
// Règles :
//  - seuls les signalements de la fenêtre (48 h par défaut) comptent ;
//  - par (station, carburant) : compte des « vide » et des « ok » ;
//  - un « ok » plus récent que le dernier « vide » remet `vide` à zéro
//    (la pompe est repartie) ;
//  - `dernier` = horodatage du signalement le plus récent, toutes catégories ;
//  - une station sans signalement dans la fenêtre n'apparaît pas.

export const FENETRE_AGREGAT = 48 * 3600;

export function agrege(lignes, {maintenant, fenetre = FENETRE_AGREGAT} = {}) {
  if (!Number.isFinite(maintenant)) throw new TypeError("agrege : `maintenant` requis");
  const depuis = maintenant - fenetre;
  const brut = new Map();  // "station\0carburant" -> {vide, ok, dernierVide, dernierOk}
  for (const l of lignes) {
    if (!l || !Number.isFinite(l.t) || l.t <= depuis || l.t > maintenant) continue;
    if (l.etat !== "vide" && l.etat !== "ok") continue;
    const cle = `${l.station}\0${l.carburant}`;
    let a = brut.get(cle);
    if (!a) brut.set(cle, (a = {station: l.station, carburant: l.carburant,
                                  vide: 0, ok: 0, dernierVide: -Infinity, dernierOk: -Infinity}));
    a[l.etat] += 1;
    if (l.etat === "vide") a.dernierVide = Math.max(a.dernierVide, l.t);
    else a.dernierOk = Math.max(a.dernierOk, l.t);
  }
  const resultat = {};
  for (const a of brut.values()) {
    const repartie = a.dernierOk > a.dernierVide;
    const entree = {vide: repartie ? 0 : a.vide, ok: a.ok,
                    dernier: Math.max(a.dernierVide, a.dernierOk)};
    (resultat[a.station] ??= {})[a.carburant] = entree;
  }
  return resultat;
}
