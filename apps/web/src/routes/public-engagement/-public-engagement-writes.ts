// Shared write plumbing for the public-engagement routes. Dash-prefixed so
// TanStack Router ignores this file as a route.
//
// The txid-timeout handling these routes pioneered now lives in
// `@simmer-mosquito/sync` — app-wide here, and in the operator console too;
// re-exported so existing public-engagement imports keep working.

export { settleWrite } from '@simmer-mosquito/sync';
