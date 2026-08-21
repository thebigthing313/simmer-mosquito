# ADR 0008: Tenant scope columns on org-owned rows

Status: Accepted

Date: 2026-05-26

## Context

SIMMER sync routes authorize Electric shapes on the server before TanStack DB
queries run locally in the client. Electric shape `where` clauses cannot depend
on cross-table subqueries, while future screens are expected to request many
on-demand subsets of organization-owned operational data.

ADR 0002 allowed child rows to omit `organization_id` until query or sync
pressure justified it. The insecticide batch sync path showed that this creates
avoidable authorization and sync complexity, so the default is now stronger.

## Decision

If a row can hold agency-scoped data, store `organization_id` on the row by
default, even when ownership can be derived through a parent table.

Parent foreign keys still model domain relationships, such as
`insecticide_batches.insecticide_id`. The `organization_id` column models the
tenant scope used by authorization, Electric shape filters, and indexes.

## Consequences

- Shape routes can keep server-owned authorization predicates simple:
  `organization_id = $1 and deleted_at is null`.
- On-demand subset routes may add narrower predicates inside the authorized
  organization scope.
- Commands and migrations must keep child `organization_id` consistent with the
  parent ownership. Mixed global/agency tables may use nullable
  `organization_id`, with `null` reserved for shared global rows.
- Database constraints or triggers may be added for high-risk tables when
  command-layer checks are not enough.
