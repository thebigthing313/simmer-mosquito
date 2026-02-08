import { Button } from '@simmer/ui/components/button';
import type { ComponentPropsWithRef } from 'react';
import { useFormContext } from '../form-context';

interface SubmitFormButtonProps
	extends Omit<
		ComponentPropsWithRef<'button'>,
		'type' | 'disabled' | 'aria-busy'
	> {
	label?: string;
}
export function SubmitButton({
	label = 'Submit',
	ref,
	...props
}: SubmitFormButtonProps) {
	const form = useFormContext();
	return (
		<form.Subscribe selector={(state) => [state.isSubmitting, state.canSubmit]}>
			{([isSubmitting, canSubmit]) => (
				<Button
					type="submit"
					aria-busy={isSubmitting}
					disabled={!canSubmit}
					variant="default"
					ref={ref}
					{...props}
				>
					<span>{label}</span>
				</Button>
			)}
		</form.Subscribe>
	);
}
