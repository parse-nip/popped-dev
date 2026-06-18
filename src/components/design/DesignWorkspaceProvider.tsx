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
import { isDesignEmbedMessage } from "@shared/design-embed-messages";
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
  /** Live iframe is loaded and the app inside sent a ready signal. */
  showLivePreview: boolean;
  changes: FileChange[];
  editEvents: EditEvent[];
  baseSha: string | null;
  commitUrl: string | null;
  publishStatus: "idle" | "publishing" | "published" | "deploying" | "failed";
  publishError: string | null;
  runAgentEdit: (prompt: string, elementContext: ElementContext) => Promise<string>;
  publish: () => Promise<void>;
  refreshChanges: () => Promise<void>;
  onPreviewFrameLoad: () => void;
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
  const [previewFrameLoaded, setPreviewFrameLoaded] = useState(false);
  const [previewAppReady, setPreviewAppReady] = useState(false);
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
  const devLogRef = useRef("");

  const appendLog = useCallback((chunk: string) => {
    devLogRef.current += stripAnsi(chunk);
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

  const resetPreviewSignals = useCallback(() => {
    setPreviewFrameLoaded(false);
    setPreviewAppReady(false);
  }, []);

  const boot = useCallback(async () => {
    if (containerRef.current && previewUrl) return;
    if (bootPromiseRef.current) return bootPromiseRef.current;

    bootPromiseRef.current = (async () => {
      try {
        setStatus("booting");
        setError(null);
        resetPreviewSignals();

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
          bootError instanceof Error ? bootError.message : "Design mode unavailable.";
        setError(message);
        setStatus("build_error");
        // Keep design mode on so the status bar shows the error message.
      }
    })();

    return bootPromiseRef.current;
  }, [appendLog, previewUrl, resetPreviewSignals]);

  useEffect(() => {
    if (isDesignMode) {
      void boot();
      return;
    }
    resetPreviewSignals();
  }, [isDesignMode, boot, resetPreviewSignals]);

  useEffect(() => {
    if (!previewUrl) return;

    function handleMessage(event: MessageEvent) {
      if (!isDesignEmbedMessage(event.data) || event.data.type !== "ready") return;
      setPreviewAppReady(true);
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [previewUrl]);

  // If the embed ready ping is missed, still crossfade after the frame loads.
  useEffect(() => {
    if (!previewFrameLoaded || previewAppReady) return;
    const timeout = window.setTimeout(() => setPreviewAppReady(true), 8000);
    return () => window.clearTimeout(timeout);
  }, [previewFrameLoaded, previewAppReady]);

  const onPreviewFrameLoad = useCallback(() => {
    setPreviewFrameLoaded(true);
  }, []);

  const runAgentEdit = useCallback(
    async (prompt: string, elementContext: ElementContext): Promise<string> => {
      const container = containerRef.current;
      if (!container) throw new Error("Still preparing design mode.");

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
    if (!container || !baseSha) throw new Error("Design mode not ready.");

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
    isDesignMode && !isReady && status !== "build_error" && status !== "idle";

  const showLivePreview =
    isDesignMode && isReady && previewFrameLoaded && previewAppReady && Boolean(embedPreviewUrl);

  const value = useMemo(
    () => ({
      status,
      error,
      previewUrl,
      embedPreviewUrl,
      isReady,
      isBooting,
      showLivePreview,
      changes,
      editEvents,
      baseSha,
      commitUrl,
      publishStatus,
      publishError,
      runAgentEdit,
      publish,
      refreshChanges,
      onPreviewFrameLoad,
    }),
    [
      status,
      error,
      previewUrl,
      embedPreviewUrl,
      isReady,
      isBooting,
      showLivePreview,
      changes,
      editEvents,
      baseSha,
      commitUrl,
      publishStatus,
      publishError,
      runAgentEdit,
      publish,
      refreshChanges,
      onPreviewFrameLoad,
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
