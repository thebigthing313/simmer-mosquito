import type { MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { AuthVariables } from './auth-variables.js';

/**
 * Admit an organization identity or an operator one, for a shape that is
 * neither's: the global catalogs carry no `organization_id`, so the only check
 * left is that somebody is signed in. Only safe on a `global` scope, and
 * `registerSyncShapeRoutes` asserts it; on an operator session `authContext`
 * stays unset. The organization door is tried first and its refusal is the one
 * returned, since almost every caller is an organization user.
 */
export function createGlobalReadMiddleware(options: {
	readonly organization: MiddlewareHandler<{ Variables: AuthVariables }>;
	readonly operator: MiddlewareHandler<{ Variables: AuthVariables }>;
}) {
	return createMiddleware<{ Variables: AuthVariables }>(async (context, next) => {
		let admitted = false;
		const markAdmitted = async () => {
			admitted = true;
		};

		const organizationRefusal = await options.organization(context, markAdmitted);
		if (admitted) {
			return next();
		}

		await options.operator(context, markAdmitted);
		if (admitted) {
			return next();
		}

		return organizationRefusal;
	});
}
