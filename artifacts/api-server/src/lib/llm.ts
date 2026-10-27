/**
 * LLM Client — Groq-first with deterministic offline fallback.
 *
 * Provider detection order:
 *   1. GROQ_API_KEY → groq (llama-3.3-70b-versatile)
 *   2. OPENAI_API_KEY → openai (gpt-4o-mini)
 *   3. offline → deterministic heuristic templates (zero external deps)
 *
 * Every exported function:
 *   - Never throws to the caller
 *   - Returns null / empty string on any error
 *   - Falls back to offline if the LLM call fails
 */

import { logger } from "./logger.js";

// ── Provider detection ────────────────────────────────────────────────────────

type Provider = "groq" | "openai" | "offline";

function detectProvider(): Provider {
  const forced = process.env.LLM_PROVIDER?.toLowerCase();
  if (forced === "groq" || forced === "openai" || forced === "offline") {
    return forced;
  }
  if (process.env.GROQ_API_KEY) return "groq";
  if (process.env.OPENAI_API_KEY) return "openai";
  return "offline";
}

export const provider: Provider = detectProvider();

logger.info({ provider }, "LLM provider selected");

// ── Core completion ───────────────────────────────────────────────────────────

interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function complete(messages: Message[], maxTokens = 1200): Promise<string> {
  if (provider === "groq") {
    // Determine which model to use — prefer env override, fall back to working defaults
    const primaryModel = process.env.GROQ_MODEL ?? "qwen/qwen3.8-27b";
    const fallbackModel = "allam-2-7b";

    const tryModel = async (model: string): Promise<string> => {
      const { Groq } = await import("groq-sdk");
      const client = new Groq({ apiKey: process.env.GROQ_API_KEY });
      const resp = await client.chat.completions.create({
        model,
        messages,
        max_tokens: maxTokens,
        temperature: 0.2,
      });
      return resp.choices[0]?.message.content ?? "";
    };

    try {
      return await tryModel(primaryModel);
    } catch (err: unknown) {
      // If primary model not found, try fallback
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("model_not_found") || msg.includes("does not exist")) {
        logger.warn({ model: primaryModel }, "Groq primary model not found — trying fallback");
        try {
          return await tryModel(fallbackModel);
        } catch (err2) {
          logger.warn({ err: err2, model: fallbackModel }, "Groq fallback model also failed — offline mode");
          return "";
        }
      }
      logger.warn({ err }, "Groq API call failed — falling back to offline");
      return "";
    }
  }

  if (provider === "openai") {
    try {
      const { OpenAI } = await import("openai");
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const resp = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages,
        max_tokens: maxTokens,
        temperature: 0.2,
      });
      return resp.choices[0]?.message.content ?? "";
    } catch (err) {
      logger.warn({ err }, "OpenAI API call failed — falling back to offline");
      return "";
    }
  }

  return ""; // offline — callers supply their own template
}

// ── Typed helpers ─────────────────────────────────────────────────────────────

export function isLive(): boolean {
  return provider !== "offline";
}

export function providerName(): string {
  return provider;
}
