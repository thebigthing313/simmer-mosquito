// Shared write plumbing for the public-engagement routes. Dash-prefixed so
// TanStack Router ignores this file as a route.
//
// The txid-timeout handling these routes pioneered now lives in
// `src/sync/settle-write.ts` and is used app-wide; re-exported here so existing
// public-engagement imports keep working.

export { isTxIdConfirmationTimeout, settleWrite } from '../../sync/settle-write';
