// ---------- Assistant vehicule en trois ecrans (premier lancement) ----------
// 1. Vehicule (type, categorie, carburants, autonomie d'un plein EN PREMIER, conso
//    connue ou estimee d'apres src/conso.js, reservoir facultatif, reserve) ;
// 2. Position (ma position, sur la carte, une adresse, plus tard) ;
// 3. C'est pret (autonomie utile, conso et son origine, rien n'est envoye).
// Feuille modale ordinaire (.modale : piege de focus, Echap et voile = Passer, cf.
// feuilles.js). creerAssistant(ctx) recoit ce dont il a besoin de app.js et renvoie
// {ouvrir(vehicule)} ; « Passer » a tout ecran = usage minimal, REGL.assistantVu = true.
function creerAssistant(ctx){
  const {$, REGL, CASES, TYPES, CATEGORIES_CONSO, estimerConso, autonomieUtile, ico,
         ouvrirFeuille, fermerFeuille, apresVehicule, localiser, reticule, geocoder, situer,
         rechercheOuverte, MOBILE, reglagesBruts} = ctx;
  const ICONE_TYPE = {voiture: 'voiture', moto: 'moto', utilitaire: 'utilitaire', campingcar: 'campingcar'};
  const LIBELLE_TYPE = {voiture: 'Voiture', moto: 'Scooter / moto', utilitaire: 'Utilitaire', campingcar: 'Camping-car'};
  let etat = {type: 'voiture', cat: 'citadine', estime: null};
  let ecran = 1, ouvert = false, origine = null;

  // Type : grands boutons-icones ; categorie : chips selon le type.
  $('asTypes').innerHTML = Object.keys(LIBELLE_TYPE).map(t =>
    `<button type="button" class="as-type" data-type="${t}" aria-pressed="false">${ico(ICONE_TYPE[t])}<span>${LIBELLE_TYPE[t]}</span></button>`).join('');
  $('asTypes').querySelectorAll('[data-type]').forEach(b => b.onclick = () => choisirType(b.dataset.type));
  $('asCarbs').innerHTML = CASES.map(([k, l]) =>
    `<label class="case"><input type="checkbox" value="${k}"> ${l}</label>`).join('');
  function choisirType(t, cat){
    etat.type = TYPES[t] ? t : 'voiture';
    $('asTypes').querySelectorAll('[data-type]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.type === etat.type)));
    const cats = CATEGORIES_CONSO[etat.type] || [];
    etat.cat = cats.some(c => c[0] === cat) ? cat : (cats[0] ? cats[0][0] : '');
    // Une seule categorie (utilitaire, camping-car) : rien a choisir.
    $('asCats').innerHTML = cats.length > 1 ? cats.map(([k, l]) =>
      `<button type="button" class="as-cat" data-cat="${k}" aria-pressed="${k === etat.cat}">${l}</button>`).join('') : '';
    $('asCats').querySelectorAll('[data-cat]').forEach(b => b.onclick = () => {
      etat.cat = b.dataset.cat;
      $('asCats').querySelectorAll('[data-cat]').forEach(o => o.setAttribute('aria-pressed', String(o === b)));
      if(etat.estime) estimer();
    });
    if(etat.estime) estimer();
  }
  const carbsChoisis = () => [...$('asCarbs').querySelectorAll('input:checked')].map(i => i.value);
  // Conso : « je la connais » (saisie libre) ou « estimer » (table embarquee, pre-remplie,
  // modifiable, source affichee). La conso ne deplace pas les arrets : elle chiffre les euros.
  function modeConso(estimer_){
    $('asConsoConnue').setAttribute('aria-pressed', String(!estimer_));
    $('asConsoEstimer').setAttribute('aria-pressed', String(estimer_));
  }
  function estimer(){
    const carb = carbsChoisis()[0];
    const r = carb ? estimerConso(etat.type, etat.cat, carb, $('asHybride').checked) : null;
    if(!r){
      etat.estime = null; modeConso(false);
      $('asConsoSource').textContent = !carb ? 'Cochez d\'abord un carburant pour estimer.'
        : $('asHybride').checked ? 'Hybride : pas d\'estimation fiable (la base mélange rechargeables et non rechargeables) — saisissez la conso que vous connaissez.'
        : 'Pas d\'estimation pour cette combinaison — saisissez la conso que vous connaissez.';
      return;
    }
    etat.estime = r; modeConso(true);
    $('asConso').value = r.conso;
    $('asConsoSource').textContent = `≈ ${String(r.conso).replace('.', ',')} L/100 — ${r.source}${r.large ? '' : '.'} Modifiable.`;
  }
  $('asConsoEstimer').onclick = () => { estimer(); if(etat.estime) $('asConso').focus(); };
  $('asConsoConnue').onclick = () => { etat.estime = null; modeConso(false); $('asConsoSource').textContent = ''; $('asConso').value = ''; $('asConso').focus(); };
  $('asConso').addEventListener('input', () => { if(etat.estime && String($('asConso').value) !== String(etat.estime.conso)){ etat.estime = null; modeConso(false); $('asConsoSource').textContent = 'Conso saisie.'; } });
  $('asCarbs').addEventListener('change', () => { $('asErreur').textContent = ''; if(etat.estime) estimer(); });
  $('asHybride').onchange = () => { if(etat.estime || $('asHybride').checked) estimer(); };

  function montrer(n){
    ecran = n;
    [1, 2, 3].forEach(i => { $('asEcran' + i).hidden = i !== n; });
    $('asCompteur').textContent = `${n} / 3`;
    $('asTitre').textContent = n === 1 ? 'Votre véhicule' : n === 2 ? 'Votre point de repère' : 'C\'est prêt';
    $('asPasser').hidden = n === 3;
    if(n === 3) resumer();
    const m = $('assistant');
    m.scrollTop = 0;
    const premier = $('asEcran' + n).querySelector('input:not([type=checkbox]), button');
    (premier || $('asTitre')).focus({preventScroll: true});
  }
  // Ecran 1 -> fiche vehicule (celle du vehicule actif) ; au moins un carburant.
  function enregistrer(){
    const carbs = carbsChoisis();
    if(!carbs.length){ $('asErreur').textContent = 'Choisissez au moins un carburant.'; $('asCarbs').querySelector('input').focus(); return false; }
    $('asErreur').textContent = '';
    const v = REGL.vehicules[REGL.vehActif];
    const cat = (CATEGORIES_CONSO[etat.type] || []).find(c => c[0] === etat.cat);
    if(!v.nom || /^Véhicule \d+$/.test(v.nom)) v.nom = cat && CATEGORIES_CONSO[etat.type].length > 1 ? cat[1] : LIBELLE_TYPE[etat.type];
    Object.assign(v, {type: etat.type, cat: etat.cat, carbs, conso: $('asConso').value, cuve: $('asCuve').value,
                      autonomie: $('asAutonomie').value, reserve: $('asReserve').value,
                      consoEstimee: !!(etat.estime && String($('asConso').value) === String(etat.estime.conso))});
    v.hybride = $('asHybride').checked || undefined;
    REGL.assistantVu = true;
    reglagesBruts();
    apresVehicule();
    return true;
  }
  $('asSuite1').onclick = () => { if(enregistrer()) montrer(2); };
  $('asRetour2').onclick = () => montrer(1);
  $('asPlusTard').onclick = () => montrer(3);
  // Ecran 2 : position. Ma position -> geolocalisation (refus : on reste, message) ;
  // sur la carte -> reticule (l'assistant se referme, revient a l'ecran 3 une fois le repere pose) ;
  // une adresse -> BAN.
  $('asPosMoi').onclick = () => {
    $('asPosMsg').textContent = 'localisation…';
    localiser(false, ok => {
      $('asPosMsg').textContent = ok ? '' : 'Position refusée ou indisponible — choisissez sur la carte, ou une adresse.';
      if(ok) montrer(3);
    });
  };
  $('asPosCarte').onclick = () => {
    fermerFeuille();
    reticule(true, () => { ouvrir(null, 3); });
  };
  $('asPosAdresse').onsubmit = async e => {
    e.preventDefault();
    const q = $('asPosQ').value.trim();
    if(!q) return;
    $('asPosMsg').textContent = 'recherche…';
    try{ const g = await geocoder(q); situer(g.lat, g.lon, g.label, true); $('asPosMsg').textContent = ''; montrer(3); }
    catch(err){ $('asPosMsg').textContent = err.message; }
  };
  // Ecran 3 : ce que le plan utilisera.
  function resumer(){
    const v = REGL.vehicules[REGL.vehActif];
    const au = autonomieUtile(+v.conso, +v.cuve, +v.autonomie, +v.reserve || 30);
    const li = [];
    const l = (txt, b) => { const e = document.createElement('li'); if(b){ const s = document.createElement('b'); s.textContent = b; e.append(s, ' '); } e.append(txt); li.push(e); };
    l(`— ${v.nom} (${LIBELLE_TYPE[v.type] || 'véhicule'}), ${v.carbs.map(k => (CASES.find(c => c[0] === k) || [k, k])[1]).join(' + ')}`, 'Véhicule');
    if(au) l(`utiles (réserve ${+v.reserve || 30} km déduite${au.source === 'autonomie' ? '' : `, ${v.cuve} L × ${String(v.conso).replace('.', ',')} L/100`})`, `≈ ${Math.round(au.A)} km`);
    else l('autonomie d\'un plein ou réservoir à renseigner dans le garage pour situer les arrêts.', 'Autonomie inconnue :');
    if(+v.conso > 0) l(`L/100 km${v.consoEstimee ? ` — estimée (${etat.estime ? etat.estime.source : 'table embarquée'}), modifiable dans le garage` : ' — saisie'}`, String(v.conso).replace('.', ','));
    else l('à renseigner (ou à estimer) dans le garage pour chiffrer le voyage en euros.', 'Conso inconnue :');
    $('asResume').replaceChildren(...li);
  }
  const terminer = () => { REGL.assistantVu = true; reglagesBruts(); fermerFeuille(); };
  $('asFin').onclick = terminer;
  $('asOuAllez').onclick = () => { terminer(); rechercheOuverte(true); if(!MOBILE.matches) $('arrivee').focus(); };
  $('asPasser').onclick = terminer;
  // Echap ou voile : vaut « Passer ».
  document.addEventListener('feuille', e => {
    if(e.detail.id !== 'assistant') return;
    ouvert = e.detail.ouverte;
    if(!ouvert && !REGL.assistantVu){ REGL.assistantVu = true; reglagesBruts(); }
  });

  // ouvrir(vehicule, ecran) : pre-rempli d'apres la fiche donnee (garage) ; sinon vide.
  function ouvrir(v, n){
    if(v){
      choisirType(v.type, v.cat);
      $('asCarbs').querySelectorAll('input').forEach(i => i.checked = (v.carbs || []).includes(i.value));
      $('asHybride').checked = !!v.hybride;
      $('asAutonomie').value = v.autonomie || ''; $('asConso').value = v.conso || '';
      $('asCuve').value = v.cuve || ''; $('asReserve').value = v.reserve || 30;
      etat.estime = null; modeConso(false); $('asConsoSource').textContent = '';
    }else if(!n){
      choisirType('voiture', 'citadine');
      $('asCarbs').querySelectorAll('input').forEach(i => i.checked = false);
      $('asHybride').checked = false;
      $('asAutonomie').value = ''; $('asConso').value = ''; $('asCuve').value = ''; $('asReserve').value = 30;
      etat.estime = null; modeConso(false); $('asConsoSource').textContent = '';
    }
    $('asErreur').textContent = ''; $('asPosMsg').textContent = '';
    ouvrirFeuille('assistant', origine);
    montrer(n || 1);
  }
  return {ouvrir};
}
