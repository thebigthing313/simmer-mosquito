# Releases and changelogs

SIMMER is in production use by an agency. That changes what a version number is
for: it is no longer bookkeeping, it is the thing a support conversation starts
with. "Which build are you on, and what changed in it."

`apps/web` and `apps/admin` are versioned independently, both starting at
**0.1.0**. Every other workspace package is unversioned on purpose; see
"Only the apps are versioned" below.

## The branch flow

```
feature branch  ──▶  staging  ──▶  main (production)
```

- **All work happens on a branch.** Nothing lands directly on `staging` or
  `main`.
- **A branch that changes what a user can do carries a changeset.** Refactors,
  test additions, dependency bumps, tooling, and docs do not. The test is
  whether the change would mean anything to somebody using SIMMER, not whether
  it was hard, and not whether it touched a lot of files.
- **`staging` is where changes accumulate.** Pending changesets pile up in
  `.changeset/` unconsumed; the version number does not move.
- **Promotion to `main` is the release.** That is when `pnpm release:version`
  runs, the pending changesets are consumed into the two `CHANGELOG.md` files,
  and both app versions bump, **whether or not anything was pending**.

The version in an agency's sidebar therefore always names something they
actually have. A number that existed before anyone could use it would be a
worse lie than no number at all.

## A changeset is not a version bump

These are two different questions and only the first one is a judgement call:

|                | What it is for                 | When it happens                 |
| -------------- | ------------------------------ | ------------------------------- |
| **Changeset**  | An entry on the changelog page | Only when a user can tell       |
| **Version**    | Naming the build somebody is on | Every promotion, automatically |

A refactor that reaches production is a new build. Nobody needs to read about it,
but they may well have to *report* it, and "which version are you on" is where
a support conversation starts. If the number had not moved, two different builds
would answer to `0.2.0` and the answer would be worthless.

So `pnpm release:version` gives every app with nothing pending a `patch` bump of
its own, with no changelog entry attached. The release lands on the page as its
version, its date, and one line: *Maintenance release with no user-facing
changes.* That is the honest description of it, and the release writes it rather
than an author made to invent something to say.

Nothing about this changes what you do on a branch. Write a changeset when the
change is one a user could notice; don't when it isn't. The version takes care
of itself at promotion.

## Writing a changeset

```bash
pnpm changeset
```

Pick the app(s) the change is visible in, pick the bump, and write the entry.
The file lands in `.changeset/` and is committed with the work it describes.

**Bump:** `minor` for anything new or meaningfully different, `patch` for a fix.
`major` is a deliberate decision about the product, not something to reach for
because a change felt large.

**Body:** one line, starting with a category token, written for a user.

```markdown
---
'@simmer-mosquito/web': minor
---

Added: Region filters on every map page, so you can scope a view to one district.
```

The tokens are `Added:`, `Changed:`, and `Fixed:`, those three and no others.
They are what the changelog page groups by: changesets' own headings are the
semver bump ("Minor Changes"), which is developer vocabulary and is dropped
before the page draws.

An entry with no token still appears, above the grouped ones and under no
heading. That is deliberate on both counts. Losing it would silently drop a
change a user was told about; inventing a category for it would make a badly
written changeset look like a decision. A release drawing ungrouped entries is
a review miss, and reads like one.

The audience is agency staff, so `DESIGN.md`'s copy rules apply: say what the
thing does, don't explain the domain back to them, don't cite best practice.

To see what is pending on your branch:

```bash
pnpm changeset:status
```

## Cutting a release

On the branch that promotes `staging` to `main`:

```bash
pnpm release:version
```

That writes a `patch` changeset for any app nothing pending would bump, runs
`changeset version` (consuming `.changeset/*.md` into the changelogs and bumping
the two `package.json` versions), then stamps the new headings with today's
date. Commit the result, meaning the deleted changesets, the two changelogs, and
the two package.json bumps, then merge to `main`. The deploy inlines the new version
at build.

It is safe to run twice. The floor bump is skipped for an app whose version has
already moved past the one on `main`, so a second run, after another changeset
merged into the promotion branch, consumes that one without inventing a
second patch. A run with no commits since `main` bumps nothing at all.

Forgetting it is caught rather than shipped. The production deploy refuses a
push to `main` that leaves either app on the version it was already on, the same
way it refuses one with changesets still pending. A promotion that skipped this
step is one where two different builds answer to one number. A manual
`workflow_dispatch` deploy is exempt, because re-deploying a release already cut
is a legitimate second deploy of one version.

## Only the apps are versioned

Every package but `@simmer-mosquito/web` and `@simmer-mosquito/admin` is listed
in `ignore` in `.changeset/config.json`.

A change to `packages/ui-web` or `apps/server` still reaches users, but it
reaches them *through* an app, and the changelog is read by people who have
never heard of `packages/sync`. So a change is filed against the app whose
surface it changes, often both in one changeset. Versioning the packages too
would bump the apps as dependents and fill a user-facing page with "Updated
dependencies [a1b2c3]" lines, which is the failure mode this config exists to
avoid.

## How the page is powered

```
.changeset/*.md  ──changeset version──▶  apps/*/CHANGELOG.md  ──?raw──▶  /changelog
```

- `.changeset/changelog-simmer.mjs` formats each entry: the summary verbatim,
  no commit hashes, no dependency lines.
- `scripts/release-version.mjs` floor-bumps the apps no changeset named, and
  stamps the release date. Changesets has no hook for either.
- `packages/ui-web/src/lib/changelog.ts` parses the generated markdown into
  releases and regroups the entries by their category token. It is pure, and
  covered by `packages/ui-web/src/tests/unit/lib/changelog.test.ts`.
- `packages/ui-web/src/components/changelog` draws it. Both apps mount the same
  component, so the two consoles cannot drift into rendering the same file two
  different ways.
- Each app's route imports its own `CHANGELOG.md` with Vite's `?raw`, so the
  whole history is inlined at build. Production is a Caddy image with no Node
  process in it, so there is nothing to fetch this from at runtime, and
  `package.json` is not in the document root. The version in the sidebar is
  inlined the same way, via `__APP_VERSION__` in each `vite.config.ts`.
