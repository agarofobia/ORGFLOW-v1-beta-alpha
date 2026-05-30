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
    // max: el dashboard dispara ~7 GETs en paralelo al cargar. Bajarlo a 3 dejó
    // sin headroom ese burst en cold start → queries encoladas fallaban ("Failed
    // query") en TODOS los endpoints. 5 es el valor conocido-bueno; lo mantenemos.
    max: 5,
    idle_timeout: 20,        // cerrar conexiones idle a los 20s
    max_lifetime: 60 * 5,    // reciclar conexiones cada 5 min (en lugar de 30 min)
    connect_timeout: 15,
  });
}

// ─── Retry transparente ante caídas transitorias de conexión ──────────────────
// Supavisor (transaction pooler) puede cerrar/corromper una conexión del pool
// entre invocaciones del Lambda warm. postgres-js entonces tira el error con code
// de conexión y drizzle lo envuelve como "Failed query" → 500 en endpoints random.
// Como el bache es transitorio (se auto-cura en ~ms), reintentamos la query un par
// de veces con backoff corto. Envolvemos `client.unsafe` (el único punto por el que
// drizzle ejecuta: `await unsafe(...)` y `unsafe(...).values()`), así cubre TODAS las
// queries sin tocar ningún call site.
const TRANSIENT_CODES = new Set([
  "CONNECTION_ENDED", "CONNECTION_CLOSED", "CONNECTION_DESTROYED", "CONNECT_TIMEOUT",
  "ECONNRESET", "EPIPE", "ETIMEDOUT",
  "08000", "08001", "08003", "08004", "08006", // class 08 — connection exception
  "57P01", "57P03",                              // admin shutdown / cannot connect now
]);

function isTransient(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  if (code && TRANSIENT_CODES.has(code)) return true;
  const msg = (err as { message?: string })?.message ?? "";
  return /connection|terminat|ECONNRESET|EPIPE|timeout/i.test(msg);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Unsafe = (...args: unknown[]) => { values: (...a: unknown[]) => Promise<unknown> } & PromiseLike<unknown>;

function withRetry(pg: ReturnType<typeof postgres>) {
  const origUnsafe = pg.unsafe.bind(pg) as unknown as Unsafe;
  const run = async (useValues: boolean, args: unknown[]) => {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const pending = origUnsafe(...args);
        return await (useValues ? pending.values() : pending);
      } catch (err) {
        lastErr = err;
        if (attempt < 3 && isTransient(err)) { await sleep(40 * 2 ** attempt); continue; }
        throw err;
      }
    }
    throw lastErr;
  };
  // Devolvemos un "pending" perezoso que soporta await y .values() (lo que usa
  // drizzle). Cada pending se consume una sola vez → sin doble ejecución.
  (pg as unknown as { unsafe: unknown }).unsafe = (...args: unknown[]) => ({
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => run(false, args).then(resolve, reject),
    catch: (reject: (e: unknown) => unknown) => run(false, args).catch(reject),
    finally: (cb: () => void) => run(false, args).finally(cb),
    values: () => run(true, args),
  });
  return pg;
}

const client =
  process.env.NODE_ENV === "production"
    ? withRetry(createClient())
    : (globalThis.__pgClient ??= withRetry(createClient()));

export const db = drizzle(client, { schema });
export { schema };
