import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL!;

// Cache global para evitar reabrir el pool en cada hot reload de Next.js dev.
// Sin esto, cada cambio de archivo crea un cliente nuevo y satura el pool de Supabase (max 15 conexiones).
declare global {
  // eslint-disable-next-line no-var
  var __pgClient: ReturnType<typeof postgres> | undefined;
}

const client =
  globalThis.__pgClient ??
  postgres(connectionString, {
    prepare: false,
    max: 5,                  // mantener bajo para no saturar el pooler de Supabase
    idle_timeout: 20,        // cerrar conexiones idle a los 20s
    max_lifetime: 60 * 30,   // reciclar conexiones cada 30 min
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__pgClient = client;
}

export const db = drizzle(client, { schema });
export { schema };
