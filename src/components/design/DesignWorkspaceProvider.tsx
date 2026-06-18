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
import type { DesignWorkspaceStatus, EditEvent, FileChange, StatusBarTone } from "@/design/types";
import {
  bootWebContainer,
  exportChangedFiles,
  installDependenciesForWebContainer,
  listTrackedFiles,
  mountProjectFiles,
  pickContextFiles,
  readFile,
  runShellCommand,
  startDevServer,
  writeFile,
} from "@/design/webcontainer";
import { createInstallProgressReporter } from "@/design/install-progress";
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
  /** Rough progress for the current boot/install/dev phase (0–100). */
  progressPercent: number | null;
  /** Live snippet streamed while the agent is working. */
  statusDetail: string | null;
  statusBarTone: StatusBarTone;
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
  const [progressPercent, setProgressPercent] = useState<number | null>(null);
  const [statusDetail, setStatusDetail] = useState<string | null>(null);
  const [statusBarTone, setStatusBarTone] = useState<StatusBarTone>("default");
  const [previewLive, setPreviewLive] = useState(false);
  const [previewRevision, setPreviewRevision] = useState(0);

  const containerRef = useRef<WebContainer | null>(null);
  const originalFilesRef = useRef<Record<string, string>>({});
  const bootPromiseRef = useRef<Promise<void> | null>(null);
  const devLogRef = useRef("");
  const approvedFlashTimeoutRef = useRef<number | null>(null);

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
    setPreviewLive(false);
  }, []);

  const boot = useCallback(async () => {
    if (containerRef.current && previewUrl) return;
    if (bootPromiseRef.current) return bootPromiseRef.current;

    bootPromiseRef.current = (async () => {
      try {
        setStatus("booting");
        setError(null);
        setProgressPercent(5);
        resetPreviewSignals();

        const container = await bootWebContainer();
        containerRef.current = container;

        setStatus("loading_files");
        setProgressPercent(12);
        const project = await fetchProjectFiles();
        setBaseSha(project.baseSha);

        originalFilesRef.current = await mountProjectFiles(container, project.files);

        setStatus("installing");
        setProgressPercent(1);
        const packageJson = project.files["package.json"] ?? "{}";
        const installCode = await installDependenciesForWebContainer(
          container,
          packageJson,
          appendLog,
          (percent) => setProgressPercent(percent),
        );
        if (installCode !== 0) {
          throw new Error(`npm install failed (exit ${installCode})`);
        }

        setStatus("starting_dev");
        setProgressPercent(0);
        const { url } = await startDevServer(container, appendLog, (percent) =>
          setProgressPercent(percent),
        );
        setPreviewUrl(url);
        setStatus("ready");
        setProgressPercent(95);
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

  useEffect(() => {
    if (previewFrameLoaded && previewAppReady && previewUrl) {
      setPreviewLive(true);
    }
  }, [previewFrameLoaded, previewAppReady, previewUrl]);

  const bumpPreview = useCallback(() => {
    setPreviewRevision((revision) => revision + 1);
  }, []);

  const runAgentEdit = useCallback(
    async (prompt: string, elementContext: ElementContext): Promise<string> => {
      const container = containerRef.current;
      if (!container) throw new Error("Still preparing design mode.");

      if (approvedFlashTimeoutRef.current) {
        window.clearTimeout(approvedFlashTimeoutRef.current);
        approvedFlashTimeoutRef.current = null;
      }

      setStatus("agent_editing");
      setError(null);
      setStatusDetail("Checking your idea…");
      setStatusBarTone("approving");
      setProgressPercent(null);

      const allFiles = await listTrackedFiles(container);
      const contextFiles = pickContextFiles(allFiles, elementContext.suggestedFiles);

      let result;
      try {
        result = await requestAgentEdit(
          {
            prompt,
            files: contextFiles,
            selectedElement: {
              designId: elementContext.designId,
              tagName: elementContext.tagName,
              text: elementContext.textPreview,
              selector: elementContext.selector,
              sourceFile: elementContext.sourceFile,
            },
          },
          {
            onStatus: (message) => {
              setStatusDetail(message);
              if (/agent is working/i.test(message)) {
                setStatusBarTone("default");
              }
            },
            onApproved: (reason) => {
              setStatusBarTone("approved");
              setStatusDetail(reason);
              approvedFlashTimeoutRef.current = window.setTimeout(() => {
                setStatusBarTone("default");
                approvedFlashTimeoutRef.current = null;
              }, 1400);
            },
            onRejected: () => {
              setStatusBarTone("rejected");
            },
          },
        );
      } catch (editError) {
        const message =
          editError instanceof Error ? editError.message : "Design request failed.";
        setError(message);
        setStatus("edit_rejected");
        setStatusBarTone("rejected");
        setStatusDetail(null);
        throw editError;
      }

      if (!result.writes?.length) {
        throw new Error("Agent returned no file changes.");
      }

      try {
        setStatusBarTone("default");
        setStatus("applying_changes");
        setStatusDetail(`Updating ${result.writes.length} file${result.writes.length === 1 ? "" : "s"}…`);

        for (const write of result.writes) {
          await writeFile(container, write.path, write.content);
        }

        if (result.commands.length > 0) {
          setStatus("installing_packages");
          setStatusDetail(null);
          const packageJson = await readFile(container, "package.json");
          const reporter = createInstallProgressReporter(packageJson, (percent) =>
            setProgressPercent(percent),
          );

          try {
            for (const command of result.commands) {
              const code = await runShellCommand(container, command, (chunk) => {
                appendLog(chunk);
                if (command.trim().startsWith("npm install")) {
                  reporter.ingest(chunk);
                }
              });
              if (code !== 0) throw new Error(`Command failed: ${command}`);
            }
            reporter.finish();
          } catch (error) {
            reporter.cancel();
            throw error;
          }
        } else {
          setProgressPercent(null);
        }

        bumpPreview();
        setStatusDetail("Refreshing preview…");
        await new Promise((resolve) => window.setTimeout(resolve, 600));

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

        setStatusDetail(null);
        await refreshChanges();
        setStatus("ready_to_publish");
        return result.summary;
      } catch (applyError) {
        const message =
          applyError instanceof Error ? applyError.message : "Could not apply design change.";
        setError(message);
        setStatus("build_error");
        setStatusBarTone("default");
        setStatusDetail(null);
        throw applyError;
      }
    },
    [appendLog, bumpPreview, refreshChanges],
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
    ? `${previewUrl}${previewUrl.includes("?") ? "&" : "?"}designEmbed=1&rev=${previewRevision}`
    : null;

  const isReady =
    previewLive &&
    (status === "ready" ||
      status === "ready_to_publish" ||
      status === "published" ||
      status === "agent_editing" ||
      status === "applying_changes" ||
      status === "installing_packages");

  const isBooting =
    isDesignMode &&
    (status === "booting" ||
      status === "loading_files" ||
      status === "installing" ||
      status === "starting_dev");

  const showLivePreview = isDesignMode && previewLive && Boolean(embedPreviewUrl);

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
      progressPercent,
      statusDetail,
      statusBarTone,
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
      progressPercent,
      statusDetail,
      statusBarTone,
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
