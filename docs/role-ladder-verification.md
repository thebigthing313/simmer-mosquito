# Verifying the Role Ladder

How to check, by hand, that SIMMER refuses what it says it refuses.

The ladder is enforced in `apps/server/src/command-permissions.ts` and mirrored
in `apps/web/src/lib/write-access.ts`. Both are unit-tested, and the reads the
ownership rules depend on are covered against Postgres in
`apps/server/src/command-authorization.integration.test.ts`. None of that
exercises the thing a person does: sign in, click, and be refused — which is how
the reordering bug in #36 was found in the first place.

## Fixtures

```sh
# Against whichever database the app you are testing is pointed at.
pnpm --filter @simmer-mosquito/db seed:role-ladder
```

Idempotent, and worth re-running before a session: the expired comment and the
stale control action are backdated from *now*, so a stale seed leaves them
drifting further out of the correction window rather than sitting just past its
edge.

It creates one organization ("Role Ladder Test District") with six profiles —
Owner, Admin, Manager, **two** Collectors, and Viewer. Two collectors, because
every ownership rule has a "somebody else's" case, and using the Manager's
profile for that would conflate *not yours* with *not your role*.

## Accounts

The seed cannot create the logins. Identity lives in WorkOS, so each account has
to exist there first; the seed links one when you give it the id:

```sh
SIMMER_ROLE_LADDER_COLLECTOR=user_01ABC… \
SIMMER_ROLE_LADDER_MANAGER=user_01DEF… \
  pnpm --filter @simmer-mosquito/db seed:role-ladder
```

Anyone without an id still gets a profile and an **invited** membership. That is
enough to be an assignee, to author a comment, and to be the subject of an
API-driven check — it is only the browser half that needs the account.

The two that matter most are **Collector** and **Manager**. Owner and Viewer are
the two halves already verified (2026-08-04, #36), and Admin differs from Owner
only where a command names the `admin` floor.

## What the fixtures are for

Each row exists because a rule turns on it. Ids are printed by the seed and
exported from `packages/db/src/seeds/role-ladder.ts` as `roleLadderIds`.

| Fixture | The rule it exercises |
|---|---|
| `ownAssignmentId` | assigned to the Collector — they may start and complete it |
| `otherAssignmentId` | assigned to the *other* Collector — 403 `Collectors can only work assignments assigned to them.` |
| `unassignedAssignmentId` | assigned to nobody — also 403, and the case most likely to be missed |
| `mixedAssignmentId` | started, one stop pending — `completeAssignment` refuses with `assignment_items_pending` |
| `emptyAssignmentId` | started, no stops — refuses with `assignment_has_no_items` |
| `freshCommentId` | the Collector's own comment, inside the window — they may edit it |
| `expiredCommentId` | their own comment, backdated 45 days — 403 `Comments can only be changed by their author for 30 days.` **Cannot be produced by clicking.** |
| `otherAuthorCommentId` | somebody else's comment — 403 |
| `ownActionId` | a source reduction the Collector performed yesterday — theirs to correct |
| `staleActionId` | one they performed 45 days ago — outside the correction window |
| `otherActionId` | one somebody else performed |

## The checks

### As a Collector

Allowed:

- start and complete `ownAssignmentId`, and complete/skip/reopen/unskip its stops
- `selfAssignRoute` on today's route
- record an inspection, a collection, a chemical application, a source reduction
- add a comment; edit or delete `freshCommentId`
- create an address; update a habitat's name, description, and accessibility
- correct `ownActionId`

Refused, with a reason:

- start or complete `otherAssignmentId` or `unassignedAssignmentId`
- `createAssignment`, `moveRouteItems`, `createTag`, `pinComment`
- edit `expiredCommentId` (their own, too old) or `otherAuthorCommentId`
- correct `staleActionId` or `otherActionId`
- create a trap, a habitat, a region, a contact, or a service request
- anything in the owner/admin catalogs (collection methods, lures, habitat
  types, insecticides, formulations, notification types)
- delete any control action — manager-and-above in code, stricter than the
  domain doc, pending #63

Worth checking in the browser as well as through the API: after #49 the UI
should not *offer* any of the refused ones. A 403 that only appears on save is
the bug #49 fixed, not the ladder working.

### As a Manager

Everything the Collector needs ownership for should be allowed outright —
including correcting another person's assignment and another person's comment.
Confirm the ownership check is genuinely skipped rather than passing by
accident: a Manager acting on `otherAssignmentId` and on `expiredCommentId` both
succeed.

Refused: the owner/admin catalogs above. This is the rung that did not exist
before #50, so it is the one most worth checking.

### As an Admin

As Manager, plus the owner/admin catalogs.

## The one gap the fixtures cannot close

`Start` and `Complete` on an assignment are shown to any Collector, because
whether they may use them depends on who the assignment is assigned to — an
ownership question only the server can settle. A Collector opening
`otherAssignmentId` will see both buttons and be refused on click. Fixing that
properly needs an assignee-aware client check; noted in #49's closing comment.
