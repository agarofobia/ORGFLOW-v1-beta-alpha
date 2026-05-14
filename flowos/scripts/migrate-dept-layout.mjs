import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });

const url = process.env.DATABASE_URL;
if (!url) { console.error("no DATABASE_URL"); process.exit(1); }

const sql = postgres(url, { max: 1, prepare: false });

try {
  // Flag para promover el head del depto arriba (default true = comportamiento actual)
  await sql`ALTER TABLE departments ADD COLUMN IF NOT EXISTS promote_head BOOLEAN NOT NULL DEFAULT TRUE;`;
  console.log("OK: departments.promote_head");

  // Modo de layout interno del depto
  await sql`ALTER TABLE departments ADD COLUMN IF NOT EXISTS layout_mode TEXT NOT NULL DEFAULT 'vertical';`;
  console.log("OK: departments.layout_mode");

  console.log("\nMigración completa.");
} catch (err) {
  console.error("ERR:", err.message);
  process.exit(1);
} finally {
  await sql.end();
}
