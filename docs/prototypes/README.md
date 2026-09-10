# Prototypes

A prototype answers one design question and is then frozen. It is not source, it
ships to nobody, and nothing imports it. Each file here is standalone: open it in
a browser and it runs.

These live under `docs/` rather than beside the code they model, because a file
under `apps/*/src` is in the corpus of every static gate that walks that tree,
and a frozen prototype is not something to hold to the rules live code follows.
`biome.json` excludes this directory for the same reason.

Read one for the reasoning behind a decision, not as a pattern to copy. The
shipped answer is in the code, and the prototype is what came before it.

## What is here

- `417-part-ring-model.html`: the part-and-ring draw model explored for #417.
  Multipart geometry shipped under ADR 0018, and `docs/multipart-geometry-spec.md`
  is the built answer.
