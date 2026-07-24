import { Alert, AlertDescription } from '@simmer-mosquito/ui-web/components/ui/alert';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from '@simmer-mosquito/ui-web/components/ui/field';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupInput,
} from '@simmer-mosquito/ui-web/components/ui/input-group';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
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
 *
 * Visually these share the landing page's committed "map room" identity: a
 * drenched-green brand stage beside a calm form column, so signing in feels like
 * the same product as the surface the user arrived from.
 */

const SpinnerIcon = iconRegistry.actions.loading.icon;
const EyeShowIcon = iconRegistry.generic.eye.icon;
const EyeHideIcon = iconRegistry.generic.eyeOff.icon;

/**
 * The committed brand stage. On desktop it's a full-height green column carrying
 * the SIMMER logo and a stable value line; on mobile it collapses to a compact
 * logo band above the form so the task stays above the fold.
 */
function AuthStage() {
	return (
		<section className="landing-stage relative isolate flex overflow-hidden px-8 py-8 text-white lg:min-h-screen lg:px-14 lg:py-12">
			<div className="landing-rise relative z-10 flex flex-1 flex-col">
				<img
					src="/logo.svg"
					alt="SIMMER"
					width={248}
					height={122}
					className="landing-logo w-[150px] lg:w-[208px]"
				/>
				<div className="hidden flex-1 flex-col justify-center gap-5 lg:flex">
					<h2 className="m-0 max-w-[13ch] text-balance font-bold text-[clamp(1.7rem,1.05rem+1.4vw,2.35rem)] leading-[1.08] tracking-[-0.02em]">
						Your agency&rsquo;s map room.
					</h2>
					<p className="m-0 max-w-[42ch] text-pretty text-[1.02rem] leading-relaxed text-simmer-green-100">
						Surveillance, control operations, and public requests — every record tied to the ground
						it happens on.
					</p>
				</div>
				<p className="mt-8 hidden text-[0.82rem] leading-normal text-simmer-green-100/85 lg:block">
					Built for the mosquito control and surveillance agencies that keep communities protected.
				</p>
			</div>
		</section>
	);
}

function AuthShell({
	title,
	description,
	children,
	footer,
}: {
	readonly title: string;
	readonly description?: ReactNode;
	readonly children?: ReactNode;
	readonly footer?: ReactNode;
}) {
	return (
		<div className="grid min-h-screen grid-rows-[auto_1fr] lg:grid-cols-[1.02fr_0.98fr] lg:grid-rows-1">
			<AuthStage />
			<section className="landing-fade flex items-center justify-center bg-(--app-stage) px-6 py-10 sm:px-10 lg:py-14">
				<div className="flex w-full max-w-[400px] flex-col gap-6">
					<header className="grid gap-2">
						<h1 className="m-0 text-balance text-[1.55rem] font-bold leading-tight tracking-[-0.01em] text-foreground">
							{title}
						</h1>
						{description ? (
							<p className="m-0 leading-normal text-muted-foreground">{description}</p>
						) : null}
					</header>
					{children}
					{footer ? (
						<div className="border-t border-border/60 pt-5 text-sm text-muted-foreground">
							{footer}
						</div>
					) : null}
				</div>
			</section>
		</div>
	);
}

/** Primary submit action, sized and stretched to match the landing entry CTAs. */
function SubmitButton({
	pending,
	children,
	pendingLabel,
}: {
	readonly pending: boolean;
	readonly children: ReactNode;
	readonly pendingLabel: string;
}) {
	return (
		<Button type="submit" size="lg" className="w-full" disabled={pending}>
			{pending ? pendingLabel : children}
		</Button>
	);
}

/**
 * Password input with a reveal toggle. Auth is exactly where users need to
 * confirm what they typed, so every password field gets a show/hide control.
 */
function PasswordField({
	id,
	label,
	autoComplete,
	value,
	onChange,
	minLength,
	hint,
}: {
	readonly id: string;
	readonly label: string;
	readonly autoComplete: string;
	readonly value: string;
	readonly onChange: (value: string) => void;
	readonly minLength?: number;
	readonly hint?: string;
}) {
	const [visible, setVisible] = useState(false);
	const ToggleIcon = visible ? EyeHideIcon : EyeShowIcon;

	return (
		<Field>
			<FieldLabel htmlFor={id}>{label}</FieldLabel>
			<InputGroup>
				<InputGroupInput
					id={id}
					type={visible ? 'text' : 'password'}
					autoComplete={autoComplete}
					required
					{...(minLength === undefined ? {} : { minLength })}
					value={value}
					onChange={(event) => onChange(event.target.value)}
				/>
				<InputGroupAddon align="inline-end">
					<InputGroupButton
						type="button"
						size="icon-xs"
						aria-pressed={visible}
						aria-label={visible ? 'Hide password' : 'Show password'}
						onClick={() => setVisible((current) => !current)}
					>
						<ToggleIcon className="size-4" />
					</InputGroupButton>
				</InputGroupAddon>
			</InputGroup>
			{hint ? <FieldDescription>{hint}</FieldDescription> : null}
		</Field>
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
			title="Sign in to your workspace"
			description="Welcome back. Enter your details to reach your agency."
			footer={
				<div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
					<span>
						New to SIMMER?{' '}
						<Link
							to="/sign-up"
							className="font-medium text-primary underline-offset-4 hover:underline"
						>
							Create an account
						</Link>
					</span>
					<Link
						to="/forgot-password"
						className="font-medium text-primary underline-offset-4 hover:underline"
					>
						Forgot password?
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
					<PasswordField
						id="signin-password"
						label="Password"
						autoComplete="current-password"
						value={password}
						onChange={setPassword}
					/>
					<SubmitButton pending={pending} pendingLabel="Signing in…">
						Sign in
					</SubmitButton>
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
			title="Create your account"
			description="You'll confirm your email with a short code after this step."
			footer={
				<span>
					Already have an account?{' '}
					<Link
						to="/sign-in"
						className="font-medium text-primary underline-offset-4 hover:underline"
					>
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
					<PasswordField
						id="signup-password"
						label="Password"
						autoComplete="new-password"
						minLength={8}
						hint="At least 8 characters."
						value={password}
						onChange={setPassword}
					/>
					<SubmitButton pending={pending} pendingLabel="Creating account…">
						Create account
					</SubmitButton>
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
			title="Enter your verification code"
			description={
				<>
					We sent a code to <span className="font-medium text-foreground">{email}</span>.
				</>
			}
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
							autoFocus
							required
							value={code}
							onChange={(event) => setCode(event.target.value)}
						/>
					</Field>
					<SubmitButton pending={pending} pendingLabel="Verifying…">
						Verify and continue
					</SubmitButton>
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
							size="lg"
							className="h-auto min-h-11 justify-start whitespace-normal break-words py-2.5 text-left"
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
				title="Check your email"
				description={
					<>
						If an account exists for <span className="font-medium text-foreground">{email}</span>,
						we've sent a link to reset your password.
					</>
				}
				footer={
					<Link
						to="/sign-in"
						className="font-medium text-primary underline-offset-4 hover:underline"
					>
						Back to sign in
					</Link>
				}
			/>
		);
	}

	return (
		<AuthShell
			title="Forgot your password?"
			description="Enter your email and we'll send a reset link."
			footer={
				<Link to="/sign-in" className="font-medium text-primary underline-offset-4 hover:underline">
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
					<SubmitButton pending={pending} pendingLabel="Sending…">
						Send reset link
					</SubmitButton>
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
				title="Invalid reset link"
				description="This link is missing its reset token. Request a new password reset."
				footer={
					<Link
						to="/forgot-password"
						className="font-medium text-primary underline-offset-4 hover:underline"
					>
						Request a new link
					</Link>
				}
			/>
		);
	}

	if (done) {
		return (
			<AuthShell
				title="Your password was changed"
				description="You can now sign in with your new password."
			>
				<Button size="lg" className="w-full" onClick={() => void navigate({ to: '/sign-in' })}>
					Continue to sign in
				</Button>
			</AuthShell>
		);
	}

	return (
		<AuthShell
			title="Choose a new password"
			description="Set a new password for your account below."
		>
			<form onSubmit={handleSubmit}>
				<FieldGroup>
					<FormError message={error} />
					<PasswordField
						id="reset-password"
						label="New password"
						autoComplete="new-password"
						minLength={8}
						hint="At least 8 characters."
						value={password}
						onChange={setPassword}
					/>
					<PasswordField
						id="reset-confirm"
						label="Confirm new password"
						autoComplete="new-password"
						value={confirm}
						onChange={setConfirm}
					/>
					<SubmitButton pending={pending} pendingLabel="Updating…">
						Update password
					</SubmitButton>
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
			<AuthShell title="Loading your invitation…">
				<p className="flex items-center gap-2 text-sm text-muted-foreground">
					<SpinnerIcon className="size-4 animate-spin" aria-hidden="true" />
					Checking your invitation
				</p>
			</AuthShell>
		);
	}

	if (invitation.status === 'invalid') {
		return (
			<AuthShell
				title="This invitation isn't valid"
				description="It may have expired, been revoked, or already been accepted."
				footer={
					<Link
						to="/sign-in"
						className="font-medium text-primary underline-offset-4 hover:underline"
					>
						Go to sign in
					</Link>
				}
			/>
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
			title="Set up your account"
			description={
				<>
					You were invited as{' '}
					<span className="font-medium text-foreground">{invitation.email}</span>.
				</>
			}
			footer={
				<span>
					Already have an account?{' '}
					<Link
						to="/sign-in"
						className="font-medium text-primary underline-offset-4 hover:underline"
					>
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
					<PasswordField
						id="invite-password"
						label="Create a password"
						autoComplete="new-password"
						minLength={8}
						hint="At least 8 characters."
						value={password}
						onChange={setPassword}
					/>
					<SubmitButton pending={pending} pendingLabel="Setting up…">
						Accept invitation
					</SubmitButton>
				</FieldGroup>
			</form>
		</AuthShell>
	);
}
