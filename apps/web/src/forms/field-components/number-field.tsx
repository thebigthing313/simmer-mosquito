'use client';

import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupInput,
} from '@simmer-mosquito/ui-web/components/ui/input-group';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { useState } from 'react';
import { useFieldContext } from '../form-contexts';
import { FormFieldFrame } from './field-frame';
import type { BaseFieldProps } from './text-field';

const AddIcon = iconRegistry.actions.add.icon;
const RemoveIcon = iconRegistry.actions.remove.icon;

export interface NumberFieldProps
	extends BaseFieldProps,
		Omit<
			React.ComponentProps<typeof InputGroupInput>,
			| 'defaultValue'
			| 'disabled'
			| 'id'
			| 'inputMode'
			| 'onBlur'
			| 'onChange'
			| 'placeholder'
			| 'type'
			| 'value'
		> {
	readonly emptyValue?: null | undefined;
	readonly showSteppers?: boolean;
	readonly significantDigits?: number | undefined;
}

export function NumberField({
	label,
	description,
	disabled,
	placeholder,
	emptyValue = null,
	showSteppers = true,
	significantDigits,
	onFocus,
	...props
}: NumberFieldProps) {
	const field = useFieldContext<number | null | undefined>();
	const [isEditing, setIsEditing] = useState(false);
	const value = field.state.value;
	const step = stepValue(props.step);
	const min = numericLimit(props.min);
	const max = numericLimit(props.max);
	const displayValue =
		value === null || value === undefined
			? ''
			: formatNumberValue(value, { isEditing, significantDigits });

	return (
		<FormFieldFrame
			description={description}
			disabled={disabled}
			label={label}
			renderControl={(controlProps) => (
				<InputGroup data-disabled={disabled ? true : undefined}>
					<InputGroupInput
						{...props}
						{...controlProps}
						{...(disabled === undefined ? {} : { disabled })}
						inputMode="decimal"
						onBlur={() => {
							setIsEditing(false);
							field.handleBlur();
						}}
						onChange={(event) => {
							const nextValue = event.target.value.trim();
							field.handleChange(nextValue.length === 0 ? emptyValue : Number(nextValue));
						}}
						onFocus={(event) => {
							setIsEditing(true);
							onFocus?.(event);
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
								onClick={() => field.handleChange(clampNumber((value ?? 0) - step, min, max))}
								size="icon-xs"
							>
								<RemoveIcon aria-hidden="true" />
							</InputGroupButton>
							<InputGroupButton
								aria-label="Increase"
								disabled={disabled}
								onClick={() => field.handleChange(clampNumber((value ?? 0) + step, min, max))}
								size="icon-xs"
							>
								<AddIcon aria-hidden="true" />
							</InputGroupButton>
						</InputGroupAddon>
					) : null}
				</InputGroup>
			)}
		/>
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
