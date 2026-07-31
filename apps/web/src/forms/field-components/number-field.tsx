'use client';

import { NumberInput } from '@simmer-mosquito/ui-web/components/ui/number-input';
import type * as React from 'react';
import { useFieldContext } from '../form-contexts';
import { FormFieldFrame } from './field-frame';
import type { BaseFieldProps } from './text-field';

export interface NumberFieldProps
	extends BaseFieldProps,
		Omit<
			React.ComponentProps<typeof NumberInput>,
			'disabled' | 'onBlur' | 'onCommit' | 'onValueChange' | 'placeholder' | 'required' | 'value'
		> {}

export function NumberField({
	label,
	required,
	description,
	disabled,
	placeholder,
	onFocus,
	...props
}: NumberFieldProps) {
	const field = useFieldContext<number | null | undefined>();

	return (
		<FormFieldFrame
			description={description}
			disabled={disabled}
			label={label}
			required={required}
			renderControl={(controlProps) => (
				<NumberInput
					{...props}
					{...controlProps}
					{...(disabled === undefined ? {} : { disabled })}
					onBlur={() => field.handleBlur()}
					onFocus={onFocus}
					onValueChange={(value) => field.handleChange(value)}
					placeholder={placeholder}
					value={field.state.value}
				/>
			)}
		/>
	);
}
