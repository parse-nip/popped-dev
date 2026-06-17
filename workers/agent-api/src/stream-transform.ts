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
      return "Changes pushed — preparing preview…";
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

export function toolCallMessage(name: string, status: string): string | null {
  if (status !== "running") return null;

  const normalized = name.toLowerCase();
  if (normalized.includes("edit") || normalized.includes("write") || normalized === "search_replace") {
    return "Editing styles…";
  }
  if (normalized === "read_file" || normalized.includes("read")) {
    return "Reading project files…";
  }
  if (normalized.includes("grep") || normalized.includes("search") || normalized === "codebase_search") {
    return "Searching the codebase…";
  }
  if (normalized.includes("terminal") || normalized === "run_terminal_cmd") {
    return "Running build commands…";
  }
  if (normalized.includes("git") || normalized.includes("push")) {
    return "Pushing branch to GitHub…";
  }
  return `Running ${name}…`;
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
