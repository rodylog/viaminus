// Tests d'intégration : le Worker complet sous Miniflare (workerd) avec une D1 locale,
// migrations appliquées (test/migrations.setup.js), stockage isolé par test.
import {describe, it, expect} from "vitest";
import {SELF, env, createExecutionContext, waitOnExecutionContext} from "cloudflare:test";
import worker from "../src/index.js";
import {QUOTA_HEURE, FENETRE_DOUBLON} from "../src/regles.js";
import {purge} from "../src/purge.js";
import {empreinte} from "../src/empreinte.js";

const BASE = "http://signalements.test";
const ORIGINE = "https://rodylog.github.io";
// Adresses de la plage réservée à la documentation (RFC 5737), jamais routées.
const IP = i => `192.0.2.${i}`;
const maintenant = () => Math.floor(Date.now() / 1000);

function post(corps, {ip = IP(1), origine = ORIGINE, type = "application/json", brut} = {}) {
  const enTetes = {"Content-Type": type, "CF-Connecting-IP": ip};
  if (origine) enTetes.Origin = origine;
  return SELF.fetch(`${BASE}/v1/signalement`, {
    method: "POST", headers: enTetes, body: brut ?? JSON.stringify(corps),
  });
}
function get(chemin, {origine = ORIGINE, ip = IP(1)} = {}) {
  const enTetes = {"CF-Connecting-IP": ip};
  if (origine) enTetes.Origin = origine;
  return SELF.fetch(`${BASE}${chemin}`, {headers: enTetes});
}
async function insere(lignes) {
  await env.DB.batch(lignes.map(l => env.DB.prepare(
    "INSERT INTO signalements (station, carburant, etat, t, empreinte) VALUES (?1, ?2, ?3, ?4, ?5)")
    .bind(l.station, l.carburant, l.etat, l.t, l.empreinte ?? null)));
}
const lignes = () => env.DB.prepare("SELECT station, carburant, etat, t, empreinte FROM signalements ORDER BY id").all()
                      .then(r => r.results);
const n = i => String(10_000_000 + i);

describe("GET /v1/sante", () => {
  it("répond ok avec le compte total, sans en-tête CORS si pas d'origine", async () => {
    const r = await get("/v1/sante", {origine: null});
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ok: true, signalements: 0});
    expect(r.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(r.headers.get("Content-Type")).toMatch(/^application\/json/);
    await insere([{station: "12345678", carburant: "e85", etat: "vide", t: maintenant()}]);
    expect((await (await get("/v1/sante")).json()).signalements).toBe(1);
  });
});

describe("POST /v1/signalement — validation", () => {
  it("accepte un signalement bien formé et renvoie l'agrégat de la station (201)", async () => {
    const avant = maintenant();
    const r = await post({station: "12345678", carburant: "e85", etat: "vide"});
    expect(r.status).toBe(201);
    const corps = await r.json();
    expect(Object.keys(corps)).toEqual(["12345678"]);
    expect(corps["12345678"].e85.vide).toBe(1);
    expect(corps["12345678"].e85.ok).toBe(0);
    expect(corps["12345678"].e85.dernier).toBeGreaterThanOrEqual(avant);
    expect(r.headers.get("Cache-Control")).toBe("no-store");
  });

  it("accepte une station espagnole", async () => {
    const r = await post({station: "ES-2777", carburant: "gazole", etat: "ok"});
    expect(r.status).toBe(201);
    expect((await r.json())["ES-2777"].gazole).toMatchObject({vide: 0, ok: 1});
  });

  it("refuse les corps invalides (400) sans rien enregistrer", async () => {
    const cas = [
      [{station: "1234567", carburant: "e85", etat: "vide"}, {}],
      [{station: "12345678", carburant: "diesel", etat: "vide"}, {}],
      [{station: "12345678", carburant: "e85", etat: "plein"}, {}],
      [{station: "12345678", carburant: "e85", etat: "vide", extra: 1}, {}],
      [[{station: "12345678", carburant: "e85", etat: "vide"}], {}],
      [null, {brut: "pas du json"}],
      [null, {brut: "x".repeat(2000)}],
      [{station: "12345678", carburant: "e85", etat: "vide"}, {type: "text/plain"}],
    ];
    for (const [corps, opts] of cas) {
      const r = await post(corps, opts);
      expect(r.status, JSON.stringify(corps ?? opts)).toBe(400);
      expect(typeof (await r.json()).erreur).toBe("string");
    }
    expect(await lignes()).toHaveLength(0);
  });

  it("répond 503 si le secret SEL manque (jamais d'empreinte sans sel)", async () => {
    const req = new Request(`${BASE}/v1/signalement`, {
      method: "POST", headers: {"Content-Type": "application/json", "CF-Connecting-IP": IP(1)},
      body: JSON.stringify({station: "12345678", carburant: "e85", etat: "vide"}),
    });
    const r = await worker.fetch(req, {...env, SEL: undefined});
    expect(r.status).toBe(503);
    expect(await lignes()).toHaveLength(0);
  });
});

describe("POST /v1/signalement — quotas", () => {
  it(`${QUOTA_HEURE} signalements par heure et par empreinte, le suivant → 429`, async () => {
    for (let i = 0; i < QUOTA_HEURE; i++) {
      const r = await post({station: n(i), carburant: "e85", etat: "vide"}, {ip: IP(10)});
      expect(r.status, `signalement ${i + 1}`).toBe(201);
    }
    const r6 = await post({station: n(99), carburant: "e85", etat: "vide"}, {ip: IP(10)});
    expect(r6.status).toBe(429);
    expect((await r6.json()).erreur).toMatch(/par heure/);
    expect(await lignes()).toHaveLength(QUOTA_HEURE);
    // Une autre adresse n'est pas affectée.
    expect((await post({station: n(99), carburant: "e85", etat: "vide"}, {ip: IP(11)})).status).toBe(201);
  });

  it("doublon (même empreinte, station, carburant sous 6 h) : le second remplace le premier", async () => {
    expect((await post({station: "12345678", carburant: "e85", etat: "vide"}, {ip: IP(20)})).status).toBe(201);
    const r = await post({station: "12345678", carburant: "e85", etat: "ok"}, {ip: IP(20)});
    expect(r.status).toBe(201);
    expect((await r.json())["12345678"].e85).toMatchObject({vide: 0, ok: 1});
    const l = await lignes();
    expect(l).toHaveLength(1);
    expect(l[0].etat).toBe("ok");
    // Même station, autre carburant : nouvelle ligne.
    expect((await post({station: "12345678", carburant: "e10", etat: "vide"}, {ip: IP(20)})).status).toBe(201);
    expect(await lignes()).toHaveLength(2);
  });

  it("passé 6 h, un nouveau signalement de la même empreinte s'ajoute au lieu de remplacer", async () => {
    const t = maintenant();
    const emp = await empreinte(IP(30), env.SEL, t);
    await insere([{station: "12345678", carburant: "e85", etat: "vide", t: t - FENETRE_DOUBLON - 60, empreinte: emp}]);
    const r = await post({station: "12345678", carburant: "e85", etat: "vide"}, {ip: IP(30)});
    expect(r.status).toBe(201);
    expect((await r.json())["12345678"].e85.vide).toBe(2);
    expect(await lignes()).toHaveLength(2);
  });
});

describe("GET /v1/etat — agrégation", () => {
  it("ok après vide remet vide à zéro ; un vide plus récent recompte tous les vide", async () => {
    const t = maintenant();
    // Horodatages posés à la main (passés) pour un ordre certain : la seconde est l'unité du service.
    await insere([
      {station: "12345678", carburant: "e85", etat: "vide", t: t - 300},
      {station: "12345678", carburant: "e85", etat: "vide", t: t - 200},
      {station: "12345678", carburant: "e85", etat: "ok", t: t - 100},
    ]);
    let a = await (await get("/v1/etat?ids=12345678")).json();
    expect(a["12345678"].e85).toEqual({vide: 0, ok: 1, dernier: t - 100});
    // Un nouveau « vide » par l'API (daté de maintenant) : la pompe est de nouveau signalée vide.
    expect((await post({station: "12345678", carburant: "e85", etat: "vide"}, {ip: IP(42)})).status).toBe(201);
    a = await (await get("/v1/etat?ids=12345678")).json();
    expect(a["12345678"].e85.vide).toBe(3);
    expect(a["12345678"].e85.ok).toBe(1);
    expect(a["12345678"].e85.dernier).toBeGreaterThanOrEqual(t);
  });

  it("fenêtre de 48 h : un signalement plus vieux n'est jamais servi, même avant la purge", async () => {
    const t = maintenant();
    await insere([
      {station: "11111111", carburant: "e85", etat: "vide", t: t - 49 * 3600},
      {station: "22222222", carburant: "e85", etat: "vide", t: t - 47 * 3600},
    ]);
    const r = await get("/v1/etat?ids=11111111,22222222,33333333");
    expect(r.status).toBe(200);
    expect(r.headers.get("Cache-Control")).toBe("public, max-age=60");
    const a = await r.json();
    expect(Object.keys(a)).toEqual(["22222222"]);      // 11111111 trop vieux, 33333333 sans signalement
    expect(a["22222222"].e85).toEqual({vide: 1, ok: 0, dernier: t - 47 * 3600});
  });

  it("plusieurs stations et carburants, dont une espagnole", async () => {
    await post({station: "12345678", carburant: "gazole", etat: "vide"}, {ip: IP(50)});
    await post({station: "ES-2777", carburant: "gazole", etat: "vide"}, {ip: IP(51)});
    await post({station: "ES-2777", carburant: "gazole", etat: "vide"}, {ip: IP(52)});
    await post({station: "ES-2777", carburant: "sp95", etat: "ok"}, {ip: IP(53)});
    const a = await (await get("/v1/etat?ids=12345678,ES-2777,87654321")).json();
    expect(Object.keys(a).sort()).toEqual(["12345678", "ES-2777"]);
    expect(a["ES-2777"].gazole).toMatchObject({vide: 2, ok: 0});
    expect(a["ES-2777"].sp95).toMatchObject({vide: 0, ok: 1});
    expect(a["12345678"].gazole).toMatchObject({vide: 1, ok: 0});
  });

  it("400 identifiants acceptés (réponse mesurée), 401 refusés, ids absent ou invalide refusé", async () => {
    const ids = Array.from({length: 400}, (_, i) => n(i));
    const t = maintenant();
    await insere(ids.map(station => ({station, carburant: "e85", etat: "vide", t})));
    const r400 = await get(`/v1/etat?ids=${ids.join(",")}`);
    expect(r400.status).toBe(200);
    const texte = await r400.text();
    expect(Object.keys(JSON.parse(texte))).toHaveLength(400);
    console.log(`taille de la réponse, 400 stations × 1 carburant signalé : ${texte.length} octets`);
    expect(texte.length).toBeLessThan(25 * 1024);   // pire cas réaliste ; le cas courant est bien plus petit
    const r401 = await get(`/v1/etat?ids=${[...ids, n(400)].join(",")}`);
    expect(r401.status).toBe(400);
    expect((await r401.json()).erreur).toMatch(/400/);
    expect((await get("/v1/etat")).status).toBe(400);
    expect((await get("/v1/etat?ids=")).status).toBe(400);
    expect((await get("/v1/etat?ids=12345678,bidon")).status).toBe(400);
  });
});

describe("CORS", () => {
  it("pré-vol accepté pour l'origine publiée et pour localhost (tout port)", async () => {
    for (const o of [ORIGINE, "http://localhost", "http://localhost:5173"]) {
      const r = await SELF.fetch(`${BASE}/v1/signalement`, {
        method: "OPTIONS",
        headers: {Origin: o, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type"},
      });
      expect(r.status, o).toBe(204);
      expect(r.headers.get("Access-Control-Allow-Origin")).toBe(o);
      expect(r.headers.get("Access-Control-Allow-Methods")).toContain("POST");
      expect(r.headers.get("Access-Control-Allow-Headers")).toMatch(/content-type/i);
      expect(r.headers.get("Vary")).toBe("Origin");
    }
  });

  it("origine refusée : 403 au pré-vol comme à la requête, rien d'enregistré", async () => {
    for (const o of ["https://exemple.invalid", "http://rodylog.github.io", "https://rodylog.github.io.evil.invalid",
                     "https://localhost", "http://localhost.evil.invalid", "null"]) {
      const pv = await SELF.fetch(`${BASE}/v1/etat`, {method: "OPTIONS", headers: {Origin: o}});
      expect(pv.status, o).toBe(403);
      expect(pv.headers.get("Access-Control-Allow-Origin")).toBeNull();
      const r = await post({station: "12345678", carburant: "e85", etat: "vide"}, {origine: o});
      expect(r.status, o).toBe(403);
    }
    expect(await lignes()).toHaveLength(0);
  });

  it("réponses normales portent l'en-tête CORS de l'origine autorisée", async () => {
    const r = await get("/v1/sante", {origine: "http://localhost:8000"});
    expect(r.status).toBe(200);
    expect(r.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:8000");
  });
});

describe("Purge (déclencheur cron)", () => {
  it("supprime > 48 h, efface l'empreinte > 6 h, garde le reste, vide les quotas > 24 h", async () => {
    const t = maintenant();
    await insere([
      {station: "11111111", carburant: "e85", etat: "vide", t: t - 49 * 3600, empreinte: "aaaaaaaaaaaaaaaa"},
      {station: "22222222", carburant: "e85", etat: "vide", t: t - 7 * 3600, empreinte: "bbbbbbbbbbbbbbbb"},
      {station: "33333333", carburant: "e85", etat: "vide", t: t - 3600, empreinte: "cccccccccccccccc"},
    ]);
    const f = Math.floor(t / 3600);
    await env.DB.batch([
      env.DB.prepare("INSERT INTO quotas VALUES ('aaaaaaaaaaaaaaaa', ?1, 3)").bind(f - 25),
      env.DB.prepare("INSERT INTO quotas VALUES ('cccccccccccccccc', ?1, 1)").bind(f),
    ]);
    const ctx = createExecutionContext();
    await worker.scheduled({cron: "0 * * * *", scheduledTime: Date.now()}, env, ctx);
    await waitOnExecutionContext(ctx);
    const l = await lignes();
    expect(l.map(x => [x.station, x.empreinte])).toEqual([
      ["22222222", null], ["33333333", "cccccccccccccccc"],
    ]);
    const q = (await env.DB.prepare("SELECT empreinte FROM quotas ORDER BY empreinte").all()).results;
    expect(q).toEqual([{empreinte: "cccccccccccccccc"}]);
  });

  it("purge() est idempotente sur une base vide", async () => {
    await purge(env.DB);
    await purge(env.DB);
    expect((await (await get("/v1/sante")).json()).signalements).toBe(0);
  });
});

describe("Anonymat", () => {
  it("aucune colonne d'aucune table ne contient l'adresse IP brute", async () => {
    const ip = "192.0.2.77";
    expect((await post({station: "12345678", carburant: "e85", etat: "vide"}, {ip})).status).toBe(201);
    expect((await post({station: "ES-42", carburant: "sp98", etat: "ok"}, {ip})).status).toBe(201);
    const tables = (await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'").all())
      .results.map(r => r.name);
    expect(tables).toEqual(expect.arrayContaining(["signalements", "quotas"]));
    let lignesVues = 0;
    for (const table of tables) {
      const {results} = await env.DB.prepare(`SELECT * FROM "${table}"`).all();
      for (const ligne of results) {
        lignesVues++;
        const texte = JSON.stringify(ligne);
        expect(texte, `${table} : ${texte}`).not.toContain(ip);
        expect(texte).not.toContain("192.0.2");
      }
    }
    expect(lignesVues).toBeGreaterThanOrEqual(3);  // 2 signalements + 1 ligne de quota
    const [{empreinte: e}] = await lignes();
    expect(e).toMatch(/^[0-9a-f]{16}$/);
  });

  it("le schéma ne prévoit aucune colonne d'IP, d'utilisateur ou de position", async () => {
    const colonnes = (await env.DB.prepare(
      "SELECT m.name AS tbl, p.name AS col FROM sqlite_master m JOIN pragma_table_info(m.name) p " +
      "WHERE m.type = 'table' AND m.name IN ('signalements', 'quotas')").all()).results.map(r => r.col);
    expect(colonnes.sort()).toEqual(["carburant", "empreinte", "empreinte", "etat", "fenetre", "id", "n", "station", "t"]);
  });
});

describe("Routes et méthodes", () => {
  it("404 sur route inconnue, 405 sur mauvaise méthode", async () => {
    expect((await get("/")).status).toBe(404);
    expect((await get("/v1/autre")).status).toBe(404);
    expect((await get("/v1/signalement")).status).toBe(405);
    expect((await SELF.fetch(`${BASE}/v1/etat?ids=12345678`, {method: "POST"})).status).toBe(405);
    expect((await SELF.fetch(`${BASE}/v1/sante`, {method: "DELETE"})).status).toBe(405);
  });
});
