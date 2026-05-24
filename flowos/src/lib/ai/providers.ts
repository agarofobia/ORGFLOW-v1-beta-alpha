// Abstracción multi-provider del asistente IA.
// El user trae su propia API key (BYOK) de cualquier provider soportado.
// Vercel AI SDK normaliza la respuesta y formato de tool use entre todos.

import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createMistral } from "@ai-sdk/mistral";
import type { LanguageModel } from "ai";

export type AiProvider = "anthropic" | "google" | "openai" | "mistral";

// ─── Catálogo de modelos por provider ────────────────────────────────────────
// El usuario elige uno desde el dropdown en Settings. Los IDs reflejan lo que
// el SDK espera. Defaults son los modelos más balanceados (rápido + capable).

export const PROVIDER_CATALOG: Record<AiProvider, {
  label: string;
  keyPrefix: string;
  keyPlaceholder: string;
  keyHelpUrl: string;
  defaultModel: string;
  models: Array<{ id: string; label: string; tier: "fast" | "balanced" | "powerful" }>;
}> = {
  anthropic: {
    label: "Anthropic (Claude)",
    keyPrefix: "sk-ant-",
    keyPlaceholder: "sk-ant-api03-…",
    keyHelpUrl: "https://console.anthropic.com/settings/keys",
    defaultModel: "claude-sonnet-4-6",
    models: [
      { id: "claude-haiku-4-5",  label: "Claude Haiku 4.5 (rápido y barato)", tier: "fast" },
      { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 (recomendado)",    tier: "balanced" },
      { id: "claude-opus-4-7",   label: "Claude Opus 4.7 (más potente)",      tier: "powerful" },
    ],
  },
  google: {
    label: "Google (Gemini)",
    keyPrefix: "AIza",
    keyPlaceholder: "AIzaSy…",
    keyHelpUrl: "https://aistudio.google.com/app/apikey",
    defaultModel: "gemini-2.5-flash",
    models: [
      { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite (gratis, más rápido)", tier: "fast" },
      { id: "gemini-2.5-flash",      label: "Gemini 2.5 Flash (gratis hasta 1500/día)",   tier: "balanced" },
      { id: "gemini-2.5-pro",        label: "Gemini 2.5 Pro (más potente)",                tier: "powerful" },
    ],
  },
  openai: {
    label: "OpenAI (GPT)",
    keyPrefix: "sk-",
    keyPlaceholder: "sk-proj-… o sk-…",
    keyHelpUrl: "https://platform.openai.com/api-keys",
    defaultModel: "gpt-4o",
    models: [
      { id: "gpt-4o-mini",  label: "GPT-4o mini (rápido y barato)",  tier: "fast" },
      { id: "gpt-4o",       label: "GPT-4o (balanceado)",             tier: "balanced" },
      { id: "gpt-4-turbo",  label: "GPT-4 Turbo",                     tier: "powerful" },
    ],
  },
  mistral: {
    label: "Mistral",
    keyPrefix: "",
    keyPlaceholder: "(tu API key de Mistral)",
    keyHelpUrl: "https://console.mistral.ai/api-keys/",
    defaultModel: "mistral-large-latest",
    models: [
      { id: "mistral-small-latest", label: "Mistral Small (rápido)",       tier: "fast" },
      { id: "mistral-large-latest", label: "Mistral Large (recomendado)",  tier: "balanced" },
    ],
  },
};

// ─── Validación de API key según provider ────────────────────────────────────

export function validateApiKey(provider: AiProvider, key: string): { ok: boolean; error?: string } {
  const trimmed = key.trim();
  if (!trimmed) return { ok: false, error: "La API key no puede estar vacía" };
  if (trimmed.length < 16) return { ok: false, error: "La API key parece demasiado corta" };

  const catalog = PROVIDER_CATALOG[provider];
  if (!catalog) return { ok: false, error: `Provider desconocido: ${provider}` };

  // Si el provider tiene prefijo conocido, validar
  if (catalog.keyPrefix && !trimmed.startsWith(catalog.keyPrefix)) {
    return {
      ok: false,
      error: `La API key de ${catalog.label} debe empezar con "${catalog.keyPrefix}"`,
    };
  }
  return { ok: true };
}

// ─── Factory de modelos ──────────────────────────────────────────────────────
// Devuelve un LanguageModel listo para pasar a generateText().

export function getModel(provider: AiProvider, apiKey: string, modelId: string): LanguageModel {
  switch (provider) {
    case "anthropic": {
      const client = createAnthropic({ apiKey });
      return client(modelId);
    }
    case "google": {
      const client = createGoogleGenerativeAI({ apiKey });
      return client(modelId);
    }
    case "openai": {
      const client = createOpenAI({ apiKey });
      return client(modelId);
    }
    case "mistral": {
      const client = createMistral({ apiKey });
      return client(modelId);
    }
    default:
      throw new Error(`Provider no soportado: ${provider}`);
  }
}

// ─── Helpers para UI ─────────────────────────────────────────────────────────

export function isValidProvider(p: string): p is AiProvider {
  return p === "anthropic" || p === "google" || p === "openai" || p === "mistral";
}

export function getDefaultModelFor(provider: AiProvider): string {
  return PROVIDER_CATALOG[provider].defaultModel;
}
