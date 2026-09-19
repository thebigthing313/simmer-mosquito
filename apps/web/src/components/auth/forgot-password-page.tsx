import { AuthSubmitButton } from '@simmer-mosquito/ui-web/components/auth';
import { Field, FieldGroup, FieldLabel } from '@simmer-mosquito/ui-web/components/ui/field';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { Link } from '@tanstack/react-router';
import { type FormEvent, useState } from 'react';
import { requestPasswordReset } from '../../auth';
import { AuthShell } from './auth-shell';

const _SpinnerIcon = iconRegistry.actions.loading.icon;

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
				title="Check Your Email"
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
			title="Forgot Your Password?"
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
					<AuthSubmitButton pending={pending} pendingLabel="Sending…">
						Send Reset Link
					</AuthSubmitButton>
				</FieldGroup>
			</form>
		</AuthShell>
	);
}
