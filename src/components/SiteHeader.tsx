"use client";

import Link from "next/link";
import { ContributorNameControl } from "@/components/community/ContributorNameControl";
import { useDesignChanges } from "@/components/design/DesignChangesProvider";
import { useDesignMode } from "@/components/design/DesignModeContext";
import { useDesignWorkspace } from "@/components/design/DesignWorkspaceProvider";
import { Button } from "@/components/ui/button";
import { formatCooldownRemaining } from "@/lib/merge-cooldown";
import { useMergeCooldown } from "@/lib/use-merge-cooldown";
import { isDraftPreviewEmbed } from "@/lib/draft-preview";

function DesignCursorIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3.2 2.1 12.4 8.2a.45.45 0 0 1 0 .76L3.2 14.9V2.1Z" fill="currentColor" />
      <rect
        x="8.5"
        y="8.5"
        width="5.5"
        height="5.5"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.2"
        fill="none"
      />
    </svg>
  );
}

export function SiteHeader() {
  const { isDesignMode, toggleDesignMode } = useDesignMode();
  const { isAgentBusy } = useDesignChanges();
  const {
    isBooting,
    status,
    changes,
    publish,
    publishStatus,
    showLivePreview,
    commitUrl,
  } = useDesignWorkspace();
  const { active: mergeCooldownActive, remainingMs } = useMergeCooldown();
  const designDisabled = isDraftPreviewEmbed() || mergeCooldownActive;
  const designLockedOn = isAgentBusy && isDesignMode;

  const showHeaderPublish =
    isDesignMode &&
    !designDisabled &&
    changes.length > 0 &&
    (status === "ready_to_publish" ||
      publishStatus === "publishing" ||
      publishStatus === "deploying" ||
      publishStatus === "published");

  const publishLabel =
    publishStatus === "publishing"
      ? "Publishing…"
      : publishStatus === "deploying"
        ? "Deploying…"
        : publishStatus === "published" && commitUrl
          ? "View on GitHub"
          : "Publish to GitHub";

  async function handleHeaderPublish() {
    if (publishStatus === "published" && commitUrl) {
      window.open(commitUrl, "_blank", "noopener,noreferrer");
      return;
    }
    if (changes.length === 0 || publishStatus === "publishing") return;
    try {
      await publish();
    } catch {
      // error stored on workspace
    }
  }

  return (
    <header
      className="site-header"
      data-design-id="site-header"
      data-source-file="src/components/SiteHeader.tsx"
      data-design-select-ui
    >
      <Link href="/" className="site-header-wordmark">
        popped.dev
      </Link>

      <div className="site-header-actions">
        {showHeaderPublish ? (
          <Button
            type="button"
            size="sm"
            className="site-header-publish-btn"
            data-design-select-ui
            disabled={
              publishStatus === "publishing" ||
              publishStatus === "deploying" ||
              (!showLivePreview && publishStatus !== "published")
            }
            onClick={() => void handleHeaderPublish()}
          >
            {publishLabel}
          </Button>
        ) : null}
        <ContributorNameControl />
        {designDisabled ? (
          <span
            className="site-header-design-locked"
            title={
              mergeCooldownActive
                ? "Wait before publishing again after your last merge"
                : "Design changes are disabled in preview embed"
            }
          >
            {mergeCooldownActive
              ? `New design in ${formatCooldownRemaining(remainingMs)}`
              : "Review only"}
          </span>
        ) : designLockedOn ? (
          <span
            className="site-header-design-locked"
            title="Design mode stays on while the agent is working"
          >
            Agent working…
          </span>
        ) : (
        <button
          type="button"
          role="switch"
          aria-checked={isDesignMode}
          aria-label="Design mode"
          className={
            isDesignMode
              ? `site-header-design-switch site-header-design-switch--on${isBooting ? " site-header-design-switch--loading" : ""}`
              : "site-header-design-switch"
          }
          onClick={toggleDesignMode}
        >
          <span className="site-header-design-switch-icon">
            <DesignCursorIcon />
          </span>
          <span className="site-header-design-switch-label">Design</span>
          <span className="site-header-design-switch-track" aria-hidden="true">
            <span className="site-header-design-switch-thumb" />
          </span>
        </button>
        )}
      </div>
    </header>
  );
}
