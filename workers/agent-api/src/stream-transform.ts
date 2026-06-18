const TERMINAL = new Set(["FINISHED", "ERROR", "CANCELLED", "EXPIRED"]);

export function isTerminalRunStatus(status: string): boolean {
  return TERMINAL.has(status);
}

export function runStatusMessage(status: string): string | null {
  switch (status) {
    case "CREATING":
      return "Starting agent…";
    case "RUNNING":
      return "Agent is working…";
    case "FINISHED":
      return "Changes saved — waiting for deploy…";
    case "ERROR":
      return "Agent run failed.";
    case "CANCELLED":
      return "Agent run cancelled.";
    case "EXPIRED":
      return "Agent run expired.";
    default:
      return null;
  }
}

export type ActivityStepPayload = {
  id: string;
  label: string;
  state: "running" | "done";
};

export function statusToStep(status: string): ActivityStepPayload | null {
  switch (status) {
    case "CREATING":
      return { id: "start", label: "Starting agent", state: "running" };
    case "RUNNING":
      return { id: "work", label: "Working on your design", state: "running" };
    case "FINISHED":
      return { id: "save", label: "Changes saved", state: "done" };
    default:
      return null;
  }
}

export function toolCallToStep(name: string, status: string): ActivityStepPayload | null {
  const normalized = name.toLowerCase();
  const done = status === "completed" || status === "finished" || status === "success";

  if (normalized.includes("edit") || normalized.includes("write") || normalized === "search_replace") {
    return {
      id: "edit",
      label: done ? "Edited presentation files" : "Editing presentation files",
      state: done ? "done" : "running",
    };
  }
  if (normalized === "read_file" || normalized.includes("read")) {
    return {
      id: "read",
      label: done ? "Read project files" : "Reading project files",
      state: done ? "done" : "running",
    };
  }
  if (normalized.includes("grep") || normalized.includes("search") || normalized === "codebase_search") {
    return {
      id: "search",
      label: done ? "Searched the codebase" : "Searching the codebase",
      state: done ? "done" : "running",
    };
  }
  if (normalized.includes("terminal") || normalized === "run_terminal_cmd") {
    return {
      id: "terminal",
      label: done ? "Ran build commands" : "Running build commands",
      state: done ? "done" : "running",
    };
  }
  if (normalized.includes("git") || normalized.includes("push")) {
    return {
      id: "save",
      label: done ? "Saved changes to GitHub" : "Saving changes to GitHub",
      state: done ? "done" : "running",
    };
  }

  if (status !== "running" && !done) return null;
  return {
    id: `tool-${normalized.replace(/[^a-z0-9]+/g, "-")}`,
    label: done ? `Finished ${name}` : `Running ${name}`,
    state: done ? "done" : "running",
  };
}

export function toolCallMessage(name: string, status: string): string | null {
  return toolCallToStep(name, status)?.label ?? null;
}

export type ParsedSsePart = {
  id?: string;
  event?: string;
  data?: string;
};

export function parseSsePart(part: string): ParsedSsePart {
  const parsed: ParsedSsePart = {};
  for (const line of part.split("\n")) {
    if (line.startsWith("id:")) parsed.id = line.slice(3).trim();
    else if (line.startsWith("event:")) parsed.event = line.slice(6).trim();
    else if (line.startsWith("data:")) parsed.data = line.slice(5).trim();
  }
  return parsed;
}
