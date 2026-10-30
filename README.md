# ⛽ ViaMinus

Carte des prix des carburants en France — et en Espagne dès que la carte ou le trajet
la touche — **avec planification optimale des pleins** — et,
pour un véhicule électrique, les bornes de recharge et le **plan de charge** —,
dans **un seul fichier HTML** partageable — sans compte, sans serveur, sans tracker.

## Ce que ça fait

- **Prix en direct** : flux instantané officiel du ministère de l'Économie
  (déclaration obligatoire des stations, mise à jour ~10 min), rechargé à chaque
  ouverture et à chaque déplacement de la carte.
- **Espagne sur la carte** (28/10/2026) : dès que l'emprise ou le couloir du trajet croise
  une province espagnole, les stations espagnoles s'ajoutent aux françaises — même tableau,
  même liste (tri par prix, badge `ES`, enseigne, horaires résumés), même carte, même fiche
  (« Y aller », ouvert / fermé à cette heure), plafond de 400 commun (annoncé quand ça
  tronque) et **même plan de pleins** (`src/plan.js` inchangé : un Perpignan → Barcelone fait
  le plein du bon côté de la frontière). Source : API du ministère espagnol, interrogée
  **par province** (`FiltroProvincia/{id}`, quelques centaines de ko ; le fichier national
  pèse 12 Mo) à partir de la table `src/es-provincias.json` (52 provinces, boîtes
  englobantes calculées le 28/10/2026) : trois provinces à la fois au plus (au-delà,
  « zoomez »), cache mémoire de 30 min par province, réponses obsolètes abandonnées comme
  pour le flux français ; en cas d'échec, « prix espagnols indisponibles » dans l'état et le
  reste continue. Correspondance des carburants : gazole ← Gasóleo A, SP95 ← Gasolina 95 E5,
  SP98 ← Gasolina 98 E5, E10 ← Gasolina 95 E10, E85 ← Gasolina 95 E85, GPLc ← GLP ; les
  nombres du flux sont des textes à virgule (`"1,999"`), vide = non vendu (null, jamais 0) ;
  seules les stations en vente au public (`Tipo Venta` P) sont gardées. La date des prix
  espagnols est l'horodatage **global** du fichier (`Fecha`), pas un relevé par station.
  `src/es.js` (pur, testé) normalise chaque station espagnole à **la forme exacte** d'une
  station française, plus `pays`, `enseigne` et `horario`.
- **Garage multi-véhicules** : chaque véhicule a sa fiche (carburants, conso,
  autonomie d'un plein en km — ou réservoir —, dont réserve en km), mémorisée dans le
  navigateur. Aucune source ouverte ne donne la capacité du réservoir (vérifié le
  17/09/2026) : l'autonomie, que l'on connaît ou que la voiture affiche, prime.
  Import/partage d'une fiche par l'URL : `fuelpilot.html#veh=Nom|e85+e10|6.5|50|30`
  (nom|carburants|conso|réservoir|réserve), autonomie en 6ᵉ champ facultatif : `…|30|600`.
  **Véhicule électrique** (30/10/2026) : 7ᵉ champ `E<batterie kWh>,<kWh/100 km>,<kW DC>,<kW AC>,<prise>,<réserve %>,<départ %>`,
  ex. `#veh=Citadine%20%C3%A9lectrique|||||E50,17,150,11,ccs,15,80` (prise `ccs`, `chademo`
  ou `t2` ; champ vide = défaut : CCS, 15 %, 80 %). Un lien ancien à 5 ou 6 champs reste lu tel
  quel ; une page antérieure ignore un lien à 7 champs sans le lire de travers (`src/partage.js`).
- **Plan de pleins optimal** (problème de la station-service, programmation
  dynamique sur l'état du réservoir, refaite le 24/10/2026) : on part plein, à
  chaque arrêt on achète **juste ce qu'il faut** pour atteindre le suivant (ou
  l'arrivée) ou **le plein** quand l'arrêt suivant, imposé par l'autonomie, est
  plus cher ; on minimise le carburant consommé + 0,80 € par arrêt, détours
  facturés en carburant ET en minutes. L'ancien modèle facturait à chaque arrêt
  tout le reste du trajet et poussait vers une station tardive et chère
  (Montpellier → Tours : Gannat 0,879 au lieu de Vic-le-Comte 0,859). Chaque
  étape affiche les litres à prendre et le carburant à bord. Champ **Réservoir
  au départ** (km ou litres — l'unité est mémorisée, la valeur non), demandé
  d'office au lancement de chaque nouveau trajet (« Il vous reste combien dans
  le réservoir ? », Valider / Passer = plein ; jamais sur un lien partagé) : le
  plan ne fait le plein au départ que s'il y est moins cher qu'en route.
  Carte-héros : le **carburant du
  voyage** en chiffre (plein de départ compris), « 2 arrêts · ≈ 14 min · votre
  prix 0,85 €/L · −11,40 € vs pleins au plus cher (1,05 €/L) » (référence = le
  même calcul sur les mêmes stations, tous les prix remplacés par le plus cher du
  trajet — plus de médiane, Eric 24/10/2026), ligne de temps verticale
  (départ, étapes avec « Y aller », arrivée, retour), états dessinés (infaisable
  avec ses remèdes, aucun arrêt nécessaire, véhicule à compléter).
- **Corrections sur place** (26/10/2026, Lodève : E85 annoncé par le flux officiel,
  pompe vide) : dans la fiche station, chaque carburant a « Corriger » — prix vu à la
  pompe, « Pompe vide », « Revenir au prix déclaré » ; et chaque arrêt du plan a
  « Pompe vide ? » (refait le plan sans elle) et « si c'est vide : » la station la plus
  proche atteignable avec ce qui reste (route ≈ 1,3 × vol d'oiseau). Gardé sur
  l'appareil (`fuelpilot:corrections`), tant que la station ne déclare rien de plus
  récent, 48 h au plus ; une station signalée vide reste sur la carte, grisée.
  **Prix figé** : carburant non redéclaré depuis 14 jours alors que la station déclare
  ses autres carburants (12,6 % des stations E85 au 26/10) — le plan l'évite dès
  qu'une autre fait l'affaire (surcoût fictif de 15 € par arrêt) et l'écrit s'il doit
  y passer ; chaque arrêt affiche la date de son prix. Limite connue : le flux officiel
  peut annoncer un carburant absent (Lodève, 26/10 : E85 annoncé, pompe vide). Aucune
  source automatique indépendante n'existe : les pages magasin des enseignes (E.Leclerc,
  Auchan) reprennent la même déclaration (255 blocs Leclerc sur 298 identiques au flux,
  sondage du 26/10), U et Intermarché citent le flux, Waze et Zagaz sont des saisies
  d'utilisateurs souvent anciennes. Seul le terrain (signalement sur place) fait foi.
- **Faire un détour ?** (26/10/2026, remplace le sélecteur de couloir du
  formulaire et les mini-barres) : le plan est refait pour 1, 2, 5, 10 et 20 km
  de la route ; ne restent que les choix utiles (faisables, aucun autre à la fois
  aussi rapide et moins cher), quatre au plus, du plus rapide au moins cher —
  « Sans détour », « +6 min de détour »… avec le carburant du voyage et le gain.
  Temps = 5 min par arrêt + détour à ~50 km/h, plein de départ compris (aller le
  chercher hors de la route compte aussi). « Conseillé » : on part du plus rapide
  et on accepte chaque détour plus long tant qu'il rapporte au moins
  `VALEUR_HEURE` = 10 €/h ; c'est le choix affiché à chaque trajet lancé à la
  main (un lien partagé garde le sien ; toucher une ligne fige le choix). Le
  `select#couloir`, caché, reste la source de vérité (lien, liste, carte). Le plan
  reste affiché même si la zone visible ne montre aucune station.
- **Aller-retour** : plus de case au formulaire depuis le 24/10/2026 (la flèche ⇄
  inverse départ et arrivée, c'est le geste retenu) ; le mécanisme reste pour les
  liens `#trajet=…|r` et les trajets mémorisés : le retour est un second itinéraire,
  le plan couvre la boucle (une station proche des deux sens compte deux fois),
  le plein du retour devient une étape, le tracé montre l'aller et le retour.
- **Partage du plan** : `fuelpilot.html#trajet=<départ>|<arrivée>|<détour>|<options>&veh=…`
  — départ et arrivée tels que saisis (`encodeURIComponent` ; départ vide =
  « Ma position », jamais une coordonnée), détour ∈ {1, 2, 5, 10, 20} km, options
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
- **Départ et lieux récents** (26/10/2026) : départ « Ma position » écrit d'office
  (en bleu, tout sélectionné au toucher : taper remplace ; vide, il y revient) ; les
  8 derniers lieux saisis à la main (arrivée, et départ s'il n'est pas « Ma
  position ») sont proposés sous le champ actif, filtrés par la saisie — un toucher
  sur l'arrivée relance le trajet, la croix efface le lieu. Clé `fuelpilot:lieux`
  du stockage local, rendue en texte ; jamais les trajets importés par lien.
- **Itinéraire** : géocodage Base Adresse Nationale + tracé Géoplateforme IGN,
  option **sans péage** (moteur `bdtopo-pgr`, autoroutes exclues), stations
  chargées à 20 km de la route puis filtrées par le détour choisi, elles suivent le zoom ; flèche **⇄** entre les deux champs pour
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
  10 % les plus chers du secteur, stations en **rupture** du carburant choisi
  écartées du classement et du plan mais montrées en **gris** avec la date de début
  (ruptures temporaires de moins de 90 jours ; le flux vide leur prix, Waze garde
  le dernier prix saisi par ses utilisateurs), dates de
  relevé dans chaque bulle (rouge au-delà de 4 jours).
- **Position** : géolocalisation de l'appareil (contexte sécurisé requis —
  servir en https), appui long ou clic droit sur la carte pour poser le repère
  (ou menu Position : sur la carte avec réticule, une adresse), `#pos=lat,lon`
  par l'URL. Aucune coordonnée personnelle embarquée.
- **Véhicule électrique** (phase 2, 30/10/2026) : énergie « électrique » dans l'assistant
  (écran 1, après le type) ou le garage — batterie utile (kWh), consommation en kWh/100 km
  pré-remplie par catégorie et modifiable (`estimerConsoElec`, `src/conso.js` : ordres de
  grandeur WLTP majorés pour la route), puissance de charge maximale en continu (50 · 100 ·
  150 · 250 kW · autre) et en alternatif (7,4 · 11 · 22 kW), prise (**CCS par défaut**,
  CHAdeMO, Type 2 seule), réserve (15 %), état de charge au départ (80 %). Le chip du garage
  dit « électrique · 50 kWh · CCS » ; un garage mixte (une E85, une électrique) bascule
  stations / bornes et plan de pleins / plan de charge selon le véhicule actif, le plan de
  pleins thermique ne change pas d'un pixel.
- **Bornes de recharge** (Base nationale des IRVE, fichiers `data/irve/<dep>.json` servis à côté
  de la page, cf. Développement) : visibles d'office pour un véhicule électrique (à la place
  des stations), en option pour un thermique (« Afficher les bornes électriques », menu
  Options, désactivée par défaut). Chargement **par département** d'après `index.json` (bbox
  par département) : les départements qui croisent l'emprise, **4 au plus à la fois** (au-delà :
  « zoomez pour voir les bornes ») ; pour un trajet, tous ceux que croise le couloir de 20 km,
  par lots de 4 ; cache en mémoire, réponses obsolètes abandonnées à chaque déplacement. En
  `file://` ou si `index.json` est injoignable : « bornes indisponibles hors ligne », rien
  d'autre ne casse. Marqueur éclair coloré par puissance maximale (violet foncé ≥ 150 kW,
  violet 50 à 149, violet clair < 50, gris pointillé inconnue — une teinte à part, qui ne dit
  jamais un prix), filtres puissance minimale (7 · 22 · 50 · 150 kW) / gratuit / carte bancaire /
  ouvert maintenant ; pour un véhicule électrique, seules les bornes où l'on peut se brancher
  (prise DC du véhicule, ou Type 2, ou prises inconnues) sont montrées. Le plafond de 400
  éléments vaut pour le total affiché (stations + bornes) et l'écran le dit quand ça tronque.
  Liste et fiche : nom, opérateur, points de charge, puissance max et min, prises, paiement
  (gratuit / à l'acte / carte bancaire), horaires (« 24h/24 » ou texte, « ouvert maintenant »),
  accès, PMR, « mis à jour il y a N jours » (au-delà de 365 jours : « donnée ancienne »),
  « Y aller » identique à celui des stations.
- **Plan de charge** (véhicule électrique + trajet) : `optimiserPlanElectrique` sur les bornes
  du couloir passant les filtres ; carte-héros : grand chiffre = **temps de charge total**,
  sous-ligne = nombre d'arrêts, pourcentage à l'arrivée, kWh rechargés ; ligne de temps avec
  les arrêts numérotés (aussi sur la carte : rond noir numéroté) — borne, km, puissance
  effective, détour, kWh, minutes, pourcentage avant / après, « Y aller » ; couloir (1 à 20 km)
  et état de charge au départ réglables sous le chiffre. « Aucune recharge nécessaire » :
  carte-héros positive (pourcentage et km restants à l'arrivée). Infaisable : message et
  remèdes concrets (retirer la puissance minimale ou les filtres, accepter la charge lente
  Type 2, élargir le couloir, réduire la réserve, partir à 100 %, revoir la batterie), jamais
  un écran vide. Il optimise le **temps**, pas l'euro (aucun prix au kWh dans les données
  ouvertes).
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
tuiles IGN et du géocodage passe par le réseau. Le snapshot de repli embarqué reste
**France seulement** (aucun prix espagnol embarqué). `--sans-snapshot` génère sans
interroger le flux (repli hors ligne vide) ; sans accès à unpkg, déposer
`maplibre-gl.js` et `maplibre-gl.css` (dist/ du paquet npm, version de
`generate.py`) dans `~/.cache/fuelpilot/`.

## Développement

Le gabarit vit dans `src/` et `generate.py` l'assemble en un seul fichier :

| Fichier | Rôle |
|---|---|
| `src/index.html` | structure de la page (`__APP_CSS__`, `__APP_JS__` = points d'insertion) |
| `src/app.css` | styles ; jetons dans `:root` (couleurs métier, surfaces, rayons), mode sombre, mise en page mobile / bureau |
| `src/plan.js` | algorithme du plan de pleins (DP sur l'état du réservoir, coût du voyage, prix moyen, économie vs le plus cher) et du plan de charge électrique (`optimiserPlanElectrique`, DP sur l'énergie à bord, temps de charge), pur, exporté pour Node |
| `src/conso.js` | tables de consommation embarquées (`estimerConso` en L/100 km, `estimerConsoElec` en kWh/100 km), pures, exportées pour Node |
| `src/irve.js` | bornes de recharge : lecture des champs Etalab (`parseBool`, `parsePuissance`, `parseXY`), horaires (`ouvertA`), compatibilité véhicule / borne, filtres, couloir le long d'un trajet (`bornesSurTrajet`) ; pur, exporté pour Node |
| `src/bornes.js` | bornes côté interface : `departementsPourEmprise(index, bbox)`, `classePuissance` (rapide / moyen / lent / inconnu), `libellePuissance`, `libelleHoraires`, `libelleMaj` (donnée ancienne > 365 j), `branchable`, `libellePrises`, `libellePaiement` ; pur, exporté pour Node |
| `src/partage.js` | format `#veh=` : `vehVersParam` / `paramVersVeh`, format historique et 7ᵉ champ électrique, lien ancien toujours lu ; pur, exporté pour Node |
| `src/es.js` | Espagne : `nombreES`, `normaliserStationES` (forme d'une station française), `ouvertA` / `resumerHorario` (horaires `L-S: 06:00-22:00; D: …`), `provincesPourEmprise` / `enEspagne` ; pur, exporté pour Node |
| `src/es-provincias.json` | les 52 provinces : id → [nom, nb de stations, latMin, latMax, lonMin, lonMax], calculées le 28/10/2026 depuis le fichier complet ; inliné à la génération |
| `src/fixtures/es-echantillon-girona.json` | réponse réelle `FiltroProvincia/17` tronquée à 3 stations (tests) |
| `src/fixtures/irve-echantillon-34.csv`, `src/fixtures/irve-34.json` | 12 points de charge réels de l'Hérault (fichier du 28/10/2026) + 1 ligne synthétique (code postal seulement dans l'adresse), et leur sortie par `irve_build.py` : fixture des tests, seule donnée IRVE commitée |
| `src/ui/icones.js` | icônes SVG inline (jeu Lucide, MIT) : `ico('nom')` |
| `src/ui/feuilles.js` | feuille glissante à trois crans (mobile), feuilles modales, Échap, focus |
| `src/ui/fond.js` | carte MapLibre : créée sans style, style IGN vectoriel posé une seule fois, transformation sombre, orthophoto, repli raster IGN puis OSM, WebGL absent |
| `src/ui/assistant.js` | assistant véhicule en trois écrans (`creerAssistant(ctx)`), énergie thermique ou électrique |
| `src/app.js` | données, rendu (`rendu()` aiguille vers `renduCarburant()` — stations, plan de pleins, inchangé — ou `renduElec()` — bornes, plan de charge), garage, itinéraire (aller-retour), partage, import par l'URL, position, menus, bornes (`chargerBornes`, `renduBornes`, `ouvrirBorne`) |
| `src/plan.test.js`, `src/conso.test.js`, `src/irve.test.js`, `src/plan-elec.test.js`, `src/bornes.test.js`, `src/partage.test.js`, `src/es.test.js` | tests des modules purs |
| `irve_build.py`, `irve_build_test.py` | Base nationale des IRVE (CSV, 114 Mo) → `data/irve/<dep>.json` + `index.json`, bibliothèque standard seule ; tests `unittest` du département et de l'emprise |

Les scripts sont assemblés dans l'ordre de `SCRIPTS` (`generate.py`) en un seul
`<script>` : `plan.js`, `conso.js`, `irve.js`, `bornes.js`, `partage.js`, `es.js`, `ui/*.js`, puis `app.js`.

```bash
node --test src/*.test.js   # modules purs (Node ≥ 20)
```

Les bornes se chargent par `fetch` d'URL **relatives** (`data/irve/index.json`,
`data/irve/<dep>.json`), donc sous `connect-src 'self'` : aucun hôte ajouté à la CSP. Déposer
la sortie d'`irve_build.py` à côté de la page (`<dossier de fuelpilot.html>/data/irve/`).

### Bornes de recharge (phase 1, 28/10/2026 : données, module pur, plan de charge ; phase 2, 30/10/2026 : interface)

L'électricité est traitée comme un carburant : un véhicule électrique a sa fiche
(`batterieKwh`, `consoKwh100`, `kwMaxDC`, `kwMaxAC`, prise `ccs` / `chademo` / `t2`,
réserve 15 %, départ 80 %), les bornes publiques sont sur la carte et le trajet a
son **plan de charge** (où s'arrêter, combien de temps, pourcentage à l'arrivée). La
phase 1 a livré la mécanique, la phase 2 l'interface (voir « Ce que ça fait »).

```bash
python3 irve_build.py consolidation-etalab-schema-irve-statique-v-2.3.1-AAAAMMJJ.csv --sortie data/irve/
python3 irve_build_test.py   # tests du script (département, emprise)
```

Mesuré le 30/10/2026 sur le fichier du jour (164 078 lignes, 114 Mo) : 3,5 s, 748 Mo de
mémoire, 151 254 PDC après 11 987 doublons retirés, 837 rejets hors France, 8 185 puissances
inconnues, 49 662 stations, 13,8 Mo écrits (Hérault : 443 stations, 135 Ko).

- `data/irve/<dep>.json` : tableau de stations, une station = plusieurs points de charge
  regroupés par `id_station_itinerance` (à défaut nom + lon/lat à 4 décimales), clés
  courtes : `{"id","n" (nom),"op" (opérateur ou enseigne),"lon","lat","pdc" (lignes
  comptées, pas `nbre_pdc`),"kw" (max),"kwmin","ac" (Type 2 ou EF),"ccs","chademo",
  "gratuit","cb","acte","h" (horaires bruts normalisés),"pmr","acces" (`libre` / `reserve`),
  "maj"}`. Booléens à trois états : `true`, `false`, `null` = inconnu (jamais faux par défaut).
- `data/irve/index.json` : `{"genere","source","departements":{"34":{"stations","pdc","octets","bbox"}}}`
  — la `bbox` sert à charger les bons départements depuis l'emprise de la carte. Elle est
  **robuste** : les stations à plus de 150 km de la médiane de leur département (coordonnées
  aberrantes : 8 PDC de l'Hérault étaient à Brest ou Paris le 30/10/2026) n'entrent pas dans
  son calcul, comptées dans le rapport.
- Département, dans l'ordre (49 % des stations tombaient dans `00.json` avant, 30/10/2026) :
  `consolidated_code_postal`, puis `code_insee_commune` (2A/2B compris), puis le dernier groupe
  de 5 chiffres d'`adresse_station` (`20xxx` → 2A si latitude < 42,0, sinon 2B), puis l'emprise
  robuste des départements déjà attribués qui contient le point (la plus petite en cas de
  chevauchement) ; `00.json` ne garde que l'inattribuable. Le rapport compte chaque voie.
- `data/irve/` est dans `.gitignore` : artefact de build régénéré hors GitHub, servi **à côté
  de la page** (`connect-src 'self'`), jamais embarqué dans le HTML (112 Mo de CSV, la page
  doit rester sous 1,6 Mo). Seule exception commitée : `src/fixtures/irve-34.json`.
- Pièges du fichier réel absorbés (mesurés le 28/10/2026) : booléens `True`/`true`/`TRUE`/`1`/vide,
  `coordonneesXY` avec ou sans espace, coordonnées consolidées fausses (`consolidated_is_lon_lat_correct`),
  rejet hors France métropolitaine et Corse, puissances en watts (> 1 000 → ÷ 1 000), doublons
  d'`id_pdc_itinerance` entre jeux (`date_maj` la plus récente gardée), accents cassés
  (« Accčs libre »). Toute chaîne est échappée à l'ingestion
  (caractères de contrôle et chevrons retirés, longueur bornée) et sera rendue en texte.
- Le script affiche un rapport : lignes lues, rejets, doublons, PDC, stations, département par
  voie, puissances inconnues, stations exclues des emprises, taille écrite.

La CSP est recalculée à chaque génération à partir des scripts réellement inline
(bibliothèque + application) ; un nouvel hôte réseau doit être ajouté à
`connect-src` / `img-src` dans `csp_meta()`. MapLibre charge tuiles, glyphes et
sprites en `fetch` (`connect-src`) et son worker en `blob:` (`worker-src`).

## Sources et licences

- Prix : [data.economie.gouv.fr](https://data.economie.gouv.fr/explore/dataset/prix-des-carburants-en-france-flux-instantane-v2/) (Licence Ouverte).
- Prix des carburants en Espagne : Ministerio para la Transición Ecológica y el Reto Demográfico,
  [Geoportal Gasolineras](https://geoportalgasolineras.es), données ouvertes
  (API `sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/FiltroProvincia/{id}`,
  CORS `*`).
- Fonds de carte : Plan IGN / orthophotos (Géoplateforme) ; OpenStreetMap en secours
  seulement si l'IGN ne répond pas (CARTO retiré le 17/09/2026 : clé désormais exigée).
- Itinéraires : Géoplateforme IGN. Géocodage : Base Adresse Nationale.
- Bornes de recharge : [Base nationale des IRVE](https://www.data.gouv.fr/datasets/fichier-consolide-des-bornes-de-recharge-pour-vehicules-electriques/)
  (données statiques, schéma Etalab v2.3.1, consolidation quotidienne de data.gouv.fr,
  Licence Ouverte Etalab 2.0). Données **statiques** : aucune disponibilité en temps réel
  et **aucun prix au kWh** — aucune donnée ouverte française n'en publie (vérifié le 28/10/2026).
- [MapLibre GL JS](https://maplibre.org) (BSD-3), icônes [Lucide](https://lucide.dev) (MIT). Code : MIT.

## Limites connues

- France et Espagne (Italie sans CORS ; Allemagne à clé personnelle).
- Espagne : l'E85 y est quasi absent (2 stations sur 11 422 le 28/10/2026, E10 : 28, GPL : 995) —
  l'application le montre tel quel, elle ne le cache pas ; la date de mise à jour espagnole est
  l'horodatage global du fichier du ministère, pas un relevé par station ; pas de notion de
  rupture dans le flux espagnol ; trois provinces chargées à la fois au plus (au-delà, zoomer) ;
  l'Espagne n'est pas chargée sur une emprise de plus de 3° de latitude (France entière).
  `src/es-provincias.json` (v2, 30/10/2026) : boîtes robustes calculées sur 11 422 stations
  (1ᵉʳ–99ᵉ centile par axe, marge 0,05°) — le fichier du ministère contient des stations à
  latitude ou longitude 0 et des valeurs aberrantes, qui étiraient la première table jusqu'à
  l'équateur ; ces stations sont ignorées à l'ingestion (coordonnée à 0 ou hors de l'enveloppe
  latitude 27–44, longitude −19–5) et comptées (« n sans position ignorées »). Le snapshot de
  repli embarqué reste français.
- `file://` : Firefox y refuse la géolocalisation et cloisonne le stockage par
  fichier — héberger en https règle les deux.
- 400 éléments affichés par zone au maximum, stations et bornes confondues (annoncé à
  l'écran quand ça tronque) ; bornes : 4 départements à la fois au plus en vue libre.
- Bornes de recharge : données **statiques** (pas de disponibilité en temps réel, pas de prix
  au kWh), indisponibles en `file://` et hors ligne (fichiers servis à côté de la page) ; les
  consommations électriques pré-remplies sont des ordres de grandeur, pas des médianes mesurées.
- Plan de charge électrique : il optimise le **temps de charge**, pas l'euro (pas de prix au
  kWh dans les données ouvertes) — pas de « Faire un détour pour payer moins ? » pour
  l'électrique, le couloir se règle à la main ; courbe de charge simplifiée en deux paliers (puissance
  pleine jusqu'à 80 % de la batterie, moitié au-delà) et 5 min de branchement par arrêt,
  énergies au kWh entier (consommation de chaque tronçon arrondie au kWh supérieur) : un
  ordre de grandeur, pas la courbe réelle du véhicule. Horaires : syntaxe simplifiée
  d'`opening_hours` ; ce qui n'est pas lisible vaut « inconnu », jamais « fermé ».
