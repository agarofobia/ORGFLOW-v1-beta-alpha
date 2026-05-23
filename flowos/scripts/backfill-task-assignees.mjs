// Backfill: tasks legacy con assigneeName (texto libre) → assigneeEmployeeId (FK).
// Recorre tasks donde assigneeEmployeeId es NULL pero assigneeName tiene valor.
// Hace match exact por fullName dentro de la misma org. Si hay match → updatea.
// Si hay ambigüedad (2 employees con mismo nombre en la org), loggea para review manual.
//
// Run: npm run --silent dev -- node scripts/backfill-task-assignees.mjs
// O direct: cd flowos && node scripts/backfill-task-assignees.mjs
//
// Idempotente: se puede correr múltiples veces sin efectos secundarios.

import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL no definido");
  process.exit(1);
}

const sql = postgres(url, { max: 1, prepare: false });

try {
  // 1. Cuántos tasks tienen assigneeName pero NO assigneeEmployeeId
  const [pending] = await sql`
    SELECT COUNT(*) AS n FROM tasks t
    JOIN projects p ON p.id = t.project_id
    WHERE t.assignee_name IS NOT NULL
      AND t.assignee_name != ''
      AND t.assignee_employee_id IS NULL
  `;
  console.log(`Tasks legacy a evaluar: ${pending.n}`);

  if (Number(pending.n) === 0) {
    console.log("Nada para backfillar.");
    process.exit(0);
  }

  // 2. Match unico por fullName dentro de la misma org del proyecto
  const matched = await sql`
    UPDATE tasks t
    SET assignee_employee_id = e.id
    FROM projects p, employees e
    WHERE t.project_id = p.id
      AND e.organization_id = p.organization_id
      AND e.full_name = t.assignee_name
      AND t.assignee_employee_id IS NULL
      AND (
        SELECT COUNT(*) FROM employees e2
        WHERE e2.organization_id = p.organization_id
          AND e2.full_name = t.assignee_name
      ) = 1
    RETURNING t.id
  `;
  console.log(`Tasks updatedas (match unico): ${matched.length}`);

  // 3. Reportar ambiguos para review manual
  const ambiguous = await sql`
    SELECT
      t.id AS task_id,
      t.title,
      t.assignee_name,
      p.organization_id,
      (
        SELECT COUNT(*) FROM employees e
        WHERE e.organization_id = p.organization_id
          AND e.full_name = t.assignee_name
      ) AS matches
    FROM tasks t
    JOIN projects p ON p.id = t.project_id
    WHERE t.assignee_name IS NOT NULL
      AND t.assignee_name != ''
      AND t.assignee_employee_id IS NULL
  `;
  if (ambiguous.length > 0) {
    console.log(`\nTasks con assigneeName sin match unico (review manual):`);
    for (const row of ambiguous) {
      const reason = row.matches === 0
        ? "no existe employee con ese nombre"
        : `${row.matches} employees con ese nombre (ambiguo)`;
      console.log(`  - "${row.title}" → assigneeName="${row.assignee_name}" — ${reason}`);
    }
  }

  console.log("\nBackfill completo.");
} catch (err) {
  console.error("ERR:", err.message);
  process.exit(1);
} finally {
  await sql.end();
}
