"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useDesignMode } from "@/components/design/DesignModeContext";
import {
  fetchProjectFiles,
  pollDeployStatus,
  publishWorkspaceChanges,
  requestAgentEdit,
} from "@/lib/design-workspace-client";
import type { ElementContext } from "@/lib/element-context";
import type { DesignWorkspaceStatus, EditEvent, FileChange } from "@/design/types";
import {
  bootWebContainer,
  exportChangedFiles,
  installDependencies,
  isCrossOriginIsolated,
  listTrackedFiles,
  mountProjectFiles,
  pickContextFiles,
  runShellCommand,
  startDevServer,
  writeFile,
} from "@/design/webcontainer";
import type { WebContainer } from "@webcontainer/api";

type DesignWorkspaceContextValue = {
  status: DesignWorkspaceStatus;
  error: string | null;
  previewUrl: string | null;
  embedPreviewUrl: string | null;
  isReady: boolean;
  isBooting: boolean;
  changes: FileChange[];
  editEvents: EditEvent[];
  baseSha: string | null;
  commitUrl: string | null;
  publishStatus: "idle" | "publishing" | "published" | "deploying" | "failed";
  publishError: string | null;
  runAgentEdit: (prompt: string, elementContext: ElementContext) => Promise<string>;
  publish: () => Promise<void>;
  refreshChanges: () => Promise<void>;
};

const DesignWorkspaceContext = createContext<DesignWorkspaceContextValue | null>(null);

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
}

export function DesignWorkspaceProvider({ children }: { children: ReactNode }) {
  const { isDesignMode } = useDesignMode();
  const [status, setStatus] = useState<DesignWorkspaceStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [changes, setChanges] = useState<FileChange[]>([]);
  const [editEvents, setEditEvents] = useState<EditEvent[]>([]);
  const [baseSha, setBaseSha] = useState<string | null>(null);
  const [commitUrl, setCommitUrl] = useState<string | null>(null);
  const [publishStatus, setPublishStatus] = useState<
    "idle" | "publishing" | "published" | "deploying" | "failed"
  >("idle");
  const [publishError, setPublishError] = useState<string | null>(null);

  const containerRef = useRef<WebContainer | null>(null);
  const originalFilesRef = useRef<Record<string, string>>({});
  const bootPromiseRef = useRef<Promise<void> | null>(null);

  const appendLog = useCallback((chunk: string) => {
    const cleaned = stripAnsi(chunk);
    if (/error|failed|warn/i.test(cleaned)) {
      // surfaced via status panel if needed
    }
  }, []);

  const refreshChanges = useCallback(async () => {
    const container = containerRef.current;
    if (!container) return;
    const next = await exportChangedFiles(container, originalFilesRef.current);
    setChanges(next);
    if (next.length > 0) {
      setStatus((current) =>
        current === "publishing" || current === "published" ? current : "ready_to_publish",
      );
    }
  }, []);

  const boot = useCallback(async () => {
    if (containerRef.current && previewUrl) return;
    if (bootPromiseRef.current) return bootPromiseRef.current;

    bootPromiseRef.current = (async () => {
      try {
        if (!isCrossOriginIsolated()) {
          throw new Error(
            "Design mode needs cross-origin isolation. Hard-refresh the page after deploy.",
          );
        }

        setStatus("booting");
        setError(null);

        const container = await bootWebContainer();
        containerRef.current = container;

        setStatus("loading_files");
        const project = await fetchProjectFiles();
        setBaseSha(project.baseSha);

        originalFilesRef.current = await mountProjectFiles(container, project.files);

        setStatus("installing");
        const installCode = await installDependencies(container, appendLog);
        if (installCode !== 0) {
          throw new Error(`npm install failed (exit ${installCode})`);
        }

        setStatus("starting_dev");
        const { url } = await startDevServer(container, appendLog);
        setPreviewUrl(url);
        setStatus("ready");
      } catch (bootError) {
        const message =
          bootError instanceof Error ? bootError.message : "Could not start design workspace.";
        setError(message);
        setStatus("build_error");
      }
    })();

    return bootPromiseRef.current;
  }, [appendLog, previewUrl]);

  useEffect(() => {
    if (isDesignMode) {
      void boot();
    }
  }, [isDesignMode, boot]);

  const runAgentEdit = useCallback(
    async (prompt: string, elementContext: ElementContext): Promise<string> => {
      const container = containerRef.current;
      if (!container) throw new Error("Workspace is still loading.");

      setStatus("agent_editing");
      setError(null);

      const allFiles = await listTrackedFiles(container);
      const contextFiles = pickContextFiles(allFiles, elementContext.suggestedFiles);

      const result = await requestAgentEdit({
        prompt,
        files: contextFiles,
        selectedElement: {
          designId: elementContext.designId,
          tagName: elementContext.tagName,
          text: elementContext.textPreview,
          selector: elementContext.selector,
          sourceFile: elementContext.sourceFile,
        },
      });

      setStatus("applying_changes");
      for (const write of result.writes) {
        await writeFile(container, write.path, write.content);
      }

      if (result.commands.length > 0) {
        setStatus("installing_packages");
        for (const command of result.commands) {
          const code = await runShellCommand(container, command, appendLog);
          if (code !== 0) throw new Error(`Command failed: ${command}`);
        }
      }

      setEditEvents((prev) => [
        {
          id: crypto.randomUUID(),
          prompt,
          summary: result.summary,
          filesChanged: result.writes.map((w) => w.path),
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);

      await refreshChanges();
      setStatus("ready_to_publish");
      return result.summary;
    },
    [appendLog, refreshChanges],
  );

  const publish = useCallback(async () => {
    const container = containerRef.current;
    if (!container || !baseSha) throw new Error("Workspace not ready.");

    setPublishStatus("publishing");
    setPublishError(null);
    setStatus("publishing");

    try {
      const nextChanges = await exportChangedFiles(container, originalFilesRef.current);
      if (nextChanges.length === 0) throw new Error("No changes to publish.");

      const summary =
        editEvents[0]?.summary ??
        `Updated ${nextChanges.length} file${nextChanges.length === 1 ? "" : "s"}`;

      const result = await publishWorkspaceChanges({
        baseSha,
        changes: nextChanges,
        summary,
      });

      setCommitUrl(result.prUrl ?? result.commitUrl);
      setPublishStatus("deploying");
      setStatus("published");

      void (async () => {
        for (let i = 0; i < 30; i++) {
          await new Promise((resolve) => setTimeout(resolve, 4000));
          const deploy = await pollDeployStatus(result.sha);
          if (deploy.live) {
            setPublishStatus("published");
            return;
          }
        }
      })();
    } catch (publishErr) {
      const message = publishErr instanceof Error ? publishErr.message : "Publish failed.";
      setPublishError(message);
      setPublishStatus("failed");
      setStatus("build_error");
      setError(message);
      throw publishErr;
    }
  }, [baseSha, editEvents]);

  const embedPreviewUrl = previewUrl
    ? `${previewUrl}${previewUrl.includes("?") ? "&" : "?"}designEmbed=1`
    : null;

  const isReady = status === "ready" || status === "ready_to_publish" || status === "published";
  const isBooting =
    isDesignMode &&
    !isReady &&
    status !== "build_error" &&
    status !== "idle";

  const value = useMemo(
    () => ({
      status,
      error,
      previewUrl,
      embedPreviewUrl,
      isReady,
      isBooting,
      changes,
      editEvents,
      baseSha,
      commitUrl,
      publishStatus,
      publishError,
      runAgentEdit,
      publish,
      refreshChanges,
    }),
    [
      status,
      error,
      previewUrl,
      embedPreviewUrl,
      isReady,
      isBooting,
      changes,
      editEvents,
      baseSha,
      commitUrl,
      publishStatus,
      publishError,
      runAgentEdit,
      publish,
      refreshChanges,
    ],
  );

  return (
    <DesignWorkspaceContext.Provider value={value}>{children}</DesignWorkspaceContext.Provider>
  );
}

export function useDesignWorkspace() {
  const context = useContext(DesignWorkspaceContext);
  if (!context) {
    throw new Error("useDesignWorkspace must be used within DesignWorkspaceProvider");
  }
  return context;
}

export function useOptionalDesignWorkspace() {
  return useContext(DesignWorkspaceContext);
}
