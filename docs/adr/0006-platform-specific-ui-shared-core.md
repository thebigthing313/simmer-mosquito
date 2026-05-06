# ADR 0006: Platform-Specific UI With Shared Core

Status: Accepted

Date: 2026-05-06

## Context

SIMMER needs a dense web management console and a field-focused mobile app. The
two surfaces share domain behavior but have different interaction needs.

## Decision

Use separate web and mobile component systems. Share design tokens and
framework-agnostic domain/sync/client packages.

Use:

- Vite React SPA with TanStack Router for web.
- Expo managed React Native for mobile.
- Mapbox as the initial map provider.
- PostGIS from the beginning.

## Consequences

- Web components can optimize for agency management workflows.
- Mobile components can optimize for field data entry.
- Shared packages avoid React/platform dependencies unless explicitly
  platform-specific.
- Mapbox-specific rendering stays outside provider-neutral mapping helpers.
