"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ATTRIBUTION_KEY } from "@/components/locked/LockedIntro";
import { contributorNameErrorMessage, validateContributorName, writeContributorName } from "@/lib/contributor-name";
import { Input } from "@/components/ui/input";
import { DesignSwitchPreview } from "@/components/community/DesignSwitchPreview";

export const WELCOME_DISMISSED_KEY = "popped.dev:welcome-dismissed";

const STEPS = [
  {
    id: "hello",
    eyebrow: "Welcome",
    title: "A portfolio you can redesign",
    body: "Visitors reshape the look. Career facts stay protected.",
    variant: "hello" as const,
  },
  {
    id: "layers",
    eyebrow: "Two layers",
    title: "Style freely. Facts stay locked.",
    variant: "layers" as const,
  },
  {
    id: "boot",
    eyebrow: "Design mode",
    title: "Flip the switch. Wait for boot.",
    body: "First launch takes 30–90 seconds.",
    variant: "boot" as const,
  },
  {
    id: "edit",
    eyebrow: "Edit",
    title: "Click. Describe. Preview.",
    variant: "edit" as const,
  },
  {
    id: "publish",
    eyebrow: "Publish",
    title: "Ship styling to GitHub",
    body: "Presentation files only — never locked resume facts.",
    variant: "publish" as const,
  },
  {
    id: "name",
    eyebrow: "Credit",
    title: "What name should we show?",
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

function VisualChip({ children }: { children: ReactNode }) {
  return <span className="welcome-visual-chip">{children}</span>;
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
      <div className="welcome-step-visual welcome-visual-mosaic" aria-hidden="true">
        <div className="welcome-visual-mosaic-pane welcome-visual-mosaic-pane--editable">
          <p className="welcome-visual-mosaic-label">Presentation</p>
          <div className="welcome-visual-mosaic-blocks">
            <span className="welcome-visual-block welcome-visual-block--wide" />
            <span className="welcome-visual-block" />
            <span className="welcome-visual-block welcome-visual-block--accent" />
          </div>
          <div className="welcome-visual-chip-row">
            <VisualChip>Layout</VisualChip>
            <VisualChip>Type</VisualChip>
            <VisualChip>Motion</VisualChip>
          </div>
        </div>
        <div className="welcome-visual-mosaic-pane welcome-visual-mosaic-pane--locked">
          <p className="welcome-visual-mosaic-label">Facts</p>
          <div className="welcome-visual-fact-lines">
            <span />
            <span />
            <span className="welcome-visual-fact-lines-short" />
          </div>
          <span className="protected-badge">
            <span aria-hidden="true">🔒</span>
            <span>Protected</span>
          </span>
        </div>
      </div>
    );
  }

  if (variant === "layers") {
    return (
      <div className="welcome-step-visual welcome-step-visual--boundary">
        <div className="welcome-step-boundary-row">
          <span className="editable-badge">Presentation editable</span>
          <h3 className="welcome-visual-heading">You can change</h3>
          <div className="welcome-visual-chip-row">
            <VisualChip>CSS & layout</VisualChip>
            <VisualChip>Typography</VisualChip>
            <VisualChip>Cards & motion</VisualChip>
          </div>
        </div>
        <div className="welcome-step-boundary-row">
          <span className="protected-badge">
            <span aria-hidden="true">🔒</span>
            <span>Facts protected</span>
          </span>
          <h3 className="welcome-visual-heading">Always locked</h3>
          <div className="welcome-visual-chip-row">
            <VisualChip>Jobs & dates</VisualChip>
            <VisualChip>Education</VisualChip>
            <VisualChip>Projects</VisualChip>
          </div>
        </div>
      </div>
    );
  }

  if (variant === "boot") {
    return (
      <div className="welcome-step-visual welcome-visual-boot">
        <div className="welcome-step-design-bar">
          <span className="welcome-step-design-wordmark">popped.dev</span>
          <DesignSwitchPreview active />
        </div>
        <ol className="welcome-visual-timeline">
          <li className="welcome-visual-timeline-item welcome-visual-timeline-item--active">
            <span className="welcome-visual-timeline-marker">1</span>
            <div>
              <h3 className="welcome-visual-heading">Boot</h3>
              <p className="welcome-visual-caption">Install packages</p>
            </div>
          </li>
          <li className="welcome-visual-timeline-item">
            <span className="welcome-visual-timeline-marker">2</span>
            <div>
              <h3 className="welcome-visual-heading">Preview</h3>
              <p className="welcome-visual-caption">Start dev server</p>
            </div>
          </li>
          <li className="welcome-visual-timeline-item">
            <span className="welcome-visual-timeline-marker">3</span>
            <div>
              <h3 className="welcome-visual-heading">Ready</h3>
              <p className="welcome-visual-caption">Cursor becomes selector</p>
            </div>
          </li>
        </ol>
        <div className="welcome-visual-status-bar">
          <span className="welcome-visual-status-dot" />
          <span>Preparing design mode…</span>
        </div>
      </div>
    );
  }

  if (variant === "edit") {
    return (
      <div className="welcome-step-visual welcome-visual-edit" aria-hidden="true">
        <div className="welcome-visual-edit-page">
          <span className="welcome-visual-block welcome-visual-block--wide" />
          <span className="welcome-visual-edit-target">
            <span className="welcome-visual-edit-ring" />
            <span className="welcome-visual-block welcome-visual-block--tall" />
          </span>
          <span className="welcome-visual-block" />
        </div>
        <div className="welcome-visual-edit-chat">
          <span className="welcome-visual-edit-cursor" />
          <span>Make this a card grid with softer shadows</span>
        </div>
      </div>
    );
  }

  if (variant === "publish") {
    return (
      <div className="welcome-step-visual welcome-visual-publish">
        <div className="welcome-visual-publish-bar">
          <span className="welcome-step-design-wordmark">popped.dev</span>
          <span className="welcome-visual-publish-btn">Publish to GitHub</span>
        </div>
        <ol className="welcome-visual-publish-flow">
          <li>
            <span className="welcome-step-github-step">1</span>
            <span>Commit styling files</span>
          </li>
          <li>
            <span className="welcome-step-github-step">2</span>
            <span>Deploy to popped.dev</span>
          </li>
          <li>
            <span className="welcome-step-github-step">3</span>
            <span>Hover shows your credit</span>
          </li>
        </ol>
      </div>
    );
  }

  return (
    <div className="welcome-step-visual welcome-visual-name">
      <div className="welcome-visual-name-preview">
        <div className="welcome-step-contrib-card">
          <p className="welcome-step-contrib-label">Experience</p>
          <p className="welcome-step-contrib-title">Software Engineer</p>
        </div>
        <div className="welcome-step-contrib-tooltip" aria-hidden="true">
          <span className="welcome-step-contrib-tooltip-label">Styled by</span>
          <span className="welcome-step-contrib-tooltip-name">you</span>
        </div>
      </div>
      <div className="welcome-visual-name-form">
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
          <p className="locked-intro-helper">Required before the agent can publish.</p>
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

          <div className="welcome-step-frame">
            <div className="welcome-step-copy">
              <p className="welcome-steps-eyebrow">{step.eyebrow}</p>
              <h2 className="welcome-steps-title">{step.title}</h2>
              {"body" in step && step.body ? (
                <p className="welcome-steps-body">{step.body}</p>
              ) : null}
            </div>

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
