export type DesignWorkspaceStatus =
  | "idle"
  | "booting"
  | "loading_files"
  | "installing"
  | "starting_dev"
  | "ready"
  | "agent_editing"
  | "applying_changes"
  | "installing_packages"
  | "build_error"
  | "ready_to_publish"
  | "publishing"
  | "published";

export type EditEvent = {
  id: string;
  prompt: string;
  summary?: string;
  filesChanged: string[];
  createdAt: string;
};

export type FileChange = {
  path: string;
  content: string;
  action: "create" | "modify" | "delete";
};

export type ProjectFilesResponse = {
  ok: boolean;
  files: Record<string, string>;
  baseSha: string;
  branch: string;
};

export type AgentEditResponse = {
  ok: boolean;
  summary: string;
  writes: Array<{ path: string; content: string }>;
  commands: string[];
};

export type PublishResponse = {
  ok: boolean;
  commitUrl: string;
  sha: string;
  branch: string;
  prUrl?: string;
  changedPaths: string[];
};

export const STATUS_LABELS: Record<DesignWorkspaceStatus, string> = {
  idle: "Idle",
  booting: "Booting WebContainer…",
  loading_files: "Loading project files…",
  installing: "Installing dependencies…",
  starting_dev: "Starting dev server…",
  ready: "Ready",
  agent_editing: "Agent editing…",
  applying_changes: "Applying file changes…",
  installing_packages: "Installing new packages…",
  build_error: "Build / dev error",
  ready_to_publish: "Ready to publish",
  publishing: "Publishing…",
  published: "Published",
};
