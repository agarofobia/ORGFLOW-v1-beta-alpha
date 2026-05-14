import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });

const url = process.env.DATABASE_URL;
if (!url) { console.error("no DATABASE_URL"); process.exit(1); }

const sql = postgres(url, { max: 1, prepare: false });

try {
  await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS image_url TEXT;`;
  console.log("OK: employees.image_url");
} catch (err) {
  console.error("ERR:", err.message);
  process.exit(1);
} finally {
  await sql.end();
}
