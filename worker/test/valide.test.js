import {describe, it, expect} from "vitest";
import {valideSignalement, valideIds, stationValide, CARBURANTS, MAX_IDS} from "../src/valide.js";

describe("validation des entrées (module pur)", () => {
  it("identifiants de station : 8 chiffres ou ES-<1 à 8 chiffres>", () => {
    for (const bon of ["12345678", "00000001", "ES-1", "ES-27770000"]) expect(stationValide(bon)).toBe(true);
    for (const mauvais of ["1234567", "123456789", "ES-", "ES-123456789", "es-27", "FR-12345678",
                           " 12345678", "12345678\n", "", 12345678, null, undefined, "12345678,1"]) {
      expect(stationValide(mauvais)).toBe(false);
    }
  });

  it("signalement bien formé", () => {
    for (const c of CARBURANTS) {
      expect(valideSignalement({station: "12345678", carburant: c, etat: "vide"}))
        .toEqual({ok: true, valeur: {station: "12345678", carburant: c, etat: "vide"}});
    }
    expect(valideSignalement({station: "ES-2777", carburant: "gazole", etat: "ok"}).ok).toBe(true);
  });

  it("signalement mal formé", () => {
    const base = {station: "12345678", carburant: "e85", etat: "vide"};
    const cas = [
      null, [], "texte", 42,
      {...base, station: "1234567"},
      {...base, station: "ES-"},
      {...base, carburant: "diesel"},
      {...base, carburant: "E85"},
      {...base, carburant: ["e85"]},
      {...base, etat: "plein"},
      {...base, etat: "VIDE"},
      {...base, prix: 1.85},                      // champ inconnu
      {station: "12345678", carburant: "e85"},    // champ manquant
      {},
    ];
    for (const c of cas) {
      const r = valideSignalement(c);
      expect(r.ok, JSON.stringify(c)).toBe(false);
      expect(typeof r.erreur).toBe("string");
    }
  });

  it("liste d'identifiants : bornes, doublons, invalides", () => {
    expect(valideIds("12345678,ES-2777")).toEqual({ok: true, valeur: ["12345678", "ES-2777"]});
    expect(valideIds(" 12345678 , 12345678 ,, ")).toEqual({ok: true, valeur: ["12345678"]});
    expect(valideIds(null).ok).toBe(false);
    expect(valideIds("").ok).toBe(false);
    expect(valideIds(",,,").ok).toBe(false);
    expect(valideIds("12345678,abc").ok).toBe(false);
    const n = i => String(10_000_000 + i);
    const quatreCents = Array.from({length: MAX_IDS}, (_, i) => n(i));
    expect(valideIds(quatreCents.join(",")).valeur).toHaveLength(400);
    expect(valideIds([...quatreCents, n(MAX_IDS)].join(",")).ok).toBe(false);
  });
});
