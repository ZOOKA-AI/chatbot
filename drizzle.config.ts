import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({
  path: ".env.local",
});

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./lib/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    // biome-ignore lint: Forbidden non-null assertion.
    // Prefer DATABASE_URL to match lib/db/* at runtime, so `drizzle-kit`
    // can never migrate a different database than the app talks to.
    url: (process.env.DATABASE_URL ?? process.env.POSTGRES_URL)!,
  },
});
