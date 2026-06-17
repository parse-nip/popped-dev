import { CommunityCanvas } from "@/components/community/CommunityCanvas";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { LockedIntro } from "@/components/locked/LockedIntro";
import { LockedResume } from "@/components/locked/LockedResume";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <main className="flex min-w-0 flex-1 flex-col">
        <LockedIntro />
        <LockedResume />
        <CommunityCanvas />
      </main>
      <div className="w-full shrink-0 lg:w-[min(100%,380px)] lg:sticky lg:top-0 lg:h-screen">
        <ChatPanel />
      </div>
    </div>
  );
}
