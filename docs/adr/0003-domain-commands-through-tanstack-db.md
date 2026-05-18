# ADR 0003: Domain Commands Through TanStack DB Mutations

Status: Accepted

Date: 2026-05-06

## Context

SIMMER has web and mobile clients that need shared business rules, optimistic
updates, and future offline replay. Generic DB patches are easy to send but do
not preserve user intent.

## Decision

Use explicit domain commands for workflow actions. UI code calls shared command
helpers. Those helpers mutate TanStack DB collections for optimistic UI and
attach command metadata that tells mutation handlers which server command
endpoint to call.

Offline queues should store domain commands rather than DB-shaped patches.

## Consequences

- Commands are testable in `packages/domain`.
- Web and mobile share workflow rules.
- Server command handlers can validate authorization and persistence state.
- TanStack DB remains the optimistic mutation mechanism.
- Command metadata, not patch inference, determines the server endpoint.
- The first implemented tracers are the foundation lookup catalogs: web
  collection mutation handlers call authenticated foundation command routes, and
  those routes return the same-transaction Electric txid after committing the
  domain command.
