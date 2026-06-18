"use client";

import { DesignModeProvider } from "@/components/design/DesignModeContext";
import { DesignChangesProvider } from "@/components/design/DesignChangesProvider";
import { DesignWorkspaceProvider } from "@/components/design/DesignWorkspaceProvider";
import { DesignWorkspacePreview } from "@/components/design/DesignWorkspaceShell";
import { DesignStatusMessage } from "@/components/design/DesignStatusMessage";
import { DesignModePreviewGuard } from "@/components/design/DesignModePreviewGuard";
import { DesignSelectLayer } from "@/components/design/DesignSelectLayer";
import { YourChangesTab } from "@/components/design/YourChangesTab";
import { SiteHeader } from "@/components/SiteHeader";
import { ContributionAttributionLayer } from "@/components/community/ContributionAttributionLayer";
import { WelcomeIntro } from "@/components/community/WelcomeIntro";
import { LockedResume } from "@/components/locked/LockedResume";
import { DesignEmbedListener } from "@/components/design/DesignEmbedListener";
import { useDesignWorkspace } from "@/components/design/DesignWorkspaceProvider";

function HomeContent() {
  const { showLivePreview } = useDesignWorkspace();

  return (
    <>
      <DesignEmbedListener />
      <DesignModePreviewGuard />
      <SiteHeader />
      <DesignStatusMessage />
      <div className="design-stage">
        <main
          className={`design-static-layer${showLivePreview ? " design-static-layer--hidden" : ""}`}
          data-design-select-root
        >
          <WelcomeIntro />
          <LockedResume />
        </main>
        <DesignWorkspacePreview />
      </div>
      <YourChangesTab />
      <DesignSelectLayer />
      <ContributionAttributionLayer />
    </>
  );
}

export function HomeShell() {
  return (
    <DesignModeProvider>
      <DesignWorkspaceProvider>
        <DesignChangesProvider>
          <HomeContent />
        </DesignChangesProvider>
      </DesignWorkspaceProvider>
    </DesignModeProvider>
  );
}
