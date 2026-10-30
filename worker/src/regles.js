// Constantes du service (quotas, fenêtres, bornes), partagées par le Worker et les tests.
export const QUOTA_HEURE = 5;             // signalements par empreinte et par heure
export const FENETRE_DOUBLON = 6 * 3600;  // 1 signalement par (empreinte, station, carburant) par 6 h
export const RETENTION_QUOTAS = 24 * 3600;
export const TAILLE_CORPS_MAX = 1024;     // octets du corps d'un POST
