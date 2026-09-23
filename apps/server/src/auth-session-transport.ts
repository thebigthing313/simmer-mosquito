/**
 * How a client carries its sealed WorkOS session: an httpOnly cookie for the
 * web apps, an `Authorization: Bearer` credential for `apps/mobile`, and a
 * response header carrying each rotation back to a declared token client
 * (ADR 0016). This is the one module in the server that knows either.
 */

export { readSealedSession } from './auth/session-transport/read-sealed-session.js';
export { SESSION_RESPONSE_HEADER } from './auth/session-transport/session-headers.js';
export { writeSealedSession } from './auth/session-transport/write-sealed-session.js';
