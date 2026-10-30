import path from "node:path";
import {defineConfig} from "vitest/config";
import {cloudflareTest, readD1Migrations} from "@cloudflare/vitest-plugin";

const migrations = await readD1Migrations(path.join(import.meta.dirname, "migrations"));

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: {configPath: "./wrangler.toml"},
      miniflare: {
        bindings: {TEST_MIGRATIONS: migrations, SEL: "sel-de-test-uniquement"},
      },
    }),
  ],
  test: {
    setupFiles: ["./test/migrations.setup.js"],
  },
});
