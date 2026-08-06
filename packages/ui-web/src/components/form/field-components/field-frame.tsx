'use client';

import { RequiredMark } from '@simmer-mosquito/ui-web/components/form/required-mark';
import {
	Field,
	FieldDescription,
	FieldError,
	FieldLabel,
} from '@simmer-mosquito/ui-web/components/ui/field';
import { useId } from 'react';
import { useFieldContext } from '../form-contexts';
import { errorMessagesFrom } from '../form-errors';

export interface FormFieldFrameProps {
	readonly label?: string | undefined;
	readonly description?: string | undefined;
	readonly disabled?: boolean | undefined;
	/** Marks the label with `*`. Optional fields carry no marker at all. */
	readonly required?: boolean | undefined;
	readonly orientation?: React.ComponentProps<typeof Field>['orientation'] | undefined;
	readonly renderControl: (props: {
		readonly id: string;
		readonly 'aria-describedby': string | undefined;
		readonly 'aria-invalid': true | undefined;
		readonly 'aria-required': true | undefined;
	}) => React.ReactNode;
}

export function FormFieldFrame({
	label,
	description,
	disabled,
	required,
	orientation,
	renderControl,
}: FormFieldFrameProps) {
	const field = useFieldContext<unknown>();
	const controlId = useId();
	const descriptionId = `${controlId}-description`;
	const errorId = `${controlId}-error`;
	const errors = errorMessagesFrom(field.state.meta.errors);
	const invalid = errors.length > 0;
	const describedBy = [description === undefined ? null : descriptionId, invalid ? errorId : null]
		.filter((value): value is string => value !== null)
		.join(' ');

	return (
		<Field
			data-disabled={disabled ? true : undefined}
			data-invalid={invalid}
			orientation={orientation}
		>
			{label === undefined ? null : (
				<FieldLabel htmlFor={controlId}>
					{label}
					{required === true ? <RequiredMark /> : null}
				</FieldLabel>
			)}
			{renderControl({
				id: controlId,
				'aria-describedby': describedBy.length === 0 ? undefined : describedBy,
				'aria-invalid': invalid ? true : undefined,
				'aria-required': required === true ? true : undefined,
			})}
			{description === undefined ? null : (
				<FieldDescription id={descriptionId}>{description}</FieldDescription>
			)}
			<FieldError errors={errors} id={errorId} />
		</Field>
	);
}
