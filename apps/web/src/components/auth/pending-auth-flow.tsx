import type {
	AcceptInvitationOutcome,
	AuthenticatedOutcome,
	AuthOrganizationChoice,
	SignInOutcome,
	SignUpOutcome,
} from '@simmer-mosquito/auth/browser';
import { AuthFormError, VerificationCodeFields } from '@simmer-mosquito/ui-web/components/auth';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { FieldGroup } from '@simmer-mosquito/ui-web/components/ui/field';
import { type FormEvent, useState } from 'react';
import { selectOrganization, verifyEmail } from '../../auth';
import { AuthShell } from './auth-shell';

export type PendingStep =
	| { readonly kind: 'verify'; readonly email: string; readonly pendingAuthenticationToken: string }
	| {
			readonly kind: 'select_org';
			readonly organizations: readonly AuthOrganizationChoice[];
			readonly pendingAuthenticationToken: string;
	  };

/** Maps a credential-step challenge outcome to the next inline step, or null if there is none. */
export function toPendingStep(
	outcome: SignInOutcome | SignUpOutcome | AcceptInvitationOutcome,
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
export function PendingAuthFlow({
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
			title="Enter Your Verification Code"
			description={
				<>
					We sent a code to <span className="font-medium text-foreground">{email}</span>.
				</>
			}
		>
			<form onSubmit={handleSubmit}>
				<VerificationCodeFields
					code={code}
					error={error}
					onCodeChange={setCode}
					pending={pending}
					pendingLabel="Verifying…"
					submitLabel="Verify and Continue"
				/>
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
			title="Select Your Organization"
			description="Your account has access to more than one organization. Pick one to continue."
		>
			<FieldGroup>
				<AuthFormError message={error} />
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
