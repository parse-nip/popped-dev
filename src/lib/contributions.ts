import contributionsData from "@/data/contributions.json";

export type Contribution = {
  id: string;
  name: string;
  branch: string;
  submittedAt: string;
};

type ContributionsFile = {
  contributions: Contribution[];
  elementAttribution?: Record<string, string>;
};

const file = contributionsData as ContributionsFile;

const contributionsById = new Map(file.contributions.map((entry) => [entry.id, entry]));

export function resolveContributorName(contributionId: string): string | null {
  const direct = contributionsById.get(contributionId);
  if (direct) {
    return direct.name;
  }

  const mappedId = file.elementAttribution?.[contributionId];
  if (!mappedId) {
    return null;
  }

  return contributionsById.get(mappedId)?.name ?? null;
}

export function hasAttribution(contributionId: string): boolean {
  return resolveContributorName(contributionId) !== null;
}
