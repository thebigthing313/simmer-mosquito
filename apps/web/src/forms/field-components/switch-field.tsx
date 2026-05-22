'use client';

import { Switch } from '@simmer-mosquito/ui-web/components/ui/switch';
import { useFieldContext } from '../form-contexts';
import { FormFieldFrame } from './field-frame';
import type { BaseFieldProps } from './text-field';

export interface SwitchFieldProps
	extends Omit<BaseFieldProps, 'placeholder'>,
		Omit<
			React.ComponentProps<typeof Switch>,
			'checked' | 'disabled' | 'id' | 'onBlur' | 'onCheckedChange'
		> {}

export function SwitchField({ label, description, disabled, ...props }: SwitchFieldProps) {
	const field = useFieldContext<boolean>();

	return (
		<FormFieldFrame
			description={description}
			disabled={disabled}
			label={label}
			orientation="horizontal"
			renderControl={(controlProps) => (
				<Switch
					{...props}
					{...controlProps}
					checked={field.state.value}
					{...(disabled === undefined ? {} : { disabled })}
					onBlur={field.handleBlur}
					onCheckedChange={(checked) => field.handleChange(checked)}
				/>
			)}
		/>
	);
}
