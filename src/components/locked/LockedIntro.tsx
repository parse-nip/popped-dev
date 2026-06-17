"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

const ATTRIBUTION_KEY = "popped.dev:contributor-name";

function readStoredName(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(ATTRIBUTION_KEY) ?? "";
}

export function LockedIntro() {
  const [name, setName] = useState(readStoredName);
  const [savedName, setSavedName] = useState<string | null>(() => {
    const stored = readStoredName();
    return stored || null;
  });

  function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) return;
    localStorage.setItem(ATTRIBUTION_KEY, trimmed);
    setSavedName(trimmed);
  }

  return (
    <section
      id="locked-intro"
      data-locked="true"
      className="border-b border-amber-500/30 bg-amber-500/5 px-4 py-6"
      aria-label="How this site works"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="border-amber-500/50 text-amber-700 dark:text-amber-300">
            Locked
          </Badge>
          <h2 className="text-lg font-semibold">Welcome to popped.dev</h2>
        </div>

        <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>
            This is a <strong className="text-foreground">community-built developer portfolio</strong>.
            Visitors chat with an AI agent to design and polish the site around my real experience
            (always visible below). When you are happy with a preview, you confirm and the change
            opens a pull request for a checker agent to review before merge.
          </p>
          <p>
            <strong className="text-foreground">What you can change:</strong> layout, styling,
            animations, typography, and creative presentation — including how my facts look.
          </p>
          <p>
            <strong className="text-foreground">What stays locked:</strong> the actual content of my
            experience, education, and achievements (the words and facts), plus this intro — so
            visitors always know how to contribute and see who built what.
          </p>
        </div>

        <Separator />

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1">
            <label htmlFor="contributor-name" className="text-sm font-medium">
              Your name for attribution
            </label>
            <Input
              id="contributor-name"
              placeholder="e.g. Alex"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
            />
          </div>
          <Button type="button" onClick={handleSave} disabled={!name.trim()}>
            {savedName ? "Update name" : "Save name"}
          </Button>
        </div>

        {savedName ? (
          <p className="text-xs text-muted-foreground">
            Contributing as <strong className="text-foreground">{savedName}</strong>. This is stored
            locally until the agent pipeline is connected.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Enter your name before chatting with the agent so contributions can be credited.
          </p>
        )}
      </div>
    </section>
  );
}

export { ATTRIBUTION_KEY };
