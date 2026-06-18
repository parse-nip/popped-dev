function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
}

const FAILURE_PATTERNS = [
  /Failed to compile[\s\S]{0,3500}/i,
  /Build Error[\s\S]{0,3500}/i,
  /Module not found:[\s\S]{0,2000}/i,
  /SyntaxError:[\s\S]{0,2000}/i,
  /Type error:[\s\S]{0,2500}/i,
  /Parsing ecmascript source code failed[\s\S]{0,2500}/i,
  /Cannot find module[\s\S]{0,2000}/i,
  /⨯[^\n]*\n[\s\S]{0,2500}/,
];

const SUCCESS_PATTERNS = [
  /Compiled successfully/i,
  /✓ Compiled/i,
  /Fast Refresh/i,
  /Compiled in \d+/i,
];

/** Pull a human-readable compile error from recent dev-server log output. */
export function extractCompileError(logChunk: string): string | null {
  const clean = stripAnsi(logChunk).trim();
  if (!clean) return null;

  for (const pattern of FAILURE_PATTERNS) {
    const match = clean.match(pattern);
    if (match?.[0]) {
      return match[0].trim().slice(0, 2500);
    }
  }

  if (/error TS\d+:/i.test(clean)) {
    const match = clean.match(/error TS\d+:[\s\S]{0,2000}/i);
    if (match) return match[0].trim();
  }

  return null;
}

export function logChunkLooksLikeCompileFailure(logChunk: string): boolean {
  return extractCompileError(logChunk) !== null;
}

export function logChunkLooksLikeCompileSuccess(logChunk: string): boolean {
  const tail = stripAnsi(logChunk).slice(-1200);
  if (logChunkLooksLikeCompileFailure(tail)) return false;
  return SUCCESS_PATTERNS.some((pattern) => pattern.test(tail));
}

export type CompileWaitResult = {
  ok: boolean;
  error: string | null;
  newLog: string;
  timedOut: boolean;
};

const COMPILE_WAIT_MS = 20_000;
const COMPILE_POLL_MS = 350;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/** Wait for Next.js dev server output after file writes. */
export async function waitForCompileResult(
  readLog: () => string,
  logStartIndex: number,
  timeoutMs = COMPILE_WAIT_MS,
): Promise<CompileWaitResult> {
  const deadline = Date.now() + timeoutMs;
  let lastNewLog = "";

  while (Date.now() < deadline) {
    await sleep(COMPILE_POLL_MS);
    lastNewLog = readLog().slice(logStartIndex);

    if (logChunkLooksLikeCompileFailure(lastNewLog)) {
      return {
        ok: false,
        error: extractCompileError(lastNewLog),
        newLog: lastNewLog,
        timedOut: false,
      };
    }

    if (logChunkLooksLikeCompileSuccess(lastNewLog)) {
      return { ok: true, error: null, newLog: lastNewLog, timedOut: false };
    }
  }

  const trailing = readLog().slice(logStartIndex);
  const error = extractCompileError(trailing);
  if (error) {
    return { ok: false, error, newLog: trailing, timedOut: true };
  }

  return { ok: true, error: null, newLog: trailing, timedOut: true };
}
