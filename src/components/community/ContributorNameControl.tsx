"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  readContributorName,
  subscribeContributorName,
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
  const [editing, setEditing] = useState(() => !readContributorName());

  useEffect(() => subscribeContributorName(setName), []);

  function commit(value: string) {
    writeContributorName(value);
    setName(value.trim());
    if (value.trim()) {
      setEditing(false);
    }
  }

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
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit(name);
            }
          }}
          className="locked-intro-input contributor-name-prompt-input"
          autoFocus
        />
        <button
          type="button"
          className="contributor-name-prompt-save"
          disabled={!name.trim()}
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
        onChange={(event) => setName(event.target.value)}
        onBlur={() => {
          commit(name);
          if (name.trim()) setEditing(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit(name);
            if (name.trim()) setEditing(false);
          }
        }}
        className="contributor-name-header-input"
      />
    </div>
  );
}