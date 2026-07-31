'use client';

import { Textarea } from '@simmer-mosquito/ui-web/components/ui/textarea';
import { useFieldContext } from '../form-contexts';
import { FormFieldFrame } from './field-frame';
import type { BaseFieldProps } from './text-field';

export interface TextareaFieldProps
	extends BaseFieldProps,
		Omit<
			React.ComponentProps<typeof Textarea>,
			| 'defaultValue'
			| 'disabled'
			| 'id'
			| 'onBlur'
			| 'onChange'
			| 'placeholder'
			| 'required'
			| 'value'
		> {}

export function TextareaField({
	label,
	required,
	description,
	disabled,
	placeholder,
	...props
}: TextareaFieldProps) {
	const field = useFieldContext<string>();

	return (
		<FormFieldFrame
			description={description}
			disabled={disabled}
			label={label}
			required={required}
			renderControl={(controlProps) => (
				<Textarea
					{...props}
					{...controlProps}
					{...(disabled === undefined ? {} : { disabled })}
					onBlur={field.handleBlur}
					onChange={(event) => field.handleChange(event.target.value)}
					placeholder={placeholder}
					value={field.state.value ?? ''}
				/>
			)}
		/>
	);
}
