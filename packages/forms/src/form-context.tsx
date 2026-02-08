import { createFormHook, createFormHookContexts } from '@tanstack/react-form';
import { DateTimeField } from './fields/date-field';
import { TextField } from './fields/text-field';
import { ResetButton } from './form/reset-button';
import { SubmitButton } from './form/submit-button';
export const { fieldContext, formContext, useFieldContext, useFormContext } =
	createFormHookContexts();

export const { useAppForm } = createFormHook({
	fieldContext,
	formContext,
	fieldComponents: {
		TextField,
		DateTimeField,
	},
	formComponents: {
		SubmitButton,
		ResetButton,
	},
});
