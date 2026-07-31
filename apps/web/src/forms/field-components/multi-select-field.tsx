'use client';

import {
	MultiSelect,
	type MultiSelectOption,
} from '@simmer-mosquito/ui-web/components/multi-select';
import { useFieldContext } from '../form-contexts';
import { FormFieldFrame } from './field-frame';
import type { BaseFieldProps } from './text-field';

export interface MultiSelectFieldProps extends BaseFieldProps {
	readonly options: readonly MultiSelectOption[];
	readonly emptyMessage?: string | undefined;
}

/** A form field holding a list of ids — attendees, product lots, and the like. */
export function MultiSelectField({
	label,
	description,
	disabled,
	options,
	emptyMessage,
	placeholder,
}: MultiSelectFieldProps) {
	const field = useFieldContext<readonly string[]>();

	return (
		<FormFieldFrame
			description={description}
			disabled={disabled}
			label={label}
			renderControl={(controlProps) => (
				<MultiSelect
					{...controlProps}
					disabled={disabled}
					emptyMessage={emptyMessage}
					onValueChange={(next) => field.handleChange(next)}
					options={options}
					placeholder={placeholder}
					value={field.state.value ?? []}
				/>
			)}
		/>
	);
}
