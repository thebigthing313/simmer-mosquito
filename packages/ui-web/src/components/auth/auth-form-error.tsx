import { Alert, AlertDescription } from '@simmer-mosquito/ui-web/components/ui/alert';

/**
 * Whatever went wrong with the last submission, said once above the fields.
 *
 * Null-safe on purpose: every auth form holds its error as `string | null` and
 * renders this unconditionally, so the absence of an error is this component's
 * business rather than a conditional at each of the eight call sites.
 */
export function AuthFormError({ message }: { readonly message: string | null }) {
	if (message === null) {
		return null;
	}

	return (
		<Alert variant="destructive">
			<AlertDescription>{message}</AlertDescription>
		</Alert>
	);
}
