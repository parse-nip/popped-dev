import type { WebContainer } from "@webcontainer/api";
import { DevServerProgressTracker } from "./install-progress";

const DEV_SERVER_TIMEOUT_MS = 360_000;

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
}

function looksLikeNextReady(text: string): boolean {
  const clean = stripAnsi(text);
  return (
    /✓ Ready/i.test(clean) ||
    /Ready in \d+/i.test(clean) ||
    /Local:\s+https?:\/\//i.test(clean) ||
    /started server on/i.test(clean)
  );
}

export async function startDevServer(
  container: WebContainer,
  onOutput?: (chunk: string) => void,
  onProgress?: (percent: number) => void,
): Promise<{ url: string; output: string[] }> {
  const output: string[] = [];
  const devProgress = new DevServerProgressTracker();
  let previewUrl: string | null = null;
  let sawReadyLine = false;
  let finished = false;

  const url = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      if (finished) return;
      if (previewUrl) {
        finished = true;
        resolve(previewUrl);
        return;
      }
      reject(
        new Error(
          "Preview is taking longer than expected — try toggling Design off and on again.",
        ),
      );
    }, DEV_SERVER_TIMEOUT_MS);

    const finish = (url: string) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      resolve(url);
    };

    container.on("server-ready", (port, url) => {
      void port;
      previewUrl = url;
      onProgress?.(100);
      finish(url);
    });

    container.on("port", (port, type, url) => {
      if (port === 3000 && type === "open" && url) {
        previewUrl = url;
        onProgress?.(Math.max(devProgress.ingest(""), 85));
        if (sawReadyLine) finish(url);
      }
    });

    void (async () => {
      const process = await container.spawn("node", [
        "node_modules/next/dist/bin/next",
        "dev",
        "--hostname",
        "0.0.0.0",
        "--port",
        "3000",
      ]);

      process.output.pipeTo(
        new WritableStream({
          write(chunk) {
            output.push(chunk);
            onOutput?.(chunk);

            const pct = devProgress.ingest(chunk);
            if (pct > 0) onProgress?.(pct);

            if (looksLikeNextReady(chunk)) {
              sawReadyLine = true;
              if (previewUrl) finish(previewUrl);
            }
          },
        }),
      );

      const exitCode = await process.exit;
      if (!finished && exitCode !== 0) {
        clearTimeout(timeout);
        reject(new Error(`Dev server exited with code ${exitCode}`));
      }
    })().catch((error) => {
      if (finished) return;
      clearTimeout(timeout);
      reject(error instanceof Error ? error : new Error("Dev server failed to start."));
    });
  });

  return { url, output };
}
