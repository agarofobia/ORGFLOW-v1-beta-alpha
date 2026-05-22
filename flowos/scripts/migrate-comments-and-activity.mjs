// Migración: comentarios en tareas + feed de actividad por proyecto.
// Bloque P0-3 del roadmap — habilita colaboración mínima.

import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL no definido"); process.exit(1); }

const sql = postgres(url, { max: 1, prepare: false });

try {
  // Comentarios en tareas
  await sql`
    CREATE TABLE IF NOT EXISTS task_comments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      organization_id text NOT NULL,
      author_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      body text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `;
  console.log("OK: task_comments table");

  await sql`CREATE INDEX IF NOT EXISTS task_comments_task_idx ON task_comments(task_id);`;
  await sql`CREATE INDEX IF NOT EXISTS task_comments_org_idx ON task_comments(organization_id);`;
  console.log("OK: task_comments indexes");

  // Feed de actividad por proyecto
  await sql`
    CREATE TABLE IF NOT EXISTS project_activity (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      organization_id text NOT NULL,
      actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      type text NOT NULL,
      payload jsonb NOT NULL DEFAULT '{}',
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `;
  console.log("OK: project_activity table");

  await sql`CREATE INDEX IF NOT EXISTS project_activity_project_idx ON project_activity(project_id, created_at DESC);`;
  await sql`CREATE INDEX IF NOT EXISTS project_activity_org_idx ON project_activity(organization_id);`;
  console.log("OK: project_activity indexes");

  console.log("\nMigración completa.");
} catch (err) {
  console.error("ERR:", err.message);
  process.exit(1);
} finally {
  await sql.end();
}
