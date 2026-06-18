"use client";

export type ActivityStep = {
  id: string;
  label: string;
  state: "running" | "done";
};

export function upsertActivityStep(steps: ActivityStep[], next: ActivityStep): ActivityStep[] {
  const updated = steps.map((step) =>
    next.state === "running" && step.state === "running" && step.id !== next.id
      ? { ...step, state: "done" as const }
      : step,
  );

  const index = updated.findIndex((step) => step.id === next.id);
  if (index >= 0) {
    updated[index] = next;
    return updated;
  }

  return [...updated, next];
}

function StepIcon({ state }: { state: ActivityStep["state"] }) {
  if (state === "done") {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.1" opacity="0.35" />
        <path
          d="M4.25 7.1L6.1 8.95L9.85 5.2"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return <span className="agent-activity-spinner" aria-hidden="true" />;
}

type AgentActivityFeedProps = {
  steps: ActivityStep[];
  error?: string | null;
};

export function AgentActivityFeed({ steps, error }: AgentActivityFeedProps) {
  if (steps.length === 0 && !error) return null;

  return (
    <div className="agent-activity" aria-live="polite">
      {steps.map((step) => (
        <div
          key={step.id}
          className={`agent-activity-step agent-activity-step--${step.state}`}
        >
          <span className="agent-activity-step-icon">
            <StepIcon state={step.state} />
          </span>
          <span className="agent-activity-step-label">{step.label}</span>
        </div>
      ))}
      {error ? <p className="agent-activity-error">{error}</p> : null}
    </div>
  );
}
