'use client';

import {
	Autocomplete,
	type AutocompleteOption,
	type AutocompleteProps,
} from '@simmer-mosquito/ui-web/components/ui/autocomplete';
import { useFieldContext } from '../form-contexts';
import { FormFieldFrame } from './field-frame';
import type { BaseFieldProps } from './text-field';

export type { AutocompleteOption };

/**
 * Everything the underlying control accepts, minus what the form owns.
 *
 * Derived from {@link AutocompleteProps} rather than restated: the search
 * behaviour props (`getOptions`, `debounceMs`, `getOptionLabel`, …) belong to
 * the control, and a copy here goes stale the moment one of them changes.
 * `value`, `id`, and `onBlur` come from the field binding, and the presentation
 * props `disabled`/`placeholder`/`required` come from {@link BaseFieldProps}.
 */
type InheritedAutocompleteProps<TOption extends AutocompleteOption> = Omit<
	AutocompleteProps<TOption>,
	'disabled' | 'id' | 'onBlur' | 'onValueChange' | 'placeholder' | 'required' | 'value'
>;

export interface AutocompleteFieldProps<TOption extends AutocompleteOption = AutocompleteOption>
	extends BaseFieldProps,
		InheritedAutocompleteProps<TOption> {
	/**
	 * Runs after the field value changes, with the outgoing value — for selections
	 * that drive a sibling field (a product's default unit, say).
	 */
	readonly onValueChange?:
		| ((value: string | null | undefined, previousValue: string | null | undefined) => void)
		| undefined;
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
