import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupTextarea,
} from '@simmer/ui/components/input-group';
import { SendHorizontal } from 'lucide-react';
import type { ComponentProps } from 'react';
import { FieldWrapper } from '../field-wrapper';
import { useFieldContext, useFormContext } from '../form-context';

interface TextAreaFieldProps extends ComponentProps<typeof InputGroupTextarea> {
	fieldProps?: Omit<ComponentProps<typeof FieldWrapper>, 'children'>;
	withSubmit?: boolean;
}

export function TextAreaField({
	fieldProps,
	withSubmit,
	...props
}: TextAreaFieldProps) {
	const field = useFieldContext<string | null>();
	const form = useFormContext();

	return (
		<FieldWrapper {...fieldProps}>
			<InputGroup>
				<InputGroupTextarea
					id={field.name}
					name={field.name}
					value={field.state.value ?? ''}
					onChange={(e) => field.handleChange(e.target.value || null)}
					onBlur={field.handleBlur}
					{...props}
				/>
			</InputGroup>
			{withSubmit && (
				<form.Subscribe
					selector={(state) => [state.canSubmit, state.isSubmitting]}
				>
					{([canSubmit, isSubmitting]) => (
						<InputGroupAddon align="block-end">
							<InputGroupButton
								aria-busy={isSubmitting}
								disabled={!canSubmit}
								variant="ghost"
								type="submit"
								size="icon-sm"
							>
								<SendHorizontal />
							</InputGroupButton>
						</InputGroupAddon>
					)}
				</form.Subscribe>
			)}
		</FieldWrapper>
	);
}
