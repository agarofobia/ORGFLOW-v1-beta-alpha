// Migración: cerrar el loop BPM ↔ Templates de Proyecto.
// 1. process_definitions.project_template_id → asocia un template al proceso
// 2. projects.process_instance_id → linkea un proyecto auto-creado a la instancia que lo originó

import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });
const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL no definido"); process.exit(1); }
const sql = postgres(url, { max: 1, prepare: false });

try {
  await sql`
    ALTER TABLE process_definitions
    ADD COLUMN IF NOT EXISTS project_template_id UUID
    REFERENCES project_templates(id) ON DELETE SET NULL;
  `;
  console.log("OK: process_definitions.project_template_id");

  await sql`
    ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS process_instance_id UUID
    REFERENCES process_instances(id) ON DELETE SET NULL;
  `;
  console.log("OK: projects.process_instance_id");

  await sql`CREATE INDEX IF NOT EXISTS process_definitions_template_idx ON process_definitions(project_template_id);`;
  await sql`CREATE INDEX IF NOT EXISTS projects_process_instance_idx ON projects(process_instance_id);`;
  console.log("OK: indexes");

  console.log("\nMigración completa.");
} catch (err) {
  console.error("ERR:", err.message);
  process.exit(1);
} finally {
  await sql.end();
}
