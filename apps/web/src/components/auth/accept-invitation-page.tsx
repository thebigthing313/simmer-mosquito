import { AuthFormError, AuthSubmitButton } from '@simmer-mosquito/ui-web/components/auth';
import { Field, FieldGroup, FieldLabel } from '@simmer-mosquito/ui-web/components/ui/field';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { Link } from '@tanstack/react-router';
import { type FormEvent, useEffect, useState } from 'react';
import { acceptInvitation, fetchInvitation } from '../../auth';
import { useAuthSuccess } from '../../hooks/auth/use-auth-success';
import { AuthShell } from './auth-shell';
import { NewPasswordFields } from './new-password-fields';
import { PendingAuthFlow, type PendingStep, toPendingStep } from './pending-auth-flow';

const SpinnerIcon = iconRegistry.actions.loading.icon;

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
	const [confirm, setConfirm] = useState('');
	const [step, setStep] = useState<PendingStep | null>(null);
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

	if (step !== null) {
		return <PendingAuthFlow initialStep={step} redirectTo="/" onAuthenticated={onAuthenticated} />;
	}

	if (invitation.status === 'loading') {
		return (
			<AuthShell title="Loading Your Invitation…">
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
				title="This Invitation Isn't Valid"
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
		setError(null);

		if (password !== confirm) {
			setError('Passwords do not match.');
			return;
		}

		setPending(true);
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

		const next = toPendingStep(outcome, invitation.status === 'ready' ? invitation.email : '');
		if (next !== null) {
			setStep(next);
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

		setError(outcome.status === 'error' ? outcome.reason : 'Unable to accept the invitation.');
	}

	return (
		<AuthShell
			title="Set Up Your Account"
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
					<AuthFormError message={error} />
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
					<NewPasswordFields
						confirm={confirm}
						idPrefix="invite"
						label="Create a password"
						onConfirmChange={setConfirm}
						onPasswordChange={setPassword}
						password={password}
					/>
					<AuthSubmitButton pending={pending} pendingLabel="Setting up…">
						Accept Invitation
					</AuthSubmitButton>
				</FieldGroup>
			</form>
		</AuthShell>
	);
}
