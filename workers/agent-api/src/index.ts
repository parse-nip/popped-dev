import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  createCloudAgent,
  createCloudRun,
  extractBranch,
  extractPrUrl,
  getCloudRun,
  streamCloudRun,
} from "./cursor-api";
import { buildDesignPrompt, buildSubmitPrompt } from "./prompts";
import { branchForSession, branchToPreviewUrl } from "./preview-url";
import {
  checkRateLimit,
  getRun,
  getSession,
  putRun,
  putSession,
  updateRun,
} from "./session-store";
import type { ElementContextPayload, Env, RunRecord, SessionRecord } from "./types";

const TERMINAL = new Set(["FINISHED", "ERROR", "CANCELLED", "EXPIRED"]);

const app = new Hono<{ Bindings: Env }>();

app.use(
  "/api/*",
  cors({
    origin: (origin, c) => {
      if (!origin) return c.env.CORS_ORIGIN || "https://popped.dev";
      if (
        origin === c.env.CORS_ORIGIN ||
        origin.startsWith("http://localhost:") ||
        origin.startsWith("http://127.0.0.1:")
      ) {
        return origin;
      }
      return c.env.CORS_ORIGIN || "https://popped.dev";
    },
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Last-Event-ID"],
  }),
);

function requireContributorName(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const trimmed = name.trim();
  return trimmed.length >= 2 && trimmed.length <= 80 ? trimmed : null;
}

function parseElementContext(value: unknown): ElementContextPayload | null {
  if (!value || typeof value !== "object") return null;
  const ctx = value as Partial<ElementContextPayload>;
  if (
    typeof ctx.label !== "string" ||
    typeof ctx.selectorPath !== "string" ||
    typeof ctx.tagName !== "string" ||
    !Array.isArray(ctx.classNames) ||
    typeof ctx.textPreview !== "string" ||
    !Array.isArray(ctx.suggestedFiles)
  ) {
    return null;
  }
  return {
    label: ctx.label,
    selectorPath: ctx.selectorPath,
    factId: typeof ctx.factId === "string" ? ctx.factId : undefined,
    contributionId:
      typeof ctx.contributionId === "string" ? ctx.contributionId : undefined,
    tagName: ctx.tagName,
    classNames: ctx.classNames.filter((item) => typeof item === "string"),
    textPreview: ctx.textPreview.slice(0, 120),
    suggestedFiles: ctx.suggestedFiles.filter((item) => typeof item === "string"),
  };
}

function jsonError(message: string, status = 400, extra?: Record<string, unknown>) {
  return new Response(JSON.stringify({ error: message, ...extra }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function clientIp(request: Request): string {
  return request.headers.get("CF-Connecting-IP") ?? "unknown";
}

app.post("/api/agent/session", async (c) => {
  if (!c.env.CURSOR_API_KEY) {
    return jsonError("server_misconfigured", 503);
  }

  const body = (await c.req.json()) as { sessionId?: string; contributorName?: string };
  const contributorName = requireContributorName(body.contributorName);
  if (!contributorName) {
    return jsonError("contributor_name_required");
  }

  const sessionId =
    typeof body.sessionId === "string" && body.sessionId.length > 0
      ? body.sessionId
      : crypto.randomUUID();

  const existing = await getSession(c.env.SESSIONS, sessionId);
  if (existing) {
    return c.json({
      sessionId: existing.sessionId,
      agentId: existing.agentId,
      branch: existing.branch,
      resumed: true,
    });
  }

  const branch = branchForSession(sessionId);
  const prompt = `${buildDesignPrompt(
    {
      label: "SessionInit",
      selectorPath: "#locked-resume",
      tagName: "main",
      classNames: [],
      textPreview: "",
      suggestedFiles: ["src/app/globals.css"],
    },
    "Initialize design session. Await element-specific requests.",
    contributorName,
  )}\n\nSession branch: ${branch}.`;

  try {
    const created = await createCloudAgent(c.env.CURSOR_API_KEY, {
      promptText: prompt,
      branch,
      repoUrl: c.env.GITHUB_REPO_URL,
      autoCreatePR: false,
    });

    const session: SessionRecord = {
      sessionId,
      agentId: created.agent.id,
      contributorName,
      branch,
      createdAt: Date.now(),
      lastRunAt: Date.now(),
      runCount: 1,
    };
    await putSession(c.env.SESSIONS, session);
    await putRun(c.env.SESSIONS, {
      runId: created.run.id,
      sessionId,
      agentId: created.agent.id,
      branch,
      status: created.run.status,
      createdAt: Date.now(),
    });

    return c.json({
      sessionId,
      agentId: created.agent.id,
      branch,
      runId: created.run.id,
      resumed: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "agent_create_failed";
    return jsonError(message, 502);
  }
});

app.post("/api/agent/message", async (c) => {
  if (!c.env.CURSOR_API_KEY) {
    return jsonError("server_misconfigured", 503);
  }

  const body = (await c.req.json()) as {
    sessionId?: string;
    message?: string;
    elementContext?: unknown;
    contributorName?: string;
  };

  const contributorName = requireContributorName(body.contributorName);
  if (!contributorName) {
    return jsonError("contributor_name_required");
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    return jsonError("invalid_message");
  }

  const elementContext = parseElementContext(body.elementContext);
  if (!elementContext) {
    return jsonError("invalid_element_context");
  }

  const sessionId =
    typeof body.sessionId === "string" && body.sessionId.length > 0
      ? body.sessionId
      : crypto.randomUUID();

  const rate = await checkRateLimit(c.env.SESSIONS, `${clientIp(c.req.raw)}:${sessionId}`);
  if (!rate.allowed) {
    return jsonError("rate_limit_exceeded", 429, {
      retryAfterSeconds: rate.retryAfterSeconds,
    });
  }

  let session = await getSession(c.env.SESSIONS, sessionId);
  if (!session) {
    const branch = branchForSession(sessionId);
    const bootstrap = buildDesignPrompt(
      elementContext,
      message,
      contributorName,
    );

    try {
      const created = await createCloudAgent(c.env.CURSOR_API_KEY, {
        promptText: bootstrap,
        branch,
        repoUrl: c.env.GITHUB_REPO_URL,
        autoCreatePR: false,
      });

      session = {
        sessionId,
        agentId: created.agent.id,
        contributorName,
        branch,
        createdAt: Date.now(),
        lastRunAt: Date.now(),
        runCount: 0,
      };
      await putSession(c.env.SESSIONS, session);

      const runRecord: RunRecord = {
        runId: created.run.id,
        sessionId,
        agentId: created.agent.id,
        branch,
        status: created.run.status,
        createdAt: Date.now(),
      };
      await putRun(c.env.SESSIONS, runRecord);

      session.lastRunAt = Date.now();
      session.runCount += 1;
      await putSession(c.env.SESSIONS, session);

      return c.json({
        sessionId,
        agentId: created.agent.id,
        runId: created.run.id,
        branch,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "agent_create_failed";
      return jsonError(msg, 502);
    }
  }

  const prompt = buildDesignPrompt(elementContext, message, contributorName);

  try {
    const created = await createCloudRun(c.env.CURSOR_API_KEY, session.agentId, prompt);
    await putRun(c.env.SESSIONS, {
      runId: created.run.id,
      sessionId: session.sessionId,
      agentId: session.agentId,
      branch: session.branch,
      status: created.run.status,
      createdAt: Date.now(),
    });

    session.lastRunAt = Date.now();
    session.runCount += 1;
    session.contributorName = contributorName;
    await putSession(c.env.SESSIONS, session);

    return c.json({
      sessionId: session.sessionId,
      agentId: session.agentId,
      runId: created.run.id,
      branch: session.branch,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "run_create_failed";
    return jsonError(msg, 502);
  }
});

app.get("/api/agent/runs/:runId", async (c) => {
  const runId = c.req.param("runId");
  const record = await getRun(c.env.SESSIONS, runId);
  if (!record) {
    return jsonError("run_not_found", 404);
  }

  try {
    const run = await getCloudRun(c.env.CURSOR_API_KEY, record.agentId, runId);
    const branch = extractBranch(run.git) ?? record.branch ?? undefined;
    const previewUrl = branch ? branchToPreviewUrl(branch, c.env.PAGES_PROJECT_NAME) : undefined;
    const prUrl = extractPrUrl(run.git);

    await updateRun(c.env.SESSIONS, runId, {
      status: run.status,
      branch,
      prUrl: prUrl ?? undefined,
    });

    return c.json({
      runId: run.id,
      agentId: run.agentId,
      status: run.status,
      result: run.result ?? null,
      branch,
      previewUrl,
      prUrl,
      done: TERMINAL.has(run.status),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "run_fetch_failed";
    return jsonError(msg, 502);
  }
});

app.get("/api/agent/runs/:runId/stream", async (c) => {
  const runId = c.req.param("runId");
  const record = await getRun(c.env.SESSIONS, runId);
  if (!record) {
    return jsonError("run_not_found", 404);
  }

  const lastEventId = c.req.header("Last-Event-ID") ?? undefined;
  const upstream = await streamCloudRun(
    c.env.CURSOR_API_KEY,
    record.agentId,
    runId,
    lastEventId,
  );

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text();
    return jsonError(text || "stream_failed", upstream.status || 502);
  }

  const projectName = c.env.PAGES_PROJECT_NAME || "popped-dev";
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let previewSent = false;

  const stream = new ReadableStream({
    async start(controller) {
      const reader = upstream.body!.getReader();
      let buffer = "";

      const emit = (event: string, data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`event: ${event}\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";

          for (const part of parts) {
            if (!part.trim()) continue;
            controller.enqueue(encoder.encode(`${part}\n\n`));

            const eventLine = part.split("\n").find((line) => line.startsWith("event:"));
            const dataLine = part.split("\n").find((line) => line.startsWith("data:"));
            if (!eventLine || !dataLine) continue;

            const eventType = eventLine.slice(6).trim();
            try {
              const payload = JSON.parse(dataLine.slice(5).trim()) as Record<string, unknown>;

              if (eventType === "tool_call" && payload.status === "running") {
                const name = String(payload.name ?? "");
                if (name.includes("edit") || name.includes("write")) {
                  emit("status", { message: "Editing styles…" });
                } else if (name.includes("terminal") || name === "run_terminal_cmd") {
                  emit("status", { message: "Running build…" });
                }
              }

              if (eventType === "result" && !previewSent) {
                const git = payload.git as { branches?: Array<{ branch?: string; prUrl?: string }> };
                const branch = extractBranch(git) ?? record.branch ?? undefined;
                if (branch) {
                  previewSent = true;
                  emit("preview", {
                    previewUrl: branchToPreviewUrl(branch, projectName),
                    branch,
                  });
                  emit("status", { message: "Building preview…" });
                  await updateRun(c.env.SESSIONS, runId, {
                    branch,
                    status: String(payload.status ?? ""),
                    prUrl: extractPrUrl(git) ?? undefined,
                  });
                }
              }
            } catch {
              // ignore malformed chunks
            }
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "stream_interrupted";
        emit("error", { message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});

app.post("/api/agent/runs/:runId/submit", async (c) => {
  const runId = c.req.param("runId");
  const record = await getRun(c.env.SESSIONS, runId);
  if (!record) {
    return jsonError("run_not_found", 404);
  }

  const session = await getSession(c.env.SESSIONS, record.sessionId);
  if (!session) {
    return jsonError("session_not_found", 404);
  }

  const body = (await c.req.json().catch(() => ({}))) as {
    contributorName?: string;
    prTitle?: string;
  };

  const contributorName =
    requireContributorName(body.contributorName) ?? session.contributorName;
  const prompt = buildSubmitPrompt(contributorName, session.branch, body.prTitle);

  try {
    const created = await createCloudRun(c.env.CURSOR_API_KEY, session.agentId, prompt);
    await putRun(c.env.SESSIONS, {
      runId: created.run.id,
      sessionId: session.sessionId,
      agentId: session.agentId,
      branch: session.branch,
      status: created.run.status,
      createdAt: Date.now(),
    });

    return c.json({
      runId: created.run.id,
      agentId: session.agentId,
      branch: session.branch,
      message: "submit_run_started",
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "submit_failed";
    return jsonError(msg, 502);
  }
});

app.get("/api/health", (c) => c.json({ ok: true }));

export default app;
