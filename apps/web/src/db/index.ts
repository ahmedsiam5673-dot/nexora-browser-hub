import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import type { Db } from "./repo";

const g = globalThis as unknown as { __nexoraPool?: Pool };

export function getDb(): Db {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. See README → Configure the database.");
  g.__nexoraPool ??= new Pool({ connectionString: url, max: 10, idleTimeoutMillis: 30_000 });
  return drizzle(g.__nexoraPool, { schema }) as unknown as Db;
}

export async function pingDb(): Promise<boolean> {
  try {
    g.__nexoraPool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
    await g.__nexoraPool.query("select 1");
    return true;
  } catch {
    return false;
  }
}
