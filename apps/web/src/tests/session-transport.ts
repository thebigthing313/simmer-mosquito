/**
 * Every suite in this app runs with a session transport installed, the way the
 * app itself runs.
 *
 * `packages/sync` refuses to send with none installed (#694), because a request
 * with no credential is answered as unauthenticated and reads as an empty
 * workspace rather than as a refusal. `apps/web` installs `cookieFetch` in
 * `app-auth.ts` at module scope, and a suite does not load that module. It
 * stubs `fetch` instead, which is the answer rather than the credential.
 *
 * So what is installed here defers to the global at call time, and each case's
 * own `vi.stubGlobal('fetch', ...)` is still what answers. A setup file rather
 * than a line in each suite, because eight of them reach a write path and the
 * install is a fact about the app rather than about any one of them.
 */

import { setSessionFetcher } from '@simmer-mosquito/sync/session-fetch';

setSessionFetcher((input, init) => fetch(input, init));
