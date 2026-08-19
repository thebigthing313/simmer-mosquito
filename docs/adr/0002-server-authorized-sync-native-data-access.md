# ADR 0002: Server-authorized sync-native data access

Status: Accepted

Date: 2026-05-06

## Context

SIMMER needs web and mobile clients that feel fast and can eventually support
local persistence and offline transactions. The previous Supabase RLS approach
created schema pressure, especially around placing `organization_id` on every
table for policy performance.

## Decision

Use ElectricSQL and TanStack DB as the primary read/sync path. Use the Hono
server as an authorization layer between clients and data services.

Do not use Postgres RLS as the primary authorization model. The server
authorizes sync shapes and command endpoints. Postgres owns data integrity.

## Consequences

- Clients do not access Postgres directly.
- Clients do not get unrestricted Electric shapes.
- App reads are primarily local TanStack DB queries over Electric-synced data.
- Server endpoints are a control plane, not a traditional CRUD REST API.
- `organization_id` is stored on parent/root records and added to children only
  when query or sync pressure justifies it.
