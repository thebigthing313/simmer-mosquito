import type {
	AuthChallenge,
	AuthenticatedSession,
	WorkOsIdentityWrites,
	WorkOsSessionAuth,
} from '@simmer-mosquito/auth';
import type {
	AcceptInvitationBody,
	AuthenticatedBody,
	ChallengeBody,
	ForgotPasswordBody,
	InvalidPayloadBody,
	InvitationLookupBody,
	ResetPasswordBody,
	SelectOrganizationBody,
	SignInBody,
	SignUpBody,
	SwitchOrganizationBody,
	VerifyEmailBody,
	WeakPasswordBody,
} from '@simmer-mosquito/auth/browser';
import type { Context, Hono } from 'hono';
import type { AuthMailer } from './auth-email.js';
import type { AuthVariables } from './auth-middleware.js';
import { readSealedSession } from './auth-session-transport.js';

/**
 * What the in-app auth pages drive, picked off both halves of the WorkOS
 * client rather than described a second time, so a signature that changes in
 * `packages/auth` changes here. A test injects a fake without a WorkOS client,
 * and it has to answer what the real method answers with.
 */
export interface AuthUserFlows {
	readonly session: Pick<
		WorkOsSessionAuth,
		| 'signInWithPassword'
		| 'verifyEmailCode'
		| 'authenticateWithOrganizationSelection'
		| 'switchOrganization'
		| 'getInvitationByToken'
	>;
	readonly identity: Pick<
		WorkOsIdentityWrites,
		'signUpWithPassword' | 'requestPasswordReset' | 'resetPassword' | 'acceptInvitationWithPassword'
	>;
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
			return context.json(invalidPayload(payload.reason), 400);
		}

		const result = await auth.session.signInWithPassword({
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

		return context.json({ ok: false, status: 'invalid_credentials' } satisfies SignInBody, 401);
	});

	app.post('/auth/sign-up', async (context) => {
		const payload = await readCredentials(context.req, { withName: true });
		if (!payload.ok) {
			return context.json(invalidPayload(payload.reason), 400);
		}

		if (payload.value.password.length < MIN_PASSWORD_LENGTH) {
			return context.json(tooShortPassword(), 422);
		}

		const result = await auth.identity.signUpWithPassword({
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
			return context.json({ ok: false, status: 'email_taken' } satisfies SignUpBody, 409);
		}

		if (result.status === 'weak_password') {
			return context.json(weakPassword(result.message), 422);
		}

		return context.json({ ok: false, status: 'invalid_credentials' } satisfies SignUpBody, 401);
	});

	app.post('/auth/verify-email', async (context) => {
		const payload = await readVerifyEmailPayload(context.req);
		if (!payload.ok) {
			return context.json(invalidPayload(payload.reason), 400);
		}

		const result = await auth.session.verifyEmailCode({
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

		return context.json({ ok: false, status: 'invalid_code' } satisfies VerifyEmailBody, 400);
	});

	app.post('/auth/select-organization', async (context) => {
		const payload = await readSelectOrganizationPayload(context.req);
		if (!payload.ok) {
			return context.json(invalidPayload(payload.reason), 400);
		}

		const result = await auth.session.authenticateWithOrganizationSelection({
			organizationId: payload.value.organizationId,
			pendingAuthenticationToken: payload.value.pendingAuthenticationToken,
			...requestClientHints(context),
		});

		if (result.status === 'authenticated') {
			return respondAuthenticated(context, finalizeSession, result.session);
		}

		return context.json(
			{ ok: false, status: 'invalid_selection' } satisfies SelectOrganizationBody,
			400,
		);
	});

	/**
	 * Move an existing session into another organization the user belongs to.
	 *
	 * Unlike `/auth/select-organization`, which resolves a pending sign-in, this
	 * takes a session that is already good and re-seals it against a different
	 * organization (ADR 0011). It is what lets a SIMMER Operator holding an
	 * `admin` membership do an organization's foundation work through the
	 * ordinary organization routes instead of a second write path.
	 *
	 * Deliberately not behind `authContextMiddleware`: the caller may currently be
	 * in an organization with no SIMMER identity at all, which that middleware
	 * refuses. The sealed session is the credential — cookie or bearer, see
	 * `auth-session-transport.ts` — and the membership check is
	 * WorkOS's — a refresh against an organization the user does not belong to
	 * fails there, before SIMMER sees it.
	 */
	app.post('/auth/switch-organization', async (context) => {
		const payload = await readSwitchOrganizationPayload(context.req);
		if (!payload.ok) {
			return context.json(invalidPayload(payload.reason), 400);
		}

		const result = await auth.session.switchOrganization({
			sealedSession: readSealedSession(context),
			workosOrganizationId: payload.value.organizationId,
		});

		if (!result.authenticated) {
			return context.json(
				{
					ok: false,
					status: 'organization_switch_refused',
					reason: result.reason,
				} satisfies SwitchOrganizationBody,
				403,
			);
		}

		return respondAuthenticated(context, finalizeSession, result);
	});

	app.post('/auth/forgot-password', async (context) => {
		const payload = await readEmailPayload(context.req);
		// Always answer identically regardless of whether the account exists, so
		// the endpoint can't be used to enumerate registered emails.
		if (payload.ok) {
			const reset = await auth.identity.requestPasswordReset({ email: payload.value.email });
			if (reset !== null) {
				const resetUrl = `${appOrigin}/reset-password?token=${encodeURIComponent(reset.passwordResetToken)}`;
				await mailer.sendPasswordResetEmail({ to: reset.email, resetUrl });
			}
		}

		return context.json({ ok: true } satisfies ForgotPasswordBody);
	});

	app.post('/auth/reset-password', async (context) => {
		const payload = await readResetPasswordPayload(context.req);
		if (!payload.ok) {
			return context.json(invalidPayload(payload.reason), 400);
		}

		if (payload.value.newPassword.length < MIN_PASSWORD_LENGTH) {
			return context.json(tooShortPassword(), 422);
		}

		const result = await auth.identity.resetPassword({
			token: payload.value.token,
			newPassword: payload.value.newPassword,
		});

		if (result.status === 'ok') {
			return context.json({ ok: true } satisfies ResetPasswordBody);
		}

		if (result.status === 'weak_password') {
			return context.json(weakPassword(result.message), 422);
		}

		return context.json({ ok: false, status: 'invalid_token' } satisfies ResetPasswordBody, 400);
	});

	app.get('/auth/invitation', async (context) => {
		const token = context.req.query('token');
		if (token === undefined || token.trim() === '') {
			return context.json(invalidPayload('token is required.'), 400);
		}

		const invitation = await auth.session.getInvitationByToken(token);
		if (invitation === null) {
			return context.json({ ok: true, invitation: null } satisfies InvitationLookupBody);
		}

		return context.json({
			ok: true,
			invitation: {
				email: invitation.email,
				state: invitation.state,
			},
		} satisfies InvitationLookupBody);
	});

	app.post('/auth/accept-invitation', async (context) => {
		const payload = await readAcceptInvitationPayload(context.req);
		if (!payload.ok) {
			return context.json(invalidPayload(payload.reason), 400);
		}

		if (payload.value.password.length < MIN_PASSWORD_LENGTH) {
			return context.json(tooShortPassword(), 422);
		}

		const invitation = await auth.session.getInvitationByToken(payload.value.invitationToken);
		if (invitation === null || invitation.state !== 'pending') {
			return context.json(
				{ ok: false, status: 'invalid_invitation' } satisfies AcceptInvitationBody,
				400,
			);
		}

		const result = await auth.identity.acceptInvitationWithPassword({
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

		// WorkOS can still ask for a code or an organization before it issues the
		// session; surface it like sign-in does so the invitee can finish rather
		// than face a dead end.
		if (
			result.status === 'verification_required' ||
			result.status === 'organization_selection_required'
		) {
			return context.json(challengeBody(result));
		}

		if (result.status === 'account_exists') {
			return context.json(
				{ ok: false, status: 'account_exists' } satisfies AcceptInvitationBody,
				409,
			);
		}

		if (result.status === 'weak_password') {
			return context.json(weakPassword(result.message), 422);
		}

		if (result.status === 'invalid_invitation') {
			return context.json(
				{ ok: false, status: 'invalid_invitation' } satisfies AcceptInvitationBody,
				400,
			);
		}

		return context.json(
			{ ok: false, status: 'invalid_credentials' } satisfies AcceptInvitationBody,
			401,
		);
	});
}

async function respondAuthenticated(
	context: Context<{ Variables: AuthVariables }>,
	finalizeSession: FinalizeWorkOsSession,
	session: AuthenticatedSession,
) {
	const { organizationRequired } = await finalizeSession(context, session);
	return context.json({ ok: true, organizationRequired } satisfies AuthenticatedBody);
}

function challengeBody(challenge: AuthChallenge): ChallengeBody {
	return { ok: false, ...challenge };
}

function invalidPayload(reason: string): InvalidPayloadBody {
	return { ok: false, status: 'invalid_payload', reason };
}

function weakPassword(reason: string): WeakPasswordBody {
	return { ok: false, status: 'weak_password', reason };
}

/** The length floor SIMMER checks before WorkOS is asked. */
function tooShortPassword(): WeakPasswordBody {
	return weakPassword(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
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

async function readSwitchOrganizationPayload(request: {
	readonly json: () => Promise<unknown>;
}): Promise<Parsed<{ readonly organizationId: string }>> {
	const raw = await readJsonObject(request);
	if (!raw.ok) {
		return raw;
	}

	// The WorkOS organization id, not the SIMMER one: this re-seals a WorkOS
	// session, and the SIMMER organization is resolved from it afterwards.
	const organizationId = readNonEmptyString(raw.value.organizationId);
	if (organizationId === null) {
		return { ok: false, reason: 'organizationId is required.' };
	}

	return { ok: true, value: { organizationId } };
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
