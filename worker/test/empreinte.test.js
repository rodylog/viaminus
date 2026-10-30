import {describe, it, expect} from "vitest";
import {empreinte, jourUTC} from "../src/empreinte.js";

const T = 1_730_280_000;  // 2024-10-30 09:20:00 UTC

describe("empreinte éphémère", () => {
  it("16 caractères hexadécimaux, stable dans la journée, différente d'un jour à l'autre", async () => {
    const a = await empreinte("192.0.2.1", "sel-de-test-uniquement", T);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(await empreinte("192.0.2.1", "sel-de-test-uniquement", T + 3600)).toBe(a);
    expect(await empreinte("192.0.2.1", "sel-de-test-uniquement", T + 86_400)).not.toBe(a);
    expect(await empreinte("192.0.2.2", "sel-de-test-uniquement", T)).not.toBe(a);
    expect(await empreinte("192.0.2.1", "autre-sel-de-test", T)).not.toBe(a);
    expect(a).not.toContain("192");
  });

  it("refuse un sel absent ou trop court", async () => {
    await expect(empreinte("192.0.2.1", undefined, T)).rejects.toThrow();
    await expect(empreinte("192.0.2.1", "court", T)).rejects.toThrow();
  });

  it("jour UTC", () => {
    expect(jourUTC(T)).toBe("2024-10-30");
  });
});
