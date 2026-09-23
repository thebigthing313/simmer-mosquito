import { CredentialsFields, VerificationCodeFields } from '@simmer-mosquito/ui-web/components/auth';
import { SignedOutEnvironmentBanner } from '@simmer-mosquito/ui-web/components/environment-banner';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { useNavigate } from '@tanstack/react-router';
import { type FormEvent, type ReactNode, useState } from 'react';
import {
	type AuthOrganizationChoice,
	getOperatorOrganizationId,
	selectOrganization,
	signIn,
	verifyEmail,
} from '../api';
import { appAuthController } from '../app-auth';

/**
 * Operator sign-in: the in-app email + password flow `apps/web` uses (ADR
 * 0010), posting to the same public `/auth/*` endpoints. There is no sign-up
 * link, because operator accounts are provisioned. WorkOS may still ask for a
 * verification code or an organization choice; the code is collected and the
 * organization is answered by `resolveOrganization`.
 */

/** The only challenge this console asks the operator to answer. */
type PendingStep = { readonly kind: 'verify'; readonly token: string; readonly email: string };

/** A dead end, stated plainly, with the one action that helps. */
interface Refusal {
	readonly title: string;
	readonly body: string;
}

const NOT_AN_OPERATOR: Refusal = {
	title: 'Not an Operator Account',
	body: 'This account is not a member of the SIMMER organization, which is what operator access is. Your own work happens in the SIMMER web app.',
};

function AuthShell({
	title,
	description,
	children,
}: {
	readonly title: string;
	readonly description: string;
	readonly children: ReactNode;
}) {
	// The strip sits outside the centring grid so it pins to the top and takes
	// no height when it renders `null`.
	return (
		<div className="flex min-h-svh flex-col bg-simmer-green-900">
			<SignedOutEnvironmentBanner environment={import.meta.env.VITE_SIMMER_ENVIRONMENT} />
			<div className="grid flex-1 place-items-center px-6 py-12">
				<div className="w-full max-w-[400px]">
					<div className="mb-8 grid justify-items-center gap-3">
						<img alt="SIMMER" className="h-12 w-auto" src="/logo.svg" />
						<p className="m-0 text-simmer-green-100/70 text-xs font-extrabold uppercase tracking-[0.14em]">
							Operations Console
						</p>
					</div>
					<div className="grid gap-6 rounded-xl border border-border bg-card p-7 shadow-lg">
						<header className="grid gap-2">
							<h1 className="m-0 text-balance font-bold text-[1.4rem] text-foreground leading-tight tracking-[-0.01em]">
								{title}
							</h1>
							<p className="m-0 text-muted-foreground text-sm leading-normal">{description}</p>
						</header>
						{children}
					</div>
				</div>
			</div>
		</div>
	);
}

export function OperatorSignInPage({ redirectTo }: { readonly redirectTo: string }) {
	const navigate = useNavigate();
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [step, setStep] = useState<PendingStep | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [refusal, setRefusal] = useState<Refusal | null>(null);
	const [pending, setPending] = useState(false);

	async function finish() {
		await appAuthController.refresh();
		await navigate({ to: redirectTo });
	}

	function reset() {
		setStep(null);
		setRefusal(null);
		setError(null);
		setPassword('');
	}

	/**
	 * Answer WorkOS's organization challenge with the SIMMER organization, or
	 * refuse. There is no picker: an account outside the SIMMER organization is
	 * not an operator whichever organization it would pick.
	 */
	async function resolveOrganization(
		token: string,
		organizations: readonly AuthOrganizationChoice[],
	) {
		const operatorOrganizationId = getOperatorOrganizationId();

		if (operatorOrganizationId === null) {
			setRefusal({
				title: 'Console Not Configured',
				body: 'This console has no SIMMER organization configured, so it cannot tell an operator from anyone else. Set VITE_SIMMER_OPERATOR_ORG_ID on the admin service and redeploy.',
			});
			return;
		}

		if (!organizations.some((organization) => organization.id === operatorOrganizationId)) {
			setRefusal(NOT_AN_OPERATOR);
			return;
		}

		setPending(true);
		const outcome = await selectOrganization({
			organizationId: operatorOrganizationId,
			pendingAuthenticationToken: token,
		});
		setPending(false);

		if (outcome.status === 'authenticated') {
			await finish();
			return;
		}

		setRefusal(
			outcome.status === 'invalid_selection'
				? NOT_AN_OPERATOR
				: { title: 'Unable to Sign In', body: outcome.reason },
		);
	}

	async function handleCredentials(event: FormEvent) {
		event.preventDefault();
		setPending(true);
		setError(null);

		const outcome = await signIn({ email, password });
		setPending(false);

		if (outcome.status === 'authenticated') {
			/*
			 * No challenge means the account is in exactly one organization. It may not
			 * be SIMMER; the server refuses that case on the first `/admin/*` call.
			 */
			await finish();
			return;
		}
		if (outcome.status === 'verification_required') {
			setStep({ kind: 'verify', token: outcome.pendingAuthenticationToken, email: outcome.email });
			return;
		}
		if (outcome.status === 'organization_selection_required') {
			await resolveOrganization(outcome.pendingAuthenticationToken, outcome.organizations);
			return;
		}
		if (outcome.status === 'invalid_credentials') {
			setError('Incorrect email or password.');
			return;
		}
		setError(outcome.reason);
	}

	if (refusal !== null) {
		return (
			<AuthShell description={refusal.body} title={refusal.title}>
				<Button className="w-full" onClick={reset} size="lg" type="button" variant="outline">
					Use a different account
				</Button>
			</AuthShell>
		);
	}

	if (step?.kind === 'verify') {
		return (
			<VerifyStep
				email={step.email}
				onAuthenticated={finish}
				onOrganizationRequired={resolveOrganization}
				token={step.token}
			/>
		);
	}

	return (
		<AuthShell
			description="Sign in with your SIMMER operator account to manage organizations, taxonomy, and units."
			title="Operator Sign In"
		>
			<form onSubmit={handleCredentials}>
				<CredentialsFields
					email={email}
					error={error}
					onEmailChange={setEmail}
					onPasswordChange={setPassword}
					password={password}
					pending={pending}
					pendingLabel="Signing in…"
					submitLabel="Sign In"
				/>
			</form>
		</AuthShell>
	);
}

function VerifyStep({
	email,
	token,
	onAuthenticated,
	onOrganizationRequired,
}: {
	readonly email: string;
	readonly token: string;
	readonly onAuthenticated: () => Promise<void>;
	readonly onOrganizationRequired: (
		token: string,
		organizations: readonly AuthOrganizationChoice[],
	) => void;
}) {
	const [code, setCode] = useState('');
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	async function submit(event: FormEvent) {
		event.preventDefault();
		setPending(true);
		setError(null);

		const outcome = await verifyEmail({ code, pendingAuthenticationToken: token });
		setPending(false);

		if (outcome.status === 'authenticated') {
			await onAuthenticated();
			return;
		}
		if (outcome.status === 'organization_selection_required') {
			onOrganizationRequired(outcome.pendingAuthenticationToken, outcome.organizations);
			return;
		}
		setError(outcome.status === 'invalid_code' ? 'That code is not valid.' : outcome.reason);
	}

	return (
		<AuthShell description={`Enter the code sent to ${email}.`} title="Verify Your Email">
			<form onSubmit={submit}>
				<VerificationCodeFields
					code={code}
					error={error}
					onCodeChange={setCode}
					pending={pending}
					pendingLabel="Verifying…"
					submitLabel="Verify"
				/>
			</form>
		</AuthShell>
	);
}
