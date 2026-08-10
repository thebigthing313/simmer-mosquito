import { AuthFormError } from '@simmer-mosquito/ui-web/components/auth/auth-form-error';
import { AuthSubmitButton } from '@simmer-mosquito/ui-web/components/auth/auth-submit-button';
import { Field, FieldGroup, FieldLabel } from '@simmer-mosquito/ui-web/components/ui/field';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';

/**
 * The code WorkOS just emailed, on the step that has nothing else to do.
 *
 * `one-time-code` lets the platform offer the code straight from the message,
 * `inputMode="numeric"` brings up the right keyboard, and the field takes focus
 * because it is the only thing on the screen. The caller owns the `<form>`, the
 * step's title, and what the outcome means — verification can hand back an
 * organization challenge, and the two apps answer that differently.
 */
export function VerificationCodeFields({
	code,
	onCodeChange,
	error,
	pending,
	submitLabel,
	pendingLabel,
}: {
	readonly code: string;
	readonly onCodeChange: (value: string) => void;
	readonly error: string | null;
	readonly pending: boolean;
	readonly submitLabel: string;
	readonly pendingLabel: string;
}) {
	return (
		<FieldGroup>
			<AuthFormError message={error} />
			<Field>
				<FieldLabel htmlFor="verify-code">Verification code</FieldLabel>
				<Input
					autoComplete="one-time-code"
					autoFocus
					id="verify-code"
					inputMode="numeric"
					onChange={(event) => onCodeChange(event.target.value)}
					required
					value={code}
				/>
			</Field>
			<AuthSubmitButton pending={pending} pendingLabel={pendingLabel}>
				{submitLabel}
			</AuthSubmitButton>
		</FieldGroup>
	);
}
