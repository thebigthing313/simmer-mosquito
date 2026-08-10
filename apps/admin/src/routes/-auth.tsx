import { CredentialsFields, VerificationCodeFields } from '@simmer-mosquito/ui-web/components/auth';
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
 * Operator sign-in.
 *
 * The same in-app email + password flow `apps/web` uses (ADR 0010), posting to
 * the same public `/auth/*` endpoints — `/auth/*` CORS already admits
 * `ADMIN_APP_ORIGIN`, so this needed no server change. Same flow, so the fields
 * are the workspace's: `@simmer-mosquito/ui-web/components/auth`. What is here
 * is the console's own front door and its own answers.
 *
 * What is deliberately *not* here: sign-up, and a link to it. Operator accounts
 * are provisioned, not self-served — a stranger who reaches this page cannot
 * create their way onto `SIMMER_OPERATOR_EMAILS`, so offering the door would
 * only lead somewhere that refuses them one step later.
 *
 * WorkOS can still interrupt before it will mint a session: with a verification
 * code, or with an organization choice when the account belongs to more than one
 * — which operators routinely do, since `createAdminAgency`'s
 * `linkRequesterAsOwner` makes them the new agency's first owner.
 *
 * The code is collected. The organization is not: see `resolveOrganization`.
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
	body: 'This account is not a member of the SIMMER organization, which is what operator access is. Agency work happens in the SIMMER web app.',
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
	return (
		<div className="grid min-h-svh place-items-center bg-simmer-green-900 px-6 py-12">
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
	 * refuse.
	 *
	 * There is no picker. Being in the SIMMER organization *is* the operator
	 * boundary, so an account that is not in it has no business here whichever
	 * agency it would otherwise have chosen — offering a list would be asking a
	 * question where the only acceptable answer is already known.
	 */
	async function resolveOrganization(
		token: string,
		organizations: readonly AuthOrganizationChoice[],
	) {
		const operatorOrganizationId = getOperatorOrganizationId();

		if (operatorOrganizationId === null) {
			setRefusal({
				title: 'Console Not Configured',
				body: 'This console has no SIMMER organization configured, so it cannot tell an operator from an agency member. Set VITE_SIMMER_OPERATOR_ORG_ID on the admin service and redeploy.',
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
			 * No challenge means this account is in exactly one organization, so
			 * WorkOS issued the session outright and there was nothing to choose. It
			 * may not be SIMMER — the server's `SIMMER_OPERATOR_EMAILS` allowlist is
			 * what refuses that case, on the first `/admin/*` call.
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
			description="Sign in with your SIMMER operator account to manage agencies, taxonomy, and units."
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
