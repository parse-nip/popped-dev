/**
 * Parse bolt.new-style <boltArtifact> / <boltAction> output into file writes and shell commands.
 * Adapted from stackblitz/bolt.new (MIT) — simplified for non-streaming server-side use.
 */

export type BoltFileAction = {
  type: "file";
  filePath: string;
  content: string;
};

export type BoltShellAction = {
  type: "shell";
  content: string;
};

export type BoltAction = BoltFileAction | BoltShellAction;

export type ParsedBoltArtifact = {
  id?: string;
  title?: string;
  actions: BoltAction[];
};

function extractAttribute(tag: string, attributeName: string): string | undefined {
  const match = tag.match(new RegExp(`${attributeName}=["']([^"']*)["']`, "i"));
  return match?.[1];
}

function normalizeFilePath(filePath: string): string {
  return filePath.replace(/^\.?\//, "").trim();
}

function parseActionBlock(openTag: string, body: string): BoltAction | null {
  const type = extractAttribute(openTag, "type")?.toLowerCase();

  if (type === "file") {
    const filePath = extractAttribute(openTag, "filePath");
    if (!filePath) return null;
    return {
      type: "file",
      filePath: normalizeFilePath(filePath),
      content: body,
    };
  }

  if (type === "shell") {
    const content = body.trim();
    if (!content) return null;
    return { type: "shell", content };
  }

  return null;
}

/** Extract all boltAction blocks from a complete model response. */
export function parseBoltActions(text: string): ParsedBoltArtifact | null {
  const artifactMatch = text.match(/<boltArtifact\b([^>]*)>([\s\S]*?)<\/boltArtifact>/i);
  const searchText = artifactMatch?.[2] ?? text;

  const actions: BoltAction[] = [];
  const actionPattern = /<boltAction\b([^>]*)>([\s\S]*?)<\/boltAction>/gi;
  let match: RegExpExecArray | null;

  while ((match = actionPattern.exec(searchText)) !== null) {
    const action = parseActionBlock(match[1], match[2]);
    if (action) actions.push(action);
  }

  if (actions.length === 0) return null;

  const artifactAttrs = artifactMatch?.[1] ?? "";
  return {
    id: extractAttribute(artifactAttrs, "id"),
    title: extractAttribute(artifactAttrs, "title"),
    actions,
  };
}

export type BoltEditResult = {
  summary: string;
  writes: Array<{ path: string; content: string }>;
  commands: string[];
};

/** Convert parsed bolt actions into the agent edit result shape. */
export function boltActionsToEditResult(
  artifact: ParsedBoltArtifact,
  fallbackSummary = "Applied design change.",
): BoltEditResult {
  const writes: Array<{ path: string; content: string }> = [];
  const commands: string[] = [];

  for (const action of artifact.actions) {
    if (action.type === "file") {
      writes.push({ path: action.filePath, content: action.content });
      continue;
    }

    const shell = action.content.trim();
    if (!shell) continue;

    // popped.dev WebContainer only runs npm install commands from the client.
    if (shell.startsWith("npm install") || shell.startsWith("npm i ")) {
      commands.push(shell);
    }
  }

  const summary =
    artifact.title?.trim() ||
    (writes.length > 0
      ? `Updated ${writes.length} file${writes.length === 1 ? "" : "s"}.`
      : fallbackSummary);

  return { summary, writes, commands };
}
