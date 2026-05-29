import { NextResponse } from "next/server";

/**
 * Respuesta de error estándar para API routes.
 *
 * Loguea el error REAL del lado server (visible en los logs de Vercel) pero
 * devuelve un mensaje genérico al cliente. NUNCA filtrar SQL, nombres de tablas,
 * schema ni internals al browser — eso es disclosure de información.
 *
 * Reemplaza el patrón viejo `NextResponse.json({ error: String(err) }, { status: 500 })`.
 */
export function apiError(err: unknown, status = 500) {
  console.error("[API error]", err);
  return NextResponse.json({ error: "Internal server error" }, { status });
}
