"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  contributorNameErrorMessage,
  readContributorName,
  subscribeContributorName,
  validateContributorName,
  writeContributorName,
} from "@/lib/contributor-name";

type ContributorNameControlProps = {
  variant?: "header" | "prompt";
  id?: string;
};

export function ContributorNameControl({
  variant = "header",
  id = "contributor-name",
}: ContributorNameControlProps) {
  const [name, setName] = useState(readContributorName);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(() => !readContributorName());

  useEffect(() => subscribeContributorName(setName), []);

  function commit(value: string) {
    const result = writeContributorName(value);
    if (!result.ok) {
      setError(contributorNameErrorMessage(result.error));
      return;
    }

    setError(null);
    setName(result.name);
    if (result.name) {
      setEditing(false);
    }
  }

  const validation = validateContributorName(name);
  const canSave = validation.ok;

  if (variant === "prompt") {
    return (
      <div className="contributor-name-prompt" data-design-select-ui>
        <p className="contributor-name-prompt-title">Add your name first</p>
        <p className="contributor-name-prompt-body">
          We credit every merged design to its contributor.
        </p>
        <label htmlFor={id} className="locked-intro-field-label">
          Your name
        </label>
        <Input
          id={id}
          placeholder="How should we credit you?"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit(name);
            }
          }}
          className="locked-intro-input contributor-name-prompt-input"
          autoFocus
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        {error ? (
          <p id={`${id}-error`} className="contributor-name-error" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="button"
          className="contributor-name-prompt-save"
          disabled={!canSave}
          onClick={() => commit(name)}
        >
          Save and continue
        </button>
      </div>
    );
  }

  if (!editing && name) {
    return (
      <button
        type="button"
        className="contributor-name-chip"
        data-design-select-ui
        onClick={() => setEditing(true)}
        aria-label={`Contributor name: ${name}. Click to edit.`}
      >
        <span className="contributor-name-chip-label">Designing as</span>
        <span className="contributor-name-chip-value">{name}</span>
      </button>
    );
  }

  return (
    <div className="contributor-name-header-field" data-design-select-ui>
      <label htmlFor={id} className="contributor-name-header-label">
        Your name
      </label>
      <Input
        id={id}
        placeholder="Credit name"
        value={name}
        onChange={(event) => {
          setName(event.target.value);
          setError(null);
        }}
        onBlur={() => {
          if (canSave) {
            commit(name);
            if (name.trim()) setEditing(false);
          } else if (name.trim()) {
            setError(
              validation.ok ? null : contributorNameErrorMessage(validation.error),
            );
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit(name);
            if (canSave) setEditing(false);
          }
        }}
        className="contributor-name-header-input"
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error ? (
        <p id={`${id}-error`} className="contributor-name-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
