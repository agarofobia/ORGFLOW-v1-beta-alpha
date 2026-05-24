// POST /api/ai/chat
//
// Refactor multi-provider: usa Vercel AI SDK (generateText) en vez del SDK
// de Anthropic directo. Soporta Claude, Gemini, GPT y Mistral según el
// provider configurado por la org.
//
// Permission: ai.create
// El user trae su API key (BYOK), FlowOS solo orquesta + valida permisos.

import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { aiConfig } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { generateText, type ModelMessage } from "ai";
import { requirePermission } from "@/lib/require-permission";
import { getUserPermissions } from "@/lib/get-user-permissions";
import { decrypt } from "@/lib/encryption";
import { buildTools, filterToolsByPermissions } from "@/lib/ai/tools";
import { getModel, isValidProvider } from "@/lib/ai/providers";

const SYSTEM_PROMPT = `Sos el asistente de FlowOS, una suite BPM/ERP correlacional.
La empresa del usuario tiene un organigrama, proyectos, hitos, tareas y procesos BPM.

REGLAS:
- Respondé siempre en español rioplatense, directo y conciso.
- Antes de crear cosas (proyectos, hitos, tareas), si el user menciona "división X" o "departamento Y" o "[nombre de persona]", usá get_organization_structure / list_employees para resolver los UUIDs reales.
- Si te falta info crítica (ej: nombre del proyecto), preguntá antes de crear.
- Para creates importantes (proyecto nuevo), confirmá con el user qué vas a hacer antes de ejecutar, salvo que el pedido sea inequívoco.
- Si una tool devuelve { error: ... }, contale al user qué pasó.
- NO inventes IDs. Siempre buscalos primero con las tools de read.
- Si el user pide algo que requiere permiso que no tenés, decile qué permiso falta.

Tu objetivo es ahorrarle clicks al user, no reemplazar su criterio.`;

const MAX_STEPS = 8;

export async function POST(req: NextRequest) {
  const block = await requirePermission("ai", "create");
  if (block) return block;
  const { orgId, userId: clerkUserId, orgRole } = await auth();
  if (!orgId || !clerkUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const previousMessages = Array.isArray(body.messages) ? (body.messages as ModelMessage[]) : [];
    const newMessage = typeof body.newMessage === "string" ? body.newMessage.trim() : "";
    if (!newMessage) {
      return NextResponse.json({ error: "newMessage requerido" }, { status: 400 });
    }

    // ─── Cargar config + decrypt key ───────────────────────────────────────
    const [cfg] = await db.select().from(aiConfig).where(eq(aiConfig.organizationId, orgId)).limit(1);
    if (!cfg || !cfg.enabled || !cfg.encryptedApiKey) {
      return NextResponse.json(
        { error: "El asistente IA no está configurado o está deshabilitado para esta organización." },
        { status: 412 }
      );
    }
    if (!isValidProvider(cfg.provider)) {
      return NextResponse.json(
        { error: `Provider configurado inválido: ${cfg.provider}` },
        { status: 500 }
      );
    }
    let apiKey: string;
    try {
      apiKey = decrypt(cfg.encryptedApiKey);
    } catch {
      return NextResponse.json(
        { error: "La API key guardada está corrupta o la clave de encriptación cambió. Reconfigurar." },
        { status: 500 }
      );
    }

    // ─── Permisos + filtrado de tools ─────────────────────────────────────
    const permissions = await getUserPermissions(orgId, clerkUserId, orgRole);
    const allTools = buildTools({ orgId, clerkUserId, permissions });
    const tools = filterToolsByPermissions(allTools, permissions);

    // ─── Modelo del provider seleccionado ─────────────────────────────────
    const model = getModel(cfg.provider, apiKey, cfg.model);

    // ─── Conversación ─────────────────────────────────────────────────────
    const messages: ModelMessage[] = [
      ...previousMessages,
      { role: "user", content: newMessage },
    ];

    // ─── generateText con tool-use loop integrado ─────────────────────────
    // Vercel AI SDK maneja el loop automáticamente: ejecuta tools hasta que
    // el modelo deja de pedirlas o se llega a maxSteps.
    const result = await generateText({
      model,
      system: SYSTEM_PROMPT,
      messages,
      tools: tools as Parameters<typeof generateText>[0]["tools"],
      stopWhen: ({ steps }) => steps.length >= MAX_STEPS,
    });

    // Devolvemos la conversación completa (incluyendo los pasos intermedios
    // con tool calls). El client decide qué mostrar.
    const updatedMessages: ModelMessage[] = [
      ...messages,
      ...result.response.messages.map((m) => ({ role: m.role, content: m.content } as ModelMessage)),
    ];

    return NextResponse.json({
      messages: updatedMessages,
      lastResponse: result.text || "(Sin respuesta final)",
      steps: result.steps.length,
      provider: cfg.provider,
      model: cfg.model,
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
