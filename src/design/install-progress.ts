export type InstallProgressUpdate = {
  percent: number;
  detail?: string;
};

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
}

export function estimateInstallPackageCount(packageJson: string): number {
  try {
    const pkg = JSON.parse(packageJson) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const direct = Object.keys({
      ...pkg.dependencies,
      ...pkg.devDependencies,
    }).length;
    return Math.max(120, direct * 8);
  } catch {
    return 200;
  }
}

/** Parse npm install stdout/stderr into a rough 1–99% progress value. */
export class NpmInstallProgressTracker {
  private readonly estimatedTotal: number;
  private readonly seen = new Set<string>();
  private fetchCount = 0;
  private finished = false;
  private lastPercent = 1;

  constructor(packageJson: string) {
    this.estimatedTotal = estimateInstallPackageCount(packageJson);
  }

  ingest(chunk: string): InstallProgressUpdate {
    const text = stripAnsi(chunk);

    const addedMatch = text.match(/added (\d+) packages/i);
    if (addedMatch) {
      this.finished = true;
      this.lastPercent = 100;
      return { percent: 100, detail: `${addedMatch[1]} packages` };
    }

    if (/idealTree:(buildDeps|init)/i.test(text)) {
      this.lastPercent = Math.max(this.lastPercent, 6);
    }

    if (/reifyPackages:/i.test(text)) {
      this.lastPercent = Math.max(this.lastPercent, 10);
    }

    const fetchMatches = text.matchAll(/npm http fetch GET 200/gi);
    for (const _match of fetchMatches) {
      this.fetchCount += 1;
    }

    const reifyMatches = text.matchAll(/reify:([\w@./-]+)/g);
    for (const match of reifyMatches) {
      const name = match[1];
      if (!name || this.seen.has(name)) continue;
      this.seen.add(name);
    }

    const fractionMatch = text.match(/\((\d+)\/(\d+)\)/);
    if (fractionMatch) {
      const current = Number(fractionMatch[1]);
      const total = Number(fractionMatch[2]);
      if (total > 0) {
        const ratio = current / total;
        this.lastPercent = Math.max(this.lastPercent, Math.min(99, Math.round(ratio * 100)));
      }
    }

    const activity = Math.max(this.seen.size, this.fetchCount);
    if (activity > 0) {
      const ratio = activity / this.estimatedTotal;
      const computed = Math.min(99, Math.max(this.lastPercent, Math.round(ratio * 100)));
      this.lastPercent = Math.max(this.lastPercent, computed);
    }

    if (this.finished) {
      return { percent: 100 };
    }

    return { percent: this.lastPercent };
  }
}

export class DevServerProgressTracker {
  private lastPercent = 0;

  ingest(chunk: string): number {
    const text = stripAnsi(chunk);

    if (/compiling/i.test(text)) {
      this.lastPercent = Math.max(this.lastPercent, 20);
    }
    if (/started server/i.test(text) || /ready on/i.test(text)) {
      this.lastPercent = Math.max(this.lastPercent, 60);
    }
    if (/✓ Ready/i.test(text) || /Ready in/i.test(text)) {
      this.lastPercent = Math.max(this.lastPercent, 92);
    }
    if (/Local:\s+https?:\/\//i.test(text)) {
      this.lastPercent = Math.max(this.lastPercent, 95);
    }

    return this.lastPercent;
  }
}

/** Smooth install progress when npm logs are sparse (common in WebContainer). */
export function createInstallProgressReporter(
  packageJson: string,
  onProgress: (percent: number) => void,
  expectedDurationMs = 90_000,
): {
  ingest: (chunk: string) => void;
  finish: () => void;
  cancel: () => void;
} {
  const tracker = new NpmInstallProgressTracker(packageJson);
  let lastReported = 1;
  const startedAt = Date.now();

  const tick = () => {
    const elapsed = Date.now() - startedAt;
    const timePercent = Math.min(92, 1 + Math.round((elapsed / expectedDurationMs) * 91));
    const next = Math.max(lastReported, timePercent);
    if (next !== lastReported) {
      lastReported = next;
      onProgress(next);
    }
  };

  const interval = window.setInterval(tick, 450);
  onProgress(1);

  return {
    ingest(chunk: string) {
      const update = tracker.ingest(chunk);
      const next = Math.max(lastReported, update.percent);
      if (next !== lastReported) {
        lastReported = next;
        onProgress(next);
      }
    },
    finish() {
      window.clearInterval(interval);
      lastReported = 100;
      onProgress(100);
    },
    cancel() {
      window.clearInterval(interval);
    },
  };
}

export function formatStatusWithPercent(label: string, percent: number | null): string {
  if (percent === null || percent <= 0) return label;
  return `${label} (${percent}%)`;
}

/** Hide raw model / SSE tokens from the status bar. */
export function isReadableStatusDetail(text: string | null): text is string {
  if (!text?.trim()) return false;
  if (text.length > 140) return false;
  if (/data:\s*\{|^\s*\{|\"response\"|\"p\":|\"writes\"|\"commands\"/.test(text)) return false;
  return true;
}
