'use client';

import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import { useFieldContext } from '../form-contexts';
import { FormFieldFrame } from './field-frame';

export interface BaseFieldProps {
	readonly label?: string | undefined;
	readonly description?: string | undefined;
	readonly disabled?: boolean | undefined;
	readonly placeholder?: string | undefined;
}

export interface TextFieldProps
	extends BaseFieldProps,
		Omit<
			React.ComponentProps<typeof Input>,
			'defaultValue' | 'disabled' | 'id' | 'onBlur' | 'onChange' | 'placeholder' | 'value'
		> {}

export function TextField({ label, description, disabled, placeholder, ...props }: TextFieldProps) {
	const field = useFieldContext<string>();

	return (
		<FormFieldFrame
			description={description}
			disabled={disabled}
			label={label}
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
