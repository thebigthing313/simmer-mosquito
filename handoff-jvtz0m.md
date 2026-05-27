# Handoff: Org-Scoped Sync Architecture and Insecticide Batch Follow-Up

## Next Session Focus

Document and implement the architectural decision that SIMMER org-owned rows should generally carry `organization_id` directly, even when tenant ownership is derivable through a parent table. This is especially important for TanStack DB + Electric shape sync because most future collections are expected to be on-demand and subset-heavy.

Suggested skills:
- `diagnose` if continuing from sync/runtime errors.
- `impeccable` if touching the insecticides UI or other setup-list presentation.
- `improve-codebase-architecture` if turning this into broader schema guidance or ADR work.

## Current Decision

Default rule:

```text
If a row is tenant-owned, store organization_id on the row.
```

Parent foreign keys still express domain relationship, for example `insecticide_batches.insecticide_id`. `organization_id` expresses tenant boundary, authorization scope, Electric shape scope, and indexing strategy.

Rationale:
- Electric shape `where` clauses cannot use cross-table subqueries.
- TanStack DB live queries can join/filter local collections, but they do not replace the server-side Electric shape authorization boundary.
- On-demand collections will generate many subset requests. Shape routes should be authorization-aware subset brokers, not generic table proxies.
- Direct `organization_id` keeps common shapes stable:
  ```sql
  organization_id = $1 and deleted_at is null
  ```
- Without direct org scope, each child collection needs a parent-scoped route and server-side parent ownership validation.

Tradeoff:
- Direct `organization_id` is denormalized when ownership is derivable.
- Commands, migrations, and possibly constraints/triggers must keep child `organization_id` consistent with parent ownership.

## What Was Changed In This Session

Relevant files:
- `packages/sync/src/index.ts`
- `apps/web/src/sync/collections.ts`
- `apps/web/src/sync/collections.test.ts`
- `packages/sync/src/index.test.ts`
- `apps/server/src/sync-shapes.ts`
- `apps/server/src/sync-shapes.test.ts`
- `apps/server/src/main.ts`
- `apps/web/src/routes/my-organization/insecticides.tsx`
- `apps/web/src/routes/my-organization/-components/insecticides.tsx`
- `apps/web/src/routes/my-organization/-components/helpers.tsx`
- `apps/web/src/routes/my-organization/-components/layout.tsx`

Implemented behavior:
- `insecticide_batches` descriptor is now `syncMode: 'on-demand'`.
- `insecticideBatches` was removed from web baseline preload.
- Batch UI moved away from one flattened table toward accordion sections grouped by insecticide.
- Web collection layer now exposes `createInsecticideBatchCollection(insecticideId)` instead of one global batch collection.
- Server batch shape route is now:
  ```text
  /sync/shapes/insecticide-batches/:insecticideId
  ```
- Server validates `:insecticideId` belongs to the current org, then proxies Electric with:
  ```sql
  insecticide_id = $1 and deleted_at is null
  ```
- `LookupListFrame` counts were made optional because on-demand grouped child collections should not require global child counts.

Important context:
- User questioned whether server-side parent validation is necessary because the UI already fetched authorized insecticides. We concluded each server boundary must validate URL params because a valid JWT proves the actor/session, not ownership of arbitrary resource IDs.
- User also noted future APIs will need to handle lots of subset requests. Treat this as a broader API design constraint.

## Verification Already Run

Passing:

```text
pnpm.cmd exec biome check apps/server/src/sync-shapes.ts apps/server/src/sync-shapes.test.ts apps/server/src/main.ts apps/web/src/sync/collections.ts apps/web/src/sync/collections.test.ts apps/web/src/routes/my-organization/insecticides.tsx apps/web/src/routes/my-organization/-components/insecticides.tsx apps/web/src/routes/my-organization/-components/helpers.tsx apps/web/src/routes/my-organization/-components/layout.tsx packages/sync/src/index.ts packages/sync/src/index.test.ts
pnpm.cmd --filter @simmer-mosquito/server test -- sync-shapes.test.ts
pnpm.cmd --filter @simmer-mosquito/web typecheck
pnpm.cmd --filter @simmer-mosquito/web test -- collections.test.ts
pnpm.cmd --filter @simmer-mosquito/sync test
```

Runtime caveat:
- The local server process may still need a restart. Earlier in the conversation, port `3000` was held by a stale Node process and new sync routes were not loaded until restart.

## Recommended Next Implementation

Prefer the broader architectural fix:

1. Add `organization_id` back to `insecticide_batches`.
2. Backfill from `insecticides.organization_id`.
3. Make it `not null` with FK to `organizations`.
4. Add useful index, likely:
   ```sql
   create index insecticide_batches_organization_insecticide_idx
     on insecticide_batches (organization_id, insecticide_id, is_active, batch_name)
     where deleted_at is null;
   ```
5. Update `packages/db/src/index.ts` table type.
6. Update `packages/sync/src/index.ts` `InsecticideBatchRow` and descriptor columns to include `organizationId`.
7. Update create/update command writes in `apps/server/src/control-product-commands.ts` to set and preserve `organization_id`.
8. Change batch shape route to org-scoped if desired:
   ```sql
   organization_id = $1 and deleted_at is null
   ```
   This would allow one organization batch shape again, but the grouped UI can still query locally by `insecticideId`.
9. Add command-layer validation that batch `organization_id` matches parent insecticide organization, especially if moving batches between insecticides is allowed.
10. Consider an ADR for “Tenant Scope Columns on Org-Owned Tables.”

Alternative if not adding `organization_id` yet:
- Keep the current per-insecticide batch collection factory and scoped server route.
- Improve subset handling in `apps/server/src/sync-shapes.ts` so server-owned auth predicates and client subset predicates are safely combined.
- Consider lazy-mounting batch collections only when accordion items open to avoid creating many on-demand streams at once.

## Open Questions

- Should `organization_id` be mandatory for all org-owned tables going forward, including deeply nested operational records?
- Should consistency be enforced with triggers, composite FKs, command-layer checks, or all of the above?
- Should route/API conventions be documented as: shape routes must validate server-owned tenant scope and may accept client subset predicates only within that scope?
- Should generated schema or migration linting flag org-owned tables without `organization_id`?
