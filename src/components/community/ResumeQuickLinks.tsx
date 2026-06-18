"use client";

import { getExperience } from "@/lib/experience";
import { DESIGN_ICON_URLS } from "@shared/design-web-images";

type LinkItem = {
  label: string;
  href: string;
  icon?: string;
};

function iconForLink(label: string, href: string): string | undefined {
  const haystack = `${label} ${href}`.toLowerCase();
  if (haystack.includes("github")) return DESIGN_ICON_URLS.github;
  if (haystack.includes("linkedin")) return DESIGN_ICON_URLS.linkedin;
  if (haystack.includes("twitter") || haystack.includes("x.com")) return DESIGN_ICON_URLS.x;
  if (haystack.includes("mailto:")) return DESIGN_ICON_URLS.mail;
  return undefined;
}

function dedupeLinks(items: LinkItem[]): LinkItem[] {
  const seen = new Set<string>();
  const out: LinkItem[] = [];
  for (const item of items) {
    if (seen.has(item.href)) continue;
    seen.add(item.href);
    out.push(item);
  }
  return out;
}

/** Community chrome around locked resume facts — links + icons sourced from experience.json. */
export function ResumeQuickLinks() {
  const data = getExperience();

  const links = dedupeLinks([
    ...data.profile.links.map((link) => ({
      label: link.label,
      href: link.href,
      icon: iconForLink(link.label, link.href),
    })),
    ...data.contact.map((item) => ({
      label: item.label,
      href: item.href,
      icon: iconForLink(item.label, item.href),
    })),
  ]);

  const skillPreview = data.skills.slice(0, 3);

  return (
    <section
      className="resume-quick-links"
      data-design-id="community.profile-strip"
      data-source-file="src/components/community/ResumeQuickLinks.tsx"
      data-contribution-id="resume-quick-links"
      aria-label="Profile links from resume"
    >
      <div className="resume-quick-links-inner">
        <div className="resume-quick-links-copy">
          <p className="resume-quick-links-name" data-design-id="community.profile-name">
            {data.profile.name}
          </p>
          <p className="resume-quick-links-tagline" data-design-id="community.profile-tagline">
            {data.profile.tagline}
          </p>
          {skillPreview.length > 0 ? (
            <ul className="resume-quick-links-skills" data-design-id="community.skill-preview">
              {skillPreview.map((skill) => (
                <li key={skill}>{skill}</li>
              ))}
            </ul>
          ) : null}
        </div>

        <nav className="resume-quick-links-nav" aria-label="Social and contact links">
          {links.map((link, index) => (
            <a
              key={link.href}
              href={link.href}
              className="resume-quick-links-item"
              data-design-id={`community.profile-link.${index}`}
              data-contribution-id="resume-quick-links"
              target="_blank"
              rel="noopener noreferrer"
            >
              {link.icon ? (
                <img
                  src={link.icon}
                  alt=""
                  width={18}
                  height={18}
                  className="resume-quick-links-icon"
                  aria-hidden="true"
                />
              ) : null}
              <span>{link.label}</span>
            </a>
          ))}
        </nav>
      </div>
    </section>
  );
}
