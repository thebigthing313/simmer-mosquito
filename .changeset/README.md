# Changesets

A changeset is one user-visible change, written for the people who use SIMMER.
`pnpm changeset` writes one here; `pnpm release:version` consumes every pending
one into `apps/web/CHANGELOG.md` / `apps/admin/CHANGELOG.md`. Those changelogs
are what the in-app `/changelog` pages render, so these files are product copy,
not commit messages.

A changeset is **not** how a version moves. Both apps bump on every promotion —
`pnpm release:version` writes the `patch` itself for an app nothing pending
named, and the release draws as a maintenance one. Write a changeset when a user
could notice the change, and never to make a number move.

See `docs/releases.md` for the full workflow: what earns a changeset, how to
write the body, and when versions are cut.

## Shape

```markdown
---
'@simmer-mosquito/web': minor
---

Added: Region filters on every map page, so you can scope a view to one district.
```

Two rules the formatter depends on:

- **Only the two apps are versioned.** Every other workspace package is in
  `ignore`. A change to `packages/ui-web` or `apps/server` is filed against the
  app whose surface it changes — often both, in one changeset.
- **The body starts with `Added:`, `Changed:`, or `Fixed:`.** That token becomes
  the heading on the changelog page. Without it the entry still appears, but
  ungrouped and above the rest — a sign the change was not described in terms of
  what a user can now do differently.
