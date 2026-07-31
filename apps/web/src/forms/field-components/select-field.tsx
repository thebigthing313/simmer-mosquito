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
	required,
	description,
	disabled,
	options,
	placeholder = 'Select an option',
	triggerClassName,
}: SelectFieldProps) {
	const field = useFieldContext<string>();
	const value = field.state.value ?? '';

	return (
		<FormFieldFrame
			description={description}
			disabled={disabled}
			label={label}
			required={required}
			renderControl={(controlProps) => (
				<Select
					{...(disabled === undefined ? {} : { disabled })}
					onValueChange={(nextValue) => {
						// Radix mirrors the value into a hidden native select. Replacing the
						// option set under a value that is already set — the unit list narrowing
						// to a newly picked product — leaves that element pointing at an option
						// that no longer exists, so the browser resets it and fires a change,
						// which arrives here as an empty value and wipes the field. No option
						// ever carries an empty value (optional selects use a non-empty
						// sentinel), so an empty one is always that reset, never a real choice.
						if (nextValue === '') {
							return;
						}
						field.handleChange(nextValue);
					}}
					value={value}
				>
					<SelectTrigger {...controlProps} className={triggerClassName}>
						{/* Label the trigger from the options rather than leaving it to Radix,
						    which portals the text out of the selected item. When a whole option
						    set is replaced as the value changes — the unit list narrowing to a
						    newly picked product — that item never mounted to supply a label, and
						    the trigger sat on its placeholder over a value that was really set. */}
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
