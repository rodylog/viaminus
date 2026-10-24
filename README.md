# ⛽ ViaMinus

Carte des prix des carburants en France **avec planification optimale des pleins**,
dans **un seul fichier HTML** partageable — sans compte, sans serveur, sans tracker.

## Ce que ça fait

- **Prix en direct** : flux instantané officiel du ministère de l'Économie
  (déclaration obligatoire des stations, mise à jour ~10 min), rechargé à chaque
  ouverture et à chaque déplacement de la carte.
- **Garage multi-véhicules** : chaque véhicule a sa fiche (carburants, conso,
  autonomie d'un plein en km — ou réservoir —, dont réserve en km), mémorisée dans le
  navigateur. Aucune source ouverte ne donne la capacité du réservoir (vérifié le
  17/09/2026) : l'autonomie, que l'on connaît ou que la voiture affiche, prime.
  Import/partage d'une fiche par l'URL : `fuelpilot.html#veh=Nom|e85+e10|6.5|50|30`
  (nom|carburants|conso|réservoir|réserve), autonomie en 6ᵉ champ facultatif : `…|30|600`.
- **Plan de pleins optimal** (problème de la station-service, programmation
  dynamique sur l'état du réservoir, refaite le 24/10/2026) : on part plein, à
  chaque arrêt on achète **juste ce qu'il faut** pour atteindre le suivant (ou
  l'arrivée) ou **le plein** quand l'arrêt suivant, imposé par l'autonomie, est
  plus cher ; on minimise le carburant consommé + 0,80 € par arrêt, détours
  facturés en carburant ET en minutes. L'ancien modèle facturait à chaque arrêt
  tout le reste du trajet et poussait vers une station tardive et chère
  (Montpellier → Tours : Gannat 0,879 au lieu de Vic-le-Comte 0,859). Chaque
  étape affiche les litres à prendre et le carburant à bord. Champ **À bord**
  (km restants au départ, facultatif, non mémorisé) : le plan ne fait le plein
  au départ que s'il y est moins cher qu'en route. Carte-héros : le **carburant du
  voyage** en chiffre (plein de départ compris), « 2 arrêts · ≈ 14 min · −6,40 €
  vs pleins au prix médian » (référence = le même calcul sur les mêmes stations,
  tous les prix remplacés par la médiane du couloir), ligne de temps verticale
  (départ, étapes avec « Y aller », arrivée, retour), mini-barres par couloir
  (toucher une barre change le couloir), états dessinés (infaisable avec trois
  remèdes, aucun arrêt nécessaire, véhicule à compléter).
- **Aller-retour** : plus de case au formulaire depuis le 24/10/2026 (la flèche ⇄
  inverse départ et arrivée, c'est le geste retenu) ; le mécanisme reste pour les
  liens `#trajet=…|r` et les trajets mémorisés : le retour est un second itinéraire,
  le plan couvre la boucle (une station proche des deux sens compte deux fois),
  le plein du retour devient une étape, le tracé montre l'aller et le retour.
- **Partage du plan** : `fuelpilot.html#trajet=<départ>|<arrivée>|<couloir>|<options>&veh=…`
  — départ et arrivée tels que saisis (`encodeURIComponent` ; départ vide =
  « Ma position », jamais une coordonnée), couloir ∈ {1, 2, 5, 10, 20}, options
  = lettres `p` (sans péage) et `r` (aller-retour), puis la fiche véhicule au
  format `#veh=` (traitée en premier). Partage natif quand il existe, sinon
  copie du lien. Même bouton dans le garage pour la fiche (`#veh=`).
- **Assistant véhicule** au premier lancement (aucun réglage mémorisé, ni
  `#veh=` ni `#trajet=` dans l'URL) : trois écrans — véhicule (type, catégorie,
  carburants, autonomie d'un plein demandée en premier, conso connue ou
  **estimée**), position, c'est prêt — « Passer » à chaque écran ; accessible
  ensuite par le bouton « Assistant » du garage. Estimation de conso
  (`src/conso.js`) : médianes du catalogue ADEME Car Labelling (14/10/2026) par
  catégorie, E85 = essence × 1,25, GPL = essence × 1,20 ; utilitaire,
  camping-car, scooter et moto = ordres de grandeur dits « estimation large » ;
  hybrides sans estimation. Le garage reprend type et catégorie, bouton
  « Estimer » à côté de la conso, suppression avec « Annuler ».
- **Itinéraire** : géocodage Base Adresse Nationale + tracé Géoplateforme IGN,
  option **sans péage** (moteur `bdtopo-pgr`, autoroutes exclues), couloir
  1-20 km, les stations suivent le zoom ; flèche **⇄** entre les deux champs pour
  inverser départ et arrivée (trajet retour recalculé d'un clic). **Secours**
  (24/10/2026 : la Géoplateforme répondait 404 sur tout itinéraire) : chaque appel
  est borné à 20 s ; géocodage Géoplateforme si la BAN se tait, tracé Valhalla
  public de FOSSGIS (OpenStreetMap, sans clé, CORS ouvert) si l'IGN se tait —
  là, « sans péage » exclut vraiment les péages ; la ligne du trajet signale
  « tracé OpenStreetMap (IGN muette) ».
- **Sécurité** : toute chaîne venue de l'extérieur (flux des stations, URL `#veh=`,
  `#trajet=`) est échappée à l'ingestion ou rendue en texte (jamais en HTML) ; Content-Security-Policy calculée à la génération
  (scripts autorisés par empreinte SHA-256, pas d'`unsafe-inline`, `connect-src`
  borné aux trois API publiques). Rien ne s'exécute côté serveur : un fichier
  statique servi en https suffit.
- **Lisibilité** : vert = le moins cher affiché (ex æquo compris), bleu = dans la
  norme, noir = repères du plan (étapes, départ, arrivée), rouge = les
  10 % les plus chers du secteur, stations en **rupture** écartées, dates de
  relevé dans chaque bulle (rouge au-delà de 4 jours).
- **Position** : géolocalisation de l'appareil (contexte sécurisé requis —
  servir en https), appui long ou clic droit sur la carte pour poser le repère
  (ou menu Position : sur la carte avec réticule, une adresse), `#pos=lat,lon`
  par l'URL. Aucune coordonnée personnelle embarquée.
- **Interface** : la carte est l'écran, tout le reste flotte dessus — pilule de
  recherche, chip véhicule (garage), feuille glissante à trois crans sur mobile,
  panneau gauche de 400 px sur bureau ; fiche station, garage, options et aide
  en feuilles, jamais une nouvelle page. Fond Plan IGN vectoriel « atténué »
  (orthophoto en option), mode sombre automatique ou choisi, transformé côté
  client. « Y aller » ouvre l'application de navigation choisie au premier usage
  (lien `geo:`, Magic Earth, OsmAnd, Google Maps, Waze, OpenStreetMap).

## Mode d'emploi

`docs/guide.html` : page autonome « comment l'utiliser et le partager » (chapeau chiffré sur le
flux officiel, QR code, bouton Partager, calcul du plan, questions fréquentes), publiée avec
l'application à `/guide.html`.

## Usage

```bash
./generate.py            # écrit ~/Documents/fuelpilot.html
./generate.py --open     # puis l'ouvre dans le navigateur
```

Le fichier généré est autonome (MapLibre GL JS embarqué, empreintes SHA-384
vérifiées, worker créé en `blob:`) ; seul le chargement des prix, du style et des
tuiles IGN et du géocodage passe par le réseau. `--sans-snapshot` génère sans
interroger le flux (repli hors ligne vide) ; sans accès à unpkg, déposer
`maplibre-gl.js` et `maplibre-gl.css` (dist/ du paquet npm, version de
`generate.py`) dans `~/.cache/fuelpilot/`.

## Développement

Le gabarit vit dans `src/` et `generate.py` l'assemble en un seul fichier :

| Fichier | Rôle |
|---|---|
| `src/index.html` | structure de la page (`__APP_CSS__`, `__APP_JS__` = points d'insertion) |
| `src/app.css` | styles ; jetons dans `:root` (couleurs métier, surfaces, rayons), mode sombre, mise en page mobile / bureau |
| `src/plan.js` | algorithme du plan de pleins (DP, coût du voyage, médiane, économie), pur, exporté pour Node |
| `src/conso.js` | table de consommation embarquée (`estimerConso`), pure, exportée pour Node |
| `src/ui/icones.js` | icônes SVG inline (jeu Lucide, MIT) : `ico('nom')` |
| `src/ui/feuilles.js` | feuille glissante à trois crans (mobile), feuilles modales, Échap, focus |
| `src/ui/fond.js` | carte MapLibre : créée sans style, style IGN vectoriel posé une seule fois, transformation sombre, orthophoto, repli raster IGN puis OSM, WebGL absent |
| `src/ui/assistant.js` | assistant véhicule en trois écrans (`creerAssistant(ctx)`) |
| `src/app.js` | données, rendu (marqueurs, liste, carte-héros du plan), garage, itinéraire (aller-retour), partage, import par l'URL, position, menus |
| `src/plan.test.js`, `src/conso.test.js` | tests des modules purs |

Les scripts sont assemblés dans l'ordre de `SCRIPTS` (`generate.py`) en un seul
`<script>` : `plan.js`, `conso.js`, `ui/*.js`, puis `app.js`.

```bash
node --test src/plan.test.js src/conso.test.js   # tests des modules purs (Node ≥ 20)
```

La CSP est recalculée à chaque génération à partir des scripts réellement inline
(bibliothèque + application) ; un nouvel hôte réseau doit être ajouté à
`connect-src` / `img-src` dans `csp_meta()`. MapLibre charge tuiles, glyphes et
sprites en `fetch` (`connect-src`) et son worker en `blob:` (`worker-src`).

## Sources et licences

- Prix : [data.economie.gouv.fr](https://data.economie.gouv.fr/explore/dataset/prix-des-carburants-en-france-flux-instantane-v2/) (Licence Ouverte).
- Fonds de carte : Plan IGN / orthophotos (Géoplateforme) ; OpenStreetMap en secours
  seulement si l'IGN ne répond pas (CARTO retiré le 17/09/2026 : clé désormais exigée).
- Itinéraires : Géoplateforme IGN. Géocodage : Base Adresse Nationale.
- [MapLibre GL JS](https://maplibre.org) (BSD-3), icônes [Lucide](https://lucide.dev) (MIT). Code : MIT.

## Limites connues

- France uniquement (multi-pays étudié : Espagne intégrable — API ouverte CORS `*` ;
  Italie sans CORS ; Allemagne à clé personnelle).
- `file://` : Firefox y refuse la géolocalisation et cloisonne le stockage par
  fichier — héberger en https règle les deux.
- 400 stations chargées par zone au maximum (annoncé à l'écran quand ça tronque).
