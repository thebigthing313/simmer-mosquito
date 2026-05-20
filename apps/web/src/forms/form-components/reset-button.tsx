'use client';

import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { useFormContext } from '../form-contexts';

export function ResetButton({
	children = 'Reset',
	disabled,
}: {
	readonly children?: React.ReactNode;
	readonly disabled?: boolean;
}) {
	const form = useFormContext();

	return (
		<form.Subscribe selector={(state) => state.isDirty}>
			{(isDirty) => (
				<Button
					type="button"
					variant="outline"
					disabled={disabled || !isDirty}
					onClick={() => form.reset()}
				>
					{children}
				</Button>
			)}
		</form.Subscribe>
	);
}
