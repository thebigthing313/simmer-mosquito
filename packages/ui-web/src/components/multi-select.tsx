'use client';

import {
	Combobox,
	ComboboxChip,
	ComboboxChips,
	ComboboxChipsInput,
	ComboboxContent,
	ComboboxEmpty,
	ComboboxItem,
	ComboboxList,
} from '@simmer-mosquito/ui-web/components/ui/combobox';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { useMemo, useRef } from 'react';

export interface MultiSelectOption {
	readonly value: string;
	readonly label: string;
}

export interface MultiSelectProps {
	readonly options: readonly MultiSelectOption[];
	readonly value: readonly string[];
	readonly onValueChange: (value: readonly string[]) => void;
	readonly placeholder?: string | undefined;
	/** Shown in the popup when the typed query matches nothing. */
	readonly emptyMessage?: string | undefined;
	readonly disabled?: boolean | undefined;
	readonly id?: string | undefined;
	readonly className?: string | undefined;
	readonly 'aria-label'?: string | undefined;
	readonly 'aria-describedby'?: string | undefined;
	readonly 'aria-invalid'?: true | undefined;
}

/**
 * Select many values from one list. Selections show as removable chips in the
 * control itself and typing filters what is left, so a long roster (profiles,
 * product lots) stays workable without a second list elsewhere on the page.
 */
export function MultiSelect({
	options,
	value,
	onValueChange,
	placeholder,
	emptyMessage = 'No matches',
	disabled,
	id,
	className,
	...ariaProps
}: MultiSelectProps) {
	const anchorRef = useRef<HTMLDivElement | null>(null);
	// A value with no matching option still gets a chip — labelled by its raw
	// value — so a selection is never silently dropped from the control.
	const selected = useMemo(() => {
		const byValue = new Map(options.map((option) => [option.value, option]));
		return value.map((entry) => byValue.get(entry) ?? { value: entry, label: entry });
	}, [options, value]);

	return (
		<Combobox
			disabled={disabled}
			isItemEqualToValue={(item: MultiSelectOption, candidate: MultiSelectOption) =>
				item.value === candidate.value
			}
			items={options}
			multiple
			onValueChange={(next: readonly MultiSelectOption[]) =>
				onValueChange(next.map((option) => option.value))
			}
			value={selected}
		>
			<ComboboxChips className={cn('w-full', className)} ref={anchorRef}>
				{selected.map((option) => (
					<ComboboxChip key={option.value}>{option.label}</ComboboxChip>
				))}
				<ComboboxChipsInput
					{...ariaProps}
					id={id}
					placeholder={selected.length === 0 ? placeholder : undefined}
				/>
			</ComboboxChips>
			<ComboboxContent anchor={anchorRef}>
				<ComboboxEmpty>{emptyMessage}</ComboboxEmpty>
				<ComboboxList>
					{(option: MultiSelectOption) => (
						<ComboboxItem key={option.value} value={option}>
							{option.label}
						</ComboboxItem>
					)}
				</ComboboxList>
			</ComboboxContent>
		</Combobox>
	);
}
