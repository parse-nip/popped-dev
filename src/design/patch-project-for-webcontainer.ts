/** Next 15.5+ / 16.x crash in WebContainer with workStore invariant — 15.4.7 is known good. */
export const WEBCONTAINER_NEXT_VERSION = "15.4.7";

type PackageJson = {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

export function patchPackageJsonForWebContainer(content: string): string {
  const pkg = JSON.parse(content) as PackageJson;

  pkg.dependencies = pkg.dependencies ?? {};
  pkg.devDependencies = pkg.devDependencies ?? {};
  pkg.scripts = pkg.scripts ?? {};

  pkg.dependencies.next = WEBCONTAINER_NEXT_VERSION;
  pkg.devDependencies["eslint-config-next"] = WEBCONTAINER_NEXT_VERSION;

  return `${JSON.stringify(pkg, null, 2)}\n`;
}

export function stripLockfileForWebContainerInstall(files: Record<string, string>): Record<string, string> {
  const next = { ...files };
  delete next["package-lock.json"];
  return next;
}
