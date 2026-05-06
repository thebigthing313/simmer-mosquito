# ADR 0005: User, Organization, Profile, and Membership Identity Model

Status: Accepted

Date: 2026-05-06

## Context

The previous SIMMER work had a profile that belonged to exactly one
organization. That supported historical attribution, but it did not support a
single login user belonging to multiple agencies.

SIMMER needs both multi-organization users and stable org-scoped attribution for
historical field data.

## Decision

Model identity with four tables:

- `users`: global login identities linked to WorkOS users.
- `organizations`: SIMMER agencies linked to WorkOS organizations.
- `profiles`: org-scoped people used for historical/domain attribution. They
  can exist without login access.
- `memberships`: current access relationship between a user, organization,
  profile, role, and status. Memberships may start as invited records before a
  WorkOS user accepts the invitation.

Domain records reference profiles for provenance and audit.

## Consequences

- A user can belong to multiple agencies.
- Agencies can keep historical attribution when memberships change.
- Non-login staff, seasonal workers, imported personnel, and contractors can be
  represented as profiles.
- Auth/session state resolves to a selected organization, profile, membership,
  and role.
- Operator-managed invitations can create org-scoped profiles and invited
  memberships before login. The lazy login path activates the invited membership
  and preserves its SIMMER role.
