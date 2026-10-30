# Signalements partagés « pompe vide » — le service

Cloudflare Worker (JavaScript, modules) + base D1 (SQLite). Il reçoit des signalements
anonymes « pompe vide » / « pompe ok » envoyés depuis ViaMinus par les personnes sur place,
et sert l'agrégat par station et carburant sur 48 h. Cette partie 1 livre le service seul ;
l'application ne l'appelle pas encore (partie 2 : boutons, affichage, hôte ajouté à la CSP).

## Routes

Toutes en JSON. CORS limité à `https://rodylog.github.io` et `http://localhost` (tout port)
— variable `ORIGINES` ; toute autre origine reçoit 403, pré-vol compris.

| Route | Entrée | Sortie |
|---|---|---|
| `POST /v1/signalement` | `{"station":"12345678","carburant":"e85","etat":"vide"}` | **201** : agrégat de la station après enregistrement ; **400** : entrée invalide ; **429** : quota ; **503** : secret `SEL` absent |
| `GET /v1/etat?ids=12345678,ES-2777,…` | jusqu'à **400** identifiants (au-delà : 400) | `{"ES-2777":{"gazole":{"vide":2,"ok":0,"dernier":1730280000}}}` — seules les stations ayant au moins un signalement sur 48 h ; `Cache-Control: public, max-age=60` |
| `GET /v1/sante` | — | `{"ok":true,"signalements":n}` (compte total, rien d'autre) |

Validation stricte : `station` = `^\d{8}$` (flux français) ou `^ES-\d{1,8}$` (Espagne) ;
`carburant` ∈ `e85, e10, sp95, sp98, gazole, gplc` (clés de `src/app.js`) ; `etat` ∈ `vide, ok` ;
aucun autre champ ; corps ≤ 1 Ko, `Content-Type: application/json`.

**Quotas** : 5 signalements par empreinte et par heure ; 1 par (empreinte, station, carburant)
par 6 h — le second remplace le premier (changer d'avis « vide » → « ok » est donc possible).

**Agrégation** (`src/agrege.js`, module pur) : par (station, carburant) sur 48 h, compte des
`vide` et des `ok` ; un `ok` plus récent que le dernier `vide` remet `vide` à zéro (la pompe est
repartie) ; `dernier` = horodatage (secondes UTC) du signalement le plus récent.

**Taille des réponses** (mesurée) : 2,3 Ko pour 40 stations signalées sur 400 demandées,
22,7 Ko si les 400 ont chacune un carburant signalé (cas extrême), 113 Ko au maximum
théorique (400 × 6 carburants). Pas de pagination.

## Confidentialité, en cinq lignes

1. Aucune adresse IP, aucun identifiant d'utilisateur, aucune position, aucun cookie : la base
   ne contient que station, carburant, état, horodatage et une empreinte.
2. L'empreinte = SHA-256(adresse IP + secret `SEL` + date UTC du jour), tronqué à 16 caractères :
   elle change chaque jour et ne permet pas de retrouver l'adresse sans le secret.
3. Elle ne sert qu'aux quotas ; elle est effacée du signalement après 6 h et la table des quotas
   est vidée au-delà de 24 h ; les signalements sont supprimés après 48 h (cron horaire) et jamais
   servis au-delà de 48 h même avant la purge.
4. Aucun journal applicatif (`observability.enabled = false`, aucun `console.log`) ; les erreurs
   internes ne sont ni consignées ni renvoyées.
5. Code public (MIT) : ce que fait le service se lit ici, tests compris.

## Déploiement (fait hors de cette session)

Prérequis : un compte Cloudflare, Node ≥ 20, `npm install` dans `worker/`.

```bash
cd worker
npx wrangler login
npx wrangler d1 create viaminus-signalements
```

Recopier le `database_id` renvoyé dans `wrangler.toml`, puis :

```bash
npx wrangler d1 migrations apply viaminus-signalements --remote
```

```bash
openssl rand -hex 32 | npx wrangler secret put SEL
```

```bash
npx wrangler deploy
```

Vérifier : `curl https://<worker>.<compte>.workers.dev/v1/sante` → `{"ok":true,"signalements":0}`.
Le déclencheur cron (`0 * * * *`, dans `wrangler.toml`) est créé par `wrangler deploy` ; il se
voit dans le tableau de bord Cloudflare (Worker → Settings → Triggers → Cron Triggers).

### Variables

| Nom | Type | Rôle |
|---|---|---|
| `SEL` | **secret** (`wrangler secret put SEL`) | sel des empreintes, ≥ 8 caractères, aléatoire et long (32 octets hexadécimaux conseillés). Le changer invalide les quotas en cours, rien d'autre. Sans lui, `POST` répond 503. |
| `ORIGINES` | variable (`[vars]` de `wrangler.toml`) | origines CORS autorisées, séparées par des virgules ; `http://localhost` vaut pour tout port. |
| `DB` | binding D1 | la base `viaminus-signalements`. |

### Coûts attendus (offre gratuite Cloudflare)

Grille publique au moment de l'écriture, non vérifiable depuis la session de développement
(réseau fermé) — à confirmer sur developers.cloudflare.com avant mise en service :
Workers gratuit = 100 000 requêtes par jour, 10 ms de CPU par requête ; D1 gratuit = 5 millions
de lignes lues et 100 000 lignes écrites par jour, 5 Go de stockage ; les déclencheurs cron
sont inclus. Ordre de grandeur du service : un `GET /v1/etat` lit au plus quelques centaines de
lignes (48 h de signalements des stations demandées, mis en cache 60 s côté navigateur et
CDN), un `POST` écrit 2 à 3 lignes. À 1 000 utilisateurs actifs par jour on reste très loin des
plafonds ; le premier plafond atteint serait celui des 100 000 lignes écrites par jour, soit de
l'ordre de 30 000 signalements quotidiens. Coût attendu : 0 €.

## Développement local

```bash
cd worker && npm install
cp .dev.vars.example .dev.vars        # puis mettre une valeur quelconque de ≥ 8 caractères
npx wrangler d1 migrations apply viaminus-signalements --local
npx wrangler dev --local --test-scheduled
```

```bash
curl -s http://localhost:8787/v1/sante
curl -s -X POST http://localhost:8787/v1/signalement -H 'Content-Type: application/json' \
     -d '{"station":"12345678","carburant":"e85","etat":"vide"}'
curl -s 'http://localhost:8787/v1/etat?ids=12345678,ES-2777'
curl -s 'http://localhost:8787/__scheduled?cron=0+*+*+*+*'   # déclenche la purge à la main
```

### Tests

```bash
npm test
```

`vitest` + `@cloudflare/vitest-plugin` (successeur de `@cloudflare/vitest-pool-workers`,
marqué obsolète par Cloudflare) : les tests tournent dans workerd avec une D1 locale, migrations
appliquées au démarrage, tables vidées avant chaque test. Couvert : validation (bons et mauvais
cas), quotas (6ᵉ de l'heure → 429, doublon → remplacement, hors fenêtre → ajout), agrégation
(`ok` après `vide`, fenêtre 48 h, stations absentes), CORS (autorisé / refusé), purge, `GET`
avec 400 et 401 identifiants, anonymat (aucune colonne ne contient l'adresse IP brute, schéma
sans colonne d'IP, d'utilisateur ni de position), routes et méthodes.

## Fichiers

| Fichier | Rôle |
|---|---|
| `wrangler.toml` | nom, binding `DB`, cron horaire, `ORIGINES`, journaux désactivés |
| `migrations/0001_signalements.sql` | tables `signalements` et `quotas`, index |
| `src/index.js` | routes, CORS, quotas, enregistrement, déclencheur cron |
| `src/agrege.js` | agrégation (pur) |
| `src/valide.js` | validation des entrées (pur) |
| `src/empreinte.js` | empreinte éphémère |
| `src/purge.js` | purge horaire |
| `src/regles.js` | constantes (quotas, fenêtres) |
| `test/` | tests (`npm test`) |
