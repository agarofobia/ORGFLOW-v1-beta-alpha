import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL!;

// En dev cacheamos el cliente a nivel global para evitar reabrir el pool en
// cada hot reload (saturaría el pool de Supabase con max 15 conexiones).
//
// En production NO cacheamos. Bug conocido: postgres-js + Supavisor (transaction
// pooler de Supabase, puerto 6543) + Vercel Serverless Lambdas warm causa que
// las conexiones cacheadas se corrompan entre invocaciones. Sintoma: queries
// fallan con "Failed query" sin razón aparente despues de unos minutos.
//
// Solucion: crear un cliente nuevo por cada cold start del Lambda. Como Vercel
// reusa el Lambda entre requests (warm starts comparten el module-scope), esto
// significa que el cliente se reusa entre requests del mismo Lambda warm, pero
// NO compartimos un cliente "global" entre Lambdas distintos.
//
// Trade-off: ~50-100ms overhead en el primer request de cada cold start.
// Beneficio: cero corrupcion de pool, queries consistentes en producción.
declare global {
  // eslint-disable-next-line no-var
  var __pgClient: ReturnType<typeof postgres> | undefined;
}

function createClient() {
  return postgres(connectionString, {
    prepare: false,          // requerido por Supavisor transaction pooler
    max: 5,                  // mantener bajo para no saturar el pool de Supabase
    idle_timeout: 20,        // cerrar conexiones idle a los 20s
    max_lifetime: 60 * 5,    // reciclar conexiones cada 5 min (en lugar de 30 min)
    connect_timeout: 15,
  });
}

const client =
  process.env.NODE_ENV === "production"
    ? createClient()
    : (globalThis.__pgClient ??= createClient());

export const db = drizzle(client, { schema });
export { schema };
