/**
 * Every suite in this console runs with a session transport installed, for the
 * reason `apps/web/src/tests/session-transport.ts` gives.
 *
 * The console installs `cookieFetch` in its own `app-auth.ts`, a suite stubs
 * `fetch` rather than loading that module, and `packages/sync` refuses to send
 * with no transport installed (#694). What is installed here defers to the
 * global at call time, so each case's stub is still what answers.
 */

import { setSessionFetcher } from '@simmer-mosquito/sync/session-fetch';

setSessionFetcher((input, init) => fetch(input, init));
