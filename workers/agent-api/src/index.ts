import { Hono } from "hono";
import { cors } from "hono/cors";
import { cleanupTtlSeconds, runCleanup } from "./cleanup";
import {
  createCloudAgent,
  createCloudRunWhenReady,
  extractBranch,
  extractPrUrl,
  getActiveRun,
  getCloudRun,
  isAgentBusyError,
  streamCloudRun,
} from "./cursor-api";
import {
  appendContributionEntry,
  deleteGitBranch,
  ensureGitBranch,
  listChangedFilesOnBranch,
  mergeBranchIntoBase,
  mergeMainIntoBranch,
} from "./github";
import { buildDesignPrompt, buildMergeCommitMessage } from "./prompts";
import {
  formatVerificationFailure,
  verifyChangedFiles,
} from "./verify-branch";
import {
  checkBranchPreviewDeploy,
  resolvePagesPreviewUrl,
  isPreviewUrlLive,
  waitForBranchPreviewDeploy,
  getBranchHeadShaForBranch,
  type BranchDeployStatus,
} from "./pages-preview";
import { branchForSession } from "./preview-url";
import { resolveBranchDraft } from "./draft";
import { generateDesignPatch } from "./design-run";
import { checkProductionDeploy } from "./design-deploy";
import { getMainHeadSha, publishWithAttribution } from "./design-publish";
import { validatePatch, type DesignPatch } from "./design-patch";
import {
  checkDesignRateLimit,
  checkMergeCooldown,
  checkRateLimit,
  getRun,
  getSession,
  MERGE_COOLDOWN_MS,
  putRun,
  putSession,
  setMergeCooldown,
  updateRun,
} from "./session-store";
import {
  isTerminalRunStatus,
  parseSsePart,
  runStatusMessage,
  statusToStep,
  toolCallToStep,
} from "./stream-transform";
import type { ElementContextPayload, Env, RunRecord, SessionRecord } from "./types";
import { validateContributorName } from "../../../shared/contributor-name-validation";
import { runAgentEdit, type AgentEditInput } from "./agent-edit";
import { fetchProjectFiles } from "./project-files";
import { publishWorkspaceChanges } from "./workspace-publish";

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

function parseContributorName(name: unknown):
  | { ok: true; name: string }
  | { ok: false; code: "contributor_name_required" | "contributor_name_invalid" } {
  if (typeof name !== "string" || !name.trim()) {
    return { ok: false, code: "contributor_name_required" };
  }

  const result = validateContributorName(name);
  if (!result.ok) {
    return { ok: false, code: "contributor_name_invalid" };
  }

  return { ok: true, name: result.name };
}

function parseSelectedElement(value: unknown): {
  designId: string;
  tagName: string;
  text: string;
  selector: string;
  sourceFile?: string;
  hasFactId: boolean;
  computedStyle: Record<string, string>;
} | null {
  if (!value || typeof value !== "object") return null;
  const el = value as Record<string, unknown>;
  if (
    typeof el.designId !== "string" ||
    typeof el.tagName !== "string" ||
    typeof el.text !== "string" ||
    typeof el.selector !== "string" ||
    !el.computedStyle ||
    typeof el.computedStyle !== "object"
  ) {
    return null;
  }
  const computedStyle: Record<string, string> = {};
  for (const [key, val] of Object.entries(el.computedStyle as Record<string, unknown>)) {
    if (typeof val === "string") computedStyle[key] = val;
  }
  return {
    designId: el.designId,
    tagName: el.tagName,
    text: el.text.slice(0, 120),
    selector: el.selector,
    sourceFile: typeof el.sourceFile === "string" ? el.sourceFile : undefined,
    hasFactId: el.hasFactId === true,
    computedStyle,
  };
}

function parseAcceptedPatches(value: unknown): DesignPatch[] {
  if (!Array.isArray(value)) return [];
  const patches: DesignPatch[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const patch = item as DesignPatch;
    if (patch.kind !== "edit") continue;
    try {
      validatePatch(patch);
      patches.push(patch);
    } catch {
      // skip invalid
    }
  }
  return patches;
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

function mergeCooldownMs(env: Env): number {
  const raw = env.MERGE_COOLDOWN_MS;
  if (raw) {
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isNaN(parsed) && parsed >= 60_000) return parsed;
  }
  return MERGE_COOLDOWN_MS;
}

function mergeCooldownResponse(retryAfterSeconds: number) {
  return jsonError("merge_cooldown", 429, {
    code: "merge_cooldown",
    retryAfterSeconds,
    message:
      "You just merged a design. Wait before starting a new cloud agent — one agent per session.",
  });
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

  const { created } = await ensureGitBranch(
    env.GITHUB_TOKEN,
    env.GITHUB_REPO_URL,
    branch,
    env.GITHUB_DEFAULT_BRANCH ?? "main",
  );

  if (created) {
    await mergeMainIntoBranch(
      env.GITHUB_TOKEN,
      env.GITHUB_REPO_URL,
      branch,
      env.GITHUB_DEFAULT_BRANCH ?? "main",
    );
  }
}

async function previewDeployForBranch(
  env: Env,
  branch: string,
  waitForDeploy: boolean,
  baselineSha?: string | null,
): Promise<BranchDeployStatus> {
  const options = {
    branch,
    projectName: env.PAGES_PROJECT_NAME || "popped-dev",
    repoUrl: env.GITHUB_REPO_URL,
    githubToken: env.GITHUB_TOKEN,
    baselineSha,
  };

  if (waitForDeploy && env.GITHUB_TOKEN) {
    return waitForBranchPreviewDeploy(options);
  }

  return checkBranchPreviewDeploy(options);
}

async function captureRunBaseline(env: Env, branch: string): Promise<string | null> {
  return getBranchHeadShaForBranch({
    branch,
    repoUrl: env.GITHUB_REPO_URL,
    githubToken: env.GITHUB_TOKEN,
  });
}

async function verifyDesignBranch(
  env: Env,
  branch: string,
): Promise<{ ok: boolean; message?: string; changedFiles: string[]; aheadBy: number }> {
  if (!env.GITHUB_TOKEN) {
    return { ok: true, changedFiles: [], aheadBy: 1 };
  }

  const baseRef = env.GITHUB_DEFAULT_BRANCH ?? "main";
  const { aheadBy, changedFiles } = await listChangedFilesOnBranch(
    env.GITHUB_TOKEN,
    env.GITHUB_REPO_URL,
    branch,
    baseRef,
  );
  const result = verifyChangedFiles(changedFiles, aheadBy);
  if (!result.ok) {
    return {
      ok: false,
      message: formatVerificationFailure(result),
      changedFiles,
      aheadBy,
    };
  }
  return { ok: true, changedFiles, aheadBy };
}

type PreviewFlags = {
  previewEmitted: boolean;
  previewReady: boolean;
  assistantSent: boolean;
  lastPreviewSha: string | null;
};

async function maybeEmitPreview(
  env: Env,
  branch: string,
  emit: SseEmitter,
  flags: PreviewFlags,
  baselineSha?: string | null,
): Promise<boolean> {
  if (!branch) return false;

  const deploy = await previewDeployForBranch(env, branch, false, baselineSha);
  const shaChanged = Boolean(deploy.sha && deploy.sha !== flags.lastPreviewSha);
  const becameReady = deploy.ready && !flags.previewReady;

  if (flags.previewEmitted && !becameReady && !shaChanged) {
    return flags.previewReady;
  }

  flags.previewEmitted = true;
  flags.lastPreviewSha = deploy.sha ?? flags.lastPreviewSha;
  if (deploy.ready) {
    flags.previewReady = true;
  }

  emit("preview", {
    previewUrl: deploy.previewUrl,
    branch,
    ready: deploy.ready,
    sha: deploy.sha,
    progress: deploy.progress,
    phase: deploy.phase,
  });
  emit("step", {
    id: "deploy",
    label: deploy.ready ? "Preview ready" : "Building preview",
    state: deploy.ready ? "done" : "running",
  });

  return flags.previewReady;
}

async function waitForPreviewDeploy(
  env: Env,
  branch: string,
  emit: SseEmitter,
  flags: PreviewFlags,
  baselineSha?: string | null,
  maxAttempts = 60,
): Promise<void> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const ready = await maybeEmitPreview(env, branch, emit, flags, baselineSha);
    if (ready) return;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
}

type SseEmitter = (event: string, data: Record<string, unknown>) => void;

async function syncRunPreview(
  apiKey: string,
  env: Env,
  record: RunRecord,
  runId: string,
  projectName: string,
  emit: SseEmitter,
  flags: PreviewFlags,
): Promise<string> {
  const run = await getCloudRun(apiKey, record.agentId, runId);
  const branch = extractBranch(run.git) ?? record.branch ?? undefined;
  const prUrl = extractPrUrl(run.git);

  if (run.result && !flags.assistantSent) {
    flags.assistantSent = true;
    emit("assistant", { text: run.result });
  }

  const terminal = isTerminalRunStatus(run.status);

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

      const flags: PreviewFlags = {
        previewEmitted: false,
        previewReady: false,
        assistantSent: false,
        lastPreviewSha: null,
      };
      emit("step", { id: "connect", label: "Reconnecting to agent", state: "running" });

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
          const step = statusToStep(status);
          if (step) {
            emit("step", step);
          } else if (friendly && !isTerminalRunStatus(status)) {
            emit("status", { message: friendly });
          }

          if (isTerminalRunStatus(status)) {
            if (status === "ERROR") {
              emit("error", { message: "Agent run failed." });
            }
            const branch = record.branch;
            if (branch) {
              await waitForPreviewDeploy(env, branch, emit, flags, record.baselineSha, 40);
            }
            emit("done", {});
            break;
          }

          if (record.branch) {
            await maybeEmitPreview(env, record.branch, emit, flags, record.baselineSha);
          }

          await new Promise((resolve) => setTimeout(resolve, 1000));
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
  flags: PreviewFlags,
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
      emit("step", { id: "connect", label: "Connected to agent", state: "done" });
      emit("assistant", { text });
    }
    return;
  }

  if (eventType === "thinking") {
    const text = typeof payload.text === "string" ? payload.text : "";
    if (text) {
      emit("activity", { kind: "thinking", text, streamId: "thinking" });
    }
    emit("step", { id: "think", label: "Planning changes", state: "running" });
    return;
  }

  if (eventType === "status") {
    const status = String(payload.status ?? "");
    const explicitMessage =
      typeof payload.message === "string" ? payload.message.trim() : "";
    const step = statusToStep(status);
    if (step && !seenStatus.has(status)) {
      seenStatus.add(status);
      emit("step", step);
      if (explicitMessage) {
        emit("activity", { kind: "status", text: explicitMessage, streamId: `status-${status}` });
      }
      return;
    }
    const message = explicitMessage || runStatusMessage(status);
    if (message && !seenStatus.has(status)) {
      seenStatus.add(status);
      emit("status", { message });
      emit("activity", { kind: "status", text: message, streamId: `status-${status}` });
    }
    return;
  }

  if (eventType === "tool_call") {
    const name = String(payload.name ?? "");
    const status = String(payload.status ?? "");
    const callId = String(payload.callId ?? name);
    const step = toolCallToStep(name, status);
    if (step) {
      emit("step", step);
      emit("activity", {
        kind: "tool",
        text: step.label,
        streamId: `tool-${callId}`,
        done: step.state === "done",
      });
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
    const status = String(payload.status ?? "");
    void updateRun(env.SESSIONS, runId, {
      branch,
      status,
      prUrl: extractPrUrl(git) ?? undefined,
    });

    if (branch) {
      void waitForPreviewDeploy(env, branch, emit, flags, record.baselineSha, 40);
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

app.post("/api/design/run", async (c) => {
  const body = (await c.req.json()) as {
    sessionId?: string;
    prompt?: string;
    selectedElement?: unknown;
    acceptedPatches?: unknown;
    contributorName?: string;
  };

  const parsedContributorName = parseContributorName(body.contributorName);
  if (!parsedContributorName.ok) {
    return jsonError(parsedContributorName.code);
  }
  const contributorName = parsedContributorName.name;

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) {
    return jsonError("invalid_prompt");
  }

  const selectedElement = parseSelectedElement(body.selectedElement);
  if (!selectedElement) {
    return jsonError("invalid_selected_element");
  }

  const sessionId =
    typeof body.sessionId === "string" && body.sessionId.length > 0
      ? body.sessionId
      : crypto.randomUUID();

  const cooldown = await checkMergeCooldown(c.env.SESSIONS, clientIp(c.req.raw));
  if (!cooldown.allowed) {
    return mergeCooldownResponse(cooldown.retryAfterSeconds);
  }

  const rate = await checkDesignRateLimit(c.env.SESSIONS, `${clientIp(c.req.raw)}:${sessionId}`);
  if (!rate.allowed) {
    return jsonError("rate_limit_exceeded", 429, {
      code: "rate_limit_exceeded",
      retryAfterSeconds: rate.retryAfterSeconds,
      message: `Design prompt limit reached — try again in ~${Math.ceil(rate.retryAfterSeconds / 60)} min.`,
    });
  }

  const acceptedPatches = parseAcceptedPatches(body.acceptedPatches);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: string, data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`event: ${event}\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        emit("status", { message: "Thinking…" });
        emit("step", { id: "think", label: "Generating edit patch", state: "running" });

        const patch = await generateDesignPatch(c.env, {
          prompt,
          selectedElement,
          acceptedPatches,
          contributorName,
        });

        emit("draft_patch", patch);
        emit("assistant", { text: patch.summary });
        emit("step", { id: "patch", label: "Patch ready — confirm on page", state: "done" });
        emit("done", { ok: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : "design_run_failed";
        emit("error", { message });
      } finally {
        controller.close();
      }
    },
  });

  return sseResponse(stream);
});

app.post("/api/design/publish", async (c) => {
  if (!c.env.GITHUB_TOKEN) {
    return jsonError("github_token_required", 503);
  }

  const body = (await c.req.json()) as {
    sessionId?: string;
    baseSha?: string;
    acceptedPatches?: unknown;
    contributorName?: string;
  };

  const parsedContributorName = parseContributorName(body.contributorName);
  if (!parsedContributorName.ok) {
    return jsonError(parsedContributorName.code);
  }
  const contributorName = parsedContributorName.name;

  const baseSha = typeof body.baseSha === "string" ? body.baseSha.trim() : "";
  if (!baseSha) {
    return jsonError("base_sha_required");
  }

  const sessionId =
    typeof body.sessionId === "string" && body.sessionId.length > 0
      ? body.sessionId
      : crypto.randomUUID();

  const acceptedPatches = parseAcceptedPatches(body.acceptedPatches);
  if (acceptedPatches.length === 0) {
    return jsonError("no_patches");
  }

  const cooldown = await checkMergeCooldown(c.env.SESSIONS, clientIp(c.req.raw));
  if (!cooldown.allowed) {
    return mergeCooldownResponse(cooldown.retryAfterSeconds);
  }

  try {
    const { commitUrl, sha: commitSha } = await publishWithAttribution(c.env, {
      acceptedPatches,
      contributorName,
      baseSha,
      sessionId,
    });

    await setMergeCooldown(
      c.env.SESSIONS,
      clientIp(c.req.raw),
      mergeCooldownMs(c.env),
    );

    return c.json({
      ok: true,
      commitUrl,
      commitSha,
      patchCount: acceptedPatches.length,
      cooldownSeconds: Math.ceil(mergeCooldownMs(c.env) / 1000),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "publish_failed";
    return jsonError(message, 502);
  }
});

app.get("/api/design/status", async (c) => {
  if (!c.env.GITHUB_TOKEN) {
    return jsonError("github_token_required", 503);
  }

  try {
    const sha = await getMainHeadSha(c.env);
    return c.json({ ok: true, baseSha: sha });
  } catch (error) {
    const message = error instanceof Error ? error.message : "status_failed";
    return jsonError(message, 502);
  }
});

app.get("/api/design/deploy-status", async (c) => {
  const sha = c.req.query("sha")?.trim();
  if (!sha) {
    return jsonError("sha_required");
  }

  try {
    const status = await checkProductionDeploy(c.env, sha);
    return c.json({ ok: true, sha, ...status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "deploy_status_failed";
    return jsonError(message, 502);
  }
});

app.post("/api/agent/session", async (c) => {
  if (!c.env.CURSOR_API_KEY) {
    return jsonError("server_misconfigured", 503);
  }

  const body = (await c.req.json()) as { sessionId?: string; contributorName?: string };
  const parsedContributorName = parseContributorName(body.contributorName);
  if (!parsedContributorName.ok) {
    return jsonError(parsedContributorName.code);
  }
  const contributorName = parsedContributorName.name;

  const sessionId =
    typeof body.sessionId === "string" && body.sessionId.length > 0
      ? body.sessionId
      : crypto.randomUUID();

  const cooldown = await checkMergeCooldown(c.env.SESSIONS, clientIp(c.req.raw));
  if (!cooldown.allowed) {
    return mergeCooldownResponse(cooldown.retryAfterSeconds);
  }

  const existing = await getSession(c.env.SESSIONS, sessionId);
  if (existing) {
    if (existing.protected || existing.mergedAt) {
      return jsonError("session_merged", 409, {
        code: "session_merged",
        message: "This design session ended after merge. Start fresh with a new session.",
      });
    }
    return c.json({
      sessionId: existing.sessionId,
      agentId: existing.agentId || null,
      branch: existing.branch,
      resumed: true,
    });
  }

  const branch = branchForSession(sessionId);

  try {
    await ensureSessionBranch(c.env, branch);

    const session: SessionRecord = {
      sessionId,
      agentId: "",
      contributorName,
      branch,
      createdAt: Date.now(),
      lastRunAt: Date.now(),
      runCount: 0,
    };
    await putSession(c.env.SESSIONS, session, cleanupTtlSeconds(c.env));

    return c.json({
      sessionId,
      agentId: null,
      branch,
      runId: null,
      resumed: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "session_init_failed";
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

  const parsedContributorName = parseContributorName(body.contributorName);
  if (!parsedContributorName.ok) {
    return jsonError(parsedContributorName.code);
  }
  const contributorName = parsedContributorName.name;

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

  const cooldown = await checkMergeCooldown(c.env.SESSIONS, clientIp(c.req.raw));
  if (!cooldown.allowed) {
    return mergeCooldownResponse(cooldown.retryAfterSeconds);
  }

  const rate = await checkRateLimit(c.env.SESSIONS, `${clientIp(c.req.raw)}:${sessionId}`);
  if (!rate.allowed) {
    return jsonError("rate_limit_exceeded", 429, {
      retryAfterSeconds: rate.retryAfterSeconds,
    });
  }

  let session = await getSession(c.env.SESSIONS, sessionId);
  if (session?.protected || session?.mergedAt) {
    return jsonError("session_merged", 409, {
      code: "session_merged",
      message: "This design session ended after merge. Clear your session and start a new design.",
    });
  }

  if (!session) {
    const branch = branchForSession(sessionId);
    const bootstrap = buildDesignPrompt(elementContext, message, contributorName);

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
        runCount: 1,
        activeRunId: created.run.id,
      };
      await putSession(c.env.SESSIONS, session, cleanupTtlSeconds(c.env));

      const baselineSha = await captureRunBaseline(c.env, branch);

      const runRecord: RunRecord = {
        runId: created.run.id,
        sessionId,
        agentId: created.agent.id,
        branch,
        baselineSha,
        status: created.run.status,
        createdAt: Date.now(),
      };
      await putRun(c.env.SESSIONS, runRecord, cleanupTtlSeconds(c.env));

      return c.json({
        sessionId,
        agentId: created.agent.id,
        runId: created.run.id,
        branch,
        baselineSha,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "agent_create_failed";
      return jsonError(msg, 502);
    }
  }

  const prompt = buildDesignPrompt(elementContext, message, contributorName);

  try {
    await ensureSessionBranch(c.env, session.branch);

    if (!session.agentId) {
      const created = await createCloudAgent(c.env.CURSOR_API_KEY, {
        promptText: prompt,
        branch: session.branch,
        repoUrl: c.env.GITHUB_REPO_URL,
        autoCreatePR: false,
      });

      session.agentId = created.agent.id;
      session.activeRunId = created.run.id;
      session.lastRunAt = Date.now();
      session.runCount += 1;
      session.contributorName = contributorName;
      await putSession(c.env.SESSIONS, session, cleanupTtlSeconds(c.env));

      const baselineSha = await captureRunBaseline(c.env, session.branch);

      await putRun(c.env.SESSIONS, {
        runId: created.run.id,
        sessionId: session.sessionId,
        agentId: created.agent.id,
        branch: session.branch,
        baselineSha,
        status: created.run.status,
        createdAt: Date.now(),
      }, cleanupTtlSeconds(c.env));

      return c.json({
        sessionId: session.sessionId,
        agentId: created.agent.id,
        runId: created.run.id,
        branch: session.branch,
        baselineSha,
      });
    }

    const baselineSha = await captureRunBaseline(c.env, session.branch);

    const created = await createCloudRunWhenReady(
      c.env.CURSOR_API_KEY,
      session.agentId,
      prompt,
    );

    await putRun(c.env.SESSIONS, {
      runId: created.run.id,
      sessionId: session.sessionId,
      agentId: session.agentId,
      branch: session.branch,
      baselineSha,
      status: created.run.status,
      createdAt: Date.now(),
    }, cleanupTtlSeconds(c.env));

    session.activeRunId = created.run.id;
    session.lastRunAt = Date.now();
    session.runCount += 1;
    session.contributorName = contributorName;
    await putSession(c.env.SESSIONS, session, cleanupTtlSeconds(c.env));

    return c.json({
      sessionId: session.sessionId,
      agentId: session.agentId,
      runId: created.run.id,
      branch: session.branch,
      baselineSha,
    });
  } catch (error) {
    if (session.agentId && isAgentBusyError(error)) {
      const active = await getActiveRun(c.env.CURSOR_API_KEY, session.agentId);
      if (active) {
        const activeRecord = await getRun(c.env.SESSIONS, active.id);
        return c.json({
          sessionId: session.sessionId,
          agentId: session.agentId,
          runId: active.id,
          branch: session.branch,
          baselineSha: activeRecord?.baselineSha ?? null,
          attachedToActiveRun: true,
        });
      }
    }

    const msg = error instanceof Error ? error.message : "run_create_failed";
    return jsonError(msg, isAgentBusyError(error) ? 409 : 502, {
      code: isAgentBusyError(error) ? "agent_busy" : undefined,
    });
  }
});

app.get("/api/agent/draft", async (c) => {
  const branch = c.req.query("branch")?.trim();
  if (!branch) {
    return jsonError("branch_required");
  }

  try {
    const draft = await resolveBranchDraft(c.env, branch);
    return c.json(draft);
  } catch (error) {
    const message = error instanceof Error ? error.message : "draft_resolve_failed";
    return jsonError(message, 502);
  }
});

app.get("/api/agent/preview", async (c) => {
  const branch = c.req.query("branch")?.trim();
  if (!branch) {
    return jsonError("branch_required");
  }

  const baselineSha = c.req.query("baselineSha")?.trim() || null;

  try {
    const deployed = await checkBranchPreviewDeploy({
      branch,
      projectName: c.env.PAGES_PROJECT_NAME || "popped-dev",
      repoUrl: c.env.GITHUB_REPO_URL,
      githubToken: c.env.GITHUB_TOKEN,
      baselineSha,
    });
    return c.json({
      branch,
      previewUrl: deployed.previewUrl,
      ready: deployed.ready,
      sha: deployed.sha,
      progress: deployed.progress,
      phase: deployed.phase,
    });
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
    const prUrl = extractPrUrl(run.git);
    const terminal = isTerminalRunStatus(run.status);
    let previewUrl: string | undefined;
    let previewReady = false;
    let previewSha: string | null = null;

    let previewProgress = 0;
    let previewPhase: string | undefined;

    if (branch) {
      const baselineSha = record.baselineSha ?? null;
      const heuristic = await previewUrlForBranch(c.env, branch);

      if (terminal && run.status === "FINISHED") {
        const deployed = await checkBranchPreviewDeploy({
          branch,
          projectName: c.env.PAGES_PROJECT_NAME || "popped-dev",
          repoUrl: c.env.GITHUB_REPO_URL,
          githubToken: c.env.GITHUB_TOKEN,
          baselineSha,
        });
        previewUrl = deployed.previewUrl;
        previewReady = deployed.ready;
        previewSha = deployed.sha;
        previewProgress = deployed.progress;
        previewPhase = deployed.phase;

        if (!previewReady && c.env.GITHUB_TOKEN) {
          const waited = await waitForBranchPreviewDeploy({
            branch,
            projectName: c.env.PAGES_PROJECT_NAME || "popped-dev",
            repoUrl: c.env.GITHUB_REPO_URL,
            githubToken: c.env.GITHUB_TOKEN,
            baselineSha,
            maxAttempts: 12,
            intervalMs: 1500,
          });
          previewUrl = waited.previewUrl;
          previewReady = waited.ready;
          previewSha = waited.sha;
          previewProgress = waited.progress;
          previewPhase = waited.phase;
        }
      } else {
        previewUrl = heuristic;
        previewReady = false;
        previewSha = baselineSha;
        previewProgress = run.status === "RUNNING" ? 35 : 18;
        previewPhase = "waiting_for_push";
      }
    }

    await updateRun(c.env.SESSIONS, runId, {
      status: run.status,
      branch,
      prUrl: prUrl ?? undefined,
    });

    if (terminal) {
      const sessionRecord = await getSession(c.env.SESSIONS, record.sessionId);
      if (sessionRecord?.activeRunId === runId) {
        sessionRecord.activeRunId = undefined;
        await putSession(c.env.SESSIONS, sessionRecord, cleanupTtlSeconds(c.env));
      }
    }

    return c.json({
      runId: run.id,
      agentId: run.agentId,
      status: run.status,
      result: run.result ?? null,
      branch,
      previewUrl,
      previewReady,
      previewSha,
      previewProgress,
      previewPhase,
      prUrl,
      done: terminal,
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

      const flags: PreviewFlags = {
        previewEmitted: false,
        previewReady: false,
        assistantSent: false,
        lastPreviewSha: null,
      };
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
            if (status === "ERROR") {
              emit("error", { message: "Agent run failed." });
            }
            if (record.branch) {
              await waitForPreviewDeploy(c.env, record.branch, emit, flags, record.baselineSha, 40);
            }
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

  if (!c.env.GITHUB_TOKEN) {
    return jsonError("github_token_required", 503);
  }

  const body = (await c.req.json().catch(() => ({}))) as {
    contributorName?: string;
  };

  const parsedContributorName = parseContributorName(body.contributorName);
  const contributorName = parsedContributorName.ok
    ? parsedContributorName.name
    : session.contributorName;
  if (!contributorName) {
    return jsonError(
      parsedContributorName.ok ? "contributor_name_required" : parsedContributorName.code,
    );
  }
  const baseRef = c.env.GITHUB_DEFAULT_BRANCH ?? "main";
  const branch = session.branch;
  const mergeMessage = buildMergeCommitMessage(contributorName, branch);

  try {
    const verification = await verifyDesignBranch(c.env, branch);
    if (!verification.ok) {
      return jsonError(verification.message ?? "branch_verification_failed", 409, {
        changedFiles: verification.changedFiles,
      });
    }

    await mergeMainIntoBranch(
      c.env.GITHUB_TOKEN,
      c.env.GITHUB_REPO_URL,
      branch,
      baseRef,
    );

    await appendContributionEntry(
      c.env.GITHUB_TOKEN,
      c.env.GITHUB_REPO_URL,
      branch,
      contributorName,
    );

    const mergeCommitUrl = await mergeBranchIntoBase(
      c.env.GITHUB_TOKEN,
      c.env.GITHUB_REPO_URL,
      branch,
      baseRef,
      mergeMessage,
    );

    try {
      await deleteGitBranch(c.env.GITHUB_TOKEN, c.env.GITHUB_REPO_URL, branch);
    } catch (deleteError) {
      console.warn("Design branch cleanup after merge failed:", deleteError);
    }

    session.protected = true;
    session.mergedAt = Date.now();
    session.lastRunAt = Date.now();
    await putSession(c.env.SESSIONS, session, cleanupTtlSeconds(c.env));

    await setMergeCooldown(
      c.env.SESSIONS,
      clientIp(c.req.raw),
      mergeCooldownMs(c.env),
    );

    await updateRun(c.env.SESSIONS, runId, { mergeCommitUrl, branch, prUrl: undefined });

    return c.json({
      runId,
      agentId: session.agentId,
      branch,
      mergeCommitUrl,
      message: "merged_to_main",
      cooldownSeconds: Math.ceil(mergeCooldownMs(c.env) / 1000),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "submit_failed";
    return jsonError(msg, 502);
  }
});

app.get("/api/project-files", async (c) => {
  if (!c.env.GITHUB_TOKEN) {
    return jsonError("github_token_required", 503);
  }

  try {
    const result = await fetchProjectFiles(c.env);
    return c.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "project_files_failed";
    return jsonError(message, 502);
  }
});

app.post("/api/agent/edit", async (c) => {
  const body = (await c.req.json()) as {
    prompt?: string;
    selectedElement?: unknown;
    files?: Record<string, string>;
    stream?: boolean;
    fixContext?: AgentEditInput["fixContext"];
  };

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) {
    return jsonError("invalid_prompt");
  }

  const files = body.files && typeof body.files === "object" ? body.files : null;
  if (!files || Object.keys(files).length === 0) {
    return jsonError("files_required");
  }

  const selectedElement =
    body.selectedElement && typeof body.selectedElement === "object"
      ? (body.selectedElement as AgentEditInput["selectedElement"])
      : null;

  const input: AgentEditInput = {
    prompt,
    selectedElement,
    files,
    fixContext:
      body.fixContext && typeof body.fixContext === "object"
        ? (body.fixContext as AgentEditInput["fixContext"])
        : null,
  };

  const wantsStream =
    body.stream === true || c.req.header("Accept")?.includes("text/event-stream") === true;

  if (wantsStream) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const emit = (event: string, data: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`event: ${event}\n`));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        try {
          const result = await runAgentEdit(c.env, input, emit);
          emit("result", result);
          emit("done", { ok: true });
        } catch (error) {
          const message = error instanceof Error ? error.message : "agent_edit_failed";
          emit("error", { message });
        } finally {
          controller.close();
        }
      },
    });

    return sseResponse(stream);
  }

  try {
    const result = await runAgentEdit(c.env, input);
    return c.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "agent_edit_failed";
    return jsonError(message, 502);
  }
});

app.post("/api/publish", async (c) => {
  if (!c.env.GITHUB_TOKEN) {
    return jsonError("github_token_required", 503);
  }

  const body = (await c.req.json()) as {
    baseSha?: string;
    contributorName?: string;
    changes?: Array<{ path: string; content: string; action?: string }>;
    allowContentFactChanges?: boolean;
    summary?: string;
  };

  const parsedContributorName = parseContributorName(body.contributorName);
  if (!parsedContributorName.ok) {
    return jsonError(parsedContributorName.code);
  }

  const baseSha = typeof body.baseSha === "string" ? body.baseSha.trim() : "";
  if (!baseSha) {
    return jsonError("base_sha_required");
  }

  const changes = Array.isArray(body.changes)
    ? body.changes
        .filter(
          (item) =>
            item &&
            typeof item.path === "string" &&
            typeof item.content === "string",
        )
        .map((item) => ({
          path: item.path,
          content: item.content,
          action: (item.action === "delete" ? "delete" : "modify") as
            | "create"
            | "modify"
            | "delete",
        }))
    : [];

  if (changes.length === 0) {
    return jsonError("no_changes");
  }

  const cooldown = await checkMergeCooldown(c.env.SESSIONS, clientIp(c.req.raw));
  if (!cooldown.allowed) {
    return mergeCooldownResponse(cooldown.retryAfterSeconds);
  }

  try {
    const result = await publishWorkspaceChanges(c.env, {
      baseSha,
      contributorName: parsedContributorName.name,
      changes,
      allowContentFactChanges: body.allowContentFactChanges === true,
      summary: typeof body.summary === "string" ? body.summary : undefined,
    });

    await setMergeCooldown(
      c.env.SESSIONS,
      clientIp(c.req.raw),
      mergeCooldownMs(c.env),
    );

    return c.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "publish_failed";
    return jsonError(message, 502);
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
