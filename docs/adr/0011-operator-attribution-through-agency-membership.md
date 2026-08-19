# ADR 0011: Operators write on an agency's behalf through a Membership in it

Status: Accepted

Date: 2026-08-09

## Context

`apps/admin` is the SIMMER **operator** control plane, not agency
administration. `docs/architecture.md` scopes it to organization creation and
support, invitations, global taxonomy, global units, and *agency foundation
bootstrapping* — regions, addresses, method/lure/habitat lookups, enabled
species, and first traps.

That last group is the problem. `apps/server/src/admin-foundations.ts` writes six
tables that `apps/web` also writes to, and it does not import
`@simmer-mosquito/domain` at all: it calls the `packages/db` writers directly
(#120). So the same row can be created by two paths validated by two different
sets of rules — the domain builders on the agency side, and a dozen hand-written
payload readers on the operator side.

Routing the operator writes through the domain builders is straightforward
mechanically, and blocked by one question that is not mechanical at all. Every
agency command carries `actorProfileId`, and
`validateAgencyCommandContext` requires it to be a UUID. A SIMMER Operator
bootstrapping an agency has no Profile in that agency. Today they write with no
attribution whatsoever — `admin-foundations.ts` contains neither the word
"profile" nor "actor", so every row it creates has a null
`created_by_profile_id`.

Three facts constrain the answer:

- **The audit columns are profile ids, not user ids.** Every affected table
  carries `created_by_profile_id` / `updated_by_profile_id` referencing
  `profiles`. `users` is referenced only by `profiles.user_id` and
  `memberships.user_id`.
- **`actorProfileId` is the recorder, not the performer.** It always lands in the
  audit pair, and it additionally *defaults* the domain actor field on surfaces
  that have one (`actorDefaultProfileId(input.applicatorProfileId,
  input.actorProfileId)`). None of the six tables in question has a domain actor
  column, so on this path it only ever means "who recorded this".
- **Identity resolves from the session's organization.**
  `resolveActiveLocalAuthIdentity` matches the sealed session's
  `workos_organization_id` against `organizations`, then requires an active
  membership and an active profile. A SIMMER-side membership alone does not
  produce an `AuthContext` for an agency the operator is not signed into.

## Decision

**An operator may not write on an agency's behalf until they are a member of it.**

Concretely: before performing foundation bootstrapping for an agency, the
operator holds a membership in that agency with role `admin` — a WorkOS
organization membership, a SIMMER `memberships` row, and the org-scoped
`profiles` row that comes with it. They then switch into that organization and
use the **ordinary agency routes**, with an ordinary `AuthContext` resolved the
ordinary way.

This is not a new attribution mechanism. It is the existing one, applied to
operators: ADR 0005 already models a Profile as an org-scoped person used for
attribution, and a membership as the current access relationship. An operator
doing agency work is a person doing agency work.

### What this replaces

The six agency-owned surfaces in `admin-foundations.ts` — addresses, region
folders, regions, organization lookups, organization species, traps — are
removed rather than rewritten. With the operator carrying an ordinary
`AuthContext`, `apps/admin` calls the same endpoints `apps/web` calls, and the
domain builders, the role ladder, and `CommandError` handling all apply without
anything being ported. The nine payload interfaces, twelve payload readers, and
ten primitive readers at `admin-foundations.ts:398-836` go with them.

### What deliberately stays operator-side

- **Global taxonomy and units** (genera, species, units). SIMMER-controlled
  catalogs with no agency-side route at all, and no agency membership is
  relevant to them. `command-permissions.ts` already records why they are mapped
  to `admin` rather than left unmapped.
- **People management** (`admin-invitations.ts`). Agency-side, every people route
  is owner-only (`requireOwner` in `profile-commands.ts`: create profile, update
  profile, list memberships, change role, send invitation). Granting an operator
  `owner` in a customer's agency in order to send an invitation is a much larger
  claim than the work requires, so invitations remain on the operator path behind
  the email allowlist.
- **Organization creation and support.** Pre-membership by definition.

This division is why the role floor is `admin` and not `owner`: the scoped job —
foundation bootstrapping — needs nothing owner-only, and the operator surfaces
that *do* need owner-level reach are exactly the ones staying operator-side.

### The bootstrap edge

The operator's own membership in an agency is created through the operator path,
not the agency path. That is not circular, it is the edge case the operator
control plane exists for: a brand-new agency has no owner to invite anyone, so
`admin-invitations.ts` — already gated by the allowlist — is where the first
memberships come from, including the operator's own.

### Offboarding

A membership granted for a support engagement ends when the engagement ends. The
lifecycle had to exist before the first one was granted, or they would
accumulate silently and invisibly (#129).

Building it found that nothing in SIMMER ended a membership of *any* kind: no
writer set `inactive`, no delete existed, and the "the agency can already remove
them" this ADR relied on was not true. So the lifecycle below is the whole of
it, for operators and ordinary members alike.

**The agency ends it.** An owner or admin removes the member from their own
people list — the same place they invited them from. Not a SIMMER-side "leave
agency" action and not an expiry: the agency is who knows the engagement is
over, and it is their people list the membership is cluttering. An expiry
default remains worth having and needs a scheduler this workspace does not have.

**Deactivated, in both systems.** The SIMMER membership goes to `inactive` and
the WorkOS organization membership is deactivated with it. WorkOS is what
actually revokes reach — a session is refreshed against a WorkOS membership, so
a SIMMER row alone stops nothing — and it goes first, because ending the SIMMER
row and then failing would leave somebody who reads as removed and can still
sign in. Keeping both rows keeps the record that access was held, which is the
only place that history lives.

**The floor is the people floor, with the invitation's bound.** Removal is
onboarding in reverse, so an admin may do it; nobody may remove above their own
role, or "admins may remove" would be "admins may remove every owner". Two
further refusals: nobody removes themselves, and the last active owner stays —
an agency with no active owner cannot hand out a role or invite a replacement.

Attribution survives offboarding: `created_by_profile_id` points at the profile,
which is not deleted with the membership. A row bootstrapped by an operator who
has since left still names them. The profile also stays assignable as field
history; what ends is the login's reach, not the person.

One defect came with this. Sign-in provisioning reused any existing membership
and set it back to `active` with its old role, so a removal would have lasted
exactly until the next sign-in. `resolveMembershipProvisioning` now answers
`revoked` and the caller returns the same no-organization identity a user who
was never a member gets.

## Consequences

- **Operator writes become attributable to a person.** Six tables stop producing
  rows with a null `created_by_profile_id`.
- **One write path per table.** The property #120 says is missing — that nothing
  downstream can tell which path produced a row — stops mattering, because there
  is only one.
- **Operators are visible to the agency.** They appear in the people list with an
  `admin` role, and the agency can remove them. This is intended, and it is the
  honest reading of "someone from SIMMER edited your data".
- **`apps/admin` needs an organization switcher.** Operator work on an agency's
  records stays in the operator console rather than moving to `apps/web`: it is
  operator work, and the console is where the operator already is. So the console
  gains a way to enter an agency, and the session it holds while inside is an
  ordinary agency session. WorkOS supports this through a refresh with an
  explicit organization, which `packages/auth` does not expose yet — that
  capability is the first thing this decision requires and it did not previously
  exist anywhere in the workspace.
- **Support requires a real WorkOS organization membership per agency.** Adding
  and removing those is now part of the support workflow rather than an
  allowlist entry, which is slower and deliberately so.
- **Operators inherit the role ladder** on everything they do through agency
  routes, including its refusals. An operator with `admin` cannot do owner-only
  work in that agency, which is the point.
- **The email allowlist keeps its remaining job.** It gates the operator console
  and the surfaces that stay operator-side; it stops being a bypass of the
  ladder for agency data.
- The `readRequiredText` that is literally `return readOptionalText(value)`
  (`admin-foundations.ts:794-796`) is deleted rather than fixed, along with the
  rest of the local readers. `pnpm fallow dead-code` gates unused exports at zero
  and will confirm nothing still calls them.

## Alternatives considered

**A designated system Profile per agency.** Each agency gets a loginless "SIMMER
Operator" profile, created on demand inside the write transaction. This keeps the
domain contract untouched and makes an operator-created row tellable from an
agency-created one. Rejected because it invents a second kind of actor to avoid
using the one ADR 0005 already defines, and because "SIMMER did this" is less
useful than the name of the person who did it.

**Operator-context variants of the six builders.** Extend the domain's existing
`OperatorCommandContext` (currently `operatorUserId` only) to carry
`organizationId`, and give each affected table an operator-context builder beside
its agency one. Rejected because it doubles six builders, leaves
`created_by_profile_id` null, and preserves the two-paths-one-table shape that
#120 is about.

**Relaxing `actorProfileId` to optional.** The smallest diff, and the wrong
direction: it weakens a required field for every caller, including `apps/web`, to
accommodate one caller that should not have needed the exemption.

**Resolving the target organization's membership server-side**, keeping the
operator routes but deriving an `AgencyContext` from the operator's membership in
the `:organizationId` target rather than the session's organization. This avoids
the org switcher. Rejected because it adds a second identity-resolution path
keyed on a path parameter rather than the session, and because operator writes
would still enter through `operatorAuthContextMiddleware` and so still bypass the
role ladder — most of what this ADR is trying to end.
