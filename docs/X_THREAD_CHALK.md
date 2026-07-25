# X thread — the chalk finding

Post from **@AryamGoyal1**. Every number here is reproducible from the repository; nothing is estimated.

Post the thread as one unit (X's "Add another post" chain), not as separate tweets.

---

## Post 1

I build a tool that tells coding agents which files to edit before they start searching.

To test it I pointed it at chalk — 22k stars, 4 source files, about as simple as a real repo gets.

It could not find chalk's color detection code.

Here is what was wrong. 🧵

---

## Post 2

The task: "handle chalk color detection on windows terminals"

What my tool returned:

    source/index.js         (low confidence) — matched "color"
    source/index.test-d.ts  (low confidence) — matched "color"

The actual answer, source/vendor/supports-color/index.js, was not in the list.

It was not ranked low. It was invisible.

---

## Post 3

Cause one: I was filtering directories named vendor, dist, build, target.

But the scan already ran `git ls-files --exclude-standard`, which applies .gitignore.

Generated files were gone before my filter ran. So the filter could only ever delete files the author *deliberately committed*.

chalk vendors its own source into source/vendor/. I threw it away.

---

## Post 4

Cause two, and this one I think is common.

I suppressed any word appearing in over half the files as boilerplate. Standard IDF thinking.

chalk says "color" in 55% of its files.

Because that is what chalk is.

My tool deleted the word "color" from a query about color, then reported zero results.

---

## Post 5

The lesson generalizes: a document-frequency cutoff calibrated on large corpora inverts on small focused ones.

In a 20-file single-purpose repo, the most common term is the subject, not the noise.

I moved the cutoff from 50% to 85%. Boilerplate still gets dropped. Subject matter survives.

---

## Post 6

Both fixed. chalk's supports-color now ranks first.

On my frozen 6-repo benchmark (pinned SHAs, real issues, expected files recorded before the run) top-3 went 83% → 100%. top-1 and top-5 held.

Fix, tests, and the benchmark are here:

github.com/aryamthecodebreaker/FixMap/pull/85

---

## Post 7

FixMap is MIT, runs locally, no API key and no model call. CLI, MCP server, or GitHub Action.

    npx -y @aryam/fixmap@latest plan --issue <github-issue-url>

If it misses on your repo I want the issue — that is exactly how the chalk case got found.

github.com/aryamthecodebreaker/FixMap

---

# Notes before you post

**Attach an image to post 2.** The before/after ranking is the whole argument and X collapses long text. A terminal screenshot of the two reports side by side will carry the thread. Reply here and I will generate it.

**Best posting time for dev audiences:** Tue–Thu, 9–11am ET (7:30–9:30pm IST).

**This thread alone will not move the star count**, and I would rather say that up front than have you judge it against the wrong bar. Your LinkedIn launch reached 6 people. A standalone post from a small account reaches roughly nobody regardless of quality — that is distribution mechanics, not a comment on the work.

What the thread is actually for: it is a **citable artifact**. Once it exists you can reference it in the two places that do have reach.

## Where the reach actually is

**1. Reply to the chalk / supports-color maintainers' orbit.** The finding is about their repo and is complimentary to them (chalk is *correctly* structured; my tool was wrong). Sindre Sorhus and the Node tooling accounts are exactly the audience. Reply with the finding, not with a pitch.

**2. The "why does my coding agent open the wrong file" conversation.** Every Cursor / Claude Code / Copilot thread has people complaining about context retrieval. That is your niche and it is active daily. Answer the specific complaint, mention the tool only if it fits.

**3. Write this up properly.** The thread is a compressed version of a genuinely good blog post — the df-cutoff inversion on small corpora is a real insight that would stand on r/programming or eventually as a Show HN. A post titled something like *"Your search index deletes the word your repo is about"* is stronger than any "I launched X" framing, because it teaches something.

**On Show HN:** you were blocked for account age, not content. That gate opens with normal commenting history. Comment substantively on HN for two or three weeks first, then submit the write-up — not the tool. "Show HN: FixMap" competes with every launch that day. A titled technical finding does not.

## The honest read on 5,000

You are at 4 stars, 0 forks, after 4 weeks. 5,000 is roughly the top 0.1% of developer tools and effectively always follows one of: a front-page HN hit, adoption by a project that already has an audience, or a sustained body of writing that makes you the person who explains this problem.

Bug-fixing does not get there on its own — but shipping a tool that misses chalk guarantees you never get there either. The work this session was the prerequisite, not the growth lever.

The reachable next milestone is **50 stars from people who are not your friends**, and the path runs through (2) and (3) above. Hit that and the mechanics of the next order of magnitude become measurable instead of hypothetical.
