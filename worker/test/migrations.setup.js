import {beforeEach} from "vitest";
import {applyD1Migrations, env} from "cloudflare:test";

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

// Base vide avant chaque test : chaque cas part d'un état connu.
beforeEach(async () => {
  await env.DB.batch([env.DB.prepare("DELETE FROM signalements"), env.DB.prepare("DELETE FROM quotas")]);
});
