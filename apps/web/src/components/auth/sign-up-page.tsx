import { AuthFormError, AuthSubmitButton } from '@simmer-mosquito/ui-web/components/auth';
import { Field, FieldGroup, FieldLabel } from '@simmer-mosquito/ui-web/components/ui/field';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { Link } from '@tanstack/react-router';
import { type FormEvent, useState } from 'react';
import { signUp } from '../../auth';
import { useAuthSuccess } from '../../hooks/auth/use-auth-success';
import { AuthShell } from './auth-shell';
import { NewPasswordFields } from './new-password-fields';
import { PendingAuthFlow, type PendingStep, toPendingStep } from './pending-auth-flow';

const _SpinnerIcon = iconRegistry.actions.loading.icon;

export function SignUpPage({ redirectTo }: { readonly redirectTo: string }) {
	const onAuthenticated = useAuthSuccess();
	const [firstName, setFirstName] = useState('');
	const [lastName, setLastName] = useState('');
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [confirm, setConfirm] = useState('');
	const [step, setStep] = useState<PendingStep | null>(null);
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
			title="Create Your Account"
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
					<AuthFormError message={error} />
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
					<NewPasswordFields
						confirm={confirm}
						idPrefix="signup"
						label="Password"
						onConfirmChange={setConfirm}
						onPasswordChange={setPassword}
						password={password}
					/>
					<AuthSubmitButton pending={pending} pendingLabel="Creating account…">
						Create Account
					</AuthSubmitButton>
				</FieldGroup>
			</form>
		</AuthShell>
	);
}
