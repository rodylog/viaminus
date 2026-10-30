# Fixture synthétique Paris → Lyon (véhicule « Banc E10 », 330 km d'autonomie, réserve 30 km)

Fabriquée à la main le 30/10/2026 : aucune API interrogée. Tracé rectiligne simplifié (6 sommets, densifié tous les 5 km)
(417 km avec la métrique plane de l'application), stations placées à un kilomètre et un
écart choisis. Autonomie utile 300 km : un arrêt est obligatoire entre le km 116 et le km 300.

| Station | km | écart | rôle dans le banc |
|---|---|---|---|
| Paris, Porte d'Orléans | 4 | 0,3 | plein au départ (la moins chère à 15 km, sur la route : même prix du carburant à bord à toute largeur) |
| Fontainebleau | 56 | 0,5 | trop tôt pour finir le trajet : jamais retenue |
| Auxerre | 150 | 3,5 | candidate à l'arrêt, plus chère que Beaune |
| Avallon | 200 | 0,4 | gazole seulement : absente de la requête E10 |
| **Beaune** | 240 | 3,2 | **l'arrêt du plan** (la moins chère atteignable, prix du 28/10) |
| Chalon-sur-Saône | 250 | 3,0 | **station muette** (tous les prix du 25/09, 35 jours) ; plus chère que Beaune, donc non retenue |
| Mâcon | 330 | 12 | la moins chère, mais à 12 km de la route : le détour ne vaut rien |
| Villefranche-sur-Saône | 395 | 0,8 | **rupture E10** temporaire depuis le 20/10 : requête des ruptures, grisée, hors plan |
| Lyon, Vaise | 410 | 0,6 | **plein à l'arrivée** (prix frais) |
| Villeurbanne | 414 | 1,2 | **prix figé** : E10 du 05/10, gazole du jour ; moins chère mais écartée du plein d'arrivée |

Aucune station à moins de 2 km de la route entre le km 116 et le km 300 : le plan est infaisable à
1 et 2 km, possible à 5 km → message « Un détour jusqu'à 5 km de la route est nécessaire ».

Échec volontaire (pour voir la règle « station muette » rougir) : dans `stations.json`, remplacer
`e10_maj` de Beaune (id 21200001) par `2026-09-25T08:30:00`, puis `node banc/rejeu.js paris-lyon`.
Beaune devient alors « prix figé » (SP95 et gazole restent frais) : le plan l'évite et retient
Chalon-sur-Saône, muette sur tous ses carburants, que le code du 30/10/2026 ne détecte pas — la règle
« aucune station retenue dont le prix date de plus de 21 jours » rougit sur Chalon (défaut n° 1 du
banc manuel du 26/10), et la fidélité à `attendu.json` rougit aussi.
