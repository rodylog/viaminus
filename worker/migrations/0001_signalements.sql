-- Signalements anonymes « pompe vide » / « pompe ok ».
-- Aucune adresse IP, aucun identifiant d'utilisateur, aucune position :
-- `empreinte` est un condensé éphémère (SHA-256 de l'IP et du sel du jour,
-- 16 caractères), effacé de cette table au bout de 6 h par la purge horaire.
CREATE TABLE signalements (
  id        INTEGER PRIMARY KEY,
  station   TEXT    NOT NULL,              -- 8 chiffres (France) ou ES-… (Espagne)
  carburant TEXT    NOT NULL,              -- e85, e10, sp95, sp98, gazole, gplc
  etat      TEXT    NOT NULL CHECK (etat IN ('vide', 'ok')),
  t         INTEGER NOT NULL,              -- horodatage, secondes depuis l'epoch (UTC)
  empreinte TEXT                           -- NULL dès que la fenêtre de dédoublonnage (6 h) est passée
);
CREATE INDEX signalements_station_t ON signalements (station, t);
CREATE INDEX signalements_t ON signalements (t);
CREATE INDEX signalements_doublon ON signalements (empreinte, station, carburant);

-- Quotas : nombre de signalements par empreinte et par fenêtre d'une heure
-- (fenetre = secondes depuis l'epoch divisées par 3600). Lignes de plus de
-- 24 h supprimées par la purge horaire.
CREATE TABLE quotas (
  empreinte TEXT    NOT NULL,
  fenetre   INTEGER NOT NULL,
  n         INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (empreinte, fenetre)
);
