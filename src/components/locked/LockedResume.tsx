import { getExperience } from "@/lib/experience";

/**
 * Renders owner facts from locked JSON. Community contributors may restyle
 * this component and target #locked-resume in CSS — but must not change
 * src/locked/experience.json (enforced by CI checksums).
 */
export function LockedResume() {
  const data = getExperience();

  return (
    <section
      id="locked-resume"
      data-facts="true"
      data-design-id="resume.root"
      aria-label="Portfolio facts"
    >
      <article className="locked-resume">
          <header className="locked-resume-header" data-design-id="hero.header">
            <h1
              data-design-id="hero.title"
              data-fact-id="profile-name"
              data-contribution-id="profile-name-papyrus"
            >
              {data.profile.name}
            </h1>
            <p data-design-id="hero.tagline" data-fact-id="profile-tagline">
              {data.profile.tagline}
            </p>
            <p
              className="locked-resume-links"
              data-design-id="hero.links"
              data-contribution-id="profile-links"
            >
              {data.profile.links.map((link, i) => (
                <span key={link.href}>
                  {i > 0 ? " · " : null}
                  <a
                    href={link.href}
                    data-design-id={`hero.link.${i}`}
                    data-fact-id={`profile-link-${i}`}
                    data-contribution-id="profile-links"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {link.label}
                  </a>
                </span>
              ))}
            </p>
          </header>

          <section id="about" className="locked-resume-about" data-design-id="about.section">
            <h2 data-design-id="about.heading">About</h2>
            <p data-design-id="about.body" data-fact-id="about">
              {data.about}
            </p>
          </section>

          <section id="experience" className="locked-resume-experience" data-design-id="experience.section">
            <h2 data-design-id="experience.heading">Experience</h2>
            <ul>
              {data.experience.map((item) => (
                <li
                  key={item.id}
                  data-design-id={`experience.card.${item.id}`}
                  data-fact-id={item.id}
                >
                  <h3>{item.title}</h3>
                  <p>
                    <time dateTime={item.period.start}>{item.period.label}</time>
                  </p>
                  <p>{item.description}</p>
                </li>
              ))}
            </ul>
          </section>

          <section id="education" className="locked-resume-education" data-design-id="education.section">
            <h2 data-design-id="education.heading">Education</h2>
            <ul>
              {data.education.map((item) => (
                <li
                  key={item.id}
                  data-design-id={`education.card.${item.id}`}
                  data-fact-id={item.id}
                >
                  <h3>{item.title}</h3>
                  {item.details.map((detail, i) => (
                    <p key={i}>{detail}</p>
                  ))}
                </li>
              ))}
            </ul>
          </section>

          <section id="projects" className="locked-resume-projects" data-design-id="projects.section">
            <h2 data-design-id="projects.heading">Selected Projects</h2>
            <ul>
              {data.projects.map((project) => (
                <li
                  key={project.id}
                  data-design-id={`projects.card.${project.id}`}
                  data-fact-id={project.id}
                >
                  <h3>
                    <a href={project.href}>{project.name}</a>
                  </h3>
                  <p>{project.description}</p>
                </li>
              ))}
            </ul>
          </section>

          <section id="skills" className="locked-resume-skills" data-design-id="skills.section">
            <h2 data-design-id="skills.heading">Skills</h2>
            <ul>
              {data.skills.map((skill, i) => (
                <li key={i} data-design-id={`skills.item.${i}`} data-fact-id={`skill-${i}`}>
                  {skill}
                </li>
              ))}
            </ul>
          </section>

          <section id="achievements" className="locked-resume-achievements" data-design-id="achievements.section">
            <h2 data-design-id="achievements.heading">Achievements</h2>
            <ul>
              {data.achievements.map((achievement, i) => (
                <li key={i} data-design-id={`achievements.item.${i}`} data-fact-id={`achievement-${i}`}>
                  {achievement}
                </li>
              ))}
            </ul>
          </section>

          <section id="contact" className="locked-resume-contact" data-design-id="contact.section">
            <h2 data-design-id="contact.heading">Contact</h2>
            <ul>
              {data.contact.map((item) => (
                <li
                  key={item.href}
                  data-design-id={`contact.${item.label.toLowerCase()}`}
                  data-fact-id={`contact-${item.label.toLowerCase()}`}
                >
                  {item.label}:{" "}
                  <a href={item.href}>{item.value}</a>
                </li>
              ))}
            </ul>
          </section>
      </article>
    </section>
  );
}
