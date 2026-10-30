# Fixture synthétique Montpellier → Aniane (véhicule « Polo E85 », 550 km d'autonomie, réserve 30 km)

Fabriquée à la main le 30/10/2026 : aucune API interrogée. Tracé rectiligne simplifié (5 sommets, densifié tous les 2 km)
(26 km avec la métrique plane de l'application) : aucun arrêt n'est nécessaire, le plan se
réduit au plein de départ et au plein d'arrivée, plus la liste des moins chères.

| Station | km | écart | rôle dans le banc |
|---|---|---|---|
| **Montpellier, av. de Toulouse** | 2 | 0,4 | **plein au départ** : la moins chère SÛRE à 15 km, sur la route (même valeur du carburant à bord à toute largeur) |
| Montpellier, route de Lodève | 6 | 0,8 | **prix figé** : E85 du 05/10 alors que SP95 et gazole sont frais ; moins chère, mais écartée du plein de départ |
| Juvignac | 8 | 0,3 | gazole seulement : absente de la requête E85 |
| Saint-Georges-d'Orques | 12 | 2,5 | candidate ordinaire (dans la fenêtre du départ et celle de l'arrivée) |
| **Montarnaud** | 18 | 4,0 | la moins chère fraîche du couloir : **plein à l'arrivée** à 10 km de largeur |
| Gignac | 22 | 0,5 | candidate ordinaire à l'arrivée |
| Aniane | 25 | 0,6 | **station muette** (tout du 25/09, 35 jours) ; la plus chère, donc jamais retenue |

Toutes les largeurs donnent le même plan (0 arrêt, même plein de départ) : un seul choix,
message « Aucun détour ne ferait gagner d'argent sur ce trajet ».
