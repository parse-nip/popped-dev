import { readFileSync } from "node:fs";
import { join } from "node:path";

function loadResumeHtml(): string {
  const filePath = join(process.cwd(), "src/locked/resume.html");
  return readFileSync(filePath, "utf8");
}

export function LockedResume() {
  const html = loadResumeHtml();

  return (
    <section
      id="locked-resume-section"
      data-locked="true"
      aria-label="Portfolio facts"
      className="border-b border-border"
    >
      <div className="mx-auto max-w-3xl px-4 py-6">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
            Always visible · unstyled facts
          </span>
          <p className="text-xs text-muted-foreground">
            Community styling wraps around this content — these facts are preserved.
          </p>
        </div>

        {/* Intentionally unstyled semantic HTML from locked source file */}
        <div
          className="locked-resume prose-neutral max-w-none [&_a]:text-blue-600 [&_a]:underline dark:[&_a]:text-blue-400"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </section>
  );
}
