'use client';

import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import { useFieldContext } from '../form-contexts';
import { FormFieldFrame } from './field-frame';

export interface BaseFieldProps {
	readonly label?: string | undefined;
	readonly description?: string | undefined;
	readonly disabled?: boolean | undefined;
	readonly placeholder?: string | undefined;
	/**
	 * Marks the label with `*`. Set it wherever the domain command builder rejects
	 * a missing value, so the form says what the server will enforce.
	 */
	readonly required?: boolean | undefined;
}

export interface TextFieldProps
	extends BaseFieldProps,
		Omit<
			React.ComponentProps<typeof Input>,
			| 'defaultValue'
			| 'disabled'
			| 'id'
			| 'onBlur'
			| 'onChange'
			| 'placeholder'
			| 'required'
			| 'value'
		> {}

export function TextField({
	label,
	description,
	disabled,
	required,
	placeholder,
	...props
}: TextFieldProps) {
	const field = useFieldContext<string>();

	return (
		<FormFieldFrame
			description={description}
			disabled={disabled}
			label={label}
			required={required}
			renderControl={(controlProps) => (
				<Input
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
