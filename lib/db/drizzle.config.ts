import { defineConfig } from "drizzle-kit";
import path from "path";

const rawUrl = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;

if (!rawUrl) {
  throw new Error("SUPABASE_DATABASE_URL (or DATABASE_URL) must be set");
}

const databaseUrl =
  process.env.SUPABASE_DATABASE_URL && !rawUrl.includes("sslmode=")
    ? `${rawUrl}?sslmode=require`
    : rawUrl;

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
});
