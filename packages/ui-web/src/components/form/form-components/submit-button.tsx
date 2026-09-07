'use client';

import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Spinner } from '@simmer-mosquito/ui-web/components/ui/spinner';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { useFormContext } from '../form-contexts';
import { saveFailureAloneBlocksSubmit } from '../form-errors';

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
		<form.Subscribe
			selector={(state) =>
				/*
				 * A save that failed sits in the same error map a failed validation
				 * does, so `canSubmit` reads false either way. Trying again is the
				 * answer to one and not the other, which is why the second half is
				 * here: the kit drops the recorded failure when the attempt lands.
				 */
				[state.canSubmit || saveFailureAloneBlocksSubmit(state), state.isSubmitting] as const
			}
		>
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
