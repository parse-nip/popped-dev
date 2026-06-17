import experienceData from "@/locked/experience.json";

export type ExperienceData = typeof experienceData;

export function getExperience(): ExperienceData {
  return experienceData;
}
