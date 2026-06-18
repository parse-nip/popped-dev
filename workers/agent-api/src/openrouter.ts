import { DEFAULT_OPENROUTER_MODEL } from "../../../shared/openrouter-config";
import type { Env } from "./types";

export { DEFAULT_OPENROUTER_MODEL };

export type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type OpenRouterChatOptions = {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  /** Request JSON object output when the model supports structured responses. */
  jsonMode?: boolean;
};

export function resolveOpenRouterModel(env: Env): string {
  return env.OPENROUTER_MODEL?.trim() || DEFAULT_OPENROUTER_MODEL;
}

function openRouterHeaders(env: Env): HeadersInit {
  const apiKey = env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured.");
  }

  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": env.CORS_ORIGIN || "https://popped.dev",
    "X-Title": "popped.dev design",
  };
}

function extractMessageContent(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const data = payload as {
    choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim() || null;
  if (Array.isArray(content)) {
    const text = content
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .join("");
    return text.trim() || null;
  }
  return null;
}

/** OpenRouter chat completion (OpenAI-compatible). Returns assistant text or null on failure. */
export async function openRouterChat(
  env: Env,
  messages: ChatMessage[],
  options: OpenRouterChatOptions = {},
): Promise<string | null> {
  if (!env.OPENROUTER_API_KEY?.trim()) return null;

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: openRouterHeaders(env),
      body: JSON.stringify({
        model: options.model ?? resolveOpenRouterModel(env),
        messages,
        max_tokens: options.maxTokens ?? 4096,
        temperature: options.temperature ?? 0.2,
        stream: false,
        ...(options.jsonMode ? { response_format: { type: "json_object" } } : {}),
        reasoning: { max_tokens: 512 },
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.warn("OpenRouter request failed:", response.status, detail.slice(0, 400));
      return null;
    }

    return extractMessageContent(await response.json());
  } catch (error) {
    console.warn("OpenRouter chat failed:", error);
    return null;
  }
}
