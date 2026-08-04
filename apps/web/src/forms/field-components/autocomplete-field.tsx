'use client';

import {
	Autocomplete,
	type AutocompleteOption,
} from '@simmer-mosquito/ui-web/components/ui/autocomplete';
import type { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import { useFieldContext } from '../form-contexts';
import { FormFieldFrame } from './field-frame';
import type { BaseFieldProps } from './text-field';

export type { AutocompleteOption };

export interface AutocompleteFieldProps<TOption extends AutocompleteOption = AutocompleteOption>
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
		> {
	readonly options?: readonly TOption[] | undefined;
	readonly getOptions?:
		| ((query: string) => readonly TOption[] | Promise<readonly TOption[]>)
		| undefined;
	/**
	 * The row behind the current value, when the caller already has it. Omit for a
	 * static `options` list — the field resolves the selection from it by value.
	 */
	readonly selectedOption?: TOption | null | undefined;
	/** What clearing writes back. Use `''` for fields typed as a plain string. */
	readonly emptyValue?: string | null | undefined;
	/**
	 * Runs after the field value changes, with the outgoing value — for selections
	 * that drive a sibling field (a product's default unit, say).
	 */
	readonly onValueChange?:
		| ((value: string | null | undefined, previousValue: string | null | undefined) => void)
		| undefined;
	readonly debounceMs?: number | undefined;
	readonly minQueryLength?: number | undefined;
	readonly getOptionLabel?: ((option: TOption) => string) | undefined;
	readonly getOptionValue?: ((option: TOption) => string) | undefined;
	readonly renderOption?: ((option: TOption) => React.ReactNode) | undefined;
	readonly renderSelectedValue?: ((option: TOption) => React.ReactNode) | undefined;
}

/**
 * Form binding around the shared {@link Autocomplete}. The search, popover, and
 * result list live there so inline surfaces without a form select the same way.
 */
export function AutocompleteField<TOption extends AutocompleteOption = AutocompleteOption>({
	label,
	required,
	description,
	disabled,
	onValueChange,
	...props
}: AutocompleteFieldProps<TOption>) {
	const field = useFieldContext<string | null | undefined>();

	return (
		<FormFieldFrame
			description={description}
			disabled={disabled}
			label={label}
			required={required}
			renderControl={(controlProps) => (
				<Autocomplete
					{...props}
					{...controlProps}
					{...(disabled === undefined ? {} : { disabled })}
					onValueChange={(value) => {
						const previousValue = field.state.value;
						field.handleChange(value);
						onValueChange?.(value, previousValue);
					}}
					value={field.state.value}
				/>
			)}
		/>
	);
}
