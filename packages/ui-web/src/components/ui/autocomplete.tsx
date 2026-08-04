'use client';

import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import {
	Popover,
	PopoverAnchor,
	PopoverContent,
} from '@simmer-mosquito/ui-web/components/ui/popover';
import { Spinner } from '@simmer-mosquito/ui-web/components/ui/spinner';
import type * as React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckIcon, SearchIcon, XIcon } from '../../icons/registry';

export interface AutocompleteOption {
	readonly value: string;
	readonly label: string;
	readonly description?: string | undefined;
	readonly disabled?: boolean | undefined;
}

export interface AutocompleteProps<TOption extends AutocompleteOption = AutocompleteOption>
	extends Omit<
		React.ComponentProps<typeof Input>,
		'defaultValue' | 'disabled' | 'onChange' | 'placeholder' | 'value'
	> {
	readonly value: string | null | undefined;
	readonly onValueChange: (value: string | null) => void;
	readonly options?: readonly TOption[] | undefined;
	readonly getOptions?:
		| ((query: string) => readonly TOption[] | Promise<readonly TOption[]>)
		| undefined;
	/**
	 * The row behind the current value, when the caller already has it. Omit for a
	 * static `options` list — the selection resolves from it by value.
	 */
	readonly selectedOption?: TOption | null | undefined;
	/** What clearing writes back. Use `''` for values typed as a plain string. */
	readonly emptyValue?: string | null | undefined;
	readonly disabled?: boolean | undefined;
	readonly placeholder?: string | undefined;
	readonly debounceMs?: number | undefined;
	readonly minQueryLength?: number | undefined;
	readonly getOptionLabel?: ((option: TOption) => string) | undefined;
	readonly getOptionValue?: ((option: TOption) => string) | undefined;
	readonly renderOption?: ((option: TOption) => React.ReactNode) | undefined;
	readonly renderSelectedValue?: ((option: TOption) => React.ReactNode) | undefined;
}

/**
 * Type-to-search selection over a static or remote option list.
 *
 * The presentational half of the form `AutocompleteField` — shared so non-form
 * surfaces (inline table cells, add-rows) search the same way instead of growing
 * their own popover-and-list pickers.
 */
export function Autocomplete<TOption extends AutocompleteOption = AutocompleteOption>({
	value,
	onValueChange,
	options,
	getOptions,
	selectedOption,
	emptyValue = null,
	disabled,
	placeholder = 'Search',
	debounceMs = 150,
	minQueryLength = 0,
	getOptionLabel = defaultOptionLabel,
	getOptionValue = defaultOptionValue,
	renderOption,
	renderSelectedValue,
	onFocus,
	...props
}: AutocompleteProps<TOption>) {
	const [open, setOpen] = useState(false);
	const optionSource = useMemo(() => options ?? [], [options]);
	// With a static list the caller need not track the selected row: a prefilled
	// value (editing an existing record) resolves to its label here, so the input
	// never shows a raw id.
	const currentOption = useMemo(() => {
		if (selectedOption !== undefined) {
			return selectedOption;
		}
		if (value === null || value === undefined || value === '') {
			return null;
		}
		return optionSource.find((option) => getOptionValue(option) === value) ?? null;
	}, [getOptionValue, optionSource, selectedOption, value]);
	// An async source cannot resolve a preset value locally, so the raw value stands
	// in. A static list either resolved above or holds a sentinel ("no selection"),
	// and either way the placeholder beats printing an id.
	const displayLabel =
		currentOption === null
			? options === undefined
				? (value ?? '')
				: ''
			: getOptionLabel(currentOption);
	const [query, setQuery] = useState(displayLabel);
	const [asyncResults, setAsyncResults] = useState<readonly TOption[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [selected, setSelected] = useState<TOption | null>(currentOption);
	const requestId = useRef(0);
	const anchorRef = useRef<HTMLDivElement>(null);

	// Reopening a chosen field: the input holds the selection's own label, and
	// filtering by it would collapse the list to the one row already picked. Only
	// what the user actually typed narrows the list.
	const activeQuery = query === displayLabel ? '' : query;

	// A static list filters in place. Debouncing it would open the popover at the
	// previous query's size and resize it a beat later, moving it under the pointer.
	const results = useMemo(() => {
		if (getOptions !== undefined) {
			return asyncResults;
		}
		if (activeQuery.length < minQueryLength) {
			return [];
		}
		return filterOptions(optionSource, activeQuery, getOptionLabel);
	}, [activeQuery, asyncResults, getOptionLabel, getOptions, minQueryLength, optionSource]);

	useEffect(() => {
		setSelected(currentOption);
		if (!open) {
			setQuery(displayLabel);
		}
	}, [currentOption, displayLabel, open]);

	// Only a remote source needs debouncing — and only while the popover is open.
	useEffect(() => {
		if (!open || getOptions === undefined) {
			return;
		}

		if (activeQuery.length < minQueryLength) {
			setAsyncResults([]);
			setIsLoading(false);
			return;
		}

		const currentRequestId = requestId.current + 1;
		requestId.current = currentRequestId;
		const timeoutId = window.setTimeout(() => {
			const nextResults = getOptions(activeQuery);

			if (isPromiseLike(nextResults)) {
				setIsLoading(true);
				void nextResults
					.then((resolvedResults) => {
						if (requestId.current === currentRequestId) {
							setAsyncResults(resolvedResults);
						}
					})
					.finally(() => {
						if (requestId.current === currentRequestId) {
							setIsLoading(false);
						}
					});
				return;
			}

			setAsyncResults(nextResults);
			setIsLoading(false);
		}, debounceMs);

		return () => window.clearTimeout(timeoutId);
	}, [activeQuery, debounceMs, getOptions, minQueryLength, open]);

	return (
		<Popover onOpenChange={setOpen} open={open}>
			<PopoverAnchor asChild>
				<div ref={anchorRef}>
					<Input
						{...props}
						{...(disabled === undefined ? {} : { disabled })}
						onChange={(event) => {
							setQuery(event.target.value);
							setOpen(true);
						}}
						onFocus={(event) => {
							setOpen(true);
							// The input carries the current selection's label, so a caret dropped
							// into it would make typing append to that name and match nothing.
							// Selecting it means the first keystroke starts a fresh search, while
							// clicking away still leaves the selection untouched.
							event.target.select();
							onFocus?.(event);
						}}
						placeholder={placeholder}
						value={query}
					/>
				</div>
			</PopoverAnchor>
			<PopoverContent
				align="start"
				// No exit animation: a closing popover stays mounted for it, and Popper
				// keeps re-positioning it — a content change on the way out (see the
				// selection footer below) would flip it above the input mid-fade.
				className="grid w-(--radix-popover-trigger-width) min-w-72 gap-2 p-2 data-[state=closed]:animate-none"
				onInteractOutside={(event) => {
					// Opening on focus, the same pointer-down lands on the anchor input —
					// which is outside the content — and would immediately dismiss the
					// popover (a focus→open→close flicker). Keep it open for anchor hits.
					const target = event.detail.originalEvent.target as Node | null;
					if (target !== null && anchorRef.current?.contains(target)) {
						event.preventDefault();
					}
				}}
				onOpenAutoFocus={(event) => event.preventDefault()}
			>
				<div className="max-h-64 overflow-y-auto">
					<AutocompleteResults
						getOptionLabel={getOptionLabel}
						getOptionValue={getOptionValue}
						isLoading={isLoading}
						onSelect={(option) => {
							setSelected(option);
							setQuery(getOptionLabel(option));
							onValueChange(getOptionValue(option));
							setOpen(false);
						}}
						renderOption={renderOption}
						results={results}
						selectedValue={value}
					/>
				</div>
				{/* Only while open: selecting closes the popover, and growing it on the
				    way out is what makes it jump. Reopening shows the selection. */}
				{open && selected !== null ? (
					<div className="flex min-w-0 items-center gap-2 border-t pt-2">
						<div className="min-w-0 flex-1">
							<p className="m-0 font-medium text-muted-foreground text-xs">Selected</p>
							<div className="truncate text-foreground text-sm">
								{renderSelectedValue?.(selected) ?? getOptionLabel(selected)}
							</div>
						</div>
						<Button
							aria-label="Clear selection"
							disabled={disabled}
							onClick={() => {
								setSelected(null);
								setQuery('');
								onValueChange(emptyValue ?? null);
							}}
							size="icon-xs"
							type="button"
							variant="ghost"
						>
							<XIcon aria-hidden="true" />
						</Button>
					</div>
				) : null}
			</PopoverContent>
		</Popover>
	);
}

function AutocompleteResults<TOption extends AutocompleteOption>({
	getOptionLabel,
	getOptionValue,
	isLoading,
	onSelect,
	renderOption,
	results,
	selectedValue,
}: {
	readonly getOptionLabel: (option: TOption) => string;
	readonly getOptionValue: (option: TOption) => string;
	readonly isLoading: boolean;
	readonly onSelect: (option: TOption) => void;
	readonly renderOption?: ((option: TOption) => React.ReactNode) | undefined;
	readonly results: readonly TOption[];
	readonly selectedValue: string | null | undefined;
}) {
	if (isLoading) {
		return (
			<div className="flex h-20 items-center justify-center gap-2 text-muted-foreground text-sm">
				<Spinner />
				Searching
			</div>
		);
	}

	if (results.length === 0) {
		return (
			<div className="flex h-20 items-center justify-center gap-2 text-muted-foreground text-sm">
				<SearchIcon aria-hidden="true" />
				No results
			</div>
		);
	}

	return (
		<div className="grid gap-1">
			{results.map((option) => {
				const value = getOptionValue(option);
				const selected = selectedValue === value;

				return (
					<button
						className="flex min-h-9 w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
						disabled={option.disabled}
						key={value}
						onClick={() => onSelect(option)}
						type="button"
					>
						<span className="min-w-0 flex-1">
							{renderOption?.(option) ?? (
								<span className="grid min-w-0 gap-0.5">
									<span className="truncate font-medium">{getOptionLabel(option)}</span>
									{option.description === undefined ? null : (
										<span className="truncate text-muted-foreground text-xs">
											{option.description}
										</span>
									)}
								</span>
							)}
						</span>
						{selected ? <CheckIcon aria-hidden="true" /> : null}
					</button>
				);
			})}
		</div>
	);
}

function defaultOptionLabel(option: AutocompleteOption): string {
	return option.label;
}

function defaultOptionValue(option: AutocompleteOption): string {
	return option.value;
}

function filterOptions<TOption extends AutocompleteOption>(
	options: readonly TOption[],
	query: string,
	getOptionLabel: (option: TOption) => string,
): readonly TOption[] {
	const normalizedQuery = query.trim().toLocaleLowerCase();
	if (normalizedQuery.length === 0) {
		return options;
	}

	return options.filter((option) =>
		getOptionLabel(option).toLocaleLowerCase().includes(normalizedQuery),
	);
}

function isPromiseLike<T>(value: T | Promise<T>): value is Promise<T> {
	return typeof (value as Promise<T>).then === 'function';
}
