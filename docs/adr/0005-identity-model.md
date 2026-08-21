# ADR 0005: User, Organization, Profile, and Membership identity model

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

Invitations support two profile paths:

- create a new org-scoped profile and invited membership for a person who has
  not yet been represented in SIMMER
- attach an invited membership to an existing login-less profile by `profileId`
  so imported or historical records keep pointing at the same profile after the
  person accepts access

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
- Operator-managed invitations can also target an existing login-less profile.
  The lazy login path links the WorkOS user to that profile, activates the
  invited membership, and preserves historical attribution.
