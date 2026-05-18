# Admin App API Plan

`apps/admin` is the SIMMER operator SPA. It is a platform control plane for
SIMMER-owned setup and support workflows, not the place where agency admins
manage their agency's operational data.

SIMMER operator tooling should use the existing server control plane for writes
and selected Electric/TanStack DB shapes for broad read views where real-time
data helps.

## Access Model

- `/admin/*` endpoints require a SIMMER Operator session through `SIMMER_OPERATOR_EMAILS`.
- Route guards in the admin SPA are only for page flow. Every server endpoint still enforces operator authorization.
- Agency-scoped domain commands continue to require agency roles; SIMMER operators do not bypass normal agency workflows unless the endpoint is explicitly operator control-plane tooling.
- Organization-owned catalogs and workflows stay in agency-facing apps unless a
  future support or repair workflow is explicitly SIMMER-operated.

## Current Pages

- Auth: session check, sign-in, sign-out handoff through WorkOS AuthKit.
- Organizations: list agencies, create agency, view agency subscription/contact metadata.
- Organization users: agency-scoped memberships, staged invitations, roles, invite status.
- Mosquito taxonomy: global genera and species vocabulary curated by SIMMER operators.
- Units: global supported app units curated by SIMMER operators.

The protected admin shell uses an auth guard plus a sidebar layout. The index
route redirects to organizations until there is a real operator dashboard.

## Explicit Non-Goals

- Normal agency management of collection methods, lures, habitat types, tags,
  routes, vehicles, equipment, insecticides, formulations, contacts, service
  requests, regions, weather stations, missions, assignments, or field records.
- Bypassing agency roles for domain commands. A SIMMER operator who is also an
  agency member still acts through that agency membership for normal agency
  workflows.
- Broad direct database editing. Support/repair tools should be intentionally
  modeled and audited.

## Existing Control-Plane Endpoints

- `GET /auth/me`: current WorkOS/local identity.
- `GET /auth/login?returnTo=<admin-url>`: begin AuthKit and return to the admin SPA after callback.
- `POST /auth/logout`: clear the session.
- `GET /admin/organizations`: list agencies.
- `POST /admin/organizations`: create/link an agency and WorkOS organization.
- `GET /admin/organizations/:organizationId/memberships`: list agency memberships.
- `POST /admin/organizations/:organizationId/invitations`: invite or restage a membership.
- `GET /admin/organizations/:organizationId/foundations`: rough seeded/reference data inspection.
- `POST /admin/genera`, `POST /admin/species`: global taxonomy seed writes.
- `POST /admin/organizations/:organizationId/species`: enable agency species.
- `POST /admin/organizations/:organizationId/lookups/:kind`: create agency lookup rows.

## Add Next

- `PATCH /admin/organizations/:organizationId`: update subscription/contact metadata.
- `PATCH /admin/organizations/:organizationId/memberships/:membershipId`: change role, status, or default membership.
- `POST /admin/organizations/:organizationId/memberships/:membershipId/resend-invitation`: resend pending invitation.
- `GET /admin/genera`, `GET /admin/species`: list global taxonomy for the
  taxonomy page without requiring selected-agency foundation reads.
- `PATCH /admin/genera/:genusId`, `PATCH /admin/species/:speciesId`: update
  global taxonomy with historical relabel acknowledgements when referenced.
- `DELETE /admin/genera/:genusId`, `DELETE /admin/species/:speciesId`: delete
  unreferenced taxonomy rows.
- `GET /admin/units`: list global units.
- `POST /admin/units`, `PATCH /admin/units/:unitId`: create/update supported
  global units.

Seed/repair endpoints may still be useful later, but they should be framed as
operator support actions with dry-run/audit output rather than ordinary agency
catalog management.

## TanStack DB / Electric Use

- Keep `organizations`, `users`, and `memberships` on API reads for now because they are operator-wide control-plane data, not selected-agency app data.
- Use API reads for current admin pages unless real-time operator-wide views
  prove they need Electric. Global `genera`, `species`, and `units` may later
  use admin-scoped shapes because they are SIMMER-controlled data.
- Do not use selected-agency Electric shapes to turn agency-owned catalogs into
  normal SIMMER operator management surfaces.
- Add admin-only Electric shapes only when an operator view needs real-time broad reads and the shape can be safely scoped server-side.
- Writes should remain explicit command/control-plane endpoints that return transaction IDs when connected to TanStack DB optimistic mutations.
