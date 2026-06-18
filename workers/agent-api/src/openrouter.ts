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
};

export type OpenRouterChatResult = {
  text: string | null;
  error: string | null;
  status?: number;
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

type ContentPart = {
  type?: string;
  text?: string;
};

function contentPartText(part: unknown): string {
  if (typeof part === "string") return part;
  if (!part || typeof part !== "object") return "";
  const typed = part as ContentPart;
  if (typeof typed.text === "string") return typed.text;
  return "";
}

function extractMessageContent(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;

  const data = payload as {
    choices?: Array<{
      message?: {
        content?: string | ContentPart[] | null;
        reasoning?: string | null;
      };
      text?: string;
    }>;
  };

  const message = data.choices?.[0]?.message;
  if (!message) {
    const legacy = data.choices?.[0]?.text;
    return typeof legacy === "string" && legacy.trim() ? legacy.trim() : null;
  }

  const { content, reasoning } = message;

  if (typeof content === "string" && content.trim()) {
    return content.trim();
  }

  if (Array.isArray(content)) {
    const text = content.map(contentPartText).join("").trim();
    if (text) return text;
  }

  if (typeof reasoning === "string" && reasoning.trim()) {
    const jsonStart = reasoning.indexOf("{");
    const jsonEnd = reasoning.lastIndexOf("}");
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      return reasoning.slice(jsonStart, jsonEnd + 1).trim();
    }
  }

  return null;
}

/** OpenRouter chat completion (OpenAI-compatible). */
export async function openRouterChat(
  env: Env,
  messages: ChatMessage[],
  options: OpenRouterChatOptions = {},
): Promise<OpenRouterChatResult> {
  if (!env.OPENROUTER_API_KEY?.trim()) {
    return { text: null, error: "OPENROUTER_API_KEY is not configured." };
  }

  const model = options.model ?? resolveOpenRouterModel(env);

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: openRouterHeaders(env),
      body: JSON.stringify({
        model,
        messages,
        max_tokens: options.maxTokens ?? 4096,
        temperature: options.temperature ?? 0.2,
        stream: false,
        reasoning: { effort: "none" },
        plugins: [{ id: "response-healing" }],
      }),
    });

    const rawBody = await response.text();

    if (!response.ok) {
      const detail = rawBody.slice(0, 500);
      console.warn("OpenRouter request failed:", response.status, detail);
      return {
        text: null,
        error: `OpenRouter HTTP ${response.status}: ${detail || "request failed"}`,
        status: response.status,
      };
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return {
        text: null,
        error: "OpenRouter returned a non-JSON response.",
        status: response.status,
      };
    }

    const text = extractMessageContent(payload);
    if (!text) {
      console.warn("OpenRouter empty content:", rawBody.slice(0, 600));
      return {
        text: null,
        error: "OpenRouter returned an empty response.",
        status: response.status,
      };
    }

    return { text, error: null, status: response.status };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("OpenRouter chat failed:", message);
    return { text: null, error: message };
  }
}
