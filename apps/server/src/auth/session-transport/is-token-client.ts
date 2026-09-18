import type { Context } from 'hono';
import { SESSION_CLIENT_HEADER, TOKEN_CLIENT } from './session-headers.js';

/** Whether this caller wants its session handed back in a header rather than a cookie. */
export function isTokenClient(context: Context): boolean {
	return context.req.header(SESSION_CLIENT_HEADER)?.trim().toLowerCase() === TOKEN_CLIENT;
}
