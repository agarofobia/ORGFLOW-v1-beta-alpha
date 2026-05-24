// POST /api/ai/chat
//
// Recibe { messages: [...], newMessage: string } y devuelve { messages, lastResponse }.
// El server maneja el tool-use loop hasta que la IA da una respuesta final.
//
// Permission: requiere ai.create.
// Auth: usa la API key encriptada de la org (BYOK) + permisos del user para
// filtrar qué tools puede invocar la IA.

import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { aiConfig } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requirePermission } from "@/lib/require-permission";
import { getUserPermissions } from "@/lib/get-user-permissions";
import { decrypt } from "@/lib/encryption";
import {
  executeTool,
  getAvailableTools,
  toAnthropicTools,
} from "@/lib/ai/tools";

const SYSTEM_PROMPT = `Sos el asistente de FlowOS, una suite BPM/ERP correlacional.
La empresa del usuario tiene un organigrama, proyectos, hitos, tareas y procesos BPM.

REGLAS:
- Respondé siempre en español rioplatense, directo y conciso.
- Antes de crear cosas (proyectos, hitos, tareas), si el user menciona "división X" o "departamento Y" o "[nombre]", usá get_organization_structure / list_employees para resolver los UUIDs reales.
- Si te falta info crítica (ej: nombre del proyecto), preguntá antes de crear.
- Para creates importantes (proyecto nuevo), confirmá con el user qué vas a hacer antes de ejecutar, salvo que el pedido sea inequívoco.
- Si una tool devuelve { error: ... }, contale al user qué pasó.
- NO inventes IDs. Siempre buscalos primero con las tools de read.
- Si el user pide algo que requiere permiso que no tenés, decile qué permiso falta.

Tu objetivo es ahorrarle clicks al user, no reemplazar su criterio.`;

const MAX_ITERATIONS = 8;

// Acepto tanto strings (cuando el cliente manda mensajes simples) como bloques
// (cuando viene del historial con tool_use / tool_result).
type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };

type ChatMessage = {
  role: "user" | "assistant";
  content: string | ContentBlock[];
};

export async function POST(req: NextRequest) {
  const block = await requirePermission("ai", "create");
  if (block) return block;
  const { orgId, userId: clerkUserId, orgRole } = await auth();
  if (!orgId || !clerkUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const previousMessages = (Array.isArray(body.messages) ? body.messages : []) as ChatMessage[];
    const newMessage = typeof body.newMessage === "string" ? body.newMessage.trim() : "";
    if (!newMessage) {
      return NextResponse.json({ error: "newMessage requerido" }, { status: 400 });
    }

    // Cargar config + API key
    const [cfg] = await db.select().from(aiConfig).where(eq(aiConfig.organizationId, orgId)).limit(1);
    if (!cfg || !cfg.enabled || !cfg.encryptedApiKey) {
      return NextResponse.json(
        { error: "El asistente IA no está configurado o está deshabilitado para esta organización." },
        { status: 412 }
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

    // Permisos del user → filtrar tools disponibles
    const permissions = await getUserPermissions(orgId, clerkUserId, orgRole);
    const availableTools = getAvailableTools(permissions);
    const anthropicTools = toAnthropicTools(availableTools);

    const client = new Anthropic({ apiKey });

    // Armar conversación
    const conversation: ChatMessage[] = [
      ...previousMessages,
      { role: "user", content: newMessage },
    ];

    // Tool-use loop
    let iterations = 0;
    let finalText = "";

    while (iterations < MAX_ITERATIONS) {
      iterations++;

      const response = await client.messages.create({
        model: cfg.model,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        tools: anthropicTools,
        messages: conversation as unknown as Anthropic.MessageParam[],
      });

      // Agregar la respuesta del assistant a la conversación
      conversation.push({
        role: "assistant",
        content: response.content as unknown as ContentBlock[],
      });

      // Si no hay tool_use, terminamos
      const toolUses = response.content.filter((c) => c.type === "tool_use");
      if (toolUses.length === 0 || response.stop_reason === "end_turn") {
        const textBlock = response.content.find((c) => c.type === "text");
        if (textBlock && textBlock.type === "text") finalText = textBlock.text;
        break;
      }

      // Ejecutar tools y armar tool_result blocks
      const toolResults: ContentBlock[] = [];
      for (const block of toolUses) {
        if (block.type !== "tool_use") continue;
        const result = await executeTool(block.name, (block.input as Record<string, unknown>) ?? {}, {
          orgId,
          clerkUserId,
          permissions,
        });
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      }

      // Próximo turn: user message con todos los tool_results juntos
      conversation.push({ role: "user", content: toolResults });
    }

    return NextResponse.json({
      messages: conversation,
      lastResponse: finalText || "(Sin respuesta final)",
      iterations,
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
