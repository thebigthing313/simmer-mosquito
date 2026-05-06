# ADR 0001: Railway, Postgres, and WorkOS

Status: Accepted

Date: 2026-05-06

## Context

SIMMER needs to control service sprawl and operational cost while supporting a
multi-tenant agency product. The previous implementation used several external
services, including Supabase and Vercel. The new architecture should centralize
deployment and monitoring where possible.

## Decision

Use Railway as the primary operational platform. Railway hosts Postgres,
ElectricSQL, the Hono server, the worker, and the web app. Use WorkOS for
authentication and organization identity.

Postgres is the durable product source of truth. WorkOS owns login identity.
SIMMER owns agency data, roles, permissions, workflows, and subscription status.

## Consequences

- Railway becomes the place to monitor most infrastructure cost.
- WorkOS is not the SIMMER data store.
- WorkOS organizations are linked to SIMMER organizations.
- SIMMER supports manual agency billing metadata without adding payment
  processing.
- SIMMER operator tooling creates/links agency organizations and sends WorkOS
  invitations; agency self-service billing is out of scope.
- Production is one shared multi-tenant deployment, not one Railway project per
  agency.
