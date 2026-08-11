# Changesets

A changeset is one user-visible change, written for the people who use SIMMER.
`pnpm changeset` writes one here; `pnpm release:version` consumes every pending
one into `apps/web/CHANGELOG.md` / `apps/admin/CHANGELOG.md` and bumps the app
versions. Those changelogs are what the in-app `/changelog` pages render, so
these files are product copy, not commit messages.

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
- **The body starts with `Added:`, `Changed:`, `Fixed:`, or `Removed:`.** That
  token becomes the heading on the changelog page. Without it the entry lands
  under "Other changes", which is a sign the change was not described in terms
  of what a user can now do differently.
