import { getExperience } from "@/lib/experience";

/**
 * Renders owner facts from locked JSON. Community contributors may restyle
 * this component and target #locked-resume in CSS — but must not change
 * src/locked/experience.json (enforced by CI checksums).
 */
export function LockedResume() {
  const data = getExperience();

  return (
    <section id="locked-resume" data-facts="true" aria-label="Portfolio facts">
      <article className="locked-resume">
          <header className="locked-resume-header">
            <h1
              data-fact-id="profile-name"
              data-contribution-id="profile-name-papyrus"
            >
              {data.profile.name}
            </h1>
            <p data-fact-id="profile-tagline">{data.profile.tagline}</p>
            <p
              className="locked-resume-links"
              data-contribution-id="profile-links"
            >
              {data.profile.links.map((link, i) => (
                <span key={link.href}>
                  {i > 0 ? " · " : null}
                  <a
                    href={link.href}
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

          <section id="about" className="locked-resume-about">
            <h2>About</h2>
            <p data-fact-id="about">{data.about}</p>
          </section>

          <section id="experience" className="locked-resume-experience">
            <h2>Experience</h2>
            <ul>
              {data.experience.map((item) => (
                <li key={item.id} data-fact-id={item.id}>
                  <h3>{item.title}</h3>
                  <p>
                    <time dateTime={item.period.start}>{item.period.label}</time>
                  </p>
                  <p>{item.description}</p>
                </li>
              ))}
            </ul>
          </section>

          <section id="education" className="locked-resume-education">
            <h2>Education</h2>
            <ul>
              {data.education.map((item) => (
                <li key={item.id} data-fact-id={item.id}>
                  <h3>{item.title}</h3>
                  {item.details.map((detail, i) => (
                    <p key={i}>{detail}</p>
                  ))}
                </li>
              ))}
            </ul>
          </section>

          <section id="projects" className="locked-resume-projects">
            <h2>Selected Projects</h2>
            <ul>
              {data.projects.map((project) => (
                <li key={project.id} data-fact-id={project.id}>
                  <h3>
                    <a href={project.href}>{project.name}</a>
                  </h3>
                  <p>{project.description}</p>
                </li>
              ))}
            </ul>
          </section>

          <section id="skills" className="locked-resume-skills">
            <h2>Skills</h2>
            <ul>
              {data.skills.map((skill, i) => (
                <li key={i} data-fact-id={`skill-${i}`}>
                  {skill}
                </li>
              ))}
            </ul>
          </section>

          <section id="achievements" className="locked-resume-achievements">
            <h2>Achievements</h2>
            <ul>
              {data.achievements.map((achievement, i) => (
                <li key={i} data-fact-id={`achievement-${i}`}>
                  {achievement}
                </li>
              ))}
            </ul>
          </section>

          <section id="contact" className="locked-resume-contact">
            <h2>Contact</h2>
            <ul>
              {data.contact.map((item) => (
                <li key={item.href} data-fact-id={`contact-${item.label.toLowerCase()}`}>
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
