// ViaMinus — service de signalements partagés anonymes « pompe vide ».
// Cloudflare Worker (modules) + base D1. Routes :
//   POST /v1/signalement   {station, carburant, etat}  -> agrégat de la station (201)
//   GET  /v1/etat?ids=a,b  (≤ 400 identifiants)        -> agrégats sur 48 h
//   GET  /v1/sante                                      -> {ok, signalements}
// Déclencheur cron horaire : purge (src/purge.js). Seul le gestionnaire est exporté
// (workerd refuse toute autre valeur exportée par le module d'entrée).
// Confidentialité : aucune IP, aucun identifiant d'utilisateur, aucune position,
// aucun journal ; seule une empreinte éphémère (src/empreinte.js) sert aux quotas.

import {agrege, FENETRE_AGREGAT} from "./agrege.js";
import {valideSignalement, valideIds} from "./valide.js";
import {empreinte, adresseClient} from "./empreinte.js";
import {QUOTA_HEURE, FENETRE_DOUBLON, TAILLE_CORPS_MAX} from "./regles.js";
import {purge} from "./purge.js";

const ORIGINES_DEFAUT = "https://rodylog.github.io,http://localhost";

// ---------------------------------------------------------------- CORS -------

function origineAutorisee(origine, env) {
  if (!origine) return false;
  const liste = (env.ORIGINES || ORIGINES_DEFAUT).split(",").map(s => s.trim()).filter(Boolean);
  for (const o of liste) {
    if (origine === o) return true;
    // http://localhost autorise aussi http://localhost:<port> (développement).
    if (o === "http://localhost" && /^http:\/\/localhost(:\d{1,5})?$/.test(origine)) return true;
  }
  return false;
}

function enTetesCors(origine) {
  return {
    "Access-Control-Allow-Origin": origine,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

// ---------------------------------------------------------------- réponses ---

function json(corps, statut = 200, enTetes = {}) {
  return new Response(JSON.stringify(corps), {
    status: statut,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...enTetes,
    },
  });
}

const erreur = (statut, message, enTetes) => json({erreur: message}, statut, enTetes);

// ---------------------------------------------------------------- données ----

const maintenant = () => Math.floor(Date.now() / 1000);

// Agrégats des stations demandées sur la fenêtre de 48 h. `json_each` évite la limite
// de D1 sur le nombre de paramètres liés (400 identifiants en un seul paramètre).
async function agregats(db, ids, t) {
  const {results} = await db.prepare(
    "SELECT station, carburant, etat, t FROM signalements " +
    "WHERE t > ?1 AND station IN (SELECT value FROM json_each(?2))")
    .bind(t - FENETRE_AGREGAT, JSON.stringify(ids)).all();
  return agrege(results, {maintenant: t});
}

// Enregistre un signalement. Retourne {statut, corps}.
async function enregistre(db, s, emp, t) {
  // Quota horaire : un seul ordre atomique (insertion ou incrément), puis lecture de n.
  const fenetre = Math.floor(t / 3600);
  const q = await db.prepare(
    "INSERT INTO quotas (empreinte, fenetre, n) VALUES (?1, ?2, 1) " +
    "ON CONFLICT (empreinte, fenetre) DO UPDATE SET n = n + 1 RETURNING n")
    .bind(emp, fenetre).first();
  if (q.n > QUOTA_HEURE) {
    return {statut: 429, corps: {erreur: `au plus ${QUOTA_HEURE} signalements par heure`}};
  }
  // Doublon (même empreinte, station, carburant sous 6 h) : le second remplace le premier ;
  // sinon insertion. Les deux ordres s'exécutent dans une même transaction.
  const depuis = t - FENETRE_DOUBLON;
  await db.batch([
    db.prepare("UPDATE signalements SET etat = ?1, t = ?2 " +
               "WHERE empreinte = ?3 AND station = ?4 AND carburant = ?5 AND t > ?6")
      .bind(s.etat, t, emp, s.station, s.carburant, depuis),
    db.prepare("INSERT INTO signalements (station, carburant, etat, t, empreinte) " +
               "SELECT ?1, ?2, ?3, ?4, ?5 WHERE NOT EXISTS (" +
               "SELECT 1 FROM signalements WHERE empreinte = ?5 AND station = ?1 " +
               "AND carburant = ?2 AND t > ?6)")
      .bind(s.station, s.carburant, s.etat, t, emp, depuis),
  ]);
  return {statut: 201, corps: await agregats(db, [s.station], t)};
}

// ---------------------------------------------------------------- routes -----

async function routeSignalement(requete, env, cors) {
  const type = requete.headers.get("Content-Type") || "";
  if (!/^application\/json\b/i.test(type)) {
    return erreur(400, "Content-Type: application/json attendu", cors);
  }
  const texte = await requete.text();
  if (texte.length > TAILLE_CORPS_MAX) return erreur(400, "corps trop long", cors);
  let corps;
  try { corps = JSON.parse(texte); } catch { return erreur(400, "JSON invalide", cors); }
  const v = valideSignalement(corps);
  if (!v.ok) return erreur(400, v.erreur, cors);

  if (typeof env.SEL !== "string" || env.SEL.length < 8) {
    return erreur(503, "service non configuré", cors);
  }
  const t = maintenant();
  const emp = await empreinte(adresseClient(requete), env.SEL, t);
  const r = await enregistre(env.DB, v.valeur, emp, t);
  return json(r.corps, r.statut, cors);
}

async function routeEtat(url, env, cors) {
  const v = valideIds(url.searchParams.get("ids"));
  if (!v.ok) return erreur(400, v.erreur, cors);
  const corps = await agregats(env.DB, v.valeur, maintenant());
  return json(corps, 200, {...cors, "Cache-Control": "public, max-age=60"});
}

async function routeSante(env, cors) {
  const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM signalements").first();
  return json({ok: true, signalements: r.n}, 200, cors);
}

export default {
  async fetch(requete, env) {
    const url = new URL(requete.url);
    const origine = requete.headers.get("Origin");
    let cors = {};
    if (origine !== null) {
      if (!origineAutorisee(origine, env)) return erreur(403, "origine non autorisée");
      cors = enTetesCors(origine);
    }
    if (requete.method === "OPTIONS") {
      return new Response(null, {status: 204, headers: cors});
    }
    try {
      if (url.pathname === "/v1/signalement") {
        if (requete.method !== "POST") return erreur(405, "méthode non autorisée", {...cors, Allow: "POST, OPTIONS"});
        return await routeSignalement(requete, env, cors);
      }
      if (url.pathname === "/v1/etat") {
        if (requete.method !== "GET") return erreur(405, "méthode non autorisée", {...cors, Allow: "GET, OPTIONS"});
        return await routeEtat(url, env, cors);
      }
      if (url.pathname === "/v1/sante") {
        if (requete.method !== "GET") return erreur(405, "méthode non autorisée", {...cors, Allow: "GET, OPTIONS"});
        return await routeSante(env, cors);
      }
      return erreur(404, "route inconnue", cors);
    } catch (e) {
      // Pas de journal : le message d'erreur interne n'est ni consigné ni renvoyé.
      return erreur(500, "erreur interne", cors);
    }
  },

  async scheduled(evenement, env, ctx) {
    ctx.waitUntil(purge(env.DB));
  },
};
