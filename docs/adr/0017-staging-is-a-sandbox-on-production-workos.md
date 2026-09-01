# ADR 0017: Staging Is A Sandbox On Production WorkOS, With Identity Writes Refused

Status: Accepted

Date: 2026-09-01

## Context

Staging exists so agency staff can try a release candidate against their own
data before it ships. That only works if they can sign in, and until #377 they
could not: staging authenticated against the WorkOS **staging** environment,
whose directory holds five test logins and nobody real. An agency user had no
account there, and creating one would have meant maintaining a parallel
directory that drifts from the real one every time somebody joins or leaves.

Pointing staging at WorkOS **production** solves the sign-in and opens a hole in
the same move. WorkOS is the identity system of record for the live product.
Every call `apps/server` makes to it from staging would then reach the same
directory production reaches, from code that has not shipped:

- `sendOrganizationInvitation` mails a real address.
- `deactivateOrganizationMembership` revokes somebody's real access, which is
  ADR 0011's offboarding path and kills their live session.
- `requestPasswordReset` mails a working reset link for a production account.

None of those are hypothetical. They are the four `identity.*` commands ADR 0013
put on `/commands/memberships`, plus the password and sign-up routes, plus the
operator console's Agency creation.

Three shapes were considered. A second WorkOS directory for staging, rejected
above. Skipping the `secondSystem` hook that settles identity commands into
WorkOS, which was the obvious answer and is wrong: that hook also runs
`assertCanGrantRole` and the last-active-owner check, so skipping it reopens
#121's invite escalation and lets staging drop an Agency's last Owner. And an
allowlist at the WorkOS boundary itself.

## Decision

Staging authenticates against WorkOS production and performs **no WorkOS
identity writes**.

The rule is stated at the WorkOS boundary, not in the commands. The seam is the
single `auth` object `main.ts` builds, which every route and every command
already receives, and which `dev-impersonation.ts` already swaps at. A `Proxy`
wraps it when `WORKOS_IDENTITY_WRITES_DISABLED` reads the exact string `true`.

- It is an **allowlist**, in `apps/server/src/workos-identity-interlock.ts`.
  Session and read methods pass; everything else refuses. A list of the writes
  that exist today would be one `packages/auth` addition away from silently
  mailing production from staging.
- The line is durable identity state against session state.
  `signInWithPassword` and `revokeSession` both write, but what they write is a
  session. `verifyEmailCode` is the one judgement call and is allowed: it is
  reachable only as the second step of a sign-in WorkOS itself asked for, and
  nobody new can reach it anyway, because `signUpWithPassword` and
  `acceptInvitationWithPassword` both refuse.
- Every refusal is one 403 with one code, `workos_identity_writes_disabled`, and
  one message. The environment banner repeats that message word for word, so a
  user reads the rule before meeting it on a half-filled invitation form.
- The refusal is thrown and caught in `app.onError`, not in a middleware. Hono's
  `compose` catches a handler's throw at the dispatch that raised it, and that
  is also what keeps the CORS headers on the 403.
- **Absent means settle.** The variable is set on staging and set nowhere else,
  so the flag going missing in production cannot silently turn identity off.
- `WORKOS_COOKIE_PASSWORD` differs between the two environments. Sharing it
  means a session minted on staging unseals on production.

Two surfaces write their Postgres row before they call WorkOS: the
`membership.invite` and `membership.reinvite` commands, and the operator
console's invitation route, which swallows a WorkOS throw into a 502. Both carry
a guard clause ahead of the write. The rule behind it generalizes: **refuse
ahead of any surface that writes Postgres first**, or the refusal leaves a
Membership row behind with nothing in WorkOS to match it.

## Consequences

- Nobody new can be onboarded on staging. Inviting, re-inviting, changing a
  role, removing access, resetting a password, signing up, and creating an
  Agency from the operator console all refuse. That is the intended shape and
  not a gap; a sandbox that could invite people would be inviting them to
  production.
- Identity commands still write SIMMER's own rows. A staging invitation creates
  a Membership and then refuses at the WorkOS step, which is why the guard runs
  first.
- The five role-ladder test accounts are WorkOS staging logins and are dead
  against the deployed staging. Role-ladder browser testing moves to local
  development, which stays on WorkOS staging.
- A new method on `packages/auth`'s `auth` object is refused on staging by
  default, and adding it to the allowlist is a deliberate act with this ADR to
  read first. That is the whole point of the allowlist, and it will occasionally
  be inconvenient.
- The staging database is a full-history clone of production and carries
  production WorkOS ids, so nothing relinks them. `scripts/clone-prod-db.ps1`
  still relinks for local development, which signs in against WorkOS staging,
  and it is the only script that does.
- Anything that reaches WorkOS from a path other than the `auth` object bypasses
  this. Nothing does today. Keeping that true is the maintenance cost.

Decided in issue #376, built in #386 and #391, and turned on in #377.
