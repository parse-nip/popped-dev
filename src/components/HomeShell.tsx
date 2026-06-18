"use client";

import { DesignModeProvider } from "@/components/design/DesignModeContext";
import { DesignChangesProvider } from "@/components/design/DesignChangesProvider";
import { DesignModePreviewGuard } from "@/components/design/DesignModePreviewGuard";
import { DesignSelectLayer } from "@/components/design/DesignSelectLayer";
import { YourChangesTab } from "@/components/design/YourChangesTab";
import { SiteHeader } from "@/components/SiteHeader";
import { ContributionAttributionLayer } from "@/components/community/ContributionAttributionLayer";
import { WelcomeIntro } from "@/components/community/WelcomeIntro";
import { LockedResume } from "@/components/locked/LockedResume";

export function HomeShell() {
  return (
    <DesignModeProvider>
      <DesignChangesProvider>
        <DesignModePreviewGuard />
        <SiteHeader />
        <main className="min-h-screen" data-design-select-root>
          <WelcomeIntro />
          <LockedResume />
        </main>
        <YourChangesTab />
        <DesignSelectLayer />
        <ContributionAttributionLayer />
      </DesignChangesProvider>
    </DesignModeProvider>
  );
}
