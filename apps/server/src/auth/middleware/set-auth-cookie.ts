import type { Context } from 'hono';
import type { AuthVariables } from './auth-variables.js';

/** Re-set the sealed session after a rotation; `main.ts` binds `writeSealedSession` to it. */
export type SetAuthCookie = (
	context: Context<{ Variables: AuthVariables }>,
	sealedSession: string | undefined,
) => void;
