import type { WebContainer } from "@webcontainer/api";
import type { FileSystemTree } from "@webcontainer/api";
import { computeFileChanges } from "./diff";
import type { FileChange } from "./types";

let webcontainerPromise: Promise<WebContainer> | null = null;
let webcontainerInstance: WebContainer | null = null;

const TRACKED_PREFIXES = ["src/", "public/", "shared/", "src/app/design-overrides.css"];
const TRACKED_ROOT_FILES = new Set([
  "package.json",
  "package-lock.json",
  "next.config.ts",
  "tsconfig.json",
  "postcss.config.mjs",
  "components.json",
]);

export type WorkspaceSession = {
  container: WebContainer;
  originalFiles: Record<string, string>;
  previewUrl: string | null;
  devOutput: string[];
};

function shouldTrackPath(path: string): boolean {
  if (TRACKED_ROOT_FILES.has(path)) return true;
  return TRACKED_PREFIXES.some((prefix) => path.startsWith(prefix));
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
    webcontainerInstance = await WebContainer.boot();
    return webcontainerInstance;
  })();

  return webcontainerPromise;
}

export async function mountProjectFiles(
  container: WebContainer,
  files: Record<string, string>,
): Promise<Record<string, string>> {
  const tree = flatFilesToTree(files);
  await container.mount(tree);

  const originalFiles: Record<string, string> = {};
  for (const [path, content] of Object.entries(files)) {
    if (shouldTrackPath(path)) {
      originalFiles[path] = content;
    }
  }
  return originalFiles;
}

export async function installDependencies(
  container: WebContainer,
  onOutput?: (chunk: string) => void,
): Promise<number> {
  const process = await container.spawn("npm", ["install"]);
  process.output.pipeTo(
    new WritableStream({
      write(chunk) {
        onOutput?.(chunk);
      },
    }),
  );
  return process.exit;
}

export async function startDevServer(
  container: WebContainer,
  onOutput?: (chunk: string) => void,
): Promise<{ url: string; output: string[] }> {
  const output: string[] = [];

  const urlPromise = new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Dev server did not become ready in time."));
    }, 120_000);

    container.on("server-ready", (port, url) => {
      clearTimeout(timeout);
      resolve(url);
      void port;
    });
  });

  const process = await container.spawn("npm", ["run", "dev"]);
  process.output.pipeTo(
    new WritableStream({
      write(chunk) {
        output.push(chunk);
        onOutput?.(chunk);
      },
    }),
  );

  const url = await urlPromise;
  return { url, output };
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

  for (const rootFile of TRACKED_ROOT_FILES) {
    try {
      files[rootFile] = await readFile(container, rootFile);
    } catch {
      // optional root file
    }
  }

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
  const paths = new Set<string>([
    "package.json",
    "src/app/globals.css",
    "src/app/design-overrides.css",
    "src/components/SiteHeader.tsx",
    "src/components/locked/LockedResume.tsx",
    ...extraPaths,
  ]);

  const picked: Record<string, string> = {};
  for (const path of paths) {
    if (allFiles[path]) picked[path] = allFiles[path];
  }

  if (Object.keys(picked).length === 0) {
    for (const [path, content] of Object.entries(allFiles).slice(0, 6)) {
      picked[path] = content;
    }
  }

  return picked;
}

export function isCrossOriginIsolated(): boolean {
  return typeof crossOriginIsolated !== "undefined" && crossOriginIsolated;
}
