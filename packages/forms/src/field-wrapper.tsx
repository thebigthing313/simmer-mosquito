import {
	Field,
	FieldContent,
	FieldDescription,
	FieldError,
	FieldLabel,
} from '@simmer/ui/components/field';
import type { ComponentProps } from 'react';
import { useFieldContext } from './form-context';

interface FieldWrapperProps {
	fieldLabel?: string;
	fieldDescription?: string;
	required?: boolean;
	children: React.ReactNode;
}
export function FieldWrapper({
	fieldLabel,
	fieldDescription,
	children,
	required = false,
	...props
}: FieldWrapperProps & ComponentProps<typeof Field>) {
	const field = useFieldContext();
	return (
		<Field
			aria-required={required}
			data-invalid={!field.state.meta.isValid}
			{...props}
		>
			<FieldLabel htmlFor={field.name}>
				{fieldLabel}
				{required ?? ' *'}
			</FieldLabel>
			<FieldDescription>{fieldDescription}</FieldDescription>
			<FieldContent>{children}</FieldContent>
			<FieldError errors={field.state.meta.errors} />
		</Field>
	);
}
