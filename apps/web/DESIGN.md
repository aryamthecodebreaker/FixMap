---
version: alpha
name: FixMap
description: An evidence-led product interface that helps developers and AI coding tools see where to start.
colors:
  paper: "#f7f4ec"
  paper-deep: "#eee9dc"
  paper-light: "#fffdf8"
  on-dark: "#fffdf8"
  ink: "#0a213b"
  ink-soft: "#405064"
  ink-faint: "#656e79"
  navy: "#071d35"
  green: "#0a5a43"
  green-dark: "#074433"
  mint: "#75c99a"
  mint-soft: "#dff2e7"
  line: "#d9d3c6"
  line-strong: "#736e66"
  focus-ring: "#589774"
  warning: "#9b521b"
  dark-paper: "#0d1117"
  dark-paper-deep: "#111821"
  dark-paper-light: "#161d26"
  dark-on-dark: "#edf3f7"
  dark-ink-soft: "#c4ced6"
  dark-ink-faint: "#aab5bf"
  dark-navy: "#071523"
  dark-green: "#75c99a"
  dark-green-emphasis: "#9bddb7"
  dark-mint-soft: "#203b31"
  dark-line: "#394651"
  dark-line-strong: "#74818c"
  dark-focus-ring: "#8ddfb0"
  dark-warning: "#ffc184"
typography:
  display:
    fontFamily: "Geist, Arial, sans-serif"
    fontSize: "76px"
    fontWeight: 660
    lineHeight: 0.98
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "Geist, Arial, sans-serif"
    fontSize: "54px"
    fontWeight: 640
    lineHeight: 1.03
    letterSpacing: "-0.045em"
  title:
    fontFamily: "Geist, Arial, sans-serif"
    fontSize: "21px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Geist, Arial, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.55
  lede:
    fontFamily: "Geist, Arial, sans-serif"
    fontSize: "19px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Geist Mono, monospace"
    fontSize: "12px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.08em"
  technical:
    fontFamily: "Geist Mono, monospace"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.45
rounded:
  chip: "5px"
  control: "6px"
  standard: "8px"
  panel: "10px"
  full: "999px"
spacing:
  micro: "6px"
  compact: "12px"
  control: "18px"
  card: "24px"
  desktop-gutter: "32px"
  tablet-gutter: "20px"
  mobile-gutter: "14px"
  section: "88px"
  section-roomy: "96px"
components:
  button-primary:
    backgroundColor: "{colors.green}"
    textColor: "{colors.paper-light}"
    rounded: "{rounded.control}"
    padding: "0 18px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.green-dark}"
    textColor: "{colors.paper-light}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 18px"
    height: "44px"
  task-input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "11px 12px"
  preset-chip:
    backgroundColor: "transparent"
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.chip}"
    padding: "5px 9px"
---

# Design System: FixMap

## Overview

**Creative North Star: "The Evidence Ledger"**

FixMap feels like a clear technical record, not an abstract AI promise. Warm paper surfaces, dark navy proof bands, disciplined rules, and compact report artifacts make the product approachable while keeping its repository-grounded character visible.

The visual system is restrained, legible, and evidence-first. Large plain-language headings establish the story; genuine files, tests, commands, and uncertainty appear in denser mono-set structures. Decoration stays subordinate to comprehension, and every expressive treatment should strengthen trust in what FixMap can actually show.

**Key Characteristics:**

- Warm paper foundation with a navy-and-mint identity.
- Editorial hierarchy paired with compact technical evidence.
- Rules and tonal bands organize content more often than floating cards.
- Real product output is the signature visual proof.
- Light and dark themes preserve the same semantic roles and contrast hierarchy.

## Colors

The palette combines warm archival neutrals with deep technical navy and a restrained green-to-mint accent family.

### Primary

- **Repository Green** (`#0a5a43`): Primary actions, meaningful icons, active states, and evidence labels.
- **Deep Repository Green** (`#074433`): Hover states, text links, and small labels that need stronger contrast on paper.

### Secondary

- **Evidence Navy** (`#071d35`): Dark proof bands, code surfaces, and the use-case output panel.
- **Signal Mint** (`#75c99a`): Positive emphasis, selected text, dark-surface labels, and connective marks.

### Neutral

- **Warm Paper** (`#f7f4ec`): Default page background.
- **Inset Paper** (`#eee9dc`): Toolbars and restrained tonal separation.
- **Clean Paper** (`#fffdf8`): Raised or bounded content surfaces and text on dark backgrounds.
- **Navy Ink** (`#0a213b`): Primary text and the strongest secondary-button border.
- **Slate Ink** (`#405064`): Supporting copy and technical descriptions.
- **Quiet Slate** (`#656e79`): Metadata, helper text, and trust facts.
- **Rule** (`#d9d3c6`) and **Strong Rule** (`#736e66`): Structural dividers and bounded controls.

Dark mode remaps the same roles to near-black paper (`#0d1117`), deep raised surfaces (`#161d26`), cool white text (`#edf3f7`), mint-led actions (`#75c99a`), and stronger slate rules (`#394651` / `#74818c`). It is a semantic inversion, not a separate visual identity.

**The Proof Band Rule.** Use navy as a deliberate evidence surface, not as a general decorative background.

**The Mint Signal Rule.** Mint marks confirmed structure, progress, or action; it does not become a broad page wash.

## Typography

**Display Font:** Geist (with Arial and sans-serif fallbacks)
**Body Font:** Geist (with Arial and sans-serif fallbacks)
**Label/Mono Font:** Geist Mono (with monospace fallback)

**Character:** Geist keeps public explanations contemporary and plain-spoken. Geist Mono distinguishes paths, commands, indices, labels, and engine evidence without turning the whole site into a developer console.

### Hierarchy

- **Display** (weight `660`, up to `76px`, line-height `0.98`): Homepage and major subpage statements; responsive sizing may step down to `45–50px` on small screens.
- **Headline** (weight `640`, up to `54px`, line-height `1.03`): Section claims and featured use-case headings.
- **Title** (weight around `600`, `21px`, line-height `1.25`): Card, workflow, and use-case titles.
- **Body** (weight `400`, `16px`, line-height `1.55`): Explanations and supporting prose. Important ledes use `19px` with the same open line height.
- **Label** (weight `700`, `12px`, `0.08em` tracking, uppercase when naming evidence roles): Compact capability, step, and proof labels.
- **Technical** (weight around `600`, typically `10.5–12.5px`, line-height near `1.45`): Paths, commands, ranks, and report metadata.

**The Two-Voice Rule.** Use Geist for the explanation and Geist Mono for the evidence; do not set long explanatory paragraphs in mono.

## Layout

The site uses a fixed-max-width fluid shell (`1240px`) with `32px` desktop side gutters, `20px` tablet gutters below `900px`, and `14px` phone gutters below `620px`. Major sections breathe vertically at roughly `88–96px`; internal report and card spacing is tighter, usually `12–24px`.

Desktop compositions often pair a shorter explanatory column with a larger evidence or list column. At `1120px`, hero and featured use-case pairs stack. At `820px`, editorial two-column sections and use-case rows simplify. At `620px`, controls and calls to action become full width, report definitions collapse to one column, and all content must wrap without horizontal overflow.

Long lists favor ruled rows and aligned columns over repeated floating cards. A row's index, story, and result create the reading order; on small screens they become one linear narrative.

**The Explanation-Then-Evidence Rule.** Lead with the plain-language claim, then place the denser report or proof beside it on wide screens and immediately after it on narrow screens.

## Elevation & Depth

The system is flat by default. Borders, dark bands, paper tones, and whitespace create most hierarchy. Shadows are reserved for overlays and the primary live report artifact, where a shallow ambient lift distinguishes an interactive product surface from editorial content.

### Shadow Vocabulary

- **Ambient Panel** (`0 14px 38px rgba(10, 33, 59, 0.08)`): Dropdowns and established raised containers.
- **Live Report** (`0 18px 50px rgba(10, 33, 59, 0.08)`): The homepage's interactive sample report only.
- **Dark Ambient Panel** (`0 20px 55px rgba(0, 0, 0, 0.36)`): Theme-equivalent lift on dark surfaces.

**The Flat-By-Default Rule.** A new section begins with rules, spacing, and tonal contrast; add shadow only when the surface is interactive, transient, or meaningfully raised.

## Shapes

Corners are gently engineered rather than bubbly. Compact controls and buttons use `5–6px` radii; ordinary cards and media use `8px`; report and proof panels use `10px`. Pills and circles are reserved for state, status, or numbered steps. Thin borders are structural and recur more often than filled containers.

**The Bounded Utility Rule.** Rounded shapes identify controls and discrete evidence surfaces; editorial rows remain mostly open and are separated by rules.

## Components

### Buttons

- **Shape:** Compact and rectangular with gently curved corners (`6px`) and a minimum height of `44px`.
- **Primary:** Repository Green on Clean Paper text, with horizontal padding of `18px`.
- **Hover / Focus:** Deepen to Deep Repository Green. Keep the global visible three-pixel focus outline and do not rely on movement alone.
- **Secondary:** Transparent paper surface with Navy Ink text and border; invert to Navy Ink on hover. On phone layouts, calls to action span the available width.

### Chips

- **Style:** Small transparent preset controls with a fine Rule border, `5px` corners, compact padding, and Slate Ink labels.
- **State:** Hover and selected states use Mint Soft with Repository Green borders and Deep Repository Green text. Selection remains explicit through `aria-pressed`.

### Cards / Containers

- **Corner Style:** Ordinary bounded surfaces use `8px`; report and proof panels use `10px`.
- **Background:** Clean Paper for bounded content, Warm Paper for inset areas, and Evidence Navy for proof panels.
- **Shadow Strategy:** Flat at rest except for the live report and transient navigation overlays.
- **Border:** One-pixel Rule or Strong Rule borders carry most separation.
- **Internal Padding:** Usually `24px`; compact report rows use approximately `12–16px`.

### Inputs / Fields

- **Style:** Warm Paper fill, Strong Rule border, `6px` radius, `11px 12px` padding, and a readable `16px` input size.
- **Focus:** Preserve the global three-pixel visible focus ring with offset. Interactive variants may also shift the border to Repository Green.
- **Error / Disabled:** Use explicit warning copy and the Warning token; do not communicate uncertainty by color alone.

### Navigation

The header is sticky, compact, and lightly translucent over the page. Desktop links use small Geist text with green hover/open states. Below `900px`, a bordered `44px` menu control opens a Clean Paper panel; every mobile navigation target is at least `44px` tall. The theme toggle remains a separately bounded control.

### Live Report

The homepage report is the canonical product-preview component. It follows a visible sequence—task input, repository check, evidence output—and uses a tonal toolbar, compact labels, ruled definition rows, mono-set paths, plain-language reasons, and an explicit uncertainty state. Preserve its privacy footnote and do not restyle it as a generic analytics dashboard.

### Use-Case Output Panel

The featured use case presents genuine sample output on Evidence Navy. Mint labels name the evidence roles, Clean Paper carries the values, and thin translucent rules separate rows. The panel stacks each label above its value on phones to keep long paths readable.

## Do's and Don'ts

### Do:

- **Do** explain the product in plain Geist copy before introducing compact mono-set evidence.
- **Do** use genuine paths, tests, commands, and uncertainty as the primary visual proof.
- **Do** use ruled editorial lists for repeated workflows and use cases.
- **Do** preserve visible focus, reduced-motion behavior, semantic headings, and a no-overflow layout at a `390px` viewport.
- **Do** keep light and dark themes semantically aligned: paper, ink, green action, mint signal, and structural rules.

### Don't:

- **Don't** turn every section into a floating card or add shadow to static editorial content.
- **Don't** use navy or mint as unbounded decoration; both colors carry specific proof and signal roles.
- **Don't** present unmeasured outcomes, invented customers, or generic AI imagery as product evidence.
- **Don't** let technical vocabulary or mono typography precede the plain-language explanation on first-contact surfaces.
- **Don't** replace honest empty or uncertain states with fabricated confident output.
