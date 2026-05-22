// Migración: attachments en tareas (archivos asociados via Supabase Storage)
import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL no definido"); process.exit(1); }

const sql = postgres(url, { max: 1, prepare: false });

try {
  await sql`
    CREATE TABLE IF NOT EXISTS task_attachments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      organization_id text NOT NULL,
      file_name text NOT NULL,
      file_url text NOT NULL,
      file_type text,
      file_size integer,
      uploaded_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      uploaded_at timestamptz NOT NULL DEFAULT now()
    );
  `;
  console.log("OK: task_attachments table");

  await sql`CREATE INDEX IF NOT EXISTS task_attachments_task_idx ON task_attachments(task_id);`;
  await sql`CREATE INDEX IF NOT EXISTS task_attachments_org_idx ON task_attachments(organization_id);`;
  console.log("OK: task_attachments indexes");

  console.log("\nMigración completa.");
} catch (err) {
  console.error("ERR:", err.message);
  process.exit(1);
} finally {
  await sql.end();
}
