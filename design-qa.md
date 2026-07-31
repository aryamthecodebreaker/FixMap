# FixMap premium website — design QA

## Source and evidence

- Approved source: `C:\Users\aryam\.codex\generated_images\019fb79a-dfb0-7340-ae47-7570b48c68c3\exec-1f144e23-9916-4fd8-8f4b-5af1c5c0d37b.png`
- Source dimensions and density: 1536 × 1024 at 1×.
- Desktop implementation: `C:\Users\aryam\AppData\Local\Temp\fixmap-premium-desktop-normalized-pass2.png`
- Desktop comparison: `C:\Users\aryam\AppData\Local\Temp\fixmap-premium-comparison-normalized-pass3.png`
- Focused product-stage comparison: `C:\Users\aryam\AppData\Local\Temp\fixmap-premium-comparison-stage-pass3.png`
- Cursor interaction evidence: `C:\Users\aryam\AppData\Local\Temp\fixmap-premium-pixel-sink-hero-pass2.png`
- Editorial transition evidence: `C:\Users\aryam\AppData\Local\Temp\fixmap-premium-story-pass9.jpg`
- Mobile page evidence: `C:\Users\aryam\AppData\Local\Temp\fixmap-premium-mobile-390-pass1.png`, `C:\Users\aryam\AppData\Local\Temp\fixmap-premium-mobile-stage-pass1.png`, and `C:\Users\aryam\AppData\Local\Temp\fixmap-premium-mobile-cards-pass1.png`
- Mobile navigation evidence: `C:\Users\aryam\AppData\Local\Temp\fixmap-premium-mobile-menu-pass3.jpg`
- Final production evidence: `C:\Users\aryam\AppData\Local\Temp\fixmap-production-final-pass2.jpg`
- Desktop viewport: requested 1551 × 1180; browser content capture 1536 × 868 at device scale 1×.
- Mobile viewport: requested 405 × 930; browser content capture 390 × 868 at device scale 1×.
- Interaction states checked: initial hero, cursor depression on exposed hero surface, edited issue, example switch, staged run, each output-card selection, and expanded mobile navigation.

## Comparison history

### Pass 1

- P1: the previous homepage had the wrong hierarchy, headline, and product-stage proportions relative to the approved source.
- P2: the stage did not have a clear visual connection between Files, Checks, and Risks.
- P2: the mobile issue-field label did not have explicit input association.
- P2: the cursor field continued scheduling frames after the pointer settled.

Fixes: rebuilt the hero around the approved composition, added the connected stage path, corrected label semantics, and stopped the animation loop once pointer state settles.

### Pass 2

- P2: the desktop headline wrapped to three lines and pushed the product stage too low.
- P2: the generated route landscape was placed behind the section stacking context and was not visible.
- P3: the browser reported the story image as an eager-load candidate during visual QA.
- P2: the four trust facts became too tight at the narrowest two-column desktop width.

Fixes: locked the desktop headline to the intended two-line rhythm, repositioned the route asset inside the visible story layer, bypassed the local optimizer issue, marked the image for eager loading, and moved the single-column hero breakpoint to 1320px so the trust row never collides.

### Final comparison

- No open P0, P1, or P2 findings.
- The implementation preserves the approved warm editorial palette, two-line hero hierarchy, compact trust row, right-side product stage, and generous transition into the story section.
- The implemented stage is intentionally denser than the static source because its selector, issue editor, run sequence, and output cards are functional.
- Mobile reflows to one column without horizontal overflow; the menu, CTAs, trust facts, stage, and story remain readable.
- The WebGL cursor depression is subtle, clipped to exposed surfaces, disabled for coarse pointers and reduced motion, and does not block clicks.

## Functional verification

- TypeScript: passed.
- ESLint: passed with no warnings.
- Full workspace tests: passed, 234/234 (action 11, CLI 87, core 136).
- Production dependency audit: passed with 0 vulnerabilities.
- Optimized Next.js build: passed; all public routes prerendered.
- Built-site HTTP smoke: `/`, `/product`, `/demo`, `/evidence`, `/get-started`, `/docs`, `/sitemap.xml`, and `/opengraph-image` returned 200.
- Browser console: no runtime errors; the only recorded warning was fixed before the final build.
- Vercel production: deployment `dpl_EjgJRoHLa1rfjiGDQY2FDpZJGUW4` is Ready and promoted to `https://fixmap-flax.vercel.app`.

passed
