import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });

const url = process.env.DATABASE_URL;
if (!url) { console.error("no DATABASE_URL"); process.exit(1); }

const sql = postgres(url, { max: 1, prepare: false });

try {
  // 1. Tabla units
  await sql`
    CREATE TABLE IF NOT EXISTS units (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id text NOT NULL,
      department_id uuid NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
      name text NOT NULL,
      color text,
      head_employee_id uuid,
      position_x double precision DEFAULT 0,
      position_y double precision DEFAULT 0,
      size_width double precision DEFAULT 260,
      size_height double precision DEFAULT 160,
      created_at timestamp with time zone NOT NULL DEFAULT now()
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS units_org_idx ON units(organization_id);`;
  await sql`CREATE INDEX IF NOT EXISTS units_dept_idx ON units(department_id);`;
  console.log("OK: units table");

  // 2. employees.role
  await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS role text;`;
  console.log("OK: employees.role");

  // 3. employees.unit_id
  await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS unit_id uuid;`;
  console.log("OK: employees.unit_id");

  console.log("\nMigración completa.");
} catch (err) {
  console.error("ERR:", err.message);
  process.exit(1);
} finally {
  await sql.end();
}
