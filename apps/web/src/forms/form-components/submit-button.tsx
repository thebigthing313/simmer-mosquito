'use client';

import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Spinner } from '@simmer-mosquito/ui-web/components/ui/spinner';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { useFormContext } from '../form-contexts';

const SaveIcon = iconRegistry.actions.save.icon;

export function SubmitButton({
	children = 'Save',
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
					{isSubmitting ? (
						<Spinner data-icon="inline-start" />
					) : (
						<SaveIcon data-icon="inline-start" aria-hidden="true" />
					)}
					{children}
				</Button>
			)}
		</form.Subscribe>
	);
}
