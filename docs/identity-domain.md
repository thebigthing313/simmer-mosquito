# Identity domain decisions

Shared command, validation, offline, sync, location-source, and module-shape
rules live in `docs/domain-command-contract.md`. This file records identity
vocabulary and exceptions. Read ADR 0013 for why identity has a vocabulary at
all, and ADR 0005 and 0011 for the identity model these commands write.

## What is here, and what is not

Seven commands, split by whether they settle anything outside Postgres.

Three do not, and they moved first for that reason: they need no part of the
spanning-command rules.

| command | table | floor |
| --- | --- | --- |
| `identity.updateOrganizationDetails` | `organizations` | admin |
| `identity.createProfile` | `profiles` | admin |
| `identity.updateProfile` | `profiles` | admin |

Four do, because the grant a session is refreshed against lives in WorkOS. All
four are on `POST|PATCH|DELETE /commands/memberships`, and they ship under the
six rules in `docs/domain-command-contract.md` -> "Commands that span two
systems".

| command | verb | floor |
| --- | --- | --- |
| `identity.invite` | POST | admin |
| `identity.reinvite` | PATCH | admin |
| `identity.changeRole` | PATCH | **owner** |
| `identity.endMembership` | PATCH | admin |

Three of those four name a role, and a floor cannot settle what that costs: it
compares the actor to a rung, and the escalation to refuse compares the actor to
the *payload*. `assertCanGrantRole` in `apps/server/src/membership-commands.ts`
is where that lives, and `tests/unit/table-commands/role-escalation.test.ts`
derives the role-bearing commands from the intent map rather than listing them,
so a fifth added without the check fails on the day it is written.

**`identity.endMembership` is a PATCH, not a DELETE.** Ending access sets
`status` to `inactive`; the row survives, because it is the only record that
access was ever held. A DELETE would take the person off the People page and
sync would put them straight back.

Only `identity.changeRole` and `identity.endMembership` are written through the
`memberships` collection. Inviting and re-inviting settle whether a mail was
delivered, which is the half the contract refuses an optimistic row for, so
`apps/web/src/hooks/mutations/use-membership-mutations.ts` posts those two
directly and waits on the txid the server answers with.

`people.listMemberships` is not one of them. It is a read behind a POST, and
reads have never been commands. It keeps an admin floor as a plain role check on
its own route, which is what let `IdentityWriteSurface`, `IDENTITY_FLOORS` and
`denyIdentityWrite` be deleted rather than kept alive for one caller. Nothing in
`apps/web` calls it: the People page reads its people from the `profiles` and
`memberships` collections over sync.

## An Invitation is two rows, and the client keys both

Inviting somebody writes a Membership at `invited` status, and a Profile for it
to point at when the invite is for a new person rather than a historical one.
The invite dialog already knows which of those it is asking for, so the client
mints both ids and sends them. Keying only the Membership would leave a retry
able to mint a second Profile.

The second system is WorkOS, and it is called after the Postgres transaction
commits. A failure between the two leaves a Membership at `invited` with no
invitation mail sent, which reads on the People page as somebody invited who
never got a link. The repair is a re-invitation, and it is the safe direction.
The other order sends a working link to somebody the agency has no row for.

`identity.reinvite` is a separate command because a second call to
`identity.invite` cannot be both a retry to swallow and a deliberate redo. It
overwrites the Membership's role and invitation, then revokes the WorkOS
invitation it replaced. Failing between those two leaves the previous link live,
which is why the revoke goes last. An operator who lowered somebody's role and
saw an error can re-run it, where the reverse would have already killed the only
link the person holds.

The People page names both effects on the invited row before it fires: the
address, the role it will set, and that the earlier link stops working. The
dialog is the confirmation and there is no step after it, and the control is only
drawn on a Membership still at `invited` — an active member has no link to
replace, and an ended one is a fresh invitation.

`workos_invitation_id` may be `null` on a row that was invited. #207 answers a
failed stamp with the Membership unstamped and one log line carrying the id, so a
re-invitation there has nothing to revoke. That is not an error and must not
block the re-invitation; it mails the replacement and leaves nothing behind.

## The agency's own row has two vocabularies, by shape

`organizations.name` and the mailing columns are
`identity.updateOrganizationDetails`. `organizations.settings` is seven
`organizationSettings.*` commands on their own routes.

The split is no longer a split in contract, only in mechanism: a JSON document
has no column diff to read an intent off, so the settings commands cannot go on
the per-table surface. See "The nine commands that are not on it" in the
contract.

## An agency address is US-shaped

Two fields on `identity.updateOrganizationDetails` enforce it. `mailingRegion`
is upper-cased and must be one of the 51 state and district codes.
`mailingCountry` is upper-cased and must be `US`. Either one can be `null`,
because an agency that has not filled its address in is not an error, but
neither can name somewhere else.

The reason is that SIMMER does not expect an agency outside the US. A mosquito
control district is a US institution, and the assumption is already load-bearing
elsewhere: the agency timezone picker offers US zones only. Until this rule the
constraint lived in three places and was stated in none, as a set of state codes
in the domain, a hardcoded `'US'` in the web mutation plan, and a fixed option
list in the details form. The country column was the one that had never been
told, so a direct API caller could write an address in a state of somewhere
else.

A non-US agency would need more than widening these two checks. The region list
is US states, the timezone picker is US zones, the postal code is validated at
20 characters of anything, and no field carries a locale. Whoever takes that on
should read this section first and treat it as the record of why the support
does not exist yet.

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
