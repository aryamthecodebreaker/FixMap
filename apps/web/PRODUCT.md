# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary user is an individual developer who works with AI coding tools such as Codex, Claude Code, Cursor, or GitHub Copilot. First-time website visitors may not know terms such as repository context, impact graph, or coding agent, so public pages must explain the product without requiring that vocabulary.

## Product Purpose

FixMap checks a software task and a code project together. It gives people and AI coding tools a short, evidence-backed starting list: files to inspect, tests or checks to run, nearby code to review, risks, and explicit uncertainty. Success means a visitor can understand that mechanism within seconds and can choose to try a sample or install FixMap for a real project.

## Positioning

FixMap is deterministic and repository-grounded. It uses project paths, symbols, imports, related tests, and bounded Git history rather than a hosted model. It shows why it surfaced an item and declines unsupported certainty.

## Operating Context

FixMap can run in a terminal, inside supported AI coding tools through `/fixmap`, over local stdio through MCP, in GitHub Actions, and in a browser against the bundled sample project. Plan is used before an edit; Explain, Compare, Verify, Watch, Context, Graph, and Benchmark support later investigation and review workflows.

## Capabilities and Constraints

- The homepage and browser demo run against the bundled `sample-api` project; they do not inspect a visitor's repository or upload task text.
- Public copy may describe files to inspect, tests to run, related code, risks, and uncertainty. It must not describe pre-edit suggestions as files that were changed.
- Token, cost, time, tool-call, and task-success improvements have not been measured and must not be claimed.
- Use cases may explain genuine product mechanisms but must not invent customers, testimonials, success rates, or guaranteed outcomes.
- FixMap runs without an account, API key, or model call.

## Brand Commitments

Keep the FixMap name, logo, existing navy-and-mint identity, and direct evidence-led tone. Public-facing copy should use plain language, short sentences, and familiar examples. Prefer “AI coding tool” over unexplained insider terms on first-contact surfaces.

## Evidence on Hand

The repository contains checked-in baseline, held-out, adversarial, and performance records, plus a real browser demo and a 31-second workflow video. Repository retrieval has measured results. No completed controlled-agent runs, customer testimonials, or downstream-efficiency evidence exist.

## Product Principles

- Explain the product before asking visitors to learn its vocabulary.
- Show genuine engine output and honest uncertainty.
- Make the next action obvious: try a sample or use FixMap on a project.
- Keep evidence and unmeasured outcomes clearly separated.
- Preserve advanced detail for people who ask for it.

## Accessibility & Inclusion

Public pages must remain keyboard accessible, use semantic headings and links, preserve visible focus, support reduced motion, and avoid horizontal overflow at a 390px viewport. Copy should be understandable without specialist repository-analysis knowledge.
