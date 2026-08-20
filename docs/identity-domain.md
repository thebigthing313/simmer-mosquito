# Identity domain decisions

Shared command, validation, offline, sync, location-source, and module-shape
rules live in `docs/domain-command-contract.md`. This file records identity
vocabulary and exceptions. Read ADR 0013 for why identity has a vocabulary at
all, and ADR 0005 and 0011 for the identity model these commands write.

## What is here, and what is not

Three commands, and they are the three identity writes that touch Postgres and
nothing else:

| command | table | floor |
| --- | --- | --- |
| `identity.updateOrganizationDetails` | `organizations` | admin |
| `identity.createProfile` | `profiles` | admin |
| `identity.updateProfile` | `profiles` | admin |

Four identity surfaces are still REST routes with floors in `IDENTITY_FLOORS`
(`apps/server/src/roles.ts`). `people.listMemberships` stays there: it is a read
behind a POST, and reads have never been commands. `people.changeRole`,
`people.endMembership` and `people.invite` are ADR 0013's slice 3, blocked on
whether an invitation can carry a client-generated membership id (#186).

Nothing here writes WorkOS. That is what made these three the ones to move
first: they need no part of the spanning-command rules.

## The agency's own row has two vocabularies, by shape

`organizations.name` and the mailing columns are
`identity.updateOrganizationDetails`. `organizations.settings` is seven
`organizationSettings.*` commands on their own routes.

The split is no longer a split in contract, only in mechanism: a JSON document
has no column diff to read an intent off, so the settings commands cannot go on
the per-table surface. See "The nine commands that are not on it" in the
contract.

## Field names

Every key both `/commands/organizations` and `/commands/profiles` read is a
column, with one exception. `expectedUpdatedAt` is `camelCase` because it names
no column: it is the `updated_at` the editor was looking at, and the server
answers `409 organization_conflict` when the row has moved since.

The check is worth stating plainly, because a false conflict is possible.
`updated_at` belongs to the row rather than to the field being edited, so a
colleague who changed the timezone while the details sheet was open is a
conflict too. That is the safe direction, and agency-level writes are rare
enough that the false conflict is rarer than the real one.

Sending no `expectedUpdatedAt` writes regardless, which is what an editor with
nothing to compare against does.

## A Profile created by command has no login

`identity.createProfile` writes `user_id: null`. That is a **historical**
Profile: somebody the agency attributes work to who never signed in, or who left
before SIMMER. Attaching a login is an invitation, which is a different floor and
a command that spans WorkOS.

There is no delete. A Profile is what records name, so the way to stop offering
one is `is_active`, which `identity.updateProfile` writes.

## Saving a Profile and a role is two writes

The People page edits both from one sheet, and they sit at different floors:
editing a Profile is admin, changing a role is owner. `profileSavePlan` in
`apps/web/src/hooks/mutations/use-profile-mutations.ts` decides which of the two
a save means, and an unchanged save must mean neither.

The trap is the role. It arrives from the unmatched side of a left join, so it is
nullish on a Profile with no login, while the picker shows `viewer` for one.
Comparing the picker to the role alone makes every historical Profile look
changed. `membershipId == null` is the question that answers it, and getting it
wrong is invisible until somebody loses access.

## The role ladder

`SimmerRole` is declared once, in `packages/domain/src/roles.ts`. `packages/db`
re-exports it; `packages/sync` must not import it, because a transport that knew
the domain vocabulary would be a second place the domain is described.

The ordering is not domain vocabulary. Which role outranks which is an
authorization question, and `apps/server/src/roles.ts` answers it with
`ROLE_RANK`, `hasAtLeastRole` and `canGrantRole`.
