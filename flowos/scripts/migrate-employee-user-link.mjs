// Migración: vincular employees con cuentas Clerk via user_id.
// Sin esto no podemos saber "qué tareas tiene el usuario logueado" → bloqueante para vista "Mi día".

import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL no está definido en .env.local");
  process.exit(1);
}

const sql = postgres(url, { max: 1, prepare: false });

try {
  await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS user_id TEXT;`;
  console.log("OK: employees.user_id");

  await sql`CREATE INDEX IF NOT EXISTS employees_user_id_idx ON employees(user_id);`;
  console.log("OK: employees_user_id_idx");

  console.log("\nMigración completa.");
} catch (err) {
  console.error("ERR:", err.message);
  process.exit(1);
} finally {
  await sql.end();
}
