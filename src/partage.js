// Fiche vehicule <-> parametre d'URL #veh= (phase 2, 30/10/2026). Module PUR (aucun DOM),
// exporte pour Node et teste dans partage.test.js ; dans la page il precede app.js.
//
// Format historique (inchange, toujours lu et ecrit) :
//   #veh=Nom|e85+e10|conso|cuve|reserve[|autonomie]
// Extension electrique (7e champ, facultatif) :
//   #veh=Nom|carburants|conso|cuve|reserve|autonomie|E<batterie>,<kWh/100>,<kW DC>,<kW AC>,<prise>,<reserve %>,<depart %>
//   ex. #veh=Citadine%20%C3%A9lectrique%2050%20kWh|||||E50,17,150,11,ccs,15,80
// Retrocompatibilite : un lien a 5 ou 6 champs reste lu tel quel (vehicule thermique) ; une page
// anterieure a cette extension ignore un lien a 7 champs (son motif est ancre), elle ne le lit
// pas de travers. Les champs sont decodes puis traites en TEXTE par l'appelant, jamais en HTML ;
// ici on borne les longueurs et on ne garde des nombres que ce qui en est.
const PRISES = ['ccs', 'chademo', 't2'];
const MAX_NOM = 80;

// Nombre positif en texte court (« 6.5 », « 50 »), ou '' si vide ou illisible.
function nombre(txt, max){
  const t = String(txt == null ? '' : txt).trim().replace(',', '.');
  if(t === '' || !/^\d+(\.\d+)?$/.test(t)) return '';
  const n = parseFloat(t);
  if(!(n > 0) || (max != null && n > max)) return '';
  return String(n);
}
function nombreOuVide(txt, max){ return nombre(txt, max); }

// vehVersParam(v) -> chaine apres « #veh= ». Thermique : 6 champs (autonomie en 6e, vide si
// absente, pour que le format reste positionnel). Electrique : les 6 champs puis le bloc E.
function vehVersParam(v){
  const enc = x => encodeURIComponent(x == null ? '' : String(x));
  const champs = [enc(String(v.nom || '').slice(0, MAX_NOM)), (v.carbs || []).join('+'), enc(v.conso || ''),
                  enc(v.cuve || ''), enc(v.reserve || ''), enc(v.autonomie || '')];
  if(v.energie === 'elec'){
    const prise = PRISES.includes(v.prise) ? v.prise : 'ccs';
    champs.push('E' + [nombre(v.batterieKwh), nombre(v.consoKwh100), nombre(v.kwMaxDC), nombre(v.kwMaxAC), prise,
                       v.reservePct == null || v.reservePct === '' ? '' : nombre(v.reservePct, 100),
                       v.departPct == null || v.departPct === '' ? '' : nombre(v.departPct, 100)].join(','));
  }
  return champs.join('|');
}

// paramVersVeh(txt) -> fiche {nom, type: 'voiture', carbs, conso, cuve, reserve, autonomie
// [, energie: 'elec', batterieKwh, consoKwh100, kwMaxDC, kwMaxAC, prise, reservePct, departPct]}
// ou null si le texte n'est pas une fiche (moins de 5 champs, nom vide). `defautCarbs` :
// carburants si le 2e champ est vide (DEFAUT de la page).
function paramVersVeh(txt, defautCarbs){
  if(typeof txt !== 'string') return null;
  const f = txt.split('|');
  if(f.length < 5) return null;
  const dec = x => { try{ return decodeURIComponent(x); }catch(e){ return x; } };
  const nom = dec(f[0]).slice(0, MAX_NOM);
  if(!nom.trim()) return null;
  const e = f.length > 6 ? f[6] : '';
  const elec = /^E/.test(e);
  // 2e champ vide : DEFAUT pour un thermique (comme avant) ; aucun carburant pour un electrique.
  const carbs = f[1] ? dec(f[1]).split('+').filter(Boolean) : elec ? [] : (defautCarbs || []).slice();
  const v = {nom, type: 'voiture', carbs, conso: dec(f[2]), cuve: dec(f[3]), reserve: dec(f[4]), autonomie: f.length > 5 ? dec(f[5]) : ''};
  if(elec){
    const p = e.slice(1).split(',');
    v.energie = 'elec';
    v.batterieKwh = nombre(p[0]);
    v.consoKwh100 = nombre(p[1]);
    v.kwMaxDC = nombre(p[2]);
    v.kwMaxAC = nombre(p[3]);
    v.prise = PRISES.includes(p[4]) ? p[4] : 'ccs';
    v.reservePct = nombreOuVide(p[5], 100);
    v.departPct = nombreOuVide(p[6], 100);
  }
  return v;
}

// Export Node (tests) ; sans effet dans la page, ou `module` n'existe pas.
if(typeof module !== 'undefined' && module.exports)
  module.exports = {vehVersParam, paramVersVeh, PRISES};
