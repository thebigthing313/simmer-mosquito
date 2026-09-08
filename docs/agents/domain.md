# Domain docs

How the engineering skills should consume this repo's domain documentation when
exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root. It is the domain glossary: Organization,
  Profile, Membership, and the rest of the vocabulary the code is written in.
- **`docs/adr/`** at the repo root. Read the ADRs that touch the area you are
  about to work in, before you change it. Auth, sync, identity, organization
  scope, DB layering, and field-work provenance each have one.

If any of these files does not exist, proceed silently. Do not flag its absence
and do not suggest creating it upfront. The `/domain-modeling` skill creates
them when a term or a decision actually gets resolved.

## File structure

This is a single-context repo. One glossary, one ADR directory, both at the
root, covering every app and package in the pnpm workspace:

```
/
├── CONTEXT.md
├── docs/
│   ├── adr/
│   │   ├── 0001-railway-postgres-workos.md
│   │   └── ...
│   ├── architecture.md
│   └── *-domain.md          per-domain command vocabulary
├── apps/
└── packages/
```

There is no `CONTEXT-MAP.md` and no per-package `docs/adr/`. A decision that
only affects one package still goes in the root `docs/adr/`.

## Use the glossary's vocabulary

When your output names a domain concept, in an issue title, a refactor proposal,
a hypothesis, or a test name, use the term as `CONTEXT.md` defines it. Do not
drift to a synonym the glossary avoids. Organization, not agency or tenant.
Profile, not user. Membership, not account.

If the concept you need is not in the glossary yet, that is a signal. Either you
are inventing language the project does not use, in which case reconsider, or
there is a real gap, in which case note it for `/domain-modeling`.

## Flag ADR conflicts

If your output contradicts an accepted ADR, say so rather than silently
overriding it:

> Contradicts ADR 0007 (shared sync descriptors), but worth reopening because...

Two ADRs need care. **0013 is accepted and built**: every identity write is a
domain command in the `identity.*` namespace, and `IDENTITY_FLOORS` is gone, so
an older note saying identity writes are REST routes is stale. **0014 amends
0007** rather than replacing it, so read both for sync.
