import { AuthFormError, AuthSubmitButton } from '@simmer-mosquito/ui-web/components/auth';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { FieldGroup } from '@simmer-mosquito/ui-web/components/ui/field';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { Link, useNavigate } from '@tanstack/react-router';
import { type FormEvent, useState } from 'react';
import { resetPassword } from '../../auth';
import { AuthShell } from './auth-shell';
import { NewPasswordFields } from './new-password-fields';

const _SpinnerIcon = iconRegistry.actions.loading.icon;

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
				title="Invalid Reset Link"
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
				title="Your Password Was Changed"
				description="You can now sign in with your new password."
			>
				<Button size="lg" className="w-full" onClick={() => void navigate({ to: '/sign-in' })}>
					Continue to Sign In
				</Button>
			</AuthShell>
		);
	}

	return (
		<AuthShell
			title="Choose a New Password"
			description="Set a new password for your account below."
		>
			<form onSubmit={handleSubmit}>
				<FieldGroup>
					<AuthFormError message={error} />
					<NewPasswordFields
						confirm={confirm}
						idPrefix="reset"
						label="New password"
						onConfirmChange={setConfirm}
						onPasswordChange={setPassword}
						password={password}
					/>
					<AuthSubmitButton pending={pending} pendingLabel="Updating…">
						Update Password
					</AuthSubmitButton>
				</FieldGroup>
			</form>
		</AuthShell>
	);
}
