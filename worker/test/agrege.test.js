import {describe, it, expect} from "vitest";
import {agrege, FENETRE_AGREGAT} from "../src/agrege.js";

const T = 1_730_280_000;  // horodatage de référence (secondes)
const l = (station, carburant, etat, t) => ({station, carburant, etat, t});

describe("agrege (module pur)", () => {
  it("compte vide et ok par station et carburant, dernier = le plus récent", () => {
    const r = agrege([
      l("12345678", "e85", "vide", T - 100),
      l("12345678", "e85", "vide", T - 50),
      l("12345678", "gazole", "ok", T - 20),
      l("ES-2777", "gazole", "vide", T - 10),
    ], {maintenant: T});
    expect(r).toEqual({
      "12345678": {e85: {vide: 2, ok: 0, dernier: T - 50}, gazole: {vide: 0, ok: 1, dernier: T - 20}},
      "ES-2777": {gazole: {vide: 1, ok: 0, dernier: T - 10}},
    });
  });

  it("un ok plus récent que le dernier vide remet vide à zéro", () => {
    const r = agrege([
      l("12345678", "e85", "vide", T - 300),
      l("12345678", "e85", "vide", T - 200),
      l("12345678", "e85", "ok", T - 100),
    ], {maintenant: T});
    expect(r["12345678"].e85).toEqual({vide: 0, ok: 1, dernier: T - 100});
  });

  it("un vide plus récent que le dernier ok garde tous les vide de la fenêtre", () => {
    const r = agrege([
      l("12345678", "e85", "vide", T - 300),
      l("12345678", "e85", "ok", T - 200),
      l("12345678", "e85", "vide", T - 100),
    ], {maintenant: T});
    expect(r["12345678"].e85).toEqual({vide: 2, ok: 1, dernier: T - 100});
  });

  it("à horodatage égal, le vide l'emporte (ok non strictement plus récent)", () => {
    const r = agrege([l("12345678", "e85", "vide", T - 10), l("12345678", "e85", "ok", T - 10)],
                     {maintenant: T});
    expect(r["12345678"].e85).toEqual({vide: 1, ok: 1, dernier: T - 10});
  });

  it("ignore ce qui sort de la fenêtre de 48 h, ce qui vient du futur, et les états inconnus", () => {
    const r = agrege([
      l("12345678", "e85", "vide", T - FENETRE_AGREGAT),       // exactement 48 h : exclu
      l("12345678", "e85", "vide", T - FENETRE_AGREGAT + 1),   // 47 h 59 min 59 s : inclus
      l("12345678", "e85", "vide", T + 5),                     // futur : exclu
      l("12345678", "e85", "bof", T - 1),                      // état inconnu : exclu
      l("87654321", "e10", "ok", T - 3 * 24 * 3600),           // trop vieux : station absente
    ], {maintenant: T});
    expect(r).toEqual({"12345678": {e85: {vide: 1, ok: 0, dernier: T - FENETRE_AGREGAT + 1}}});
  });

  it("stations sans signalement absentes ; liste vide → objet vide", () => {
    expect(agrege([], {maintenant: T})).toEqual({});
  });

  it("exige `maintenant`", () => {
    expect(() => agrege([])).toThrow();
  });
});
