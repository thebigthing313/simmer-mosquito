'use client';

import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import {
	Popover,
	PopoverAnchor,
	PopoverContent,
} from '@simmer-mosquito/ui-web/components/ui/popover';
import { Spinner } from '@simmer-mosquito/ui-web/components/ui/spinner';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFieldContext } from '../form-contexts';
import { FormFieldFrame } from './field-frame';
import type { BaseFieldProps } from './text-field';

const CheckIcon = iconRegistry.actions.check.icon;
const SearchIcon = iconRegistry.actions.search.icon;
const XIcon = iconRegistry.actions.close.icon;

export interface AutocompleteOption {
	readonly value: string;
	readonly label: string;
	readonly description?: string | undefined;
	readonly disabled?: boolean | undefined;
}

export interface AutocompleteFieldProps<TOption extends AutocompleteOption = AutocompleteOption>
	extends BaseFieldProps,
		Omit<
			React.ComponentProps<typeof Input>,
			'defaultValue' | 'disabled' | 'id' | 'onBlur' | 'onChange' | 'placeholder' | 'value'
		> {
	readonly options?: readonly TOption[] | undefined;
	readonly getOptions?:
		| ((query: string) => readonly TOption[] | Promise<readonly TOption[]>)
		| undefined;
	readonly selectedOption?: TOption | null | undefined;
	readonly emptyValue?: null | undefined;
	readonly debounceMs?: number | undefined;
	readonly minQueryLength?: number | undefined;
	readonly getOptionLabel?: ((option: TOption) => string) | undefined;
	readonly getOptionValue?: ((option: TOption) => string) | undefined;
	readonly renderOption?: ((option: TOption) => React.ReactNode) | undefined;
	readonly renderSelectedValue?: ((option: TOption) => React.ReactNode) | undefined;
}

export function AutocompleteField<TOption extends AutocompleteOption = AutocompleteOption>({
	label,
	description,
	disabled,
	placeholder = 'Search',
	options,
	getOptions,
	selectedOption,
	emptyValue = null,
	debounceMs = 150,
	minQueryLength = 0,
	getOptionLabel = defaultOptionLabel,
	getOptionValue = defaultOptionValue,
	renderOption,
	renderSelectedValue,
	onFocus,
	...props
}: AutocompleteFieldProps<TOption>) {
	const field = useFieldContext<string | null | undefined>();
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState(() =>
		selectedOptionLabel(selectedOption, getOptionLabel, field.state.value),
	);
	const [results, setResults] = useState<readonly TOption[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [selected, setSelected] = useState<TOption | null>(selectedOption ?? null);
	const requestId = useRef(0);
	const optionSource = useMemo(() => options ?? [], [options]);

	useEffect(() => {
		setSelected(selectedOption ?? null);
		if (!open) {
			setQuery(selectedOptionLabel(selectedOption, getOptionLabel, field.state.value));
		}
	}, [field.state.value, getOptionLabel, open, selectedOption]);

	useEffect(() => {
		if (!open) {
			return;
		}

		if (query.length < minQueryLength) {
			setResults([]);
			setIsLoading(false);
			return;
		}

		const currentRequestId = requestId.current + 1;
		requestId.current = currentRequestId;
		const timeoutId = window.setTimeout(() => {
			const source =
				getOptions ?? ((search: string) => filterOptions(optionSource, search, getOptionLabel));
			const nextResults = source(query);

			if (isPromiseLike(nextResults)) {
				setIsLoading(true);
				void nextResults
					.then((resolvedResults) => {
						if (requestId.current === currentRequestId) {
							setResults(resolvedResults);
						}
					})
					.finally(() => {
						if (requestId.current === currentRequestId) {
							setIsLoading(false);
						}
					});
				return;
			}

			setResults(nextResults);
			setIsLoading(false);
		}, debounceMs);

		return () => window.clearTimeout(timeoutId);
	}, [debounceMs, getOptionLabel, getOptions, minQueryLength, open, optionSource, query]);

	return (
		<FormFieldFrame
			description={description}
			disabled={disabled}
			label={label}
			renderControl={(controlProps) => (
				<Popover open={open} onOpenChange={setOpen}>
					<PopoverAnchor asChild>
						<Input
							{...props}
							{...controlProps}
							{...(disabled === undefined ? {} : { disabled })}
							onFocus={(event) => {
								setOpen(true);
								onFocus?.(event);
							}}
							onChange={(event) => {
								setQuery(event.target.value);
								setOpen(true);
							}}
							placeholder={placeholder}
							value={query}
						/>
					</PopoverAnchor>
					<PopoverContent
						align="start"
						className="grid w-(--radix-popover-trigger-width) min-w-72 gap-2 p-2"
						onOpenAutoFocus={(event) => event.preventDefault()}
					>
						<div className="max-h-64 overflow-y-auto">
							<AutocompleteResults
								getOptionLabel={getOptionLabel}
								getOptionValue={getOptionValue}
								isLoading={isLoading}
								onSelect={(option) => {
									const value = getOptionValue(option);
									setSelected(option);
									setQuery(getOptionLabel(option));
									field.handleChange(value);
									setOpen(false);
								}}
								renderOption={renderOption}
								results={results}
								selectedValue={field.state.value}
							/>
						</div>
						{selected === null ? null : (
							<div className="flex min-w-0 items-center gap-2 border-t pt-2">
								<div className="min-w-0 flex-1">
									<p className="m-0 text-xs font-medium text-muted-foreground">Selected</p>
									<div className="truncate text-sm text-foreground">
										{renderSelectedValue?.(selected) ?? getOptionLabel(selected)}
									</div>
								</div>
								<Button
									type="button"
									variant="ghost"
									size="icon-xs"
									aria-label="Clear selection"
									disabled={disabled}
									onClick={() => {
										setSelected(null);
										setQuery('');
										field.handleChange(emptyValue);
									}}
								>
									<XIcon aria-hidden="true" />
								</Button>
							</div>
						)}
					</PopoverContent>
				</Popover>
			)}
		/>
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
			<div className="flex h-20 items-center justify-center gap-2 text-sm text-muted-foreground">
				<Spinner />
				Searching
			</div>
		);
	}

	if (results.length === 0) {
		return (
			<div className="flex h-20 items-center justify-center gap-2 text-sm text-muted-foreground">
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
						type="button"
						className="flex min-h-9 w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
						disabled={option.disabled}
						key={value}
						onClick={() => onSelect(option)}
					>
						<span className="min-w-0 flex-1">
							{renderOption?.(option) ?? (
								<span className="grid min-w-0 gap-0.5">
									<span className="truncate font-medium">{getOptionLabel(option)}</span>
									{option.description === undefined ? null : (
										<span className="truncate text-xs text-muted-foreground">
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

function selectedOptionLabel<TOption extends AutocompleteOption>(
	option: TOption | null | undefined,
	getOptionLabel: (option: TOption) => string,
	fallback: string | null | undefined,
): string {
	if (option !== null && option !== undefined) {
		return getOptionLabel(option);
	}

	return fallback ?? '';
}
