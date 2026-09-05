# Releases and changelogs

SIMMER is in production use by an organization. That changes what a version
number is for: it is no longer bookkeeping, it is the thing a support
conversation starts with. "Which build are you on, and what changed in it."

`apps/web` and `apps/admin` are versioned independently, both starting at
**0.1.0**. Every other workspace package is unversioned on purpose; see
"Only the apps are versioned" below.

## The branch flow

```
feature branch  ──▶  develop  ──▶  staging  ──▶  main (production)
                                  ▲ the release is cut here
```

- **All work happens on a branch.** None of the three protected branches takes a
  direct push, with the one exception described below.
- **`develop` is where work accumulates.** It is the default branch and the base
  every feature branch PRs into. It deploys nothing: `railway-deploy.yml` names
  only `staging` and `main`, so a merge into `develop` runs CI and stops there.
- **A branch that changes what a user can do carries a changeset.** Refactors,
  test additions, dependency bumps, tooling, and docs do not. The test is
  whether the change would mean anything to somebody using SIMMER, not whether
  it was hard, and not whether it touched a lot of files. The `Changeset filed
  (or declined)` check asks only PRs based on `develop`, because that is the one
  shape where a changeset has not been written yet.
- **`develop` to `staging` is the release cut.** That PR carries the run of
  `pnpm release:version`: the pending changesets consumed into the two
  `CHANGELOG.md` files, and both app versions bumped, **whether or not anything
  was pending**. Merging it deploys the Railway `staging` environment, and what
  is soaking there is a numbered release candidate.
- **`staging` to `main` is a fast-forward push.** No merge commit, no second
  build, no reordering. What ships to production is the commit that soaked. It
  is not forced, and that is load-bearing rather than a detail of phrasing: a
  plain push only lands when `main` is behind `staging`, so git itself refuses
  to overwrite a hotfix that has not merged back.

`main` is the one branch whose ruleset does **not** require a PR, and that is a
decision rather than an oversight. GitHub's merge button cannot fast-forward, so
requiring a PR means requiring a merge commit, and a merge commit is a tree no
environment has run. The promotion is a push:

```bash
git fetch origin
git push origin origin/staging:main
```

`main` blocks deletion and force pushes, and requires the same seven checks as
the other two branches. It carries an admin bypass, but that bypass is a way out
rather than part of the promotion: a fast-forward onto an unchanged `main` trips
no rule and prints no bypass notice.

The first promotion did print one, and neither half of it was a fault:

```
remote: Bypassed rule violations for refs/heads/main:
remote: - Cannot force-push to this branch
remote: - This branch must not contain merge commits.
```

**The force push was a one-off.** `main`'s tip was the merge commit of the last
release under the two-branch flow, where the promotion was GitHub's merge
button. `staging` did not contain that commit, so that one promotion was not a
fast-forward. Both of its parents were already on `staging` and no ordinary
commit was dropped. Every promotion since is a clean fast-forward, so a
force-push notice now means the two branches have diverged, and is worth
stopping for rather than bypassing.

**The merge-commit violation was permanent, and it is why `main` no longer
requires linear history.** `develop` and `staging` both require a PR, GitHub's
merge button writes a merge commit, and `main` fast-forwards to whatever
`staging` holds. So the rule fired on every promotion by construction, and a
rule bypassed every time enforces nothing while burying the notice that would
mean something. Nothing else read it: `develop` and `staging` never required it,
and no workflow or script asks about it.

The two release gates are not a third reason, though this document used to say
they were. `Changeset filed (or declined)` and `Release cut (or declined)` are
`pull_request`-only jobs, so on a push they report `skipped` rather than no run
at all, and GitHub counts a skipped required check as satisfied. The promotion
commit already carries all seven checks from its push to `staging`, so the
status-check rule passes on the promotion without a bypass.

## A version names the candidate, not the shipped build

This inverts what this document used to say, so the old reasoning is worth
stating before the new one. Under the two-branch flow the cut happened on the
promotion to `main`, and the argument was that a number nobody could yet be on
would be a worse lie than no number at all: the version in the sidebar always
named a build an organization actually had.

The soak is what changed it. A release candidate now sits on `staging` for days
in front of organization staff trying it against a clone of their own data, and
a bug they report has to be reportable. "The one on staging" stops being an
answer the moment there have been two candidates. So the number is minted at the
cut and names the candidate from that moment, and `main` fast-forwards a number
that already exists.

The cost is real and small. Between the cut and the promotion there is a version
production is not on, and a candidate that gets fixed before it ships takes its
changelog entry with it. What that buys is one question with one answer in every
environment.

## A changeset is not a version bump

These are two different questions and only the first one is a judgement call:

|                | What it is for                  | When it happens           |
| -------------- | ------------------------------- | ------------------------- |
| **Changeset**  | An entry on the changelog page  | Only when a user can tell |
| **Version**    | Naming the build somebody is on | Every cut, automatically  |

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
of itself at the cut.

## Writing a changeset

```bash
pnpm changeset
```

Pick the app(s) the change is visible in, pick the bump, and write the entry.
The file lands in `.changeset/` and is committed with the work it describes.
`baseBranch` in `.changeset/config.json` is `develop`, so `pnpm changeset:status`
compares against the branch you actually branched from.

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

The audience is organization staff, so `DESIGN.md`'s copy rules apply: say what
the thing does, don't explain the domain back to them, don't cite best practice.

To see what is pending on your branch:

```bash
pnpm changeset:status
```

## Cutting a release

The cut belongs to the `develop` to `staging` PR, and it cannot be committed
there. That PR's head is `develop`, which takes no direct pushes, so the cut
reaches `develop` the way every other change does:

1. Branch off `develop`. Run `pnpm release:version` and commit what it writes:
   the deleted changesets, the two changelogs, and the two `package.json` bumps.
2. PR that branch into `develop` and merge it. The changeset gate stays quiet on
   its own, with no label needed, because a cut touches no `*/src/*`.
3. Open the `develop` to `staging` PR. It now carries the cut, and
   `Release cut (or declined)` reads it.

```bash
git fetch origin
git switch -c release/0.7.0 origin/develop
pnpm release:version
git commit -am "chore: cut web 0.7.0 and admin 0.6.0"
```

`scripts/release-version.mjs` writes a `patch` changeset for any app nothing
pending would bump, runs `changeset version`, then stamps the new headings with
today's date. The deploy inlines the new version at build.

It is safe to run twice **on the same cut**. The floor bump is skipped for an
app whose version has already moved past every numbered branch, so a second run,
after another changeset merged into the release branch, consumes that one
without inventing a second patch.

Two branches carry a number, not one, and the script reads both. `staging` holds
the candidate and `main` holds what production is on. Reading only `main` would
let a second cut into `staging`, before the first candidate promotes, hand an
app with no changeset the number that candidate already answers to.

## The two gates

Both live in `ci.yml` and both are required checks on all three branches.

- **`Changeset filed (or declined)`** fails a PR based on `develop` that moves
  app-visible source with no changeset. Override with the `no changeset` label,
  then re-run the job. It exits 0 on any other base.
- **`Release cut (or declined)`** fails a PR based on `staging` that leaves
  changesets unconsumed, or leaves either app on the version it was already on.
  Override with the `release cut declined` label. It exits 0 on any other base.

They used to sit on the production deploy in `railway-deploy.yml`. They moved
because the risk moved: by the time `main` fast-forwards, the numbers are days
old and a gate on that push is trivially true.

**On a push, both report `skipping`.** They carry
`if: github.event_name == 'pull_request'`, so only the PR run has anything to
say, and the PR run is the one the rulesets read. A `skipping` sitting next to
six passes on a merge commit looks red and is not a required check going
missing.

Neither job skips itself on a base it has nothing to say about. It runs, prints
why it has nothing to say, and exits 0. A required check that reports no run at
all blocks the merge forever, which is worse than a wasted runner minute.

## The hotfix path

A production bug that cannot wait for the candidate on `staging` gets its own
version off `main`. This is the ugly corner of the flow and worth naming as one:
it is the only path where two release lines exist at once, and every awkward
part below follows from that.

1. Branch from `main`.
2. Fix it. File a changeset if a user can tell.
3. Run `pnpm release:version` on the branch and commit the cut with the fix.
4. PR into `main`. The changeset gate exits 0 there, because the changeset is
   consumed already.
5. Merge it, and `railway-deploy.yml` ships it.
6. **Merge `main` back into `staging`, then `staging` into `develop`, as the
   last step of the fix.** Not optional and not later: until that happens the
   fix is on no other branch. Both branches require a pull request, so this is
   two of them, and each trips a gate that is correct to decline:

   ```bash
   gh pr create --base staging --head main  --label 'release cut declined'
   gh pr create --base develop --head staging --label 'no changeset'
   ```

Three things to expect on the way back.

**The changelogs conflict, and both sides are right.** The hotfix wrote `0.5.1`
against `main`'s history while the candidate wrote `0.6.0` against `staging`'s.
Keep both entries, in version order, and resolve nothing away.

**Do not re-run `pnpm release:version` on a hotfix branch.** The first run is
correct: the branch sits at `main`'s version, below the candidate soaking on
`staging`, so it takes its floor bump. A second run sees the same thing, because
the branch is still below that candidate, and bumps again. The guard that makes
a re-run safe on an ordinary cut compares against the highest numbered branch,
and on a hotfix that is never this one (#375).

**Skipping step 6 is caught, in two different ways and neither of them early.**
The first merge is caught hard. The promotion is a plain push, so a `main`
holding a fix `staging` lacks is not behind and git rejects it: the production
fix cannot be quietly overwritten, and the one way past that is to type
`--force`, which is why this document no longer calls the promotion forced. What
that rejection cannot do is say why, and it arrives days later, after a
candidate has already soaked and taken a version number.

The second merge was caught by nothing. `develop` goes on building against code
the fix never reached, the next cut carries that gap into `staging`, and the fix
dies the day somebody resolves a conflict in its file the other way.

So `Release cut (or declined)` reads both, on the `develop` to `staging` PR,
ahead of the cut rather than after it (#412). The test is
`git cherry origin/develop origin/main`: commits reachable from `main` and not
from `develop`, merges dropped, the rest compared by patch id. Dropping the
merges is what keeps it quiet, because `main` is always a promotion merge commit
`develop` does not carry and a plain reachability test would fire on every cut.
A hotfix is the only thing that can produce a `+` line.

Nothing has run this path yet. Read step 6 as the part to get right.

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
