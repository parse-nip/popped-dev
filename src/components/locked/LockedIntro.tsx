"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import {
  contributorNameErrorMessage,
  writeContributorName,
} from "@/lib/contributor-name";
import { ATTRIBUTION_KEY } from "@shared/contributor-name-validation";

function readStoredName(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(ATTRIBUTION_KEY) ?? "";
}

export function LockedIntro() {
  const [name, setName] = useState(readStoredName);
  const [error, setError] = useState<string | null>(null);

  function persistName(value: string) {
    const result = writeContributorName(value);
    if (!result.ok) {
      setError(contributorNameErrorMessage(result.error));
      return;
    }

    setError(null);
    setName(result.name);
  }

  return (
    <section id="locked-intro" data-locked="true" aria-label="How this site works">
      <div className="locked-intro-stack">
        <div className="locked-intro-header">
          <span className="portfolio-badge" aria-hidden="true">
            <span>🔒</span>
            <span>Protected portfolio</span>
          </span>
          <h2 className="locked-intro-title">Welcome to popped.dev</h2>
          <p className="locked-intro-lead">
            You&apos;re looking at a real developer portfolio — and you&apos;re invited to help
            shape how it feels. Explore layouts, styling, and motion with the AI agent while the
            career facts stay protected.
          </p>
        </div>

        <div className="locked-intro-boundary">
          <div className="locked-intro-boundary-row">
            <p className="locked-intro-boundary-label">Editable presentation</p>
            <p className="locked-intro-boundary-detail">
              Layout, styling, motion, typography, and visual structure can be redesigned.
            </p>
          </div>
          <div className="locked-intro-boundary-row">
            <p className="locked-intro-boundary-label">Protected facts</p>
            <p className="locked-intro-boundary-detail">
              Experience, education, achievements, and factual content stay unchanged.
            </p>
          </div>
        </div>

        <div className="space-y-2.5">
          <label htmlFor="contributor-name" className="locked-intro-field-label">
            Your name
          </label>
          <Input
            id="contributor-name"
            placeholder="How should we credit you?"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            onBlur={() => persistName(name)}
            className="locked-intro-input"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "contributor-name-error" : undefined}
          />
          {error ? (
            <p id="contributor-name-error" className="contributor-name-error" role="alert">
              {error}
            </p>
          ) : (
            <p className="locked-intro-helper">This will be shown with your contributions.</p>
          )}
        </div>
      </div>
    </section>
  );
}
