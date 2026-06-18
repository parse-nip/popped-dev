"use client";

import Link from "next/link";
import { ContributorNameControl } from "@/components/community/ContributorNameControl";
import { useDesignChanges } from "@/components/design/DesignChangesProvider";
import { useDesignMode } from "@/components/design/DesignModeContext";
import { usePreview } from "@/components/design/PreviewContext";
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
  const { mode: previewMode } = usePreview();
  const { isAgentBusy } = useDesignChanges();
  const { active: mergeCooldownActive, remainingMs } = useMergeCooldown();
  const designDisabled =
    previewMode === "preview" || isDraftPreviewEmbed() || mergeCooldownActive;
  const designLockedOn = isAgentBusy && isDesignMode;

  return (
    <header className="site-header" data-design-select-ui>
      <Link href="/" className="site-header-wordmark">
        popped.dev
      </Link>

      <div className="site-header-actions">
        <ContributorNameControl />
        {designDisabled ? (
          <span
            className="site-header-design-locked"
            title={
              mergeCooldownActive
                ? "Wait before starting a new cloud agent after merging"
                : "Design changes are disabled while reviewing your draft"
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
            ? "site-header-design-switch site-header-design-switch--on"
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
