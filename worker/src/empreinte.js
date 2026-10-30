// Empreinte éphémère anti-abus : SHA-256(IP + sel du jour), tronqué à 16 caractères hexadécimaux.
// Le sel du jour dérive du secret SEL et de la date UTC : l'empreinte change chaque jour
// et ne permet pas de retrouver l'adresse sans le secret. L'adresse elle-même n'est
// jamais écrite nulle part.

export function jourUTC(maintenant) {
  return new Date(maintenant * 1000).toISOString().slice(0, 10);  // YYYY-MM-DD
}

export async function empreinte(ip, sel, maintenant) {
  if (typeof sel !== "string" || sel.length < 8) {
    throw new Error("SEL absent ou trop court (secret du Worker)");
  }
  const texte = `${ip}\n${sel}\n${jourUTC(maintenant)}`;
  const condense = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texte));
  return [...new Uint8Array(condense)].map(o => o.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

// Adresse du client telle que Cloudflare la transmet (en-tête posé par la plateforme,
// un client ne peut pas l'usurper en production). Utilisée uniquement en mémoire.
export function adresseClient(requete) {
  return requete.headers.get("CF-Connecting-IP") || "inconnue";
}
