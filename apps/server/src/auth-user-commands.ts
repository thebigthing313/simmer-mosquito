import type {
	AcceptInvitationInput,
	AcceptInvitationResult,
	AuthChallenge,
	AuthenticatedSession,
	InvitationSummary,
	PasswordAuthResult,
	PasswordSignInInput,
	PasswordSignUpInput,
	ResetPasswordResult,
	SelectOrganizationResult,
	SignUpResult,
	VerifyEmailResult,
} from '@simmer-mosquito/auth';
import type { Context, Hono } from 'hono';
import type { AuthMailer } from './auth-email.js';
import type { AuthVariables } from './auth-middleware.js';

/**
 * The subset of `createWorkOsAuth` the in-app (bring-your-own-UI) auth pages
 * drive. Kept structural so tests can inject a fake without a WorkOS client.
 */
export interface AuthUserFlows {
	signInWithPassword(input: PasswordSignInInput): Promise<PasswordAuthResult>;
	signUpWithPassword(input: PasswordSignUpInput): Promise<SignUpResult>;
	verifyEmailCode(input: {
		readonly code: string;
		readonly pendingAuthenticationToken: string;
		readonly ipAddress?: string;
		readonly userAgent?: string;
	}): Promise<VerifyEmailResult>;
	requestPasswordReset(input: {
		readonly email: string;
	}): Promise<{ readonly passwordResetToken: string; readonly email: string } | null>;
	resetPassword(input: {
		readonly token: string;
		readonly newPassword: string;
	}): Promise<ResetPasswordResult>;
	getInvitationByToken(token: string): Promise<InvitationSummary | null>;
	acceptInvitationWithPassword(input: AcceptInvitationInput): Promise<AcceptInvitationResult>;
	authenticateWithOrganizationSelection(input: {
		readonly organizationId: string;
		readonly pendingAuthenticationToken: string;
		readonly ipAddress?: string;
		readonly userAgent?: string;
	}): Promise<SelectOrganizationResult>;
}

/**
 * Runs after any successful WorkOS authentication: upserts the local identity,
 * sets the sealed-session cookie, and reports whether the session still lacks a
 * SIMMER organization (blocking entry to the app).
 */
export type FinalizeWorkOsSession = (
	context: Context<{ Variables: AuthVariables }>,
	session: AuthenticatedSession,
) => Promise<{ readonly organizationRequired: boolean }>;

const MIN_PASSWORD_LENGTH = 8;

export function registerAuthUserRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: {
		readonly auth: AuthUserFlows;
		readonly mailer: AuthMailer;
		readonly appOrigin: string;
		readonly finalizeSession: FinalizeWorkOsSession;
	},
): void {
	const { auth, mailer, appOrigin, finalizeSession } = options;

	app.post('/auth/sign-in', async (context) => {
		const payload = await readCredentials(context.req);
		if (!payload.ok) {
			return context.json({ ok: false, status: 'invalid_payload', reason: payload.reason }, 400);
		}

		const result = await auth.signInWithPassword({
			email: payload.value.email,
			password: payload.value.password,
			...requestClientHints(context),
		});

		if (result.status === 'authenticated') {
			return respondAuthenticated(context, finalizeSession, result.session);
		}

		if (
			result.status === 'verification_required' ||
			result.status === 'organization_selection_required'
		) {
			return context.json(challengeBody(result));
		}

		return context.json({ ok: false, status: 'invalid_credentials' }, 401);
	});

	app.post('/auth/sign-up', async (context) => {
		const payload = await readCredentials(context.req, { withName: true });
		if (!payload.ok) {
			return context.json({ ok: false, status: 'invalid_payload', reason: payload.reason }, 400);
		}

		if (payload.value.password.length < MIN_PASSWORD_LENGTH) {
			return context.json(
				{
					ok: false,
					status: 'weak_password',
					reason: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
				},
				422,
			);
		}

		const result = await auth.signUpWithPassword({
			email: payload.value.email,
			password: payload.value.password,
			...(payload.value.firstName === null ? {} : { firstName: payload.value.firstName }),
			...(payload.value.lastName === null ? {} : { lastName: payload.value.lastName }),
			...requestClientHints(context),
		});

		if (result.status === 'authenticated') {
			return respondAuthenticated(context, finalizeSession, result.session);
		}

		if (
			result.status === 'verification_required' ||
			result.status === 'organization_selection_required'
		) {
			return context.json(challengeBody(result));
		}

		if (result.status === 'email_taken') {
			return context.json({ ok: false, status: 'email_taken' }, 409);
		}

		if (result.status === 'weak_password') {
			return context.json({ ok: false, status: 'weak_password', reason: result.message }, 422);
		}

		return context.json({ ok: false, status: 'invalid_credentials' }, 401);
	});

	app.post('/auth/verify-email', async (context) => {
		const payload = await readVerifyEmailPayload(context.req);
		if (!payload.ok) {
			return context.json({ ok: false, status: 'invalid_payload', reason: payload.reason }, 400);
		}

		const result = await auth.verifyEmailCode({
			code: payload.value.code,
			pendingAuthenticationToken: payload.value.pendingAuthenticationToken,
			...requestClientHints(context),
		});

		if (result.status === 'authenticated') {
			return respondAuthenticated(context, finalizeSession, result.session);
		}

		if (result.status === 'organization_selection_required') {
			return context.json(challengeBody(result));
		}

		return context.json({ ok: false, status: 'invalid_code' }, 400);
	});

	app.post('/auth/select-organization', async (context) => {
		const payload = await readSelectOrganizationPayload(context.req);
		if (!payload.ok) {
			return context.json({ ok: false, status: 'invalid_payload', reason: payload.reason }, 400);
		}

		const result = await auth.authenticateWithOrganizationSelection({
			organizationId: payload.value.organizationId,
			pendingAuthenticationToken: payload.value.pendingAuthenticationToken,
			...requestClientHints(context),
		});

		if (result.status === 'authenticated') {
			return respondAuthenticated(context, finalizeSession, result.session);
		}

		return context.json({ ok: false, status: 'invalid_selection' }, 400);
	});

	app.post('/auth/forgot-password', async (context) => {
		const payload = await readEmailPayload(context.req);
		// Always answer identically regardless of whether the account exists, so
		// the endpoint can't be used to enumerate registered emails.
		if (payload.ok) {
			const reset = await auth.requestPasswordReset({ email: payload.value.email });
			if (reset !== null) {
				const resetUrl = `${appOrigin}/reset-password?token=${encodeURIComponent(reset.passwordResetToken)}`;
				await mailer.sendPasswordResetEmail({ to: reset.email, resetUrl });
			}
		}

		return context.json({ ok: true });
	});

	app.post('/auth/reset-password', async (context) => {
		const payload = await readResetPasswordPayload(context.req);
		if (!payload.ok) {
			return context.json({ ok: false, status: 'invalid_payload', reason: payload.reason }, 400);
		}

		if (payload.value.newPassword.length < MIN_PASSWORD_LENGTH) {
			return context.json(
				{
					ok: false,
					status: 'weak_password',
					reason: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
				},
				422,
			);
		}

		const result = await auth.resetPassword({
			token: payload.value.token,
			newPassword: payload.value.newPassword,
		});

		if (result.status === 'ok') {
			return context.json({ ok: true });
		}

		return context.json({ ok: false, status: 'invalid_token' }, 400);
	});

	app.get('/auth/invitation', async (context) => {
		const token = context.req.query('token');
		if (token === undefined || token.trim() === '') {
			return context.json(
				{ ok: false, status: 'invalid_payload', reason: 'token is required.' },
				400,
			);
		}

		const invitation = await auth.getInvitationByToken(token);
		if (invitation === null) {
			return context.json({ ok: true, invitation: null });
		}

		return context.json({
			ok: true,
			invitation: {
				email: invitation.email,
				state: invitation.state,
			},
		});
	});

	app.post('/auth/accept-invitation', async (context) => {
		const payload = await readAcceptInvitationPayload(context.req);
		if (!payload.ok) {
			return context.json({ ok: false, status: 'invalid_payload', reason: payload.reason }, 400);
		}

		if (payload.value.password.length < MIN_PASSWORD_LENGTH) {
			return context.json(
				{
					ok: false,
					status: 'weak_password',
					reason: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
				},
				422,
			);
		}

		const invitation = await auth.getInvitationByToken(payload.value.invitationToken);
		if (invitation === null || invitation.state !== 'pending') {
			return context.json({ ok: false, status: 'invalid_invitation' }, 400);
		}

		const result = await auth.acceptInvitationWithPassword({
			invitationToken: payload.value.invitationToken,
			email: invitation.email,
			password: payload.value.password,
			...(payload.value.firstName === null ? {} : { firstName: payload.value.firstName }),
			...(payload.value.lastName === null ? {} : { lastName: payload.value.lastName }),
			...requestClientHints(context),
		});

		if (result.status === 'authenticated') {
			return respondAuthenticated(context, finalizeSession, result.session);
		}

		if (result.status === 'account_exists') {
			return context.json({ ok: false, status: 'account_exists' }, 409);
		}

		if (result.status === 'invalid_invitation') {
			return context.json({ ok: false, status: 'invalid_invitation' }, 400);
		}

		return context.json({ ok: false, status: 'invalid_credentials' }, 401);
	});
}

async function respondAuthenticated(
	context: Context<{ Variables: AuthVariables }>,
	finalizeSession: FinalizeWorkOsSession,
	session: AuthenticatedSession,
) {
	const { organizationRequired } = await finalizeSession(context, session);
	return context.json({ ok: true, organizationRequired });
}

/** Serializes a "one more step" challenge (verification or org selection) for the client. */
function challengeBody(challenge: AuthChallenge) {
	if (challenge.status === 'verification_required') {
		return {
			ok: false as const,
			status: 'verification_required' as const,
			pendingAuthenticationToken: challenge.pendingAuthenticationToken,
			email: challenge.email,
		};
	}

	return {
		ok: false as const,
		status: 'organization_selection_required' as const,
		pendingAuthenticationToken: challenge.pendingAuthenticationToken,
		organizations: challenge.organizations,
	};
}

function requestClientHints(context: Context<{ Variables: AuthVariables }>): {
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

interface Credentials {
	readonly email: string;
	readonly password: string;
	readonly firstName: string | null;
	readonly lastName: string | null;
}

type Parsed<T> =
	| { readonly ok: true; readonly value: T }
	| { readonly ok: false; readonly reason: string };

async function readCredentials(
	request: { readonly json: () => Promise<unknown> },
	options: { readonly withName?: boolean } = {},
): Promise<Parsed<Credentials>> {
	const raw = await readJsonObject(request);
	if (!raw.ok) {
		return raw;
	}

	const email = readEmail(raw.value.email);
	if (email === null) {
		return { ok: false, reason: 'A valid email is required.' };
	}

	const password = readPassword(raw.value.password);
	if (password === null) {
		return { ok: false, reason: 'password is required.' };
	}

	return {
		ok: true,
		value: {
			email,
			password,
			firstName: options.withName ? readOptionalText(raw.value.firstName) : null,
			lastName: options.withName ? readOptionalText(raw.value.lastName) : null,
		},
	};
}

async function readEmailPayload(request: {
	readonly json: () => Promise<unknown>;
}): Promise<Parsed<{ readonly email: string }>> {
	const raw = await readJsonObject(request);
	if (!raw.ok) {
		return raw;
	}

	const email = readEmail(raw.value.email);
	if (email === null) {
		return { ok: false, reason: 'A valid email is required.' };
	}

	return { ok: true, value: { email } };
}

async function readVerifyEmailPayload(request: {
	readonly json: () => Promise<unknown>;
}): Promise<Parsed<{ readonly code: string; readonly pendingAuthenticationToken: string }>> {
	const raw = await readJsonObject(request);
	if (!raw.ok) {
		return raw;
	}

	const code = readNonEmptyString(raw.value.code);
	if (code === null) {
		return { ok: false, reason: 'code is required.' };
	}

	const pendingAuthenticationToken = readNonEmptyString(raw.value.pendingAuthenticationToken);
	if (pendingAuthenticationToken === null) {
		return { ok: false, reason: 'pendingAuthenticationToken is required.' };
	}

	return { ok: true, value: { code, pendingAuthenticationToken } };
}

async function readSelectOrganizationPayload(request: {
	readonly json: () => Promise<unknown>;
}): Promise<
	Parsed<{ readonly organizationId: string; readonly pendingAuthenticationToken: string }>
> {
	const raw = await readJsonObject(request);
	if (!raw.ok) {
		return raw;
	}

	const organizationId = readNonEmptyString(raw.value.organizationId);
	if (organizationId === null) {
		return { ok: false, reason: 'organizationId is required.' };
	}

	const pendingAuthenticationToken = readNonEmptyString(raw.value.pendingAuthenticationToken);
	if (pendingAuthenticationToken === null) {
		return { ok: false, reason: 'pendingAuthenticationToken is required.' };
	}

	return { ok: true, value: { organizationId, pendingAuthenticationToken } };
}

async function readResetPasswordPayload(request: {
	readonly json: () => Promise<unknown>;
}): Promise<Parsed<{ readonly token: string; readonly newPassword: string }>> {
	const raw = await readJsonObject(request);
	if (!raw.ok) {
		return raw;
	}

	const token = readNonEmptyString(raw.value.token);
	if (token === null) {
		return { ok: false, reason: 'token is required.' };
	}

	const newPassword = readPassword(raw.value.newPassword);
	if (newPassword === null) {
		return { ok: false, reason: 'newPassword is required.' };
	}

	return { ok: true, value: { token, newPassword } };
}

async function readAcceptInvitationPayload(request: {
	readonly json: () => Promise<unknown>;
}): Promise<
	Parsed<{
		readonly invitationToken: string;
		readonly password: string;
		readonly firstName: string | null;
		readonly lastName: string | null;
	}>
> {
	const raw = await readJsonObject(request);
	if (!raw.ok) {
		return raw;
	}

	const invitationToken = readNonEmptyString(raw.value.invitationToken);
	if (invitationToken === null) {
		return { ok: false, reason: 'invitationToken is required.' };
	}

	const password = readPassword(raw.value.password);
	if (password === null) {
		return { ok: false, reason: 'password is required.' };
	}

	return {
		ok: true,
		value: {
			invitationToken,
			password,
			firstName: readOptionalText(raw.value.firstName),
			lastName: readOptionalText(raw.value.lastName),
		},
	};
}

async function readJsonObject(request: {
	readonly json: () => Promise<unknown>;
}): Promise<Parsed<Record<string, unknown>>> {
	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		return { ok: false, reason: 'Request body must be JSON.' };
	}

	if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
		return { ok: false, reason: 'Request body must be an object.' };
	}

	return { ok: true, value: raw as Record<string, unknown> };
}

function readEmail(value: unknown): string | null {
	const text = readNonEmptyString(value);
	if (text === null || !text.includes('@')) {
		return null;
	}

	return text.toLowerCase();
}

/** Passwords are validated for presence only — never trimmed or normalized. */
function readPassword(value: unknown): string | null {
	return typeof value === 'string' && value.length > 0 ? value : null;
}

function readNonEmptyString(value: unknown): string | null {
	if (typeof value !== 'string') {
		return null;
	}

	const trimmed = value.trim();
	return trimmed.length === 0 ? null : trimmed;
}

function readOptionalText(value: unknown): string | null {
	return readNonEmptyString(value);
}
