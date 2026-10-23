// Estimation de la consommation (L/100 km, cycle mixte WLTP) quand le conducteur ne la
// connait pas. Module PUR (aucun DOM), exporte pour Node et teste dans conso.test.js.
//
// Sources (relevees le 23/10/2026, phase 2) :
//  - Lignes voiture : MEDIANES du catalogue des vehicules neufs « ADEME Car Labelling »
//    (jeu de donnees `ademe-car-labelling`, 3 604 versions, mis a jour le 14/10/2026,
//    extrait le 23/10/2026). Correspondance des categories : `Gamme` ECONOMIQUE /
//    INFERIEURE -> citadine ; MOYENNE INFERIEURE -> compacte ; MOYENNE SUPERIEURE /
//    SUPERIEURE / LUXE -> berline ; `Carrosserie` TS TERRAINS/CHEMINS -> suv ;
//    MINIBUS / MONOSPACE / COMBISPACE -> monospace. n = effectif essence / gazole.
//  - E85 = essence x 1,25 (regle decidee le 23/10/2026). La base donne 7,7 L/100 pour
//    les citadines flexfuel (n = 67), soit +31 % : l'ecart est note, la regle est gardee.
//  - GPL = essence x 1,20 (hypothese de travail, aucune mediane exploitable).
//  - Lignes marquees `large: true` (utilitaire, camping-car, scooter, moto) : ordres de
//    grandeur SANS source ouverte trouvee, a affiner en phase 4 avec la sonde ADEME par
//    modele. L'ecran le dit (« estimation large »).
//  - Hybrides : pas d'estimation (la base melange rechargeables et non rechargeables) ;
//    estimerConso renvoie null, l'ecran demande la conso connue.
// La conso ne deplace pas les arrets du plan (la programmation dynamique est homogene en
// L/100 hors penalite d'arret) : elle ne sert qu'aux euros affiches.
const TABLE_CONSO = {
  // type -> categorie -> {essence, gazole, e85, gpl, n: [essence, gazole], large}
  voiture: {
    citadine:  {essence: 5.9, gazole: 4.4, e85: 7.4, gpl: 7.1, n: [382, 14]},
    compacte:  {essence: 6.2, gazole: 4.8, e85: 7.8, gpl: 7.4, n: [427, 41]},
    berline:   {essence: 7.3, gazole: 5.1, e85: 9.1, gpl: 8.8, n: [228, 25]},
    suv:       {essence: 6.7, gazole: 5.4, e85: 8.4, gpl: 8.0, n: [387, 277]},
    monospace: {essence: 6.9, gazole: 6.0, e85: 8.6, gpl: 8.3, n: [90, 213]},
  },
  utilitaire: {fourgon: {essence: 9.0, gazole: 7.5, e85: 11.3, gpl: 10.8, large: true}},
  campingcar: {campingcar: {gazole: 11.0, large: true}},
  moto: {
    scooter: {essence: 3.0, e85: 3.8, large: true},     // scooter 125
    moto:    {essence: 5.0, e85: 6.3, large: true},
  },
};
const CATEGORIES_CONSO = {
  voiture: [['citadine', 'Citadine'], ['compacte', 'Compacte'], ['berline', 'Berline / break'],
            ['suv', 'SUV / 4×4'], ['monospace', 'Monospace / ludospace']],
  moto: [['scooter', 'Scooter 125'], ['moto', 'Moto']],
  utilitaire: [['fourgon', 'Fourgon']],
  campingcar: [['campingcar', 'Camping-car']],
};
// Carburant de la fiche (cle du flux) -> colonne de la table.
const COLONNE_CONSO = {e10: 'essence', sp95: 'essence', sp98: 'essence', spmin: 'essence',
                       gazole: 'gazole', e85: 'e85', gplc: 'gpl'};
const NOM_COLONNE = {essence: 'essence', gazole: 'gazole', e85: 'E85 (essence × 1,25)', gpl: 'GPL (essence × 1,20)'};

// estimerConso(type, categorie, carburant, hybride) -> {conso, source, large} ou null.
// `carburant` = cle du flux (e10, sp98, gazole, e85, gplc, spmin). Categorie absente ->
// premiere categorie du type (utilitaire, camping-car n'en ont qu'une).
function estimerConso(type, categorie, carburant, hybride){
  if(hybride) return null;
  const cats = TABLE_CONSO[type];
  if(!cats) return null;
  const cat = categorie && cats[categorie] ? categorie : Object.keys(cats)[0];
  const ligne = cats[cat];
  const col = COLONNE_CONSO[carburant];
  if(!col || !(ligne[col] > 0)) return null;
  const libelle = (CATEGORIES_CONSO[type].find(c => c[0] === cat) || [cat, cat])[1];
  const source = ligne.large
    ? `ordre de grandeur ${libelle.toLowerCase()} ${NOM_COLONNE[col]}, sans source ouverte — estimation large`
    : `médiane ADEME Car Labelling (14/10/2026), ${libelle.toLowerCase()} ${NOM_COLONNE[col]}` +
      (col === 'essence' || col === 'gazole' ? ` (n = ${ligne.n[col === 'essence' ? 0 : 1]})` : '');
  return {conso: ligne[col], source, large: !!ligne.large};
}

if(typeof module !== 'undefined' && module.exports)
  module.exports = {estimerConso, TABLE_CONSO, CATEGORIES_CONSO, COLONNE_CONSO};
