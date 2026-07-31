'use client';

import type * as React from 'react';
import { useState } from 'react';
import { MinusIcon, PlusIcon } from '../../icons/registry';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from './input-group';

export interface NumberInputProps
	extends Omit<
		React.ComponentProps<typeof InputGroupInput>,
		'defaultValue' | 'disabled' | 'inputMode' | 'onChange' | 'type' | 'value'
	> {
	readonly value: number | null | undefined;
	/** Fired on each keystroke and stepper click with the parsed value. */
	readonly onValueChange: (value: number | null) => void;
	/**
	 * Fired on blur, Enter, and stepper click — the moment to persist. Lets a
	 * consumer edit the draft freely via `onValueChange` but only commit once the
	 * value settles (e.g. an inline cell writing to a synced store on blur).
	 */
	readonly onCommit?: ((value: number | null) => void) | undefined;
	readonly disabled?: boolean;
	readonly emptyValue?: null | undefined;
	readonly showSteppers?: boolean;
	readonly significantDigits?: number | undefined;
}

/**
 * Controlled numeric input with ± steppers, built on {@link InputGroup}. The
 * presentational half of the form `NumberField` — shared so non-form surfaces
 * (e.g. inline table cells) get the same stepper affordance without a form.
 */
export function NumberInput({
	value,
	onValueChange,
	onCommit,
	onBlur,
	onFocus,
	onKeyDown,
	disabled,
	placeholder,
	emptyValue = null,
	showSteppers = true,
	significantDigits,
	className,
	...props
}: NumberInputProps) {
	const [isEditing, setIsEditing] = useState(false);
	// What the user actually typed, alongside the number it parsed to. Rendering
	// the parsed number back would eat a trailing "." (or a "0" after it), so an
	// in-progress decimal like "1.0" could never be typed. The draft is dropped as
	// soon as `value` moves on its own, so an external reset still wins.
	const [draft, setDraft] = useState<{
		readonly text: string;
		readonly value: number | null;
	} | null>(null);
	const step = stepValue(props.step);
	const min = numericLimit(props.min);
	const max = numericLimit(props.max);
	const activeDraft = draft !== null && Object.is(draft.value, value ?? null) ? draft : null;
	const displayValue =
		activeDraft !== null
			? activeDraft.text
			: value === null || value === undefined
				? ''
				: formatNumberValue(value, { isEditing, significantDigits });

	const commitStep = (delta: number) => {
		const next = clampNumber((value ?? 0) + delta, min, max);
		setDraft(null);
		onValueChange(next);
		onCommit?.(next);
	};

	return (
		<InputGroup className={className} data-disabled={disabled ? true : undefined}>
			<InputGroupInput
				{...props}
				{...(disabled === undefined ? {} : { disabled })}
				inputMode="decimal"
				onBlur={(event) => {
					setIsEditing(false);
					setDraft(null);
					onBlur?.(event);
					onCommit?.(value ?? emptyValue);
				}}
				onChange={(event) => {
					const text = event.target.value;
					const trimmed = text.trim();
					const parsed = trimmed.length === 0 ? emptyValue : Number(trimmed);
					// Text that is not (yet) a number — "1.2.3", "-", "abc" — leaves the
					// value where it was rather than pushing NaN downstream; the draft
					// still shows what was typed so the keystroke is not swallowed.
					const nextValue =
						parsed === null || Number.isFinite(parsed) ? parsed : (value ?? emptyValue);
					setDraft({ text, value: nextValue });
					onValueChange(nextValue);
				}}
				onFocus={(event) => {
					setIsEditing(true);
					onFocus?.(event);
				}}
				onKeyDown={(event) => {
					if (event.key === 'Enter') {
						event.currentTarget.blur();
					}
					onKeyDown?.(event);
				}}
				placeholder={placeholder}
				type="text"
				value={displayValue}
			/>
			{showSteppers ? (
				<InputGroupAddon align="inline-end">
					<InputGroupButton
						aria-label="Decrease"
						disabled={disabled || value === null || value === undefined}
						onClick={() => commitStep(-step)}
						size="icon-xs"
					>
						<MinusIcon aria-hidden="true" />
					</InputGroupButton>
					<InputGroupButton
						aria-label="Increase"
						disabled={disabled}
						onClick={() => commitStep(step)}
						size="icon-xs"
					>
						<PlusIcon aria-hidden="true" />
					</InputGroupButton>
				</InputGroupAddon>
			) : null}
		</InputGroup>
	);
}

function formatNumberValue(
	value: number,
	options: { readonly isEditing: boolean; readonly significantDigits?: number | undefined },
): string {
	if (options.isEditing || options.significantDigits === undefined) {
		return String(value);
	}

	const maximumSignificantDigits = normalizedSignificantDigits(options.significantDigits);

	return new Intl.NumberFormat(undefined, {
		maximumSignificantDigits,
		useGrouping: false,
	}).format(value);
}

function normalizedSignificantDigits(value: number): number {
	if (!Number.isFinite(value)) {
		return 21;
	}

	return Math.min(21, Math.max(1, Math.trunc(value)));
}

function numericLimit(
	value: React.ComponentProps<typeof InputGroupInput>['min'],
): number | undefined {
	if (value === undefined) {
		return undefined;
	}

	const numberValue = Number(value);
	return Number.isFinite(numberValue) ? numberValue : undefined;
}

function stepValue(value: React.ComponentProps<typeof InputGroupInput>['step']): number {
	const numberValue = Number(value ?? 1);
	return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : 1;
}

function clampNumber(value: number, min: number | undefined, max: number | undefined): number {
	if (min !== undefined && value < min) {
		return min;
	}

	if (max !== undefined && value > max) {
		return max;
	}

	return value;
}
