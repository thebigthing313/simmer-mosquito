# ADR 0010: In-App (Bring-Your-Own-UI) Authentication Pages

Status: Accepted

Date: 2026-07-07

## Context

ADR 0001 established WorkOS as the authentication and organization-identity
provider. The initial implementation used WorkOS **AuthKit hosted UI**: the web
app redirected to `getAuthorizationUrl({ provider: 'authkit' })`, users left the
SIMMER origin to sign in on WorkOS-hosted pages, and were returned to
`apps/server` `/auth/callback` to exchange the code for a sealed session cookie.

Hosted AuthKit gave us auth quickly but ceded the entire sign-in/sign-up surface
— layout, copy, brand, error states — to WorkOS's theming options. We want the
authentication screens to be first-class product surfaces styled with the same
`ui-web` primitives and design tokens as the rest of `apps/web`.

## Decision

Own the authentication UI in `apps/web` and drive it through WorkOS's headless
**User Management** API instead of hosted AuthKit. Auth method for v1 is **email
+ password** (plus email verification, password reset, and invitation
acceptance). OAuth/SSO remain possible later through the existing code callback.

- `packages/auth` remains the sole WorkOS boundary. It gains normalized,
  non-throwing result unions for `signInWithPassword`, `signUpWithPassword`,
  `verifyEmailCode`, `requestPasswordReset`, `resetPassword`,
  `getInvitationByToken`, and `acceptInvitationWithPassword`.
- `apps/server` exposes public `POST /auth/*` endpoints (`sign-in`, `sign-up`,
  `verify-email`, `forgot-password`, `reset-password`, `accept-invitation`) plus
  a `GET /auth/invitation` lookup. Every successful authentication funnels
  through a shared `finalizeWorkOsSession` helper that upserts the local identity
  and sets the same `wos-session` sealed cookie the callback already used.
  Downstream `AuthContext` resolution, sync-shape authorization, and command
  endpoints are unchanged.
- `apps/web` renders the screens as file-based routes (`/sign-in`, `/sign-up`,
  `/forgot-password`, `/reset-password`, `/accept-invitation`), added to the
  root route's public-path allowlist.
- WorkOS dashboard redirect URLs (Sign-in endpoint, Sign-up URL, Sign-out
  redirects, User invitation URL, Password reset URL) point at these app routes
  so transactional emails link back into the app.

### Email delivery

WorkOS still sends invitation and email-verification messages itself. The
headless password-reset flow, however, returns the reset token to us rather than
emailing it, so SIMMER now owns password-reset email delivery. We send it via
Resend's REST API (`apps/server/src/auth-email.ts`, no SDK dependency). The
reset link is constructed server-side from `APP_ORIGIN` so it does not depend on
the WorkOS-configured URL, and `POST /auth/forgot-password` always responds
identically to avoid leaking which emails are registered.

## Consequences

- SIMMER owns the authentication surface and its security-relevant edges
  (credential handling, verification, reset-token flow, invitation acceptance),
  not just its styling. This is more code and more attack surface than hosted
  AuthKit.
- A transactional email provider (Resend) is now a production dependency for
  password reset. `RESEND_API_KEY` / `AUTH_EMAIL_FROM` are new server env vars;
  when the key is absent, non-production logs the reset link and prod logs an
  error rather than throwing.
- This supersedes the hosted-AuthKit posture of ADR 0001. `/auth/callback` and
  the WorkOS session model are retained, keeping OAuth/SSO reachable later.
- MFA, step-up auth, and SSO are out of scope for v1 and would each add new
  flows.
