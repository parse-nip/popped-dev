"use client";

import { DesignModeProvider } from "@/components/design/DesignModeContext";
import { DesignChangesProvider } from "@/components/design/DesignChangesProvider";
import { DesignModePreviewGuard } from "@/components/design/DesignModePreviewGuard";
import { DesignSelectLayer } from "@/components/design/DesignSelectLayer";
import { PreviewBar } from "@/components/design/PreviewBar";
import { PreviewFrame } from "@/components/design/PreviewFrame";
import { PreviewProvider, usePreview } from "@/components/design/PreviewContext";
import { PreviewReviewModal } from "@/components/design/PreviewReviewModal";
import { YourChangesTab } from "@/components/design/YourChangesTab";
import { SiteHeader } from "@/components/SiteHeader";
import { ContributionAttributionLayer } from "@/components/community/ContributionAttributionLayer";
import { WelcomeIntro } from "@/components/community/WelcomeIntro";
import { LockedResume } from "@/components/locked/LockedResume";

function HomeMain() {
  const { mode } = usePreview();

  if (mode === "preview") {
    return (
      <main className="min-h-screen preview-main" data-design-select-root>
        <PreviewBar />
        <PreviewFrame />
      </main>
    );
  }

  return (
    <main className="min-h-screen" data-design-select-root>
      <WelcomeIntro />
      <LockedResume />
    </main>
  );
}

export function HomeShell() {
  return (
    <DesignModeProvider>
      <PreviewProvider>
        <DesignChangesProvider>
          <DesignModePreviewGuard />
          <SiteHeader />
          <HomeMain />
          <YourChangesTab />
          <DesignSelectLayer />
          <ContributionAttributionLayer />
          <PreviewReviewModal />
        </DesignChangesProvider>
      </PreviewProvider>
    </DesignModeProvider>
  );
}
