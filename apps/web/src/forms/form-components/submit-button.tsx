'use client';

import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Spinner } from '@simmer-mosquito/ui-web/components/ui/spinner';
import { useFormContext } from '../form-contexts';

export function SubmitButton({
	children = 'Save changes',
	disabled,
}: {
	readonly children?: React.ReactNode;
	readonly disabled?: boolean;
}) {
	const form = useFormContext();

	return (
		<form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting] as const}>
			{([canSubmit, isSubmitting]) => (
				<Button type="submit" disabled={disabled || !canSubmit || isSubmitting}>
					{isSubmitting ? <Spinner data-icon="inline-start" /> : null}
					{children}
				</Button>
			)}
		</form.Subscribe>
	);
}
