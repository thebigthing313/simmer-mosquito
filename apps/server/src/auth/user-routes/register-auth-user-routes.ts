import type { Hono } from 'hono';
import type { AuthVariables } from '../middleware/auth-variables.js';
import type { AuthUserRouteDeps } from './auth-user-flows.js';
import { registerAcceptInvitation } from './register-accept-invitation.js';
import { registerForgotPassword } from './register-forgot-password.js';
import { registerInvitationLookup } from './register-invitation-lookup.js';
import { registerResetPassword } from './register-reset-password.js';
import { registerSelectOrganization } from './register-select-organization.js';
import { registerSignIn } from './register-sign-in.js';
import { registerSignUp } from './register-sign-up.js';
import { registerSwitchOrganization } from './register-switch-organization.js';
import { registerVerifyEmail } from './register-verify-email.js';

/** The in-app email and password flows (ADR 0010), one module per endpoint. */
export function registerAuthUserRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	deps: AuthUserRouteDeps,
): void {
	registerSignIn(app, deps);
	registerSignUp(app, deps);
	registerVerifyEmail(app, deps);
	registerSelectOrganization(app, deps);
	registerSwitchOrganization(app, deps);
	registerForgotPassword(app, deps);
	registerResetPassword(app, deps);
	registerInvitationLookup(app, deps);
	registerAcceptInvitation(app, deps);
}
