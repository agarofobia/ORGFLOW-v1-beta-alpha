import { NextResponse } from "next/server";
import type { z } from "zod";

/**
 * Valida un body contra un schema de zod.
 * - Si pasa: devuelve { data } con el valor parseado y tipado.
 * - Si falla: devuelve { response } con un 400 que lista los issues (sin filtrar internals).
 *
 * Uso:
 *   const v = validateBody(schema, await req.json());
 *   if ("response" in v) return v.response;
 *   const data = v.data; // tipado
 *
 * Nota: las rutas pueden seguir leyendo del `body` original (passthrough); el schema
 * solo asegura que los campos requeridos existan y tengan el tipo correcto.
 */
export function validateBody<S extends z.ZodTypeAny>(
  schema: S,
  body: unknown
): { data: z.infer<S> } | { response: NextResponse } {
  const result = schema.safeParse(body);
  if (!result.success) {
    return {
      response: NextResponse.json(
        {
          error: "Validación fallida",
          issues: result.error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        },
        { status: 400 }
      ),
    };
  }
  return { data: result.data };
}
