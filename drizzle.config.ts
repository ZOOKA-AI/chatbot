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
    // Same precedence as lib/db/queries.ts and lib/db/migrate.ts, so drizzle-kit
    // always targets the database the app actually uses.
    // biome-ignore lint: Forbidden non-null assertion.
    url: (process.env.DATABASE_URL ?? process.env.POSTGRES_URL)!,
  },
});
