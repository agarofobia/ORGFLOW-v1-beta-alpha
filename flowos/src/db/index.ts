import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL!;

// En dev cacheamos el cliente a nivel global para evitar reabrir el pool en
// cada hot reload (saturaría el pool de Supabase con max 15 conexiones).
// En production NO cacheamos: postgres-js + Supavisor transaction pooler tiene
// un bug conocido donde el connection pool se corrompe entre warm starts del
// Lambda y queries empiezan a fallar con "Failed query" sin razón aparente.
// Crear cliente fresh por request en serverless agrega ~50-100ms pero elimina
// el problema 100%.
declare global {
  // eslint-disable-next-line no-var
  var __pgClient: ReturnType<typeof postgres> | undefined;
}

function createClient() {
  return postgres(connectionString, {
    prepare: false,           // requerido por Supavisor transaction pooler
    max: 1,                   // 1 connection por Lambda warm (multi-statement no necesario)
    idle_timeout: 5,          // cerrar conexiones idle agresivamente
    max_lifetime: 60,         // reciclar conexiones cada minuto
    connect_timeout: 10,
  });
}

const client =
  process.env.NODE_ENV === "production"
    ? createClient()
    : (globalThis.__pgClient ??= createClient());

export const db = drizzle(client, { schema });
export { schema };
