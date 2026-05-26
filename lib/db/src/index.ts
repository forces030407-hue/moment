import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const rawUrl = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;

if (!rawUrl) {
  throw new Error(
    "SUPABASE_DATABASE_URL (or DATABASE_URL) must be set.",
  );
}

// Supabase direct connections use IPv6 (unreachable from some hosts).
// Rewrite to the session-mode pooler on port 5432 which uses IPv4.
function resolveConnectionUrl(url: string): string {
  try {
    const u = new URL(url);
    // If it's already a pooler URL or not Supabase, return as-is
    if (u.hostname.includes("pooler.supabase.com") || !u.hostname.includes("supabase.co")) {
      return url;
    }
    // Direct DB host: db.<ref>.supabase.co → aws-0-<region>.pooler.supabase.com
    // Use session pooler on port 5432 (no plan required)
    const refMatch = u.hostname.match(/^db\.([^.]+)\.supabase\.co$/);
    if (refMatch) {
      const ref = refMatch[1];
      u.hostname = `aws-0-us-east-1.pooler.supabase.com`;
      u.port = "5432";
      u.username = `postgres.${ref}`;
      return u.toString();
    }
    return url;
  } catch {
    return url;
  }
}

const databaseUrl = process.env.SUPABASE_DATABASE_URL
  ? resolveConnectionUrl(rawUrl)
  : rawUrl;

export const pool = new Pool({
  connectionString: databaseUrl,
  ssl: process.env.SUPABASE_DATABASE_URL ? { rejectUnauthorized: false } : undefined,
});
export const db = drizzle(pool, { schema });

export * from "./schema";
