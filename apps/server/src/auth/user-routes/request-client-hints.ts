import type { Context } from 'hono';

/** The origin fields WorkOS records against a sign-in, when the request carries them. */
export function requestClientHints(context: Context): {
	ipAddress?: string;
	userAgent?: string;
} {
	const ipAddress = context.req.header('x-forwarded-for');
	const userAgent = context.req.header('user-agent');
	return {
		...(ipAddress === undefined ? {} : { ipAddress }),
		...(userAgent === undefined ? {} : { userAgent }),
	};
}
