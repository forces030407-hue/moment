import { defineConfig } from "drizzle-kit";
import path from "path";

const rawUrl = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;

if (!rawUrl) {
  throw new Error("SUPABASE_DATABASE_URL (or DATABASE_URL) must be set");
}

function resolveConnectionUrl(url: string): string {
  try {
    const u = new URL(url);
    // Already a pooler URL — just ensure sslmode
    if (u.hostname.includes("pooler.supabase.com")) {
      return url.includes("sslmode=") ? url : `${url}${url.includes("?") ? "&" : "?"}sslmode=require`;
    }
    // Direct DB host: rewrite to pooler
    const refMatch = u.hostname.match(/^db\.([^.]+)\.supabase\.co$/);
    if (refMatch) {
      const ref = refMatch[1];
      u.hostname = "aws-1-ap-northeast-1.pooler.supabase.com";
      u.port = "6543";
      u.username = `postgres.${ref}`;
      const result = u.toString();
      return result.includes("sslmode=") ? result : `${result}${result.includes("?") ? "&" : "?"}sslmode=require`;
    }
    return url;
  } catch {
    return url;
  }
}

const databaseUrl = process.env.SUPABASE_DATABASE_URL
  ? resolveConnectionUrl(rawUrl)
  : rawUrl;

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
});
