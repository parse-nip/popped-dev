# DESIGN.md

# popped.dev Site-Wide Design Direction

**Project:** popped.dev
**Scope:** Full site experience
**Design direction:** Kimi × Notion × Linear
**Primary goal:** Make the portfolio feel like a calm, intelligent, collaborative AI workspace.

---

# 1. Product Feel

popped.dev should not feel like a traditional resume website.

It should feel like a living portfolio that visitors can thoughtfully shape with an AI agent.

The design should communicate:

* Calm intelligence
* Editorial clarity
* Trust
* Precision
* Human authorship
* AI collaboration
* Creative flexibility
* Protected factual integrity

The site should feel closer to:

* Kimi
* Notion
* Linear
* Claude
* Arc
* Apple setup flows

and less like:

* A template portfolio
* A dense resume page
* A SaaS dashboard
* A developer documentation site
* A flashy personal landing page

---

# 2. Design Principles

## 2.1 Calm First

The interface should feel quiet by default.

Avoid visual noise, heavy borders, bright colors, unnecessary gradients, oversized animations, and decorative clutter.

Use whitespace, soft contrast, and clean hierarchy to create confidence.

---

## 2.2 Editorial, Not Decorative

The portfolio content is the product.

Design should frame the work and biography beautifully, not compete with it.

Use editorial spacing, restrained typography, and clear sections.

The page should feel curated.

---

## 2.3 AI-Native, Not Gimmicky

The AI agent is central to the experience, but the site should not feel like a chatbot slapped onto a resume.

The design should suggest:

> This portfolio can be reshaped through conversation.

The agent UI should feel integrated into the site, not floating randomly on top of it.

---

## 2.4 Protected Truth, Flexible Presentation

The design must reinforce the core rule:

Visitors can change presentation, but not factual content.

The experience should make this feel reassuring rather than restrictive.

Use language like:

* Protected facts
* Editable presentation
* Community-built interface
* Reviewed before merge

Avoid language that feels legalistic or defensive.

---

# 3. Visual Personality

## Keywords

```text
Calm
Minimal
Polished
Soft
Precise
Collaborative
Human
Editorial
AI-native
Premium
```

## Avoid

```text
Flashy
Dense
Corporate
Over-animated
Neon
Dashboard-heavy
Generic portfolio
Template-like
```

---

# 4. Layout System

## Page Width

Use a centered layout with generous breathing room.

```css
--site-max-width: 1120px;
--content-max-width: 760px;
--wide-max-width: 1280px;
```

Main content should usually sit within `1120px`.

Text-heavy sections should be narrower, around `720px–780px`.

---

## Page Padding

```css
--page-padding-desktop: 48px;
--page-padding-tablet: 32px;
--page-padding-mobile: 20px;
```

Mobile should remain spacious but not wasteful.

---

## Section Spacing

Use large, calm vertical rhythm.

```css
--section-gap-large: 96px;
--section-gap-medium: 64px;
--section-gap-small: 40px;
```

The page should feel like a sequence of thoughtful editorial blocks, not a compressed resume.

---

# 5. Typography

## Font Direction

Use a modern system sans-serif stack.

Preferred:

```css
font-family:
  Inter,
  ui-sans-serif,
  system-ui,
  -apple-system,
  BlinkMacSystemFont,
  "Segoe UI",
  sans-serif;
```

Avoid decorative fonts.

Typography should feel like Notion: simple, readable, confident.

---

## Type Scale

```css
--text-xs: 12px;
--text-sm: 13px;
--text-base: 15px;
--text-md: 16px;
--text-lg: 18px;
--text-xl: 22px;
--text-2xl: 28px;
--text-3xl: 40px;
--text-4xl: 56px;
```

---

## Headings

Headings should use tight letter spacing and medium-bold weight.

```css
.heading-xl {
  font-size: clamp(40px, 7vw, 72px);
  line-height: 0.95;
  letter-spacing: -0.055em;
  font-weight: 650;
}

.heading-lg {
  font-size: clamp(32px, 5vw, 56px);
  line-height: 1;
  letter-spacing: -0.045em;
  font-weight: 650;
}

.heading-md {
  font-size: 28px;
  line-height: 1.15;
  letter-spacing: -0.035em;
  font-weight: 620;
}
```

---

## Body Text

Body text should be readable, soft, and restrained.

```css
.body {
  font-size: 15px;
  line-height: 1.7;
  color: var(--color-text-secondary);
}
```

Long paragraphs should be avoided.

Prefer short paragraphs, cards, callouts, and structured rows.

---

# 6. Color System

The site should primarily use neutral colors.

## Core Colors

```css
:root {
  --color-page: #fafafa;
  --color-surface: #ffffff;
  --color-surface-soft: #f6f6f5;
  --color-surface-muted: #f1f1ef;

  --color-text-primary: #111111;
  --color-text-secondary: #666666;
  --color-text-muted: #8a8a8a;

  --color-border: #e8e8e6;
  --color-border-strong: #d8d8d5;

  --color-black: #111111;
  --color-white: #ffffff;
}
```

---

## Accent Colors

Use accents sparingly.

Suggested accents:

```css
--color-accent-blue: #eef3ff;
--color-accent-blue-text: #315fdc;

--color-accent-amber: #fff4e5;
--color-accent-amber-text: #a45f12;

--color-accent-green: #edf8f1;
--color-accent-green-text: #247a45;

--color-accent-purple: #f3efff;
--color-accent-purple-text: #6c46c2;
```

Accents should be used for:

* Status pills
* Protected labels
* Agent activity
* Small icons
* Section badges

They should not dominate the page.

---

# 7. Background

The page background should be near-white, not pure gray.

```css
body {
  background: #fafafa;
}
```

Subtle depth can be added with radial gradients.

```css
.site-bg {
  background:
    radial-gradient(circle at 50% 0%, rgba(0,0,0,0.035), transparent 32%),
    #fafafa;
}
```

Avoid obvious colorful gradients.

The background should feel like air, not decoration.

---

# 8. Surfaces

Cards, panels, modals, and agent containers should feel soft and physical.

```css
.surface {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 24px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.06);
}
```

For smaller cards:

```css
.card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 18px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.035);
}
```

For Notion-like quiet blocks:

```css
.soft-card {
  background: var(--color-surface-soft);
  border: 1px solid rgba(0,0,0,0.04);
  border-radius: 16px;
}
```

---

# 9. Header / Navigation

The header should be minimal and quiet.

It should not feel like a marketing navbar.

## Recommended Header

```text
[popped.dev]                         [How it works] [Agent] [GitHub]
```

or, if very minimal:

```text
[popped.dev]                                      [Open agent]
```

## Header Style

```css
.site-header {
  height: 72px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-inline: var(--page-padding-desktop);
}
```

Use:

* Small wordmark
* Muted nav links
* No heavy background
* Optional translucent blur on scroll

```css
.site-header.is-sticky {
  background: rgba(250,250,250,0.76);
  backdrop-filter: blur(16px);
  border-bottom: 1px solid rgba(0,0,0,0.05);
}
```

---

# 10. Hero Section

The hero should explain the site quickly and beautifully.

## Goal

In one glance, users should understand:

> This is a real developer portfolio that can be redesigned through an AI agent.

## Suggested Structure

```text
[Community-built portfolio]

A developer portfolio
that redesigns itself
through conversation.

Visitors can use the AI agent to change layout, styling, and presentation.
The facts stay protected, and accepted changes open a pull request.

[Start designing] [See protected content]
```

## Hero Style

```css
.hero {
  min-height: 72vh;
  display: grid;
  align-items: center;
  padding-block: 96px;
}
```

Hero title:

```css
.hero-title {
  max-width: 880px;
  font-size: clamp(48px, 8vw, 96px);
  line-height: 0.92;
  letter-spacing: -0.07em;
  font-weight: 680;
}
```

Hero copy:

```css
.hero-copy {
  max-width: 620px;
  margin-top: 24px;
  font-size: 18px;
  line-height: 1.65;
  color: var(--color-text-secondary);
}
```

---

# 11. Resume / Portfolio Content

The real portfolio content should be treated like a protected document inside a beautiful workspace.

## Layout

Use a two-column layout on desktop:

```text
Left: section labels / metadata
Right: content
```

Example:

```text
Experience        Software Engineer
                  Company Name
                  Description...
```

This creates a Notion-like document feel while staying more polished.

## Section Style

```css
.resume-section {
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: 48px;
  padding-block: 56px;
  border-top: 1px solid var(--color-border);
}
```

On mobile:

```css
.resume-section {
  grid-template-columns: 1fr;
  gap: 16px;
}
```

---

## Section Labels

```css
.section-label {
  font-size: 13px;
  color: var(--color-text-muted);
  font-weight: 500;
}
```

Labels should feel like Notion database properties or Linear sidebar labels.

---

## Resume Items

```css
.resume-item {
  display: grid;
  gap: 10px;
  padding-bottom: 32px;
}
```

Title:

```css
.resume-item-title {
  font-size: 20px;
  font-weight: 600;
  letter-spacing: -0.025em;
}
```

Metadata:

```css
.resume-item-meta {
  font-size: 14px;
  color: var(--color-text-muted);
}
```

Description:

```css
.resume-item-description {
  font-size: 15px;
  line-height: 1.7;
  color: var(--color-text-secondary);
}
```

---

# 12. AI Agent Panel

The agent should feel like a first-class product surface.

Not a random chat widget.

## Placement

Preferred options:

### Option A: Right-side workspace panel

Good for desktop.

```text
┌──────────────────────────────┬──────────────────────┐
│ Portfolio                    │ Agent                │
│                              │                      │
│                              │ Chat + preview notes │
└──────────────────────────────┴──────────────────────┘
```

### Option B: Bottom composer

Good for Kimi-inspired simplicity.

```text
Portfolio content

        [ Ask the agent to redesign this site...     ↑ ]
```

### Option C: Floating pill that expands

Good for mobile.

```text
[ ✨ Design with AI ]
```

---

## Agent Visual Style

```css
.agent-panel {
  background: rgba(255,255,255,0.86);
  backdrop-filter: blur(20px);
  border: 1px solid var(--color-border);
  border-radius: 24px;
  box-shadow: 0 24px 80px rgba(0,0,0,0.08);
}
```

The agent should use:

* Rounded input
* Minimal toolbar
* Muted placeholder text
* Clear send button
* Small status indicators

Placeholder:

```text
Ask the agent to redesign the portfolio...
```

---

## Agent Message Style

User messages:

```css
.message-user {
  background: var(--color-black);
  color: white;
  border-radius: 18px;
}
```

Agent messages:

```css
.message-agent {
  background: var(--color-surface-soft);
  color: var(--color-text-primary);
  border-radius: 18px;
}
```

System/status messages:

```css
.message-status {
  color: var(--color-text-muted);
  font-size: 13px;
}
```

---

# 13. Protected / Editable Language

The site should consistently distinguish between:

1. Editable presentation
2. Protected facts

Do this through small, repeated UI cues.

## Protected Badge

```text
🔒 Facts protected
```

```css
.protected-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  background: #fff4e5;
  color: #a45f12;
  font-size: 12px;
  font-weight: 500;
}
```

## Editable Badge

```text
✨ Presentation editable
```

```css
.editable-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  background: #eef3ff;
  color: #315fdc;
  font-size: 12px;
  font-weight: 500;
}
```

---

# 14. Buttons

Buttons should feel Notion-simple and Kimi-soft.

## Primary Button

```css
.button-primary {
  height: 44px;
  padding: 0 18px;
  border-radius: 12px;
  background: #111111;
  color: white;
  font-size: 14px;
  font-weight: 500;
  box-shadow: 0 8px 24px rgba(0,0,0,0.14);
}
```

## Secondary Button

```css
.button-secondary {
  height: 44px;
  padding: 0 18px;
  border-radius: 12px;
  background: white;
  color: #222;
  border: 1px solid var(--color-border);
}
```

## Ghost Button

```css
.button-ghost {
  height: 40px;
  padding: 0 14px;
  border-radius: 10px;
  background: transparent;
  color: var(--color-text-secondary);
}
```

Hover states should be subtle.

Avoid bright hover effects.

---

# 15. Inputs

Inputs should feel like Kimi’s composer and Notion’s clean fields.

```css
.input {
  height: 48px;
  padding: 0 14px;
  border-radius: 14px;
  border: 1px solid var(--color-border);
  background: white;
  color: var(--color-text-primary);
  font-size: 15px;
}
```

Focus:

```css
.input:focus {
  outline: none;
  border-color: #cfcfcb;
  box-shadow: 0 0 0 4px rgba(0,0,0,0.04);
}
```

---

# 16. Modal System

Modals should follow the same site-wide surface language.

## Modal Style

```css
.modal-backdrop {
  background: rgba(250,250,250,0.72);
  backdrop-filter: blur(12px);
}

.modal {
  width: min(760px, calc(100vw - 32px));
  background: white;
  border: 1px solid var(--color-border);
  border-radius: 24px;
  box-shadow: 0 24px 80px rgba(0,0,0,0.10);
}
```

## Welcome Modal

The welcome modal should introduce the whole product, not just itself.

Recommended copy:

```text
Welcome to popped.dev

This is a real developer portfolio that visitors can reshape with an AI agent.

You can redesign the layout, styling, motion, typography, and presentation.
The underlying experience, education, achievements, and facts stay protected.

When a design is approved, the agent opens a pull request for review.
```

Actions:

```text
Skip
Start designing
```

---

# 17. Cards and Content Blocks

Use cards to summarize, not to decorate.

Good card types:

* Current role
* Featured work
* AI contribution status
* Protected content explanation
* How it works
* Suggested prompts
* Project highlights

Card style:

```css
.info-card {
  padding: 22px;
  border-radius: 20px;
  background: white;
  border: 1px solid var(--color-border);
}
```

Card title:

```css
.info-card-title {
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.015em;
}
```

Card body:

```css
.info-card-body {
  margin-top: 8px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--color-text-secondary);
}
```

---

# 18. Suggested Prompts

The site should help visitors understand what they can ask the agent.

Use quiet prompt chips.

Examples:

```text
Make this feel like a research lab
Turn the resume into a timeline
Make the typography more editorial
Create a darker visual style
Make the portfolio feel like Linear
Add subtle motion
```

Style:

```css
.prompt-chip {
  display: inline-flex;
  align-items: center;
  min-height: 34px;
  padding: 0 12px;
  border-radius: 999px;
  background: white;
  border: 1px solid var(--color-border);
  color: var(--color-text-secondary);
  font-size: 13px;
}
```

---

# 19. Motion

Motion should be soft, fast, and functional.

Use motion for:

* Modal entrance
* Agent panel expansion
* Preview updates
* Button hover
* Toasts
* Section reveal

Avoid:

* Bouncy animation
* Large parallax
* Constant movement
* Decorative animation that distracts from reading

## Standard Transition

```css
--ease-out-soft: cubic-bezier(.22, 1, .36, 1);
--duration-fast: 140ms;
--duration-normal: 220ms;
```

## Modal Entrance

```css
.modal-enter {
  opacity: 0;
  transform: scale(.98) translateY(8px);
}

.modal-enter-active {
  opacity: 1;
  transform: scale(1) translateY(0);
  transition:
    opacity 180ms var(--ease-out-soft),
    transform 180ms var(--ease-out-soft);
}
```

---

# 20. Responsive Behavior

## Desktop

Desktop can support:

* Split portfolio + agent layouts
* Wider hero type
* Section label columns
* Sticky side metadata

## Tablet

Tablet should reduce layout complexity:

* Collapse side labels above content
* Keep agent available as a docked composer or floating button
* Reduce hero scale

## Mobile

Mobile should feel like a clean document plus AI action.

Use:

* Single column
* Sticky bottom agent composer
* Compact cards
* Fewer visible chips
* Large tap targets

Mobile agent trigger:

```text
✨ Design with AI
```

---

# 21. Accessibility

The design must remain readable and usable.

Requirements:

* Body text minimum `15px`
* Tap targets minimum `40px`
* Visible focus states
* Keyboard navigable modals
* Close button with accessible label
* Color contrast must not rely only on hue
* No essential information hidden in animation

---

# 22. Implementation Tokens

Use design tokens instead of one-off values.

```css
:root {
  --font-sans: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;

  --color-page: #fafafa;
  --color-surface: #ffffff;
  --color-surface-soft: #f6f6f5;
  --color-text-primary: #111111;
  --color-text-secondary: #666666;
  --color-text-muted: #8a8a8a;
  --color-border: #e8e8e6;

  --radius-sm: 10px;
  --radius-md: 14px;
  --radius-lg: 18px;
  --radius-xl: 24px;
  --radius-pill: 999px;

  --shadow-card: 0 8px 28px rgba(0, 0, 0, 0.035);
  --shadow-panel: 0 20px 60px rgba(0, 0, 0, 0.06);
  --shadow-modal: 0 24px 80px rgba(0, 0, 0, 0.10);

  --ease-out-soft: cubic-bezier(.22, 1, .36, 1);

  --page-padding: clamp(20px, 4vw, 48px);
  --content-width: 760px;
  --site-width: 1120px;
}
```

---

# 23. Component Checklist

Every component should answer:

1. Does it feel calm?
2. Is the hierarchy obvious?
3. Is there enough whitespace?
4. Does it look good in black, white, and soft gray?
5. Does it feel like part of an AI-native workspace?
6. Is the factual content clearly protected?
7. Does it avoid looking like a generic portfolio template?

---

# 24. Site-Wide Experience Summary

The final site should feel like:

> A quiet AI-native portfolio workspace where visitors can redesign the presentation through conversation, while the real professional facts remain protected and reviewable.

The modal, hero, resume, agent panel, cards, buttons, forms, and motion should all share the same design language:

* Soft white surfaces
* Rounded product-like panels
* Minimal typography
* Muted borders
* Restrained shadows
* Calm interactions
* Clear distinction between editable design and protected facts

The result should feel polished enough to be a real product, but personal enough to still feel like a developer portfolio.
