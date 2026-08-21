# 13. Identity writes are domain commands

Date: 2026-08-18

## Status

Accepted, and **built** as of 2026-08-21.

Slices 1 and 2 landed (#168). `SimmerRole` has one declaration, in
`packages/domain`. The three writes that touch Postgres and nothing else are
commands: `identity.updateOrganizationDetails`, `identity.createProfile`,
`identity.updateProfile`, with the floors they had in `IDENTITY_FLOORS`
carried into `COMMAND_PERMISSIONS` unchanged.

Slice 3 landed in #204, and the invitation question #186 held is answered:
the client mints both ids. The four that span WorkOS are
`identity.invite`, `identity.reinvite`, `identity.changeRole` and
`identity.endMembership`, all on `/commands/memberships`. The namespace is
`identity.*` throughout — the `people.*` names below and in the older issues
were never shipped. `IdentityWriteSurface`, `IDENTITY_FLOORS` and
`denyIdentityWrite` are gone, `lib/identity-api.ts` with them, and all three
identity collections are `mutations: true`.

**A fourth spanning command exists that this ADR does not name.**
`identity.reinvite` is #186's answer to a question the ADR left open: a second
`identity.invite` is a retry to swallow, and a deliberate redo cannot be told
from one by any key, so the redo is its own command. See
`docs/domain-command-contract.md`, "Commands that span two systems", for the
six rules the four ship under — the four rules below are the ADR's original
statement of them, and the doc is the current one.

`hooks/mutations/rest-writes.ts` survives, against what "Consequences" says
below. It has one caller left, and it is not identity: the seven
`organizationSettings.*` routes need the same optimistic-row-and-txid
machinery and are not on the per-table surface either.

`people.listMemberships` is still `POST /organization/memberships/list`, with
a plain admin check on its own route. It is a read behind a POST, and reads
have never been commands. Nothing in `apps/web` calls it.

Supersedes the reasoning recorded in `IdentityWriteSurface`
(`apps/server/src/roles.ts`), which this ADR corrects rather than reverses.

## Context

SIMMER has two ways to write Postgres, and which one a table gets is not a
property of the table.

Ninety-five agency writes are **domain commands**: a name from
`AgencyCommandType`, a pure builder in `packages/domain` that validates it, a
floor read from `COMMAND_PERMISSIONS` before the body is parsed, and one
dispatch that commits it in a Kysely transaction. Seven are **identity writes**:
ordinary REST routes in `organization-commands.ts` and `profile-commands.ts`
that read a hand-rolled payload and write directly.

The split has never been written down as a decision. `roles.ts` gives a reason
in passing:

> They have no commands. A domain command is an intent a client generates,
> applies optimistically, and can safely replay. Identity writes are not that:
> they land in WorkOS *and* Postgres, and a replayed invitation or role change is
> a second grant rather than the same one.

That is true of one of the seven. Checked against the code:

| surface | writes WorkOS | replay-safe | client-generated id |
| --- | --- | --- | --- |
| `organization.updateDetails` | no | yes | n/a (singleton row) |
| `people.createProfile` | no | yes | **already** |
| `people.updateProfile` | no | yes | n/a |
| `people.listMemberships` | no | it is a read behind a POST | n/a |
| `people.changeRole` | yes | setting a role is idempotent | n/a |
| `people.endMembership` | yes | ending an ended one is a no-op | n/a |
| `people.invite` | yes | **no**: a replay is a second invitation | no |

The last row is what #186 answered, and the answer changed it: a replay is a
second invitation only while the server keys the row. With the client minting
the Membership id and the Profile id, a replay collides on the primary key and
the server hands back the row already there.

`createHistoricalProfileWithTxid` is a plain insert with `user_id: null`.
`PATCH /organization/current` is a plain update. Neither has ever touched
WorkOS, and `createProfile` already carries a client-minted UUID, the exact
property the command contract asks for.

So the stated reason disqualifies `people.invite`, and nothing else.

### What the split actually costs

**A hole in the floor.** `COMMAND_PERMISSIONS` is `Record<AgencyCommandType,
CommandPermission>`, so a command with no floor does not compile, and dispatch
reads the map before a handler runs. The identity floors are a parallel table
that each handler must remember to consult by hand. `roles.ts` says so:
"Adding a whole new route and never naming a surface does not [fail the build]
… It is a smaller promise, honestly kept." Ninety-five endpoints are guarded by
the type system; seven are guarded by convention.

**Two vocabularies on one row.** `organizations.settings` is written by seven
`organizationSettings.*` commands with per-command floors and DB validation.
`organizations.name` and the mailing columns beside it are an identity write.
Same table, same request, two contracts, which is the clearest sign the line
is not about the data.

**A second client seam.** `hooks/mutations/rest-writes.ts` exists only because
identity writes cannot go through `mutateCollection`. It reimplements what the
command path gets free: the transaction that moves the optimistic row, the txid
wait, and the suppression that makes an unchanged save send nothing.

**Validation that is harder to test.** A domain builder is tested in
`packages/domain` with no server harness. `readOrganizationPayload` had to be
exported purely so a test could reach it.

### The alternative that was considered and rejected

The floor hole can be closed on its own, without touching the vocabulary: make
route registration take the surface name, so a route without a floor is
unrepresentable. One helper, seven call sites.

That is cheaper and it does close the specific hole. It was rejected because it
buys safety and leaves the mental model split, and for a solo maintainer the
model is the expensive part. Two contracts means every future write starts with
"which kind is this", and the answer is a boundary nobody can derive from the
data.

## Decision

**Every agency write to Postgres is a domain command.** Identity gains a
vocabulary in `packages/domain` and joins `AgencyCommandType`, so
`COMMAND_PERMISSIONS` becomes total over every write SIMMER accepts.

One model covers every operation: *this is what I intended to do*, and the
server decides whether to do it. Nothing else about a write is the client's to
know: not the tables it touches, not the order, not whether a second system is
involved. That is already true of ninety-five writes; this makes it true of all
of them, and it is the reason to accept the costs below rather than the cheaper
fix above.

`people.listMemberships` does not join it, and is not an exception to it: it is
a read behind a POST, and reads have never been commands.

### A command may span WorkOS and Postgres

This is the part of the contract that changes, and it is the whole reason this
is an ADR rather than a refactor. Until now a command promised one Kysely
transaction. Three identity commands cannot promise that, because the grant a
session is refreshed against lives in WorkOS.

The rules for a command that spans both:

1. **Postgres is the ordering authority.** The row is written first for a
   create, and last for a revoke. `endMembership` already gets this right and
   its comment says why: revoking in Postgres first would leave somebody who
   reads as removed and can still sign in.
2. **The client-generated id is what makes the replay safe.** An invitation
   carries the `membershipId` it will create, so a replay collides on the
   primary key and the WorkOS call never fires a second time. Without that id a
   spanning command is not replay-safe and must not be built.
3. **No optimistic row for the half the client cannot see.** A spanning command
   may still apply optimistically to rows it fully determines; it must not
   invent a status that only WorkOS decides. The membership stream reflects the
   result once both have settled.
4. **A spanning command says so.** Its domain doc names the second system and
   what happens if that half fails, because a partial failure here is an access
   bug, not a data bug.

## Consequences

`packages/domain` acquires an identity vocabulary. It has never described
tenancy before, and this is a real widening of what that package is for, the
cost accepted in exchange for one contract.

`SimmerRole` was declared in `packages/db`, re-declared in
`packages/sync/src/rows/index.ts`, and twice more in each frontend under three
names. Domain command builders need it, so consolidating it was part of the work
rather than a follow-up: it now lives in `packages/domain/src/roles.ts`, `db`
re-exports it, and `sync` dropped its copy because sync must not depend on
domain. The ranking stays in `apps/server/src/roles.ts`, which is where
authorization is decided.

`lib/identity-api.ts` is deleted once the last surface moves, and
`rest-writes.ts` with it — except that it turned out to have a caller that is
not identity at all. See the status note above. `lib/collections/profiles.ts` and `organizations.ts` go back to
`mutations: true`, because `/commands/profiles` and `/commands/organizations`
will exist.

`IdentityWriteSurface` and `IDENTITY_FLOORS` are deleted with the last surface.
Until then they stay, and the floors they hold are the source for the
`COMMAND_PERMISSIONS` entries that replace them. The floors themselves are not
being revisited by this ADR, only where they are written down.

The three pure-Postgres writes move first. They need no new contract, so they
prove the shape before the spanning rules above are exercised on anything.

See `docs/domain-command-contract.md` for the contract this amends, ADR 0003 for
the command path itself, and ADR 0005 and 0011 for the identity model these
commands write.
