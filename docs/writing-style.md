# Writing style

Every word an agent writes in this repo follows these rules. There is no opt-in
step and no trigger phrase. It covers chat replies, commit messages, PR titles
and bodies, changesets, issue comments, handoff notes, markdown under `docs/`,
code comments, and user-facing copy in the apps.

Product copy carries one extra rule: never explain the domain back to the user.
Field, catalog, and navigation copy is written for people who run mosquito
control for a living, so it names the thing and stops. Changeset bodies have
their own shape in `docs/releases.md`. Where a more specific document conflicts
with this one, it wins.

These are the rules of the `unslop` skill, checked in so they bind Claude Code,
Codex, and any other agent that reads `AGENTS.md` or `CLAUDE.md`, whether or not
that agent has the skill installed.

## How to apply it

1. Write the thing.
2. Scan the patterns below and rewrite what matches.
3. Ask "what makes this obviously machine written?" and fix what is left.

Removing the patterns is half of it. Voiceless writing reads as machine written
too. Have an opinion. Vary the sentence rhythm. Say "I" when it fits. Be
specific: not "the query is slow" but "the explorer issues 41 shape requests on
first paint".

## Content

- Cut puffery. No "pivotal moment", "testament to", "evolving landscape",
  "indelible mark".
- Cut trailing `-ing` clauses that add nothing: "highlighting...",
  "ensuring...", "reflecting...", "showcasing...".
- Cut promotional words: "seamless", "robust", "groundbreaking", "powerful",
  "elegant".
- Name the source or delete the claim. No "experts believe", "reports suggest".
- No "despite challenges, X continues to thrive" shapes. State the fact.

## Language

- Avoid this vocabulary: additionally, crucial, delve, enhance, fostering,
  garner, interplay, intricate, landscape (abstract), pivotal, showcase,
  tapestry, testament, underscore, vibrant.
- Say "is" and "has". Not "serves as", "stands as", "boasts", "features".
- No "not just X, but Y". State the point.
- Do not force ideas into groups of three. Use the real number.
- Pick one name for a thing and repeat it. Do not cycle synonyms.
- No false ranges. "From migrations to map tiles" is not a scale.

## Style

- No em dashes. End the sentence or use a comma. Swapping in parentheses or an
  en dash trades one tell for another.
- Colons introduce a list or an example. They are not mid-sentence connectors.
- Do not bold every proper noun.
- No inline-header lists where the bold label restates the line
  ("**Performance:** performance improved"). A bold lead-in that names an item
  and is followed by new detail is fine.
- Sentence case headings.
- No decorative emoji.
- Straight quotes.

The dash rule is the one a machine can hold, and `pnpm check:prose` holds it.
Biome reads no markdown, so nothing checked a word of this document's own
subject until #594, and fourteen em dashes had collected under `docs/`. The gate
reads every tracked `.md` except the generated changelogs, for an em dash
anywhere and an en dash between spaces. An unspaced en dash in a range is
correct and is left alone. A dash that is right carries a marker on the line
above, `<!-- prose-ignore: one sentence ending in a full stop. -->`, and a
marker that excuses nothing fails. Nothing else here is gated, and the rest of
this document binds the same either way.

## Talking to the user

- No "I hope this helps", "Let me know if", "Of course!", "Certainly!".
- No "great question", "you're absolutely right".
- No knowledge-cutoff disclaimers. Find the answer or say what you checked.

## Filler

- "In order to" is "to". "Due to the fact that" is "because". "It is important
  to note that" gets deleted.
- One hedge at most. "May" beats "could potentially possibly".
- No generic endings. "The future looks bright" says nothing.

## Jargon

Prefer the concrete word to the abstract metaphor: substrate, wedge, vector,
locus, nexus, primitive (noun), harness (metaphor), surface (as in "API
surface"), bedrock, scaffolding (metaphor), paradigm, gold-plating, ratchet
(metaphor), evacuate (for moving code), endgame, north star, flywheel.
"Substrate" is "base". "Wedge in" is "add". "Gold-plating" is "more than the job
needs". "Evacuate" is "move out".

This repo has its own real terms. Organization, Profile, Membership, shape,
command, collection, and the rest of `CONTEXT.md` are domain vocabulary, not
jargon. Use them exactly.

Organization is the one to spell out, because the word it replaced was narrower.
An Organization is the customer, the group that runs mosquito control and owns
its records, settings, and field work. It can be an abatement district, a city
or county program, a health department, a university, or a contractor. Nothing
in the schema enumerates the kinds, so any narrower word names one of them and
misnames the rest. That is why agency sits on the Avoid list beside tenant, and
why `pnpm check:vocabulary` reads app copy for both words.

An Organization is also a record SIMMER owns, with an id, memberships, and
settings, so text somebody typed is not one. Where a Contact works is that text.
Its label is Company, and writing Organization there would put two organizations
on one row, one of them the key every authorization filter reads. ADR 0019 is
the decision.

## Plain speech

- Name the mechanism, not the feeling. Not "sync stays close at hand" but "the
  server authorizes the shape before Electric streams a row".
- If a sentence would read the same in another project's docs, it says nothing
  about this one. Cut it.
- One idea per sentence. Split anything the reader has to re-read.
- Active voice. "Queries are validated" is "the command handler validates the
  query". Passive is fine when the actor genuinely does not matter.
- Cut adverbs or find the stronger verb. "Runs quickly" is "is fast", or the
  measured number.
- Plain words: "use" not "utilize" or "leverage", "help" not "facilitate",
  "many" not "numerous", "if" not "in the event that".

## Code comments

The same rules apply, with one addition. A comment that restates the code is
noise. Write the reason, the constraint, or the trap. `docs/` and the memory
notes hold the long version; the comment holds the one line a reader needs at
that line.
