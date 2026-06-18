"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ContributorNameControl } from "@/components/community/ContributorNameControl";
import { readContributorName } from "@/lib/contributor-name";
import {
  fetchProjectFiles,
  pollDeployStatus,
  publishWorkspaceChanges,
  requestAgentEdit,
} from "@/lib/design-workspace-client";
import { DesignStatusPanel } from "./DesignStatusPanel";
import { WebContainerPreview } from "./WebContainerPreview";
import type { DesignWorkspaceStatus, EditEvent, FileChange } from "./types";
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
} from "./webcontainer";

export function DesignMode() {
  const [status, setStatus] = useState<DesignWorkspaceStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [devLog, setDevLog] = useState("");
  const [changes, setChanges] = useState<FileChange[]>([]);
  const [editEvents, setEditEvents] = useState<EditEvent[]>([]);
  const [commitUrl, setCommitUrl] = useState<string | null>(null);
  const [baseSha, setBaseSha] = useState<string | null>(null);

  const originalFilesRef = useRef<Record<string, string>>({});
  const containerRef = useRef<Awaited<ReturnType<typeof bootWebContainer>> | null>(null);
  const bootStartedRef = useRef(false);

  const appendLog = useCallback((chunk: string) => {
    setDevLog((prev) => prev + chunk);
  }, []);

  const refreshChanges = useCallback(async () => {
    const container = containerRef.current;
    if (!container) return;
    const next = await exportChangedFiles(container, originalFilesRef.current);
    setChanges(next);
    if (next.length > 0 && status !== "publishing" && status !== "published") {
      setStatus("ready_to_publish");
    }
  }, [status]);

  useEffect(() => {
    if (bootStartedRef.current) return;
    bootStartedRef.current = true;

    async function boot() {
      try {
        if (!isCrossOriginIsolated()) {
          throw new Error(
            "Design mode requires cross-origin isolation (COOP/COEP headers). Reload after deploy or run via next dev.",
          );
        }

        setStatus("booting");
        setError(null);

        const container = await bootWebContainer();
        containerRef.current = container;

        setStatus("loading_files");
        const project = await fetchProjectFiles();
        setBaseSha(project.baseSha);

        const originalFiles = await mountProjectFiles(container, project.files);
        originalFilesRef.current = originalFiles;

        setStatus("installing");
        const installCode = await installDependencies(container, appendLog);
        if (installCode !== 0) {
          throw new Error(`npm install failed with exit code ${installCode}`);
        }

        setStatus("starting_dev");
        const { url } = await startDevServer(container, appendLog);
        setPreviewUrl(url);
        setStatus("ready");
      } catch (bootError) {
        const message =
          bootError instanceof Error ? bootError.message : "Failed to boot design workspace.";
        setError(message);
        setStatus("build_error");
      }
    }

    void boot();
  }, [appendLog]);

  const handleTestEdit = useCallback(async () => {
    const container = containerRef.current;
    if (!container) return;

    try {
      setStatus("applying_changes");
      setError(null);
      const overridesPath = "src/app/design-overrides.css";
      const current = await listTrackedFiles(container);
      const existing = current[overridesPath] ?? "/* design overrides */\n";
      const stamp = new Date().toISOString();
      await writeFile(
        container,
        overridesPath,
        `${existing}\n/* test edit ${stamp} */\nbody { outline: 1px dashed rgba(37, 99, 235, 0.25); }\n`,
      );
      await refreshChanges();
      setStatus("ready_to_publish");
    } catch (editError) {
      setError(editError instanceof Error ? editError.message : "Test edit failed.");
      setStatus("build_error");
    }
  }, [refreshChanges]);

  const handlePromptSubmit = useCallback(async () => {
    const container = containerRef.current;
    const trimmed = prompt.trim();
    if (!container || !trimmed) return;

    if (!readContributorName()) {
      setError("Add your name for attribution before prompting the agent.");
      return;
    }

    try {
      setStatus("agent_editing");
      setError(null);

      const allFiles = await listTrackedFiles(container);
      const contextFiles = pickContextFiles(allFiles);

      const result = await requestAgentEdit({
        prompt: trimmed,
        files: contextFiles,
      });

      setStatus("applying_changes");
      for (const write of result.writes) {
        await writeFile(container, write.path, write.content);
      }

      if (result.commands.length > 0) {
        setStatus("installing_packages");
        for (const command of result.commands) {
          const code = await runShellCommand(container, command, appendLog);
          if (code !== 0) {
            throw new Error(`Command failed (${code}): ${command}`);
          }
        }
      }

      const filesChanged = result.writes.map((write) => write.path);
      setEditEvents((prev) => [
        {
          id: crypto.randomUUID(),
          prompt: trimmed,
          summary: result.summary,
          filesChanged,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);

      setPrompt("");
      await refreshChanges();
      setStatus("ready_to_publish");
    } catch (agentError) {
      setError(agentError instanceof Error ? agentError.message : "Agent edit failed.");
      setStatus("build_error");
    }
  }, [appendLog, prompt, refreshChanges]);

  const handlePublish = useCallback(async () => {
    const container = containerRef.current;
    if (!container || !baseSha) return;

    if (!readContributorName()) {
      setError("Add your name before publishing.");
      return;
    }

    try {
      setStatus("publishing");
      setError(null);

      const nextChanges = await exportChangedFiles(container, originalFilesRef.current);
      if (nextChanges.length === 0) {
        throw new Error("No changes to publish.");
      }

      const summary =
        editEvents[0]?.summary ??
        `Updated ${nextChanges.length} file${nextChanges.length === 1 ? "" : "s"}`;

      const result = await publishWorkspaceChanges({
        baseSha,
        changes: nextChanges,
        summary,
      });

      setCommitUrl(result.prUrl ?? result.commitUrl);
      setStatus("published");

      const poll = async () => {
        for (let i = 0; i < 30; i++) {
          await new Promise((resolve) => setTimeout(resolve, 4000));
          const deploy = await pollDeployStatus(result.sha);
          if (deploy.live) return;
        }
      };
      void poll();
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : "Publish failed.");
      setStatus("build_error");
    }
  }, [baseSha, editEvents]);

  const publishDisabled = useMemo(() => {
    return (
      changes.length === 0 ||
      status === "publishing" ||
      status === "published" ||
      status === "booting" ||
      status === "loading_files" ||
      status === "installing" ||
      status === "starting_dev" ||
      status === "agent_editing" ||
      status === "applying_changes" ||
      status === "installing_packages"
    );
  }, [changes.length, status]);

  const previewMessage = useMemo(() => {
    if (error) return error;
    if (status === "booting") return "Booting WebContainer…";
    if (status === "loading_files") return "Loading repo files from GitHub…";
    if (status === "installing") return "Installing dependencies…";
    if (status === "starting_dev") return "Starting dev server…";
    return "Preview will appear here once the dev server is ready.";
  }, [error, status]);

  return (
    <div className="design-workspace">
      <header className="design-workspace-header">
        <div className="design-workspace-header-left">
          <Link href="/" className="design-workspace-wordmark">
            popped.dev
          </Link>
          <span className="design-workspace-badge">Design mode</span>
        </div>
        <ContributorNameControl />
      </header>

      <div className="design-workspace-body">
        <section className="design-workspace-main">
          <WebContainerPreview previewUrl={previewUrl} statusMessage={previewMessage} />

          <div className="design-workspace-composer">
            <textarea
              className="design-workspace-input"
              rows={3}
              placeholder="Ask the agent to redesign the portfolio…"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              disabled={
                status === "booting" ||
                status === "loading_files" ||
                status === "installing" ||
                status === "starting_dev" ||
                status === "agent_editing"
              }
            />
            <div className="design-workspace-composer-actions">
              <button
                type="button"
                className="design-workspace-secondary"
                onClick={() => void handleTestEdit()}
                disabled={!previewUrl}
              >
                Test CSS edit
              </button>
              <button
                type="button"
                className="design-workspace-primary"
                onClick={() => void handlePromptSubmit()}
                disabled={!previewUrl || !prompt.trim()}
              >
                Send to agent
              </button>
            </div>
          </div>
        </section>

        <DesignStatusPanel
          status={status}
          error={error}
          previewUrl={previewUrl}
          changes={changes}
          editEvents={editEvents}
          devLog={devLog}
          onPublish={() => void handlePublish()}
          publishDisabled={publishDisabled}
          commitUrl={commitUrl}
        />
      </div>
    </div>
  );
}
