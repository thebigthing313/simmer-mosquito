import { Alert, AlertDescription } from '@simmer-mosquito/ui-web/components/ui/alert';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Field,
	FieldError,
	FieldGroup,
	FieldLabel,
} from '@simmer-mosquito/ui-web/components/ui/field';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import { Link, useNavigate } from '@tanstack/react-router';
import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { appAuthController } from '../app-auth';
import {
	type AuthenticatedOutcome,
	type AuthOrganizationChoice,
	acceptInvitation,
	fetchInvitation,
	requestPasswordReset,
	resetPassword,
	type SignInOutcome,
	type SignUpOutcome,
	selectOrganization,
	signIn,
	signUp,
	verifyEmail,
} from '../auth';

/**
 * In-app (bring-your-own-UI) auth screens. These replace the WorkOS-hosted
 * AuthKit pages: each posts to a public `/auth/*` server endpoint that calls the
 * WorkOS User Management API and sets the sealed-session cookie.
 */

const AUTH_BG =
	'grid min-h-screen place-items-center bg-[linear-gradient(90deg,color-mix(in_oklch,var(--app-shell)_58%,transparent),transparent_360px),var(--app-stage)] p-6';

function BrandMark() {
	return (
		<span className="inline-grid size-[34px] place-items-center rounded-md bg-primary font-extrabold text-primary-foreground">
			S
		</span>
	);
}

function AuthShell({
	eyebrow,
	title,
	description,
	children,
	footer,
}: {
	readonly eyebrow: string;
	readonly title: string;
	readonly description?: ReactNode;
	readonly children: ReactNode;
	readonly footer?: ReactNode;
}) {
	return (
		<div className={AUTH_BG}>
			<section className="grid w-[min(440px,100%)] gap-5 rounded-md border border-border/30 bg-card p-7">
				<BrandMark />
				<div className="grid gap-2">
					<p className="eyebrow">{eyebrow}</p>
					<h1 className="m-0 text-[1.6rem] leading-tight">{title}</h1>
					{description ? (
						<p className="m-0 leading-normal text-muted-foreground">{description}</p>
					) : null}
				</div>
				{children}
				{footer ? <div className="text-sm text-muted-foreground">{footer}</div> : null}
			</section>
		</div>
	);
}

function FormError({ message }: { readonly message: string | null }) {
	if (message === null) {
		return null;
	}

	return (
		<Alert variant="destructive">
			<AlertDescription>{message}</AlertDescription>
		</Alert>
	);
}

/**
 * Shared "we authenticated" handoff: refresh the cached auth snapshot, then send
 * the user to their intended route — or to the org-required landing when their
 * WorkOS session has no SIMMER organization yet.
 */
function useAuthSuccess() {
	const navigate = useNavigate();

	return async (outcome: AuthenticatedOutcome, redirectTo: string) => {
		if (outcome.organizationRequired) {
			await navigate({
				to: '/landing',
				search: { auth: 'organization_required', redirect: '/' },
			});
			return;
		}

		await appAuthController.refresh();
		await navigate({ to: redirectTo });
	};
}

// --- Sign in (with inline email-verification step) ---

export function SignInPage({ redirectTo }: { readonly redirectTo: string }) {
	const onAuthenticated = useAuthSuccess();
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [step, setStep] = useState<PendingStep | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	async function handleCredentials(event: FormEvent) {
		event.preventDefault();
		setPending(true);
		setError(null);

		const outcome = await signIn({ email, password });
		setPending(false);

		if (outcome.status === 'authenticated') {
			await onAuthenticated(outcome, redirectTo);
			return;
		}

		const next = toPendingStep(outcome, email);
		if (next !== null) {
			setStep(next);
			return;
		}

		if (outcome.status === 'invalid_credentials') {
			setError('Incorrect email or password.');
			return;
		}

		setError(outcome.status === 'error' ? outcome.reason : 'Unable to sign in.');
	}

	if (step !== null) {
		return (
			<PendingAuthFlow
				initialStep={step}
				redirectTo={redirectTo}
				onAuthenticated={onAuthenticated}
			/>
		);
	}

	return (
		<AuthShell
			eyebrow="SIMMER sign in"
			title="Sign in to your workspace"
			footer={
				<div className="grid gap-1">
					<span>
						New to SIMMER?{' '}
						<Link to="/sign-up" className="text-primary underline-offset-4 hover:underline">
							Create an account
						</Link>
					</span>
					<Link to="/forgot-password" className="text-primary underline-offset-4 hover:underline">
						Forgot your password?
					</Link>
				</div>
			}
		>
			<form onSubmit={handleCredentials}>
				<FieldGroup>
					<FormError message={error} />
					<Field>
						<FieldLabel htmlFor="signin-email">Email</FieldLabel>
						<Input
							id="signin-email"
							type="email"
							autoComplete="email"
							required
							value={email}
							onChange={(event) => setEmail(event.target.value)}
						/>
					</Field>
					<Field>
						<FieldLabel htmlFor="signin-password">Password</FieldLabel>
						<Input
							id="signin-password"
							type="password"
							autoComplete="current-password"
							required
							value={password}
							onChange={(event) => setPassword(event.target.value)}
						/>
					</Field>
					<Button type="submit" disabled={pending}>
						{pending ? 'Signing in…' : 'Sign in'}
					</Button>
				</FieldGroup>
			</form>
		</AuthShell>
	);
}

// --- Sign up ---

export function SignUpPage({ redirectTo }: { readonly redirectTo: string }) {
	const onAuthenticated = useAuthSuccess();
	const [firstName, setFirstName] = useState('');
	const [lastName, setLastName] = useState('');
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [step, setStep] = useState<PendingStep | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	async function handleSubmit(event: FormEvent) {
		event.preventDefault();
		setPending(true);
		setError(null);

		const outcome = await signUp({
			email,
			password,
			...(firstName.trim() === '' ? {} : { firstName: firstName.trim() }),
			...(lastName.trim() === '' ? {} : { lastName: lastName.trim() }),
		});
		setPending(false);

		if (outcome.status === 'authenticated') {
			await onAuthenticated(outcome, redirectTo);
			return;
		}

		const next = toPendingStep(outcome, email);
		if (next !== null) {
			setStep(next);
			return;
		}

		if (outcome.status === 'email_taken') {
			setError('An account with this email already exists. Try signing in instead.');
			return;
		}

		if (outcome.status === 'weak_password') {
			setError(outcome.reason);
			return;
		}

		setError(outcome.status === 'error' ? outcome.reason : 'Unable to create your account.');
	}

	if (step !== null) {
		return (
			<PendingAuthFlow
				initialStep={step}
				redirectTo={redirectTo}
				onAuthenticated={onAuthenticated}
			/>
		);
	}

	return (
		<AuthShell
			eyebrow="SIMMER sign up"
			title="Create your account"
			description="You'll confirm your email with a short code after this step."
			footer={
				<span>
					Already have an account?{' '}
					<Link to="/sign-in" className="text-primary underline-offset-4 hover:underline">
						Sign in
					</Link>
				</span>
			}
		>
			<form onSubmit={handleSubmit}>
				<FieldGroup>
					<FormError message={error} />
					<div className="grid grid-cols-2 gap-3">
						<Field>
							<FieldLabel htmlFor="signup-first">First name</FieldLabel>
							<Input
								id="signup-first"
								autoComplete="given-name"
								value={firstName}
								onChange={(event) => setFirstName(event.target.value)}
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor="signup-last">Last name</FieldLabel>
							<Input
								id="signup-last"
								autoComplete="family-name"
								value={lastName}
								onChange={(event) => setLastName(event.target.value)}
							/>
						</Field>
					</div>
					<Field>
						<FieldLabel htmlFor="signup-email">Email</FieldLabel>
						<Input
							id="signup-email"
							type="email"
							autoComplete="email"
							required
							value={email}
							onChange={(event) => setEmail(event.target.value)}
						/>
					</Field>
					<Field>
						<FieldLabel htmlFor="signup-password">Password</FieldLabel>
						<Input
							id="signup-password"
							type="password"
							autoComplete="new-password"
							required
							minLength={8}
							value={password}
							onChange={(event) => setPassword(event.target.value)}
						/>
						<FieldError>At least 8 characters.</FieldError>
					</Field>
					<Button type="submit" disabled={pending}>
						{pending ? 'Creating account…' : 'Create account'}
					</Button>
				</FieldGroup>
			</form>
		</AuthShell>
	);
}

// --- Post-credential steps: email verification and organization selection ---

type PendingStep =
	| { readonly kind: 'verify'; readonly email: string; readonly pendingAuthenticationToken: string }
	| {
			readonly kind: 'select_org';
			readonly organizations: readonly AuthOrganizationChoice[];
			readonly pendingAuthenticationToken: string;
	  };

/** Maps a sign-in/sign-up challenge outcome to the next inline step, or null if there is none. */
function toPendingStep(
	outcome: SignInOutcome | SignUpOutcome,
	fallbackEmail: string,
): PendingStep | null {
	if (outcome.status === 'verification_required') {
		return {
			kind: 'verify',
			email: outcome.email === '' ? fallbackEmail : outcome.email,
			pendingAuthenticationToken: outcome.pendingAuthenticationToken,
		};
	}

	if (outcome.status === 'organization_selection_required') {
		return {
			kind: 'select_org',
			organizations: outcome.organizations,
			pendingAuthenticationToken: outcome.pendingAuthenticationToken,
		};
	}

	return null;
}

/**
 * Drives the steps WorkOS may require after valid credentials: email
 * verification and/or organization selection. Verification can itself surface an
 * organization-selection step, so this owns the transition between the two.
 */
function PendingAuthFlow({
	initialStep,
	redirectTo,
	onAuthenticated,
}: {
	readonly initialStep: PendingStep;
	readonly redirectTo: string;
	readonly onAuthenticated: (outcome: AuthenticatedOutcome, redirectTo: string) => Promise<void>;
}) {
	const [step, setStep] = useState<PendingStep>(initialStep);

	if (step.kind === 'select_org') {
		return (
			<OrgSelectStep
				organizations={step.organizations}
				pendingAuthenticationToken={step.pendingAuthenticationToken}
				redirectTo={redirectTo}
				onAuthenticated={onAuthenticated}
			/>
		);
	}

	return (
		<VerifyEmailStep
			email={step.email}
			pendingAuthenticationToken={step.pendingAuthenticationToken}
			redirectTo={redirectTo}
			onAuthenticated={onAuthenticated}
			onRequireOrganization={(pendingAuthenticationToken, organizations) =>
				setStep({ kind: 'select_org', organizations, pendingAuthenticationToken })
			}
		/>
	);
}

function VerifyEmailStep({
	email,
	pendingAuthenticationToken,
	redirectTo,
	onAuthenticated,
	onRequireOrganization,
}: {
	readonly email: string;
	readonly pendingAuthenticationToken: string;
	readonly redirectTo: string;
	readonly onAuthenticated: (outcome: AuthenticatedOutcome, redirectTo: string) => Promise<void>;
	readonly onRequireOrganization: (
		pendingAuthenticationToken: string,
		organizations: readonly AuthOrganizationChoice[],
	) => void;
}) {
	const [code, setCode] = useState('');
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	async function handleSubmit(event: FormEvent) {
		event.preventDefault();
		setPending(true);
		setError(null);

		const outcome = await verifyEmail({ code, pendingAuthenticationToken });
		setPending(false);

		if (outcome.status === 'authenticated') {
			await onAuthenticated(outcome, redirectTo);
			return;
		}

		if (outcome.status === 'organization_selection_required') {
			onRequireOrganization(outcome.pendingAuthenticationToken, outcome.organizations);
			return;
		}

		setError(
			outcome.status === 'invalid_code'
				? "That code didn't match. Check your email and try again."
				: outcome.reason,
		);
	}

	return (
		<AuthShell
			eyebrow="Confirm your email"
			title="Enter your verification code"
			description={`We sent a code to ${email}.`}
		>
			<form onSubmit={handleSubmit}>
				<FieldGroup>
					<FormError message={error} />
					<Field>
						<FieldLabel htmlFor="verify-code">Verification code</FieldLabel>
						<Input
							id="verify-code"
							inputMode="numeric"
							autoComplete="one-time-code"
							required
							value={code}
							onChange={(event) => setCode(event.target.value)}
						/>
					</Field>
					<Button type="submit" disabled={pending}>
						{pending ? 'Verifying…' : 'Verify and continue'}
					</Button>
				</FieldGroup>
			</form>
		</AuthShell>
	);
}

function OrgSelectStep({
	organizations,
	pendingAuthenticationToken,
	redirectTo,
	onAuthenticated,
}: {
	readonly organizations: readonly AuthOrganizationChoice[];
	readonly pendingAuthenticationToken: string;
	readonly redirectTo: string;
	readonly onAuthenticated: (outcome: AuthenticatedOutcome, redirectTo: string) => Promise<void>;
}) {
	const [error, setError] = useState<string | null>(null);
	const [pendingId, setPendingId] = useState<string | null>(null);

	async function choose(organizationId: string) {
		setPendingId(organizationId);
		setError(null);

		const outcome = await selectOrganization({ organizationId, pendingAuthenticationToken });
		setPendingId(null);

		if (outcome.status === 'authenticated') {
			await onAuthenticated(outcome, redirectTo);
			return;
		}

		setError(
			outcome.status === 'invalid_selection'
				? 'That selection is no longer valid. Please sign in again.'
				: outcome.reason,
		);
	}

	return (
		<AuthShell
			eyebrow="Choose organization"
			title="Select your organization"
			description="Your account has access to more than one organization. Pick one to continue."
		>
			<FieldGroup>
				<FormError message={error} />
				<div className="grid gap-2">
					{organizations.map((organization) => (
						<Button
							key={organization.id}
							type="button"
							variant="outline"
							className="h-auto min-h-9 justify-start whitespace-normal break-words py-2 text-left"
							disabled={pendingId !== null}
							onClick={() => void choose(organization.id)}
						>
							{pendingId === organization.id ? 'Continuing…' : organization.name}
						</Button>
					))}
				</div>
			</FieldGroup>
		</AuthShell>
	);
}

// --- Forgot password ---

export function ForgotPasswordPage() {
	const [email, setEmail] = useState('');
	const [submitted, setSubmitted] = useState(false);
	const [pending, setPending] = useState(false);

	async function handleSubmit(event: FormEvent) {
		event.preventDefault();
		setPending(true);
		await requestPasswordReset({ email });
		setPending(false);
		setSubmitted(true);
	}

	if (submitted) {
		return (
			<AuthShell
				eyebrow="Check your email"
				title="Password reset sent"
				description={`If an account exists for ${email}, we've sent a link to reset your password.`}
				footer={
					<Link to="/sign-in" className="text-primary underline-offset-4 hover:underline">
						Back to sign in
					</Link>
				}
			>
				<div />
			</AuthShell>
		);
	}

	return (
		<AuthShell
			eyebrow="Reset password"
			title="Forgot your password?"
			description="Enter your email and we'll send a reset link."
			footer={
				<Link to="/sign-in" className="text-primary underline-offset-4 hover:underline">
					Back to sign in
				</Link>
			}
		>
			<form onSubmit={handleSubmit}>
				<FieldGroup>
					<Field>
						<FieldLabel htmlFor="forgot-email">Email</FieldLabel>
						<Input
							id="forgot-email"
							type="email"
							autoComplete="email"
							required
							value={email}
							onChange={(event) => setEmail(event.target.value)}
						/>
					</Field>
					<Button type="submit" disabled={pending}>
						{pending ? 'Sending…' : 'Send reset link'}
					</Button>
				</FieldGroup>
			</form>
		</AuthShell>
	);
}

// --- Reset password ---

export function ResetPasswordPage({ token }: { readonly token: string }) {
	const navigate = useNavigate();
	const [password, setPassword] = useState('');
	const [confirm, setConfirm] = useState('');
	const [done, setDone] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	async function handleSubmit(event: FormEvent) {
		event.preventDefault();
		setError(null);

		if (password !== confirm) {
			setError('Passwords do not match.');
			return;
		}

		setPending(true);
		const outcome = await resetPassword({ token, newPassword: password });
		setPending(false);

		if (outcome.status === 'ok') {
			setDone(true);
			return;
		}

		if (outcome.status === 'invalid_token') {
			setError('This reset link is invalid or has expired. Request a new one.');
			return;
		}

		if (outcome.status === 'weak_password') {
			setError(outcome.reason);
			return;
		}

		setError(outcome.reason);
	}

	if (token.trim() === '') {
		return (
			<AuthShell
				eyebrow="Reset password"
				title="Invalid reset link"
				description="This link is missing its reset token. Request a new password reset."
				footer={
					<Link to="/forgot-password" className="text-primary underline-offset-4 hover:underline">
						Request a new link
					</Link>
				}
			>
				<div />
			</AuthShell>
		);
	}

	if (done) {
		return (
			<AuthShell
				eyebrow="Password updated"
				title="Your password was changed"
				description="You can now sign in with your new password."
			>
				<Button onClick={() => void navigate({ to: '/sign-in' })}>Continue to sign in</Button>
			</AuthShell>
		);
	}

	return (
		<AuthShell eyebrow="Reset password" title="Choose a new password">
			<form onSubmit={handleSubmit}>
				<FieldGroup>
					<FormError message={error} />
					<Field>
						<FieldLabel htmlFor="reset-password">New password</FieldLabel>
						<Input
							id="reset-password"
							type="password"
							autoComplete="new-password"
							required
							minLength={8}
							value={password}
							onChange={(event) => setPassword(event.target.value)}
						/>
						<FieldError>At least 8 characters.</FieldError>
					</Field>
					<Field>
						<FieldLabel htmlFor="reset-confirm">Confirm new password</FieldLabel>
						<Input
							id="reset-confirm"
							type="password"
							autoComplete="new-password"
							required
							value={confirm}
							onChange={(event) => setConfirm(event.target.value)}
						/>
					</Field>
					<Button type="submit" disabled={pending}>
						{pending ? 'Updating…' : 'Update password'}
					</Button>
				</FieldGroup>
			</form>
		</AuthShell>
	);
}

// --- Accept invitation ---

type InvitationState =
	| { readonly status: 'loading' }
	| { readonly status: 'ready'; readonly email: string }
	| { readonly status: 'invalid' };

export function AcceptInvitationPage({ token }: { readonly token: string }) {
	const onAuthenticated = useAuthSuccess();
	const [invitation, setInvitation] = useState<InvitationState>({ status: 'loading' });
	const [firstName, setFirstName] = useState('');
	const [lastName, setLastName] = useState('');
	const [password, setPassword] = useState('');
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	useEffect(() => {
		let active = true;

		if (token.trim() === '') {
			setInvitation({ status: 'invalid' });
			return;
		}

		void fetchInvitation(token).then((result) => {
			if (!active) {
				return;
			}

			setInvitation(
				result !== null && result.state === 'pending'
					? { status: 'ready', email: result.email }
					: { status: 'invalid' },
			);
		});

		return () => {
			active = false;
		};
	}, [token]);

	if (invitation.status === 'loading') {
		return (
			<AuthShell eyebrow="Invitation" title="Loading your invitation…">
				<div />
			</AuthShell>
		);
	}

	if (invitation.status === 'invalid') {
		return (
			<AuthShell
				eyebrow="Invitation"
				title="This invitation isn't valid"
				description="It may have expired, been revoked, or already been accepted."
				footer={
					<Link to="/sign-in" className="text-primary underline-offset-4 hover:underline">
						Go to sign in
					</Link>
				}
			>
				<div />
			</AuthShell>
		);
	}

	async function handleSubmit(event: FormEvent) {
		event.preventDefault();
		setPending(true);
		setError(null);

		const outcome = await acceptInvitation({
			invitationToken: token,
			password,
			...(firstName.trim() === '' ? {} : { firstName: firstName.trim() }),
			...(lastName.trim() === '' ? {} : { lastName: lastName.trim() }),
		});
		setPending(false);

		if (outcome.status === 'authenticated') {
			await onAuthenticated(outcome, '/');
			return;
		}

		if (outcome.status === 'account_exists') {
			setError('You already have a SIMMER account. Sign in to accept this invitation.');
			return;
		}

		if (outcome.status === 'invalid_invitation') {
			setInvitation({ status: 'invalid' });
			return;
		}

		if (outcome.status === 'weak_password') {
			setError(outcome.reason);
			return;
		}

		setError(outcome.reason);
	}

	return (
		<AuthShell
			eyebrow="Accept invitation"
			title="Set up your account"
			description={`You were invited as ${invitation.email}.`}
			footer={
				<span>
					Already have an account?{' '}
					<Link to="/sign-in" className="text-primary underline-offset-4 hover:underline">
						Sign in to accept
					</Link>
				</span>
			}
		>
			<form onSubmit={handleSubmit}>
				<FieldGroup>
					<FormError message={error} />
					<div className="grid grid-cols-2 gap-3">
						<Field>
							<FieldLabel htmlFor="invite-first">First name</FieldLabel>
							<Input
								id="invite-first"
								autoComplete="given-name"
								value={firstName}
								onChange={(event) => setFirstName(event.target.value)}
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor="invite-last">Last name</FieldLabel>
							<Input
								id="invite-last"
								autoComplete="family-name"
								value={lastName}
								onChange={(event) => setLastName(event.target.value)}
							/>
						</Field>
					</div>
					<Field>
						<FieldLabel htmlFor="invite-password">Create a password</FieldLabel>
						<Input
							id="invite-password"
							type="password"
							autoComplete="new-password"
							required
							minLength={8}
							value={password}
							onChange={(event) => setPassword(event.target.value)}
						/>
						<FieldError>At least 8 characters.</FieldError>
					</Field>
					<Button type="submit" disabled={pending}>
						{pending ? 'Setting up…' : 'Accept invitation'}
					</Button>
				</FieldGroup>
			</form>
		</AuthShell>
	);
}
