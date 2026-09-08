'use client';

import { createFormHook } from '@tanstack/react-form';
import {
	AutocompleteField,
	HiddenField,
	JsonSchemaField,
	MetadataField,
	MultiSelectField,
	NumberField,
	SelectField,
	SwitchField,
	TextareaField,
	TextField,
	UrlField,
} from './field-components';
import {
	AppFieldGroup,
	FormActions,
	FormErrorAlert,
	ResetButton,
	SubmitButton,
} from './form-components';
import { fieldContext, formContext } from './form-contexts';
import { isSaveFailure, SaveFailure } from './form-errors';

const { useAppForm: useFormKit } = createFormHook({
	fieldContext,
	formContext,
	fieldComponents: {
		AutocompleteField,
		HiddenField,
		JsonSchemaField,
		MetadataField,
		MultiSelectField,
		NumberField,
		SelectField,
		SwitchField,
		TextareaField,
		TextField,
		UrlField,
	},
	formComponents: {
		AppFieldGroup,
		FormActions,
		FormErrorAlert,
		ResetButton,
		SubmitButton,
	},
});

type FormKitOptions = Parameters<typeof useFormKit>[0];

/**
 * The SIMMER form kit's hook: TanStack's `useAppForm` with the save-failure
 * channel wired into the same error map validation already writes to.
 *
 * `handleSubmit` rejects when `onSubmit` throws and records nothing, so every
 * form used to catch its own throw and paint a second alert beside the kit's
 * one. Here the throw is caught once, and `FormErrorAlert` renders it under the
 * title that form already passes.
 *
 * Recording it there costs the save button, because the error map is what
 * `canSubmit` reads: a form the server refused would be unsavable until the user
 * happened to edit a field. So the next attempt drops the recorded failure and
 * runs the save again, and `SubmitButton` reads
 * `saveFailureAloneBlocksSubmit` so there is an attempt to make.
 *
 * This is the one answer both apps are on. `apps/admin` used to opt out of it,
 * three forms writing a plain string into the error map through a helper of
 * their own and two holding the failure in component state beside a second
 * alert, and a string is not a `SaveFailure`, so Save stayed dead until the
 * operator edited a field. Nothing records a save failure by hand now (#754).
 *
 * Re-enabling Save is deliberately not conditional on the failure being
 * transient. A refusal keeps saying what was wrong in the alert, and pressing
 * Save again costs nothing.
 */
export const useAppForm = ((options: FormKitOptions) =>
	useFormKit(withSaveFailureRecorded(options))) as unknown as typeof useFormKit;

function withSaveFailureRecorded(options: FormKitOptions): FormKitOptions {
	const { onSubmit, onSubmitInvalid } = options;

	return {
		...options,
		onSubmit: async (props) => {
			try {
				await onSubmit?.(props);
			} catch (error) {
				/*
				 * The options are generic-erased here, so the library types this
				 * key as the widest error shape it can name rather than as the one
				 * a form's own validators give it. The value is read back through
				 * `errorMessagesFrom`, which takes anything.
				 */
				props.formApi.setErrorMap({ onSubmit: new SaveFailure(error) as never });
			}
		},
		onSubmitInvalid: (props) => {
			/*
			 * The form is invalid because the last save failed, not because a
			 * field is. Drop what that attempt recorded and let this one run.
			 */
			if (props.formApi.state.errors.some(isSaveFailure)) {
				props.formApi.setErrorMap({ onSubmit: undefined });
				void props.formApi.handleSubmit();
				return;
			}

			onSubmitInvalid?.(props);
		},
	};
}
