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
    title: "Hello — welcome to popped.dev",
    body: "You're looking at a real developer portfolio. Visitors like you can help reshape how it looks and feels — layout, typography, motion, and style — while the career facts stay protected.",
  },
  {
    id: "how-it-works",
    eyebrow: "Step 2",
    title: "How it works",
    body: "Think of it as two layers: presentation you can redesign, and facts that stay locked.",
    variant: "boundary" as const,
  },
  {
    id: "design-mode",
    eyebrow: "Step 3",
    title: "Turn on Design mode",
    body: "Flip the Design switch in the header. Your cursor becomes a selector — click any part of the page to open a chat and ask the AI agent to restyle that element.",
    variant: "design" as const,
  },
  {
    id: "contributions",
    eyebrow: "Step 4",
    title: "See what others built",
    body: "Styled elements carry attribution. Hover over a redesigned section to see who contributed — every change is credited to the person who made it.",
    variant: "contributions" as const,
  },
  {
    id: "github",
    eyebrow: "Step 5",
    title: "Changes go to GitHub",
    body: "When a design is approved, the agent opens a pull request. The site owner reviews the diff, and merged changes go live for everyone.",
    variant: "github" as const,
  },
  {
    id: "your-name",
    eyebrow: "Step 6",
    title: "One last thing",
    body: "Add your name so we can credit you when your designs are merged.",
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

type WelcomeStepVariant = "boundary" | "design" | "contributions" | "github" | "name";

function StepVisual({
  variant,
  name,
  onNameChange,
  nameError,
}: {
  variant?: WelcomeStepVariant;
  name: string;
  onNameChange: (value: string) => void;
  nameError?: string | null;
}) {
  if (variant === "boundary") {
    return (
      <div className="welcome-step-visual welcome-step-visual--boundary">
        <div className="welcome-step-boundary-row">
          <span className="editable-badge">Presentation editable</span>
          <p>Layout, styling, motion, typography, and visual structure.</p>
        </div>
        <div className="welcome-step-boundary-row">
          <span className="protected-badge">
            <span aria-hidden="true">🔒</span>
            <span>Facts protected</span>
          </span>
          <p>Experience, education, achievements, and factual content stay unchanged.</p>
        </div>
      </div>
    );
  }

  if (variant === "design") {
    return (
      <div className="welcome-step-visual welcome-step-visual--design">
        <div className="welcome-step-design-bar">
          <span className="welcome-step-design-wordmark">popped.dev</span>
          <DesignSwitchPreview active />
        </div>
        <p className="welcome-step-design-hint">
          Click any element → describe your change → the agent updates the presentation.
        </p>
      </div>
    );
  }

  if (variant === "contributions") {
    return (
      <div className="welcome-step-visual welcome-step-visual--contributions">
        <div className="welcome-step-contrib-card">
          <p className="welcome-step-contrib-label">Experience</p>
          <p className="welcome-step-contrib-title">Software Engineer</p>
          <p className="welcome-step-contrib-body">Building products with care and clarity.</p>
        </div>
        <div className="welcome-step-contrib-tooltip" aria-hidden="true">
          <span className="welcome-step-contrib-tooltip-label">Styled by</span>
          <span className="welcome-step-contrib-tooltip-name">alex.dev</span>
        </div>
      </div>
    );
  }

  if (variant === "github") {
    return (
      <ol className="welcome-step-visual welcome-step-visual--github">
        <li>
          <span className="welcome-step-github-step">1</span>
          <span>You describe a design change</span>
        </li>
        <li>
          <span className="welcome-step-github-step">2</span>
          <span>The agent writes the code</span>
        </li>
        <li>
          <span className="welcome-step-github-step">3</span>
          <span>A pull request opens on GitHub</span>
        </li>
        <li>
          <span className="welcome-step-github-step">4</span>
          <span>Reviewed and merged when approved</span>
        </li>
      </ol>
    );
  }

  if (variant === "name") {
    return (
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
          <p className="locked-intro-helper">Shown with your contributions after merge.</p>
        )}
      </div>
    );
  }

  return (
    <div className="welcome-step-visual welcome-step-visual--hello">
      <span className="portfolio-badge">
        <span aria-hidden="true">🔒</span>
        <span>Protected portfolio</span>
      </span>
      <p className="welcome-step-hello-copy">
        A living portfolio workspace — community-built presentation, protected professional facts.
      </p>
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
            variant={"variant" in step ? step.variant : undefined}
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
