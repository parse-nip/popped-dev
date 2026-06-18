"use client";

import { DesignModeProvider } from "@/components/design/DesignModeContext";
import { DesignChangesProvider } from "@/components/design/DesignChangesProvider";
import { DesignWorkspaceProvider } from "@/components/design/DesignWorkspaceProvider";
import {
  DesignBootOverlay,
  DesignWorkspacePreview,
} from "@/components/design/DesignWorkspaceShell";
import { DesignModePreviewGuard } from "@/components/design/DesignModePreviewGuard";
import { DesignSelectLayer } from "@/components/design/DesignSelectLayer";
import { YourChangesTab } from "@/components/design/YourChangesTab";
import { SiteHeader } from "@/components/SiteHeader";
import { ContributionAttributionLayer } from "@/components/community/ContributionAttributionLayer";
import { WelcomeIntro } from "@/components/community/WelcomeIntro";
import { LockedResume } from "@/components/locked/LockedResume";
import { DesignEmbedListener } from "@/components/design/DesignEmbedListener";
import { useDesignMode } from "@/components/design/DesignModeContext";
import { useDesignWorkspace } from "@/components/design/DesignWorkspaceProvider";

function HomeContent() {
  const { isDesignMode } = useDesignMode();
  const { isReady } = useDesignWorkspace();
  const showStatic = !isDesignMode || !isReady;

  return (
    <>
      <DesignEmbedListener />
      <DesignModePreviewGuard />
      <SiteHeader />
      {showStatic ? (
        <main className="min-h-screen" data-design-select-root>
          <WelcomeIntro />
          <LockedResume />
        </main>
      ) : null}
      <DesignWorkspacePreview />
      <DesignBootOverlay />
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
