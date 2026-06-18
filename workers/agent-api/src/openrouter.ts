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

export type OpenRouterStreamHandlers = {
  onDelta?: (delta: string) => void;
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

function extractStreamDelta(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";

  const data = payload as {
    choices?: Array<{
      delta?: {
        content?: string | ContentPart[] | null;
        reasoning?: string | null;
      };
      text?: string;
    }>;
  };

  const delta = data.choices?.[0]?.delta;
  if (!delta) {
    const legacy = data.choices?.[0]?.text;
    return typeof legacy === "string" ? legacy : "";
  }

  if (typeof delta.content === "string") {
    return delta.content;
  }

  if (Array.isArray(delta.content)) {
    return delta.content.map(contentPartText).join("");
  }

  if (typeof delta.reasoning === "string") {
    return delta.reasoning;
  }

  return "";
}

function parseSseDataLines(chunk: string): string[] {
  const events: string[] = [];
  const lines = chunk.split("\n");

  for (const line of lines) {
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") continue;
    events.push(data);
  }

  return events;
}

/** OpenRouter chat completion with optional token streaming. */
export async function openRouterChatStream(
  env: Env,
  messages: ChatMessage[],
  options: OpenRouterChatOptions & OpenRouterStreamHandlers = {},
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
        stream: true,
        reasoning: { effort: "none" },
        plugins: [{ id: "response-healing" }],
      }),
    });

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      console.warn("OpenRouter stream failed:", response.status, detail);
      return {
        text: null,
        error: `OpenRouter HTTP ${response.status}: ${detail || "request failed"}`,
        status: response.status,
      };
    }

    if (!response.body) {
      return { text: null, error: "OpenRouter returned an empty stream.", status: response.status };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullText = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";

      for (const part of parts) {
        for (const dataLine of parseSseDataLines(part)) {
          try {
            const payload = JSON.parse(dataLine) as unknown;
            const delta = extractStreamDelta(payload);
            if (!delta) continue;
            fullText += delta;
            options.onDelta?.(delta);
          } catch {
            // Ignore malformed SSE chunks.
          }
        }
      }
    }

    const text = fullText.trim();
    if (!text) {
      return {
        text: null,
        error: "OpenRouter returned an empty response.",
        status: response.status,
      };
    }

    return { text, error: null, status: response.status };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("OpenRouter stream failed:", message);
    return { text: null, error: message };
  }
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
