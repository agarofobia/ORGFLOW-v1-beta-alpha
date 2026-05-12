import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });

const url = process.env.DATABASE_URL;
if (!url) { console.error("no DATABASE_URL"); process.exit(1); }

const sql = postgres(url, { max: 1, prepare: false });

try {
  await sql`
    ALTER TABLE employees
    ADD COLUMN IF NOT EXISTS manual_position BOOLEAN NOT NULL DEFAULT FALSE;
  `;
  const updated = await sql`
    UPDATE employees
    SET manual_position = TRUE
    WHERE (position_x IS NOT NULL AND position_x != 0)
       OR (position_y IS NOT NULL AND position_y != 0);
  `;
  console.log("OK: column added. rows preserved:", updated.count);
} catch (err) {
  console.error("ERR:", err.message);
  process.exit(1);
} finally {
  await sql.end();
}
