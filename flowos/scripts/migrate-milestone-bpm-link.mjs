// Migración: linkear milestones a nodos BPM. Cierra el loop BPM inverso.
// Completar un milestone → avanza el nodo BPM correspondiente.

import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });
const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL no definido"); process.exit(1); }
const sql = postgres(url, { max: 1, prepare: false });

try {
  await sql`ALTER TABLE project_milestones ADD COLUMN IF NOT EXISTS bpm_node_id TEXT;`;
  console.log("OK: project_milestones.bpm_node_id");
  console.log("\nMigración completa.");
} catch (err) {
  console.error("ERR:", err.message);
  process.exit(1);
} finally {
  await sql.end();
}
