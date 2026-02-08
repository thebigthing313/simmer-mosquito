import { Button } from '@simmer/ui/components/button';
import { useFormContext } from '../form-context';

interface ResetButtonProps {
	label?: string;
	handleReset?: () => void;
}
export function ResetButton({
	label = 'Reset',
	handleReset,
	ref,
	...props
}: ResetButtonProps & React.ComponentPropsWithRef<'button'>) {
	const form = useFormContext();
	return (
		<form.Subscribe selector={(state) => state.isSubmitting}>
			{(isSubmitting) => (
				<Button
					aria-busy={isSubmitting}
					disabled={isSubmitting}
					onClick={() => {
						form.reset();
						if (handleReset) handleReset();
					}}
					ref={ref}
					type="button"
					variant="secondary"
					{...props}
				>
					{label}
				</Button>
			)}
		</form.Subscribe>
	);
}
