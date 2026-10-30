// Service worker de ViaMinus (corps). pwa/sw.js = src/pwa-strategie.js (regles pures, testees)
// + ce fichier, assembles par generate.py ; servi A COTE de la page (meme dossier), enregistre
// par la page en https seulement : sw.js?v=<empreinte de build>&p=<nom de la page>.
// Toute erreur ici retombe sur le reseau : la page continue de fonctionner comme avant.
const PARAMS = new URL(self.location.href).searchParams;
const BUILD_SW = PARAMS.get('v') || '';
const SCOPE = self.registration.scope;
const PAGE = urlPage(SCOPE, PARAMS.get('p') || '');
const NOM_COQUILLE = nomCacheCoquille(BUILD_SW);   // deterministe : le worker peut etre relance a tout moment
const NOMS = {prix: CACHE_PRIX, es: CACHE_ES, irve: CACHE_IRVE};
// Reseau d'abord, mais pas sans fin : au-dela de DELAI_RESEAU sans reponse (reseau « present mais
// muet »), la derniere reponse en cache est servie si elle existe ; sans cache, on attend le reseau.
const DELAI_RESEAU = 8000;

// Copie d'une reponse datee (l'en-tete dit a la page : « ceci vient du cache, de telle date »).
function dater(r){
  const h = new Headers(r.headers);
  h.set(ENTETE_DATE, new Date().toISOString());
  return new Response(r.body, {status: r.status, statusText: r.statusText, headers: h});
}
async function entrees(c){
  const ks = await c.keys();
  return Promise.all(ks.map(async k => { const m = await c.match(k); return {url: k.url, date: m ? m.headers.get(ENTETE_DATE) : null}; }));
}
// Stocke une reponse 200 sous `cle`, puis applique la limite (entrees, age) du cache.
async function stocker(nom, cle, r, limite){
  if(!r || !r.ok) return;
  const c = await caches.open(nom);
  await c.put(cle, dater(r));
  if(!limite) return;
  for(const u of entreesAPurger(await entrees(c), limite, Date.now())) await c.delete(u);
}
async function repli(nom, cle, limite, famille){
  const c = await caches.open(nom);
  const u = choisirRepli(await entrees(c), cle, limite, {famille});
  return u ? c.match(u) : null;
}

// Installation : la coquille est lue fraiche (cache: reload) et rangee dans le cache de CE build.
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const r = await fetch(PAGE, {cache: 'reload'});
    if(!r.ok) throw new Error('coquille HTTP ' + r.status);
    const c = await caches.open(NOM_COQUILLE);
    await c.put(PAGE, dater(r));
  })());
});
// Activation : les coquilles des builds precedents disparaissent, les caches de donnees restent.
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const garder = [NOM_COQUILLE, CACHE_PRIX, CACHE_ES, CACHE_IRVE];
    for(const n of cachesAPurger(await caches.keys(), garder)) await caches.delete(n);
    await self.clients.claim();   // des la premiere visite, les chargements suivants passent par le worker
  })());
});
// La page (bandeau « nouvelle version », bouton Recharger) demande au worker en attente de prendre la main.
self.addEventListener('message', e => { if(e.data && e.data.type === 'activer') self.skipWaiting(); });

async function coquille(d, req){
  const c = await caches.open(NOM_COQUILLE);
  if(d.reseauDabord){
    try{
      const r = await fetch(req);
      if(r.ok){ await c.put(d.cle, dater(r.clone())); return r; }
      return (await c.match(d.cle)) || r;
    }catch(e){
      const m = await c.match(d.cle);
      if(m) return m;
      throw e;
    }
  }
  const m = await c.match(d.cle);
  if(m) return m;
  const r = await fetch(req);
  if(r.ok) await c.put(d.cle, dater(r.clone()));
  return r;
}
async function reseauDabord(d, req, famille){
  const nom = NOMS[d.type], limite = LIMITES[d.type];
  if(self.navigator && navigator.onLine === false){   // hors ligne declare : pas la peine d'essayer
    const m = await repli(nom, d.cle, limite, famille);
    if(m) return m;
  }
  const reseau = fetch(req).then(async r => { if(r.ok) await stocker(nom, d.cle, r.clone(), limite); return r; });
  const r = await Promise.race([reseau, new Promise(res => setTimeout(() => res(null), DELAI_RESEAU))]).catch(() => null);
  if(r && r.ok) return r;
  const m = await repli(nom, d.cle, limite, famille);   // echec, delai depasse ou reponse en erreur
  if(m) return m;
  return reseau;   // rien en cache : la reponse du reseau, bonne ou mauvaise, ou son erreur
}
async function cacheDabord(d, req, e){
  const nom = NOMS[d.type], limite = LIMITES[d.type];
  const c = await caches.open(nom);
  const m = await c.match(d.cle);
  const maj = fetch(req).then(r => { if(r.ok) return stocker(nom, d.cle, r.clone(), limite).then(() => r); return r; });
  if(m){ e.waitUntil(maj.catch(() => {})); return m; }
  return maj;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if(req.method !== 'GET') return;
  const d = decider(req.url, {scope: SCOPE, cache: req.cache});
  if(d.type === 'reseau') return;                      // tuiles, itineraires, geocodage… : le navigateur fait comme d'habitude
  const p = d.type === 'coquille' ? coquille(d, req)
          : d.type === 'irve' ? cacheDabord(d, req, e)
          : reseauDabord(d, req, d.type === 'prix');
  e.respondWith(p.catch(() => fetch(req)));            // erreur du worker : comme sans worker
});
