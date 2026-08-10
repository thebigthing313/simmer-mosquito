import { AuthFormError } from '@simmer-mosquito/ui-web/components/auth/auth-form-error';
import { AuthSubmitButton } from '@simmer-mosquito/ui-web/components/auth/auth-submit-button';
import { PasswordField } from '@simmer-mosquito/ui-web/components/password-field';
import { Field, FieldGroup, FieldLabel } from '@simmer-mosquito/ui-web/components/ui/field';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';

/**
 * Email and password, the way both front doors ask for them.
 *
 * The caller owns the `<form>` and its submit handler — this is the fieldset
 * inside it, so the agency workspace and the operator console can disagree about
 * everything around the credentials (their shells, their footers, what they do
 * with the outcome) while agreeing about the credentials themselves. The
 * autofill hints are the reason that agreement matters: `autoComplete="email"`
 * and `current-password` are what let a password manager fill the form, and a
 * second copy of the fieldset is a second chance to get them wrong.
 */
export function CredentialsFields({
	email,
	password,
	onEmailChange,
	onPasswordChange,
	error,
	pending,
	submitLabel,
	pendingLabel,
}: {
	readonly email: string;
	readonly password: string;
	readonly onEmailChange: (value: string) => void;
	readonly onPasswordChange: (value: string) => void;
	readonly error: string | null;
	readonly pending: boolean;
	readonly submitLabel: string;
	readonly pendingLabel: string;
}) {
	return (
		<FieldGroup>
			<AuthFormError message={error} />
			<Field>
				<FieldLabel htmlFor="signin-email">Email</FieldLabel>
				<Input
					autoComplete="email"
					id="signin-email"
					onChange={(event) => onEmailChange(event.target.value)}
					required
					type="email"
					value={email}
				/>
			</Field>
			<PasswordField
				autoComplete="current-password"
				id="signin-password"
				label="Password"
				onChange={onPasswordChange}
				value={password}
			/>
			<AuthSubmitButton pending={pending} pendingLabel={pendingLabel}>
				{submitLabel}
			</AuthSubmitButton>
		</FieldGroup>
	);
}
