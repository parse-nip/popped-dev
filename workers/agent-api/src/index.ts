import { Hono } from "hono";
import { cors } from "hono/cors";
import { cleanupTtlSeconds, runCleanup } from "./cleanup";
import {
  createCloudAgent,
  createCloudRun,
  extractBranch,
  extractPrUrl,
  getCloudRun,
  streamCloudRun,
} from "./cursor-api";
import { ensureGitBranch } from "./github";
import { buildDesignPrompt, buildSubmitPrompt } from "./prompts";
import { resolvePagesPreviewUrl, isPreviewUrlLive } from "./pages-preview";
import { branchForSession } from "./preview-url";
import {
  checkRateLimit,
  getRun,
  getSession,
  putRun,
  putSession,
  updateRun,
} from "./session-store";
import {
  isTerminalRunStatus,
  parseSsePart,
  runStatusMessage,
  toolCallMessage,
} from "./stream-transform";
import type { ElementContextPayload, Env, RunRecord, SessionRecord } from "./types";

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
      // Cloudflare Pages default + branch preview URLs (no Worker on *.pages.dev).
      if (
        origin === "https://popped-dev.pages.dev" ||
        /^https:\/\/[^/]+--popped-dev\.pages\.dev$/.test(origin) ||
        /^https:\/\/[^/]+\.popped-dev\.pages\.dev$/.test(origin)
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

async function previewUrlForBranch(env: Env, branch: string): Promise<string> {
  return resolvePagesPreviewUrl({
    branch,
    projectName: env.PAGES_PROJECT_NAME || "popped-dev",
    repoUrl: env.GITHUB_REPO_URL,
    githubToken: env.GITHUB_TOKEN,
  });
}

async function ensureSessionBranch(env: Env, branch: string): Promise<void> {
  if (!env.GITHUB_TOKEN) {
    throw new Error(
      "GITHUB_TOKEN is required to create session branches before starting cloud agents.",
    );
  }

  await ensureGitBranch(
    env.GITHUB_TOKEN,
    env.GITHUB_REPO_URL,
    branch,
    env.GITHUB_DEFAULT_BRANCH ?? "main",
  );
}

type SseEmitter = (event: string, data: Record<string, unknown>) => void;

async function syncRunPreview(
  apiKey: string,
  env: Env,
  record: RunRecord,
  runId: string,
  projectName: string,
  emit: SseEmitter,
  flags: { previewSent: boolean; assistantSent: boolean },
): Promise<string> {
  const run = await getCloudRun(apiKey, record.agentId, runId);
  const branch = extractBranch(run.git) ?? record.branch ?? undefined;
  const prUrl = extractPrUrl(run.git);

  if (run.result && !flags.assistantSent) {
    flags.assistantSent = true;
    emit("assistant", { text: run.result });
  }

  if (branch && !flags.previewSent) {
    flags.previewSent = true;
    const previewUrl = await previewUrlForBranch(env, branch);
    emit("preview", {
      previewUrl,
      branch,
    });
    emit("status", { message: "Opening preview…" });
  }

  await updateRun(env.SESSIONS, runId, {
    branch,
    status: run.status,
    prUrl: prUrl ?? undefined,
  });

  return run.status;
}

function sseResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

function createPollRunStream(
  env: Env,
  record: RunRecord,
  runId: string,
  projectName: string,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      const emit: SseEmitter = (event, data) => {
        controller.enqueue(encoder.encode(`event: ${event}\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      const flags = { previewSent: false, assistantSent: false };
      emit("status", { message: "Reconnecting to agent run…" });

      try {
        for (let attempt = 0; attempt < 90; attempt += 1) {
          const status = await syncRunPreview(
            env.CURSOR_API_KEY,
            env,
            record,
            runId,
            projectName,
            emit,
            flags,
          );

          const friendly = runStatusMessage(status);
          if (friendly && !isTerminalRunStatus(status)) {
            emit("status", { message: friendly });
          }

          if (isTerminalRunStatus(status)) {
            if (status === "ERROR") {
              emit("error", { message: "Agent run failed." });
            }
            emit("done", {});
            break;
          }

          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not load run status.";
        emit("error", { message });
      } finally {
        controller.close();
      }
    },
  });
}

function shouldPollRunInstead(upstream: Response, body: string): boolean {
  if (upstream.status === 410) return true;
  return /no longer available|stream_expired|stream expired/i.test(body);
}

function handleUpstreamSseEvent(
  eventType: string,
  payload: Record<string, unknown>,
  emit: SseEmitter,
  flags: { previewSent: boolean; assistantSent: boolean },
  record: RunRecord,
  runId: string,
  projectName: string,
  env: Env,
  seenStatus: Set<string>,
): void {
  if (eventType === "assistant") {
    const text = typeof payload.text === "string" ? payload.text : "";
    if (text) {
      flags.assistantSent = true;
      emit("assistant", { text });
    }
    return;
  }

  if (eventType === "thinking") {
    const text = typeof payload.text === "string" ? payload.text : "";
    if (text) {
      emit("status", { message: "Thinking…" });
    }
    return;
  }

  if (eventType === "status") {
    const status = String(payload.status ?? "");
    const message = runStatusMessage(status);
    if (message && !seenStatus.has(status)) {
      seenStatus.add(status);
      emit("status", { message });
    }
    return;
  }

  if (eventType === "tool_call") {
    const name = String(payload.name ?? "");
    const status = String(payload.status ?? "");
    const message = toolCallMessage(name, status);
    if (message) {
      emit("status", { message });
    }
    return;
  }

  if (eventType === "result") {
    const text = typeof payload.text === "string" ? payload.text : "";
    if (text && !flags.assistantSent) {
      flags.assistantSent = true;
      emit("assistant", { text });
    }

    const git = payload.git as { branches?: Array<{ branch?: string; prUrl?: string }> } | undefined;
    const branch = extractBranch(git) ?? record.branch ?? undefined;
    if (branch && !flags.previewSent) {
      flags.previewSent = true;
      void (async () => {
        const previewUrl = await previewUrlForBranch(env, branch);
        emit("preview", { previewUrl, branch });
        emit("status", { message: "Opening preview…" });
        await updateRun(env.SESSIONS, runId, {
          branch,
          status: String(payload.status ?? ""),
          prUrl: extractPrUrl(git) ?? undefined,
        });
      })();
    }
    return;
  }

  if (eventType === "error") {
    const message = String(payload.message ?? "Stream error");
    if (!/no longer available|stream_expired|stream expired/i.test(message)) {
      emit("error", { message });
    }
    return;
  }

  if (eventType === "done") {
    emit("done", {});
  }
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
    await ensureSessionBranch(c.env, branch);

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
    await putSession(c.env.SESSIONS, session, cleanupTtlSeconds(c.env));
    await putRun(c.env.SESSIONS, {
      runId: created.run.id,
      sessionId,
      agentId: created.agent.id,
      branch,
      status: created.run.status,
      createdAt: Date.now(),
    }, cleanupTtlSeconds(c.env));

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
      await ensureSessionBranch(c.env, branch);

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
      await putSession(c.env.SESSIONS, session, cleanupTtlSeconds(c.env));

      const runRecord: RunRecord = {
        runId: created.run.id,
        sessionId,
        agentId: created.agent.id,
        branch,
        status: created.run.status,
        createdAt: Date.now(),
      };
      await putRun(c.env.SESSIONS, runRecord, cleanupTtlSeconds(c.env));

      session.lastRunAt = Date.now();
      session.runCount += 1;
      await putSession(c.env.SESSIONS, session, cleanupTtlSeconds(c.env));

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
    }, cleanupTtlSeconds(c.env));

    session.lastRunAt = Date.now();
    session.runCount += 1;
    session.contributorName = contributorName;
    await putSession(c.env.SESSIONS, session, cleanupTtlSeconds(c.env));

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

app.get("/api/agent/preview", async (c) => {
  const branch = c.req.query("branch")?.trim();
  if (!branch) {
    return jsonError("branch_required");
  }

  try {
    const previewUrl = await previewUrlForBranch(c.env, branch);
    const ready = await isPreviewUrlLive(previewUrl);
    return c.json({ branch, previewUrl, ready });
  } catch (error) {
    const message = error instanceof Error ? error.message : "preview_resolve_failed";
    return jsonError(message, 502);
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
    const previewUrl = branch ? await previewUrlForBranch(c.env, branch) : undefined;
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
      done: isTerminalRunStatus(run.status),
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

  const projectName = c.env.PAGES_PROJECT_NAME || "popped-dev";
  const lastEventId = c.req.header("Last-Event-ID") ?? undefined;
  const upstream = await streamCloudRun(
    c.env.CURSOR_API_KEY,
    record.agentId,
    runId,
    lastEventId,
  );

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text();
    if (shouldPollRunInstead(upstream, text)) {
      return sseResponse(createPollRunStream(c.env, record, runId, projectName));
    }
    return jsonError(text || "stream_failed", upstream.status || 502);
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const stream = new ReadableStream({
    async start(controller) {
      const reader = upstream.body!.getReader();
      let buffer = "";

      const emit: SseEmitter = (event, data) => {
        controller.enqueue(encoder.encode(`event: ${event}\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      const flags = { previewSent: false, assistantSent: false };
      const seenStatus = new Set<string>();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";

          for (const part of parts) {
            if (!part.trim()) continue;

            const { event: eventType, data: dataRaw } = parseSsePart(part);
            if (!eventType || !dataRaw) continue;

            try {
              const payload = JSON.parse(dataRaw) as Record<string, unknown>;
              handleUpstreamSseEvent(
                eventType,
                payload,
                emit,
                flags,
                record,
                runId,
                projectName,
                c.env,
                seenStatus,
              );
            } catch {
              // ignore malformed chunks
            }
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "stream_interrupted";
        emit("status", { message: "Stream interrupted — checking run status…" });
        if (!/no longer available|stream_expired/i.test(message)) {
          emit("error", { message });
        }
      } finally {
        try {
          const status = await syncRunPreview(
            c.env.CURSOR_API_KEY,
            c.env,
            record,
            runId,
            projectName,
            emit,
            flags,
          );
          if (isTerminalRunStatus(status)) {
            emit("done", {});
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "Could not finalize run.";
          emit("error", { message });
        } finally {
          controller.close();
        }
      }
    },
  });

  return sseResponse(stream);
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
    session.protected = true;
    session.lastRunAt = Date.now();
    await putSession(c.env.SESSIONS, session, cleanupTtlSeconds(c.env));

    const created = await createCloudRun(c.env.CURSOR_API_KEY, session.agentId, prompt);
    await putRun(c.env.SESSIONS, {
      runId: created.run.id,
      sessionId: session.sessionId,
      agentId: session.agentId,
      branch: session.branch,
      status: created.run.status,
      createdAt: Date.now(),
    }, cleanupTtlSeconds(c.env));

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

export default {
  fetch: app.fetch,
  scheduled: (_event: ScheduledEvent, env: Env, ctx: ExecutionContext) => {
    ctx.waitUntil(
      runCleanup(env).then((stats) => {
        console.log("cleanup", JSON.stringify(stats));
      }),
    );
  },
};
