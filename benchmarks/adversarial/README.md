# Adversarial Evaluation

The accuracy suites ask whether FixMap finds the right file. This one asks the opposite question, and an external stress test found it to be the more damaging failure: **does FixMap stay quiet when it has nothing to say?**

A wrong answer costs an agent one wasted file read. A wrong answer delivered with high confidence and persuasive reasons costs it an entire investigation. The original review put it plainly — the dangerous failure is *"being wrong while sounding grounded, specific, and high-confidence."*

## What is measured

**False-confidence rate** — the share of cases where FixMap's top result exceeded the confidence ceiling a case allows. Each case also asserts the reported task grounding, and identifier cases require a diagnostic naming the identifiers that could not be resolved or verified.

| Result | Value |
| --- | ---: |
| Cases | 8 |
| Passed | 8 |
| **False-confidence rate** | **0.0** |

Measured 2026-07-26. Per-case output is checked in at [`results.json`](results.json).

## The cases

| Case | Repository | Probes |
| --- | --- | --- |
| `fabricated-identifier-undici` | undici | Invented identifiers whose word fragments genuinely appear in the repository |
| `fabricated-identifier-express` | Express | The same, on a small repository where weak matches are a larger share of total evidence |
| `wrong-repository-identifier` | Express | Real Zod identifiers (`cidrv6`, `safeParse`) asked against a repository that has neither |
| `vague-improvement-request` | Vitest | "improve DX when running into errors" — no localizable target |
| `vague-cleanup-request` | chalk | Vague product language against a small repository |
| `absent-feature-surface` | chalk | A CLI flag for a package that exposes no CLI |
| `runtime-only-symptom` | pino | A timing-dependent concurrency symptom with no static trace |
| `documentation-term-flood` | webpack | Only broad development vocabulary that instruction and documentation files carry in volume |

Cases reuse the checkouts already pinned by the accuracy suites, so this suite clones nothing new.

## Why this is not only unit tests

Unit tests already cover grounding behavior, and they cannot replace this for two reasons.

They run against fixtures rather than real repositories, so they never see the case that actually matters: a large codebase where a fabricated compound identifier decomposes into a dozen words that all appear somewhere. That is where lexical ranking manufactures a confident answer.

More sharply — **FixMap's own test fixtures contain the fabricated identifiers.** Running these cases against this repository resolves `experimentalHoudiniPartialPrerenderScheduler` as exact text, grounding reports `anchored`, and no warning fires. A suite pointed at this repository would pass while the behavior was completely broken. It has to run elsewhere.

## Recorded observation, not asserted away

`vague-cleanup-request` reports task grounding as `descriptive` rather than `vague`. `isVagueTask` only fires at five task tokens or fewer, so a longer vague sentence misses the label even when a reader would call it obviously vague.

The ranking outcome is still honest — one context file at low confidence — so this is a labeling gap rather than a safety gap, and the case passes on the ceiling that matters. It is recorded here and in the dataset's `note` field rather than quietly loosened, because a suite that edits its expectations to stay green measures nothing.

## Running it

```bash
npm run build:core
npm run evaluate:adversarial           # report only
npm run evaluate:adversarial:gate      # fail if any case overclaims
npm run evaluate:adversarial:record    # deliberately refresh results.json
```

## Rules

1. **Never widen a ceiling to make a case pass.** If FixMap starts overclaiming on a case, that is the finding — fix the ranker or record the regression.
2. **Cases are not tuning targets.** These probe behavior FixMap must never exhibit, not accuracy to optimize.
3. **Add a case whenever a new confident-nonsense mode is found.** That is how this suite stays useful.
