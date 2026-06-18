import type { WebContainer } from "@webcontainer/api";
import type { FileSystemTree } from "@webcontainer/api";
import { computeFileChanges } from "./diff";
import type { FileChange } from "./types";
import {
  canAttemptDesignBoot,
  detectCoepMode,
  getDesignModeBlockReason,
} from "./design-support";
import { patchPackageJsonForWebContainer } from "./patch-project-for-webcontainer";
import { pickAgentContextFiles } from "@shared/agent-context-files";
import { isEditableWorkspacePath } from "@shared/editable-workspace-paths";
import { createInstallProgressReporter } from "./install-progress";

export { startDevServer } from "./dev-server";

let webcontainerPromise: Promise<WebContainer> | null = null;
let webcontainerInstance: WebContainer | null = null;

export type WorkspaceSession = {
  container: WebContainer;
  originalFiles: Record<string, string>;
  previewUrl: string | null;
  devOutput: string[];
};

function shouldTrackPath(path: string): boolean {
  return isEditableWorkspacePath(path);
}

export function flatFilesToTree(files: Record<string, string>): FileSystemTree {
  const root: FileSystemTree = {};

  for (const [filePath, content] of Object.entries(files)) {
    const parts = filePath.split("/").filter(Boolean);
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;

      if (isLast) {
        current[part] = { file: { contents: content } };
        continue;
      }

      const existing = current[part];
      if (!existing || !("directory" in existing)) {
        current[part] = { directory: {} };
      }
      current = (current[part] as { directory: FileSystemTree }).directory;
    }
  }

  return root;
}

export async function bootWebContainer(): Promise<WebContainer> {
  if (webcontainerInstance) return webcontainerInstance;
  if (webcontainerPromise) return webcontainerPromise;

  webcontainerPromise = (async () => {
    const { WebContainer } = await import("@webcontainer/api");

    const coep = detectCoepMode();
    if (coep === "none" || !canAttemptDesignBoot()) {
      throw new Error(getDesignModeBlockReason());
    }

    webcontainerInstance = await WebContainer.boot({ coep });
    return webcontainerInstance;
  })();

  return webcontainerPromise;
}

export async function mountProjectFiles(
  container: WebContainer,
  files: Record<string, string>,
): Promise<Record<string, string>> {
  const mountable = { ...files };
  delete mountable["package-lock.json"];

  const tree = flatFilesToTree(mountable);
  await container.mount(tree);

  const originalFiles: Record<string, string> = {};
  for (const [path, content] of Object.entries(files)) {
    if (shouldTrackPath(path) && path !== "package-lock.json") {
      originalFiles[path] = content;
    }
  }
  return originalFiles;
}

/** Install deps with a WebContainer-compatible Next.js version, then restore package.json. */
export async function installDependenciesForWebContainer(
  container: WebContainer,
  originalPackageJson: string,
  onOutput?: (chunk: string) => void,
  onProgress?: (percent: number) => void,
): Promise<number> {
  await writeFile(container, "package.json", patchPackageJsonForWebContainer(originalPackageJson));

  try {
    await container.fs.rm("package-lock.json");
  } catch {
    // optional
  }

  const reporter = createInstallProgressReporter(originalPackageJson, (percent) =>
    onProgress?.(percent),
  );

  const code = await installDependencies(container, (chunk) => {
    onOutput?.(chunk);
    reporter.ingest(chunk);
  });

  reporter.finish();
  await writeFile(container, "package.json", originalPackageJson);
  return code;
}

export async function installDependencies(
  container: WebContainer,
  onOutput?: (chunk: string) => void,
): Promise<number> {
  const process = await container.spawn("npm", [
    "install",
    "--no-audit",
    "--no-fund",
    "--loglevel=verbose",
    "--progress=true",
  ]);
  process.output.pipeTo(
    new WritableStream({
      write(chunk) {
        onOutput?.(chunk);
      },
    }),
  );
  return process.exit;
}

export async function readFile(container: WebContainer, path: string): Promise<string> {
  const data = await container.fs.readFile(path, "utf-8");
  return typeof data === "string" ? data : new TextDecoder().decode(data);
}

export async function writeFile(
  container: WebContainer,
  path: string,
  contents: string,
): Promise<void> {
  const parts = path.split("/");
  if (parts.length > 1) {
    const dir = parts.slice(0, -1).join("/");
    await container.fs.mkdir(dir, { recursive: true });
  }
  await container.fs.writeFile(path, contents);
}

async function walkDirectory(
  container: WebContainer,
  dir: string,
  acc: Record<string, string>,
): Promise<void> {
  let entries: Array<{ name: string; isDirectory(): boolean } | string>;
  try {
    entries = await container.fs.readdir(dir || ".", { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const name = typeof entry === "string" ? entry : entry.name;
    if (name === "." || name === "..") continue;

    const isDir =
      typeof entry === "string" ? false : typeof entry.isDirectory === "function" && entry.isDirectory();
    const fullPath = dir && dir !== "." ? `${dir}/${name}` : name;

    if (isDir) {
      await walkDirectory(container, fullPath, acc);
      continue;
    }

    if (!shouldTrackPath(fullPath)) continue;

    try {
      acc[fullPath] = await readFile(container, fullPath);
    } catch {
      // skip unreadable files
    }
  }
}

export async function listTrackedFiles(container: WebContainer): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  await walkDirectory(container, ".", files);

  return files;
}

export async function exportChangedFiles(
  container: WebContainer,
  originalFiles: Record<string, string>,
): Promise<FileChange[]> {
  const current = await listTrackedFiles(container);
  return computeFileChanges(originalFiles, current);
}

export async function runShellCommand(
  container: WebContainer,
  commandLine: string,
  onOutput?: (chunk: string) => void,
): Promise<number> {
  const trimmed = commandLine.trim();
  if (!trimmed.startsWith("npm ")) {
    throw new Error(`Unsupported command: ${commandLine}`);
  }
  const parts = trimmed.split(/\s+/);
  const process = await container.spawn(parts[0], parts.slice(1));
  process.output.pipeTo(
    new WritableStream({
      write(chunk) {
        onOutput?.(chunk);
      },
    }),
  );
  return process.exit;
}

export function pickContextFiles(
  allFiles: Record<string, string>,
  extraPaths: string[] = [],
): Record<string, string> {
  return pickAgentContextFiles(allFiles, extraPaths);
}

export { isCrossOriginIsolated } from "./design-support";
