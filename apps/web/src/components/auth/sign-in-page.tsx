import { CredentialsFields } from '@simmer-mosquito/ui-web/components/auth';
import { Link } from '@tanstack/react-router';
import { type FormEvent, useState } from 'react';
import { signIn } from '../../auth';
import { useAuthSuccess } from '../../hooks/auth/use-auth-success';
import { AuthShell } from './auth-shell';
import { PendingAuthFlow, type PendingStep, toPendingStep } from './pending-auth-flow';

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
			title="Sign In to Your Workspace"
			description="Welcome back. Enter your details to reach your organization."
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
