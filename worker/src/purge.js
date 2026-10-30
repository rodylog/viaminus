// Purge horaire (déclencheur cron) : signalements de plus de 48 h supprimés ; empreinte
// effacée des signalements de plus de 6 h (fin de la fenêtre de dédoublonnage) ;
// lignes de quotas de plus de 24 h supprimées.
import {FENETRE_AGREGAT} from "./agrege.js";
import {FENETRE_DOUBLON, RETENTION_QUOTAS} from "./regles.js";

export async function purge(db, t = Math.floor(Date.now() / 1000)) {
  await db.batch([
    db.prepare("DELETE FROM signalements WHERE t <= ?1").bind(t - FENETRE_AGREGAT),
    db.prepare("UPDATE signalements SET empreinte = NULL WHERE empreinte IS NOT NULL AND t <= ?1")
      .bind(t - FENETRE_DOUBLON),
    db.prepare("DELETE FROM quotas WHERE fenetre < ?1")
      .bind(Math.floor((t - RETENTION_QUOTAS) / 3600)),
  ]);
}
