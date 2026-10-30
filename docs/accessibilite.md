# Déclaration d'accessibilité — ViaMinus

**État : partiellement conforme** au niveau AA des WCAG 2.2 sur les parcours principaux
(carte et liste des stations, fiche station, fiche borne, assistant véhicule, garage, plan de
pleins, plan de charge, options, aide), **établi le 30/10/2026** par audit automatisé et parcours
clavier scripté dans Chromium. Les tests avec de vrais lecteurs d'écran (TalkBack, NVDA, VoiceOver)
et sur la vraie carte IGN restent à faire : voir « Ce qui n'a pas été vérifié ».

Contact : une [issue GitHub](https://github.com/rodylog/viaminus/issues) sur ce dépôt (public).

## Méthode

- Page générée par `generate.py --sans-snapshot`, ouverte dans Chromium headless (Playwright) avec
  le réseau remplacé par des **données factices** : dix stations sur une ligne Paris → Lyon, trois
  bornes de recharge (forme de `src/fixtures/irve-34.json`), une province espagnole (fixture de
  Girona), un véhicule thermique (E85, autonomie 320 km) et un électrique (50 kWh, CCS 150 kW).
  Rien ne sort de la machine ; aucune donnée personnelle.
- **axe-core 4.10.3**, règles WCAG 2.0 / 2.1 / 2.2 A et AA + bonnes pratiques, sur **12 états**
  (accueil, assistant écrans 1-2-3, liste, fiche station, fiche borne, plan de pleins, plan de
  charge, Options, Aide, plus la liste avec stations espagnoles) × **375 px et 1280 px** × **clair
  et sombre** = 48 mesures.
- **Clavier** : parcours Tab / Maj+Tab / Entrée / Espace / Échap / flèches, cycle du focus dans
  chaque feuille, retour du focus à l'ouvreur, contraste du contour de focus, cibles tactiles
  < 44 px, reflow à 320 px, zoom texte 200 % (racine à 200 % sur 375 px), captures.
- **Performance** : temps jusqu'au premier rendu de la liste (Performance API, observateur DOM),
  moyenne de cinq chargements, avec une latence réseau simulée de 0 ms et de 150 ms.
- Outils et données dans `outils/accessibilite/` (hors build) ; mode d'emploi dans le README.

## Résultats axe-core

### Avant (main du 30/10/2026, `e6f7cb0`)

| Règle axe | État | Nombre d'éléments (4 contextes) | Gravité |
|---|---|---:|---|
| `button-name` | fiche-borne, plan-charge, plan-pleins | 4 + 4 + 4 | critique |
| `color-contrast` | accueil, aide, options | 5 + 5 + 5 | sérieuse |
| `color-contrast` | assistant 1, 2, 3 | 7 + 7 + 7 | sérieuse |
| `color-contrast` | liste, fiche-station | 7 + 7 | sérieuse |
| `color-contrast` | plan-pleins | 10 | sérieuse |
| `color-contrast` | plan-charge, fiche-borne | 2 + 1 | sérieuse |
| `target-size` | liste, plan-pleins, plan-charge | 2 + 2 + 2 | sérieuse |
| `region` | les 11 états | 10 à 12 par état | modérée |

**Total : 12 critiques, 69 sérieuses, 128 modérées, 0 mineure.** Causes :

- `button-name` : les boutons « replier » des listes (icône seule) n'avaient pas de nom.
- `color-contrast` : blanc sur le vert `#158a3f` à 4,43:1 (pastilles, étiquettes de la carte,
  badge « conseillé ») ; bleu `#0b57d0` et rouge `#c02626` posés en **texte sur les surfaces
  sombres** à 2,6 – 2,9:1 (« Ma position », « Y aller », prix surlignés, alertes, « Pompe vide ? ») ;
  gris `#6b7280` à 4,1:1 sur les lignes de détour teintées.
- `target-size` : « Ma position » recouvert par le panneau déplié en plein sur mobile.
- `region` : carte, formulaire, boutons et panneau hors de tout repère (landmark).

### Après (branche `claude/accessibilite`)

| Règle axe | État | Nombre | Gravité |
|---|---|---:|---|
| — | les 12 états, 4 contextes | **0** | — |

**Total : 0 critique, 0 sérieuse, 0 modérée, 0 mineure** sur 48 mesures. Aucune règle
modérée restante à expliquer.

## Ce qui a été corrigé (un commit par thème)

1. **Contraste** — jetons `:root` : `--vert` → `#137a37` (blanc dessus 5,4:1) ; `--muted` →
   `#5f6670` (≥ 4,9:1) ; jetons texte et focus `--txt-bleu`, `--txt-rouge`, `--txt-vert`, `--focus`
   éclaircis en mode sombre (`#8ab4f8` 8,0:1, `#f28b82` 7,1:1, `#5fcf8b` 8,7:1 sur `#1a1d23`) ;
   gris de rupture fixe ; bordure des champs et piste d'interrupteur ≥ 3:1 (1.4.11) ; couleur des
   placeholders fixée. Les fonds colorés à texte blanc ne changent pas de thème.
2. **Focus et clavier** — lien d'évitement vers la liste ; flèches entre les boutons des groupes
   (tri, types, catégories, puissances, détours, fond, apparence) ; le focus survit au re-rendu de
   la liste et du plan (il retombait sur le corps de la page) ; contour de focus `--focus` 2 px ;
   étiquettes de prix de la carte dans des cibles de 44 px, crayon de correction et « Pompe
   vide ? » à 44 px au doigt.
3. **Dialogues et régions live** — feuille ouverte = reste de la page `inert` (en plus
   d'`aria-modal`), retour du focus à l'ouvreur ; boutons « replier » nommés ; erreur de l'assistant
   et messages des bornes en `role="status"` (poli) ; `aria-haspopup="dialog"` sur les ouvreurs.
4. **Structure** — h1 (caché), `header` + `role="search"`, `main`, régions nommées pour la carte et
   ses outils ; `lang="es"` sur noms, enseignes et adresses des stations espagnoles ; **la couleur ne
   dit plus seule le prix** : coche sur la moins chère, flèche sur la chère, texte caché pour les
   lecteurs d'écran, mêmes signes dans la légende (1.4.1).
5. **Typographie** — tailles de police en rem (16 px = 1 rem, rendu identique à 100 %), aperçu du
   panneau en rem ; textes tronqués passés sur deux lignes (chip, adresses, pilule) ; vérifié à
   320 px et à 200 %.
6. **Performance** — carte MapLibre créée après le départ du premier appel aux prix, emprise
   calculée sans la carte ; `emprise()` mémorisée par passe ; vérification de version sans
   re-télécharger ni analyser 1,4 Mo.
7. **Régions (suite)** — boutons de la carte retirés du flux quand le panneau mobile est en plein
   (ils étaient recouverts, 2.4.11) ; h1 dans l'en-tête, outils de la carte en région.

## Clavier et focus (après)

| Vérification | Résultat |
|---|---|
| Tab depuis le début (bureau) | lien d'évitement → carte → zoom → formulaire → chip → outils → options / aide → tri → cartes de la liste ; aucun piège, aucun élément inatteignable |
| Feuilles (Options, Aide, Garage, Fond, Fiche station, Assistant) | Tab cyclique dans la feuille : 0 arrêt hors feuille sur 7 à 28 arrêts ; Échap ferme et rend le focus à l'ouvreur (vérifié y compris après un re-rendu de la liste) |
| Contour de focus | 2 px `#0b57d0` sur les surfaces claires : 6,0 à 6,4:1 ; `#8ab4f8` sur les surfaces sombres : 8,0:1 |
| Flèches dans les groupes | tri des listes, types / catégories / énergies de l'assistant, puissances, détours, fond et apparence |
| Cibles tactiles (375 px, tactile) | aucune cible interactive < 44 px sur les 7 états testés (les points restants — repère, ronds d'étape, numéros d'arrêt — ne sont pas interactifs) |
| Reflow 320 px | aucun défilement horizontal ; aucun texte coupé hors l'aperçu de 96 px du panneau replié |
| Zoom texte 200 % à 375 px | aucun défilement horizontal ; aucun texte coupé hors l'aperçu de 96 px du panneau replié |
| Mouvement réduit | `prefers-reduced-motion` : aucune transition CSS, caméra sans animation (inchangé, vérifié dans le code) |

Captures (focus visible) dans `docs/accessibilite/` : liste et fiche station sur mobile, assistant,
garage et options sur bureau, plan à 320 px, plan au zoom texte 200 %, liste en mode sombre.

## Performance

Chromium headless, données factices, moyenne de cinq chargements (temps depuis l'origine de
navigation). La page tient en un fichier de 1 448 Ko (1 436 avant).

| Mesure | Avant | Après |
|---|---:|---:|
| Premier rendu de la liste, latence réseau 0 ms, 375 px | 250 ms | 245 ms |
| Premier rendu de la liste, latence réseau 0 ms, 1280 px | 236 ms | 270 ms |
| Premier rendu de la liste, latence réseau 150 ms, 375 px | 402 ms (382 – 461) | 359 ms (332 – 378) |
| Premier rendu de la liste, latence réseau 150 ms, 1280 px | 450 ms (380 – 497) | 344 ms (338 – 356) |
| Évaluation de MapLibre inline (fin) | ≈ 115 ms | ≈ 115 ms |
| Constructeur MapLibre `Map` | ≈ 28 ms, **avant** le premier appel aux prix | ≈ 19 ms, **pendant** l'appel |
| Rendus de la liste dans les 1,5 s suivant l'ouverture | 2 (chargement, puis recentrage géolocalisé) | 2 (inchangé) |

Lecture : à latence nulle (irréaliste) rien ne change — le bruit de mesure (± 20 ms) domine ;
avec 150 ms de réseau, la liste arrive 40 à 100 ms plus tôt et la dispersion tombe de ± 50 ms
à ± 15 ms, parce que la requête part avant la construction de la carte. Aucune boucle de
re-rendu au défilement : le défilement de la liste ne déclenche rien, seul un déplacement de
la carte (après 400 ms d'immobilité) recharge.

**Signalé sans correction** (demanderait de scinder le fichier unique, hors invariants) :
≈ 300 ms d'analyse et de compilation du script inline (MapLibre ≈ 0,9 Mo sur les 1,4 Mo) au profil
CPU ; `webglDispo()` crée un contexte WebGL de test (≈ 9 ms) avant celui de la carte.

## Limites connues et ce qui n'a pas été vérifié

- **Lecteurs d'écran réels** (TalkBack, NVDA, VoiceOver, Orca) : non testés. Les noms accessibles,
  rôles, états et régions live sont posés et contrôlés par axe-core, pas écoutés.
- **Carte** : le canvas WebGL n'est pas lisible ; ses marqueurs (prix, bornes) sont des boutons
  nommés mais hors de l'ordre de tabulation (`tabindex="-1"`) — la liste porte toute
  l'information et chaque carte ouvre la même fiche. Les tuiles IGN réelles et leur contraste
  n'ont pas été vus (style minimal factice en mesure) ; les étiquettes de prix ont un fond plein
  et une bordure sombre, indépendants du fond de carte.
- **Mode sombre** : vérifié par `prefers-color-scheme: dark` émulé ; le choix explicite « Sombre »
  du menu Apparence pose les mêmes jetons.
- **Zoom texte** : émulé en portant la racine à 200 % (équivalent au zoom texte de Firefox) ;
  le zoom de page des navigateurs ramène au cas 320 px. Dans l'aperçu replié du panneau (96 px),
  l'état sur une ligne reste tronqué avec « … » : le texte entier apparaît dès que l'on déplie.
- **Plan de pleins / de charge** : les titres d'étape mêlant français et nom de lieu espagnol
  ne portent pas `lang="es"` (mot à mot dans une phrase française).
- `inert` : navigateurs de 2022 et plus (Chrome 102, Safari 15.5, Firefox 112) ; en deçà, le
  cycle Tab et `aria-modal` restent.
- Données factices : dix stations, trois bornes, trois stations espagnoles — pas de test de la
  liste à 400 éléments ni des stations en rupture (rendu identique, non mesuré).
