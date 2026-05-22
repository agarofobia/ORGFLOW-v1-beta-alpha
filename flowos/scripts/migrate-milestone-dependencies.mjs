// Migración: dependencias entre milestones (DAG simple).
// "Beta 2 depende de Beta 1" → no podés mover Beta 2 a in_progress mientras Beta 1 esté pending.

import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });
const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL no definido"); process.exit(1); }
const sql = postgres(url, { max: 1, prepare: false });

try {
  await sql`
    CREATE TABLE IF NOT EXISTS milestone_dependencies (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      milestone_id uuid NOT NULL REFERENCES project_milestones(id) ON DELETE CASCADE,
      depends_on_id uuid NOT NULL REFERENCES project_milestones(id) ON DELETE CASCADE,
      organization_id text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(milestone_id, depends_on_id),
      CHECK (milestone_id <> depends_on_id)
    );
  `;
  console.log("OK: milestone_dependencies table");

  await sql`CREATE INDEX IF NOT EXISTS milestone_deps_milestone_idx ON milestone_dependencies(milestone_id);`;
  await sql`CREATE INDEX IF NOT EXISTS milestone_deps_depends_on_idx ON milestone_dependencies(depends_on_id);`;
  console.log("OK: indexes");

  console.log("\nMigración completa.");
} catch (err) {
  console.error("ERR:", err.message);
  process.exit(1);
} finally {
  await sql.end();
}
