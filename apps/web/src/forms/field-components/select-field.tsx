'use client';

import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@simmer-mosquito/ui-web/components/ui/select';
import { useFieldContext } from '../form-contexts';
import { FormFieldFrame } from './field-frame';
import type { BaseFieldProps } from './text-field';

export interface FieldOption {
	readonly label: string;
	readonly value: string;
	readonly disabled?: boolean;
}

export interface SelectFieldProps extends BaseFieldProps {
	readonly options: readonly FieldOption[];
	readonly triggerClassName?: string;
}

export function SelectField({
	label,
	description,
	disabled,
	options,
	placeholder = 'Select an option',
	triggerClassName,
}: SelectFieldProps) {
	const field = useFieldContext<string>();

	return (
		<FormFieldFrame
			description={description}
			disabled={disabled}
			label={label}
			renderControl={(controlProps) => (
				<Select
					{...(disabled === undefined ? {} : { disabled })}
					onValueChange={(value) => field.handleChange(value)}
					value={field.state.value ?? ''}
				>
					<SelectTrigger {...controlProps} className={triggerClassName}>
						<SelectValue placeholder={placeholder} />
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							{options.map((option) => (
								<SelectItem
									{...(option.disabled === undefined ? {} : { disabled: option.disabled })}
									key={option.value}
									value={option.value}
								>
									{option.label}
								</SelectItem>
							))}
						</SelectGroup>
					</SelectContent>
				</Select>
			)}
		/>
	);
}
