// Migración: project_templates — clonables con estructura completa (VFP + hitos + tareas).
// El campo `structure` jsonb guarda toda la jerarquía. Al instanciar se crea el proyecto + hitos + tareas.
// Optional FK a process_definitions: un proceso BPM puede tener un template asociado para auto-instanciar.

import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });
const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL no definido"); process.exit(1); }
const sql = postgres(url, { max: 1, prepare: false });

try {
  await sql`
    CREATE TABLE IF NOT EXISTS project_templates (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id text NOT NULL,
      name text NOT NULL,
      description text,
      -- shape: { vfp: ProjectVFP, milestones: [{ title, description, acceptanceCriteria, orderIndex, dueDateOffsetDays?, tasks: [{ title, description, priority, status, sectionName? }] }] }
      structure jsonb NOT NULL DEFAULT '{}',
      -- Si el template se origina/se usa desde un proceso BPM, se linkea acá
      process_definition_id uuid REFERENCES process_definitions(id) ON DELETE SET NULL,
      created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `;
  console.log("OK: project_templates table");

  await sql`CREATE INDEX IF NOT EXISTS project_templates_org_idx ON project_templates(organization_id);`;
  await sql`CREATE INDEX IF NOT EXISTS project_templates_process_idx ON project_templates(process_definition_id);`;
  console.log("OK: indexes");

  console.log("\nMigración completa.");
} catch (err) {
  console.error("ERR:", err.message);
  process.exit(1);
} finally {
  await sql.end();
}
