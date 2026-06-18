"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { ATTRIBUTION_KEY } from "@/components/locked/LockedIntro";
import { contributorNameErrorMessage, validateContributorName, writeContributorName } from "@/lib/contributor-name";
import { Input } from "@/components/ui/input";
import { DesignSwitchPreview } from "@/components/community/DesignSwitchPreview";

export const WELCOME_DISMISSED_KEY = "popped.dev:welcome-dismissed";

const STEPS = [
  {
    id: "hello",
    eyebrow: "Step 1",
    title: "Welcome to popped.dev",
    body: "This is a real developer portfolio that anyone can help restyle with AI — like Wikipedia for presentation, with protected career facts.",
    variant: "hello" as const,
  },
  {
    id: "layers",
    eyebrow: "Step 2",
    title: "Two layers to know",
    body: "You can redesign layout, colors, typography, and motion. Jobs, education, and project facts stay locked.",
    variant: "layers" as const,
  },
  {
    id: "boot",
    eyebrow: "Step 3",
    title: "Turn on Design mode — then wait a bit",
    body: "Flip the Design switch in the header. The first boot takes 30–90 seconds while packages install and the live preview starts. Watch the status bar — don’t click anything until it says you’re ready.",
    variant: "boot" as const,
  },
  {
    id: "edit",
    eyebrow: "Step 4",
    title: "Click, describe, wait again",
    body: "Click any part of the page to open the agent chat. Describe your change in plain English, send it, and give the agent a little time. Your edit shows up in the live preview when it’s done.",
    variant: "edit" as const,
  },
  {
    id: "publish",
    eyebrow: "Step 5",
    title: "Publish to GitHub",
    body: "Happy with the preview? Hit Publish to GitHub in the header. That commits your styling files to the repo and deploys them to popped.dev — usually another minute or two.",
    variant: "publish" as const,
  },
  {
    id: "name",
    eyebrow: "Step 6",
    title: "Add your name",
    body: "We credit contributors on styled sections. Add the name you want shown when people hover your work.",
    variant: "name" as const,
  },
] as const;

function readWelcomeDismissed(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(WELCOME_DISMISSED_KEY) === "true";
}

function readStoredName(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(ATTRIBUTION_KEY) ?? "";
}

type WelcomeStepVariant = (typeof STEPS)[number]["variant"];

function InfoCard({
  badge,
  title,
  body,
  tone = "default",
}: {
  badge?: string;
  title: string;
  body: string;
  tone?: "default" | "wait" | "locked" | "editable";
}) {
  return (
    <article className={`welcome-info-card welcome-info-card--${tone}`}>
      {badge ? <span className="welcome-info-card-badge">{badge}</span> : null}
      <h3 className="welcome-info-card-title">{title}</h3>
      <p className="welcome-info-card-body">{body}</p>
    </article>
  );
}

function StepVisual({
  variant,
  name,
  onNameChange,
  nameError,
}: {
  variant: WelcomeStepVariant;
  name: string;
  onNameChange: (value: string) => void;
  nameError?: string | null;
}) {
  if (variant === "hello") {
    return (
      <div className="welcome-info-cards">
        <InfoCard
          badge="Community-built"
          title="Style the site together"
          body="Visitors use an AI agent to reshape typography, layout, and visual design."
        />
        <InfoCard
          badge="Protected facts"
          title="Career data stays fixed"
          body="Experience, education, and projects are locked so the portfolio stays truthful."
          tone="locked"
        />
      </div>
    );
  }

  if (variant === "layers") {
    return (
      <div className="welcome-info-cards welcome-info-cards--two">
        <InfoCard
          badge="You can edit"
          title="Presentation"
          body="CSS, layout, cards, motion, fonts, spacing — anything visual."
          tone="editable"
        />
        <InfoCard
          badge="Locked"
          title="Facts"
          body="Job titles, dates, schools, project descriptions, and contact details in the resume JSON."
          tone="locked"
        />
      </div>
    );
  }

  if (variant === "boot") {
    return (
      <div className="welcome-info-cards">
        <div className="welcome-step-design-bar">
          <span className="welcome-step-design-wordmark">popped.dev</span>
          <DesignSwitchPreview active />
        </div>
        <InfoCard
          badge="1 · Boot"
          title="Preparing design mode"
          body="Loads project files and installs packages in your browser."
          tone="wait"
        />
        <InfoCard
          badge="2 · Preview"
          title="Starting live preview"
          body="A mini dev server spins up. The status bar shows progress — wait until the preview is ready."
          tone="wait"
        />
        <InfoCard
          badge="3 · Ready"
          title="Start clicking"
          body="When loading finishes, your cursor becomes a selector and you can edit elements."
        />
      </div>
    );
  }

  if (variant === "edit") {
    return (
      <div className="welcome-info-cards welcome-info-cards--two">
        <InfoCard
          badge="Click"
          title="Pick an element"
          body="Anything on the page — a heading, section, button, or card."
        />
        <InfoCard
          badge="Chat"
          title="Describe the change"
          body="“Make this a card grid”, “use a darker background”, “bigger headline” — plain English works."
        />
        <InfoCard
          badge="Wait"
          title="Agent applies it"
          body="The agent writes code and updates the live preview. This usually takes 10–60 seconds."
          tone="wait"
        />
        <InfoCard
          badge="See it"
          title="Check the preview"
          body="Tweak again if needed. Your edits stay local until you publish."
        />
      </div>
    );
  }

  if (variant === "publish") {
    return (
      <div className="welcome-info-cards">
        <InfoCard
          badge="Publish to GitHub"
          title="Commits your styling"
          body="Only presentation files go to GitHub — never the locked resume facts."
        />
        <InfoCard
          badge="Deploy"
          title="Goes live on popped.dev"
          body="Cloudflare rebuilds the site after the commit. The button says Deploying… while that runs."
          tone="wait"
        />
        <InfoCard
          badge="If it fails"
          title="Site changed on GitHub?"
          body="If someone else pushed meanwhile, turn Design mode off and on once, then publish again. The app will try to sync automatically."
          tone="wait"
        />
      </div>
    );
  }

  return (
    <div className="welcome-info-cards">
      <InfoCard
        badge="Attribution"
        title="Hover to see credits"
        body="Redesigned sections show who styled them — your name appears after you contribute."
      />
      <div className="welcome-step-visual welcome-step-visual--name">
        <label htmlFor="contributor-name" className="locked-intro-field-label">
          Your name
        </label>
        <Input
          id="contributor-name"
          placeholder="How should we credit you?"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          className="locked-intro-input"
          aria-invalid={Boolean(nameError)}
          aria-describedby={nameError ? "contributor-name-error" : undefined}
        />
        {nameError ? (
          <p id="contributor-name-error" className="contributor-name-error" role="alert">
            {nameError}
          </p>
        ) : (
          <p className="locked-intro-helper">Required before the agent can publish for you.</p>
        )}
      </div>
    </div>
  );
}

function useIsClient() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

function WelcomeIntroDialog() {
  const [open, setOpen] = useState(() => !readWelcomeDismissed());
  const [stepIndex, setStepIndex] = useState(0);
  const [name, setName] = useState(readStoredName);
  const [nameError, setNameError] = useState<string | null>(null);

  const step = STEPS[stepIndex];
  const isFirstStep = stepIndex === 0;
  const isLastStep = stepIndex === STEPS.length - 1;

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  function dismissWelcome() {
    localStorage.setItem(WELCOME_DISMISSED_KEY, "true");
    setOpen(false);
  }

  function handleContinue() {
    const result = writeContributorName(name);
    if (!result.ok) {
      setNameError(contributorNameErrorMessage(result.error));
      return;
    }

    setNameError(null);
    dismissWelcome();
  }

  function handleNext() {
    if (isLastStep) {
      const validation = validateContributorName(name);
      if (!validation.ok) {
        setNameError(contributorNameErrorMessage(validation.error));
        return;
      }

      handleContinue();
      return;
    }
    setNameError(null);
    setStepIndex((current) => Math.min(current + 1, STEPS.length - 1));
  }

  function handleBack() {
    setStepIndex((current) => Math.max(current - 1, 0));
  }

  if (!open) {
    return null;
  }

  return createPortal(
    <div className="welcome-start">
      <div
        className="welcome-start-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Welcome to popped.dev"
      >
        <button
          type="button"
          className="welcome-start-close"
          onClick={dismissWelcome}
          aria-label="Close welcome dialog"
        >
          ×
        </button>

        <div className="welcome-steps">
          <div className="welcome-steps-progress" aria-hidden="true">
            {STEPS.map((item, index) => (
              <span
                key={item.id}
                className={
                  index === stepIndex
                    ? "welcome-steps-dot welcome-steps-dot--active"
                    : index < stepIndex
                      ? "welcome-steps-dot welcome-steps-dot--complete"
                      : "welcome-steps-dot"
                }
              />
            ))}
          </div>

          <p className="welcome-steps-eyebrow">{step.eyebrow}</p>
          <h2 className="welcome-steps-title">{step.title}</h2>
          <p className="welcome-steps-body">{step.body}</p>

          <StepVisual
            variant={step.variant}
            name={name}
            onNameChange={(value) => {
              setName(value);
              setNameError(null);
            }}
            nameError={nameError}
          />
        </div>

        <footer className="welcome-start-footer">
          <div className="welcome-start-footer-left">
            {!isFirstStep ? (
              <button type="button" className="welcome-start-action welcome-start-action--skip" onClick={handleBack}>
                Back
              </button>
            ) : (
              <span aria-hidden="true" />
            )}
          </div>

          <div className="welcome-start-footer-right">
            <button type="button" className="welcome-start-action welcome-start-action--skip" onClick={dismissWelcome}>
              Skip
            </button>
            <button
              type="button"
              className="welcome-start-action welcome-start-action--continue"
              onClick={handleNext}
            >
              {isLastStep ? "Start designing" : "Next"}
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body
  );
}

export function WelcomeIntro() {
  const mounted = useIsClient();
  if (!mounted) {
    return null;
  }
  return <WelcomeIntroDialog />;
}
